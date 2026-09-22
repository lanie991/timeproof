'use strict';

/**
 * Runs the Time Evidence Engine over a synthetic day of activity and
 * prints the resulting timesheet + drill-down evidence. Useful for
 * demoing the "killer feature" without launching the Electron GUI.
 *
 *   npm run demo
 */

const { buildEvidenceBlocks } = require('../src/timeEvidenceEngine');
const { buildTimesheet, explainProject } = require('../src/timesheetBuilder');

const MIN = 60 * 1000;
const day = new Date('2026-09-22T09:00:00');
const base = day.getTime();

function at(hh, mm) {
  return new Date(2026, 8, 22, hh, mm).getTime();
}

function sampleRange(startTs, endTs, app, title, stepMin = 1) {
  const samples = [];
  for (let ts = startTs; ts <= endTs; ts += stepMin * MIN) {
    samples.push({ ts, app, title, idleSeconds: 0, event: 'active' });
  }
  return samples;
}

const samples = [
  ...sampleRange(at(9, 3), at(10, 12), 'Excel', 'Bank Statement Analysis.xlsx'),
  ...sampleRange(at(10, 14), at(10, 27), 'Outlook', 'RE: Client ABC correspondence'),
  ...sampleRange(at(10, 29), at(11, 41), 'Word', 'Client ABC Draft Report.docx'),
  ...sampleRange(at(13, 0), at(13, 45), 'Slack', '#internal-standup'),
];

const projectRules = [
  { name: 'Client ABC', keywords: ['client abc', 'bank statement'] },
  { name: 'Internal', keywords: ['internal', 'standup'] },
];

const blocks = buildEvidenceBlocks(samples, { projectRules });
const timesheet = buildTimesheet(blocks, { weekLabel: 'Demo Day' });

console.log(`\nTimesheet — ${timesheet.weekLabel} (total ${timesheet.totalHours}h)\n`);
for (const line of timesheet.lines) {
  console.log(`${line.project.padEnd(14)} ${line.duration.padStart(8)}  [${line.status}]`);
}

console.log('\n--- Drill-down: "Why does this say N hours?" ---\n');
for (const line of timesheet.lines) {
  const explanation = explainProject(timesheet, line.project);
  console.log(`${explanation.project} — ${explanation.hours}h`);
  for (const block of explanation.blocks) {
    console.log(`  ${block.range}  ${block.duration}  Confidence: ${block.confidence}%`);
    for (const e of block.evidence) console.log(`    - ${e}`);
  }
  console.log('');
}
