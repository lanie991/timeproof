'use strict';

const { formatDuration } = require('./timeEvidenceEngine');

/**
 * Group evidence blocks (from timeEvidenceEngine) into a per-project
 * timesheet summary, plus keep each block around as the drill-down
 * "why does this say N hours?" evidence trail.
 */
function buildTimesheet(blocks, { weekLabel } = {}) {
  const byProject = new Map();

  for (const block of blocks) {
    if (!byProject.has(block.project)) {
      byProject.set(block.project, { project: block.project, totalMs: 0, blocks: [], status: 'pending' });
    }
    const entry = byProject.get(block.project);
    entry.totalMs += block.durationMs;
    entry.blocks.push(block);
  }

  const lines = [...byProject.values()]
    .map((entry) => ({
      project: entry.project,
      hours: Math.round((entry.totalMs / 3600000) * 100) / 100,
      duration: formatDuration(entry.totalMs),
      status: entry.status,
      tasks: [...new Set(entry.blocks.map((b) => b.taskLabel).filter(Boolean))],
      blocks: entry.blocks,
    }))
    .sort((a, b) => b.hours - a.hours);

  const totalMs = lines.reduce((sum, l) => sum + l.blocks.reduce((s, b) => s + b.durationMs, 0), 0);

  return {
    weekLabel: weekLabel || null,
    lines,
    totalHours: Math.round((totalMs / 3600000) * 100) / 100,
  };
}

/**
 * The "why does this say 4.2 hours?" drill-down: return the ordered
 * evidence trail behind a single project's total.
 */
function explainProject(timesheet, projectName) {
  const line = timesheet.lines.find((l) => l.project === projectName);
  if (!line) return null;
  return {
    project: line.project,
    hours: line.hours,
    blocks: line.blocks.map((b) => ({
      range: `${new Date(b.start).toTimeString().slice(0, 5)}–${new Date(b.end).toTimeString().slice(0, 5)}`,
      duration: b.duration,
      taskLabel: b.taskLabel,
      confidence: b.confidence,
      evidence: b.evidence,
    })),
  };
}

function approveLine(timesheet, projectName) {
  const line = timesheet.lines.find((l) => l.project === projectName);
  if (line) line.status = 'approved';
  return timesheet;
}

module.exports = { buildTimesheet, explainProject, approveLine };
