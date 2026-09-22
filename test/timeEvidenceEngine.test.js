'use strict';

const { buildEvidenceBlocks, classifyProject, formatDuration } = require('../src/timeEvidenceEngine');

const MIN = 60 * 1000;

function sample(minute, app, title, extra = {}) {
  return { ts: minute * MIN, app, title, idleSeconds: 0, event: 'active', ...extra };
}

const projectRules = [{ name: 'Client ABC', keywords: ['client abc', 'bank statement'] }];

describe('classifyProject', () => {
  it('matches against app and title case-insensitively', () => {
    const rules = [{ name: 'Client ABC', keywords: ['bank statement'] }].map((r) => ({
      name: r.name,
      keywords: r.keywords,
    }));
    expect(classifyProject({ app: 'Excel', title: 'BANK STATEMENT analysis.xlsx' }, rules)).toBe(
      'Client ABC'
    );
  });

  it('returns null when nothing matches', () => {
    const rules = [{ name: 'Client ABC', keywords: ['bank statement'] }];
    expect(classifyProject({ app: 'Spotify', title: 'Lo-fi beats' }, rules)).toBeNull();
  });
});

describe('buildEvidenceBlocks', () => {
  it('merges a continuous run of the same app/title into one block', () => {
    const samples = [
      sample(0, 'Excel', 'Bank Statement Analysis.xlsx'),
      sample(1, 'Excel', 'Bank Statement Analysis.xlsx'),
      sample(2, 'Excel', 'Bank Statement Analysis.xlsx'),
    ];
    const blocks = buildEvidenceBlocks(samples, { projectRules });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].project).toBe('Client ABC');
    expect(blocks[0].durationMs).toBe(2 * MIN);
  });

  it('bridges a brief unrelated app switch within the same project', () => {
    const samples = [
      sample(0, 'Excel', 'Bank Statement Analysis.xlsx'),
      sample(5, 'Outlook', 'RE: Client ABC correspondence'),
      sample(8, 'Excel', 'Bank Statement Analysis.xlsx'),
    ];
    const blocks = buildEvidenceBlocks(samples, { projectRules });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].apps).toEqual(expect.arrayContaining(['Excel', 'Outlook']));
  });

  it('breaks a block on an idle gap longer than the idle threshold', () => {
    const samples = [
      sample(0, 'Excel', 'Bank Statement Analysis.xlsx'),
      sample(1, 'Excel', 'Bank Statement Analysis.xlsx', { idleSeconds: 600, event: 'idle' }),
      sample(20, 'Excel', 'Bank Statement Analysis.xlsx'),
    ];
    const blocks = buildEvidenceBlocks(samples, { projectRules });
    expect(blocks).toHaveLength(2);
  });

  it('separates unrelated projects even with no idle time between them', () => {
    const samples = [
      sample(0, 'Excel', 'Bank Statement Analysis.xlsx'),
      sample(1, 'Excel', 'Bank Statement Analysis.xlsx'),
      sample(2, 'Slack', '#random'),
      sample(3, 'Slack', '#random'),
    ];
    const blocks = buildEvidenceBlocks(samples, { projectRules });
    expect(blocks).toHaveLength(2);
    expect(blocks[0].project).toBe('Client ABC');
    expect(blocks[1].project).toBe('Unclassified');
  });

  it('scores higher confidence for sustained, multi-app, project-matched work', () => {
    const strong = [
      sample(0, 'Excel', 'Bank Statement Analysis.xlsx'),
      sample(3, 'Outlook', 'RE: Client ABC correspondence'),
      sample(6, 'Excel', 'Bank Statement Analysis.xlsx'),
    ];
    const weak = [sample(0, 'Solitaire', 'Solitaire')];

    const [strongBlock] = buildEvidenceBlocks(strong, { projectRules });
    const [weakBlock] = buildEvidenceBlocks(weak, { projectRules });

    expect(strongBlock.confidence).toBeGreaterThan(weakBlock.confidence);
    expect(strongBlock.confidence).toBeLessThanOrEqual(98);
  });

  it('lists "no idle period" evidence when there is no long gap', () => {
    const samples = [
      sample(0, 'Excel', 'Bank Statement Analysis.xlsx'),
      sample(1, 'Excel', 'Bank Statement Analysis.xlsx'),
    ];
    const [block] = buildEvidenceBlocks(samples, { projectRules });
    expect(block.evidence.some((e) => e.includes('No idle period'))).toBe(true);
  });

  it('excludes idle/locked samples from segments entirely', () => {
    const samples = [
      sample(0, 'Excel', 'Bank Statement Analysis.xlsx'),
      { ts: 1 * MIN, app: null, title: null, idleSeconds: 0, event: 'lock' },
      sample(2, 'Excel', 'Bank Statement Analysis.xlsx'),
    ];
    const blocks = buildEvidenceBlocks(samples, { projectRules });
    // Gap across the lock event still bridges within maxBridgeGapMs.
    expect(blocks).toHaveLength(1);
  });
});

describe('taskLabel', () => {
  it('derives a task label from the longest-running segment, stripping the file extension', () => {
    const samples = [
      sample(0, 'Outlook', 'RE: Client ABC correspondence'),
      sample(1, 'Excel', 'Bank Statement Analysis.xlsx'),
      sample(2, 'Excel', 'Bank Statement Analysis.xlsx'),
      sample(3, 'Excel', 'Bank Statement Analysis.xlsx'),
    ];
    const [block] = buildEvidenceBlocks(samples, { projectRules });
    expect(block.taskLabel).toBe('Bank Statement Analysis');
  });

  it('falls back to the app name when there is no useful title', () => {
    const samples = [sample(0, 'Terminal', '')];
    const [block] = buildEvidenceBlocks(samples, { projectRules: [] });
    expect(block.taskLabel).toBe('Terminal');
  });
});

describe('formatDuration', () => {
  it('formats minutes, hours, and combined', () => {
    expect(formatDuration(45 * MIN)).toBe('45m');
    expect(formatDuration(2 * 60 * MIN)).toBe('2h');
    expect(formatDuration(2 * 60 * MIN + 38 * MIN)).toBe('2h 38m');
  });
});
