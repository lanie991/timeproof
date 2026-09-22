'use strict';

/**
 * Time Evidence Engine
 *
 * Pure, dependency-free logic that turns a stream of raw activity samples
 * into defensible "evidence blocks" — the thing a timesheet line is built
 * from. No Electron, no I/O: this is what the tests exercise directly.
 *
 * Raw sample shape (one per poll, e.g. every 15s):
 *   {
 *     ts: <ms epoch>,
 *     app: 'Excel',
 *     title: 'Bank Statement Analysis.xlsx',
 *     idleSeconds: 0,          // seconds idle at time of sample
 *     event: 'active'|'idle'|'lock'|'unlock'|'login'|'logout'
 *   }
 */

const DEFAULT_OPTIONS = {
  // A gap with no samples (app asleep, tracker paused) longer than this
  // ends a raw segment outright.
  maxSampleGapMs: 2 * 60 * 1000,
  // Idle time at or above this breaks a segment into idle vs active.
  idleThresholdMs: 5 * 60 * 1000,
  // Two segments belonging to the same project may be bridged into one
  // evidence block if the gap between them (idle, or a brief unrelated
  // app) is no larger than this.
  maxBridgeGapMs: 10 * 60 * 1000,
  // Named projects/clients and the keywords (matched against app+title,
  // case-insensitive) that tag a sample as belonging to them.
  projectRules: [],
};

function normalizeRules(projectRules) {
  return projectRules.map((rule) => ({
    name: rule.name,
    keywords: (rule.keywords || []).map((k) => k.toLowerCase()),
  }));
}

/**
 * Determine which project (if any) a sample belongs to, by matching its
 * app + window title against each project's keyword list.
 */
function classifyProject(sample, rules) {
  const haystack = `${sample.app || ''} ${sample.title || ''}`.toLowerCase();
  for (const rule of rules) {
    if (rule.keywords.some((kw) => kw && haystack.includes(kw))) {
      return rule.name;
    }
  }
  return null;
}

/**
 * Step 1: collapse the raw sample stream into contiguous "raw segments" —
 * runs of samples that are the same app+title and not idle/locked, with no
 * gap in sampling larger than maxSampleGapMs.
 */
function buildRawSegments(samples, options) {
  const segments = [];
  let current = null;

  for (const sample of samples) {
    const isIdle =
      sample.event === 'idle' ||
      sample.event === 'lock' ||
      sample.event === 'logout' ||
      (sample.idleSeconds || 0) * 1000 >= options.idleThresholdMs;

    if (isIdle) {
      if (current) segments.push(current);
      current = null;
      continue;
    }

    const key = `${sample.app || ''}::${sample.title || ''}`;
    const gapFromPrev = current ? sample.ts - current.lastTs : Infinity;

    if (current && current.key === key && gapFromPrev <= options.maxSampleGapMs) {
      current.end = sample.ts;
      current.lastTs = sample.ts;
      current.samples.push(sample);
    } else {
      if (current) segments.push(current);
      current = {
        key,
        app: sample.app,
        title: sample.title,
        start: sample.ts,
        end: sample.ts,
        lastTs: sample.ts,
        samples: [sample],
      };
    }
  }
  if (current) segments.push(current);
  return segments;
}

/**
 * Step 2: tag each raw segment with a project, then merge adjacent
 * same-project segments into evidence blocks, bridging short gaps
 * (brief idle, or a quick unrelated app) up to maxBridgeGapMs.
 */
function groupIntoBlocks(rawSegments, rules, options) {
  const tagged = rawSegments.map((seg) => ({
    ...seg,
    project: classifyProject(seg, rules) || 'Unclassified',
  }));

  const blocks = [];
  let current = null;

  for (const seg of tagged) {
    const gapFromPrev = current ? seg.start - current.end : Infinity;

    if (current && current.project === seg.project && gapFromPrev <= options.maxBridgeGapMs) {
      if (gapFromPrev > 0) {
        current.gaps.push({ start: current.end, end: seg.start, durationMs: gapFromPrev });
      }
      current.end = seg.end;
      current.segments.push(seg);
    } else {
      if (current) blocks.push(current);
      current = {
        project: seg.project,
        start: seg.start,
        end: seg.end,
        segments: [seg],
        gaps: [],
      };
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

/**
 * Turn a block's segments/gaps into human-readable evidence lines and a
 * 0-100 confidence score. The score rewards: sustained activity with no
 * long idle gaps, multiple corroborating apps/documents, and a
 * consistently-matched project — the same signals a person would use to
 * defend the entry if asked "why does this say N hours?".
 */
function scoreBlock(block, options) {
  const evidence = [];
  let score = 55;

  const uniqueApps = new Set(block.segments.map((s) => s.app));
  for (const seg of block.segments) {
    const durationMs = seg.end - seg.start;
    evidence.push(
      `${seg.app} active: ${formatRange(seg.start, seg.end)}${
        durationMs < 60 * 1000 ? ' (opened)' : ''
      }`
    );
  }

  const longGaps = block.gaps.filter((g) => g.durationMs > options.idleThresholdMs);
  if (longGaps.length === 0) {
    evidence.push(`No idle period >${Math.round(options.idleThresholdMs / 60000)} minutes`);
    score += 15;
  } else {
    for (const gap of longGaps) {
      evidence.push(
        `Idle gap: ${formatRange(gap.start, gap.end)} (${Math.round(gap.durationMs / 60000)}m)`
      );
      score -= 10;
    }
  }

  if (uniqueApps.size > 1) {
    score += 10; // multiple corroborating apps for the same project
  }
  if (block.project !== 'Unclassified') {
    score += 15; // matched a known client/project keyword
  } else {
    score -= 15; // no evidence tying this time to a specific project
  }
  if (block.segments.length > 1) {
    score += 5; // sustained, resumed work rather than a single blip
  }

  score = Math.max(5, Math.min(98, Math.round(score)));
  return { score, evidence };
}

const FILE_EXTENSION_RE = /\.(xlsx|xlsm|xls|docx|doc|pdf|csv|pptx|ppt|txt)$/i;

function cleanTitle(title) {
  if (!title) return '';
  return title.replace(FILE_EXTENSION_RE, '').trim();
}

/**
 * A short human label for "what" the block was — e.g. "Bank Statement
 * Analysis" — derived from the document/window title of the block's
 * longest-running segment (the most representative activity), rather
 * than just the project it was classified under.
 */
function deriveTaskLabel(block) {
  const longest = block.segments.reduce((best, seg) => {
    const durationMs = seg.end - seg.start;
    return !best || durationMs > best.durationMs ? { ...seg, durationMs } : best;
  }, null);

  const cleaned = cleanTitle(longest && longest.title);
  return cleaned || (longest && longest.app) || null;
}

function formatRange(startMs, endMs) {
  return `${formatTime(startMs)}–${formatTime(endMs)}`;
}

function formatTime(ms) {
  const d = new Date(ms);
  return d.toTimeString().slice(0, 5);
}

function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Public entry point: raw samples in, evidence blocks out.
 */
function buildEvidenceBlocks(samples, userOptions = {}) {
  const options = { ...DEFAULT_OPTIONS, ...userOptions };
  const rules = normalizeRules(options.projectRules || []);

  const sorted = [...samples].sort((a, b) => a.ts - b.ts);
  const rawSegments = buildRawSegments(sorted, options);
  const grouped = groupIntoBlocks(rawSegments, rules, options);

  return grouped.map((block) => {
    const { score, evidence } = scoreBlock(block, options);
    const durationMs = block.end - block.start;
    return {
      project: block.project,
      taskLabel: deriveTaskLabel(block),
      start: block.start,
      end: block.end,
      durationMs,
      duration: formatDuration(durationMs),
      confidence: score,
      evidence,
      apps: [...new Set(block.segments.map((s) => s.app))],
    };
  });
}

module.exports = {
  buildEvidenceBlocks,
  classifyProject,
  formatDuration,
  DEFAULT_OPTIONS,
};
