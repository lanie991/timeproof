'use strict';

const { buildEvidenceBlocks } = require('../src/timeEvidenceEngine');
const { buildTimesheet, explainProject, approveLine } = require('../src/timesheetBuilder');

const MIN = 60 * 1000;
const projectRules = [
  { name: 'Client A', keywords: ['client a'] },
  { name: 'Client B', keywords: ['client b'] },
];

function sample(minute, app, title) {
  return { ts: minute * MIN, app, title, idleSeconds: 0, event: 'active' };
}

describe('buildTimesheet', () => {
  it('aggregates blocks per project and sorts by hours descending', () => {
    const samples = [
      sample(0, 'Excel', 'Client A budget'),
      sample(1, 'Excel', 'Client A budget'),
      sample(2, 'Excel', 'Client A budget'),
      sample(10, 'Word', 'Client B memo'),
    ];
    const blocks = buildEvidenceBlocks(samples, { projectRules });
    const timesheet = buildTimesheet(blocks);

    expect(timesheet.lines[0].project).toBe('Client A');
    expect(timesheet.lines[0].status).toBe('pending');
    expect(timesheet.totalHours).toBeGreaterThan(0);
  });

  it('explains a project total via its underlying evidence blocks', () => {
    const samples = [sample(0, 'Excel', 'Client A budget'), sample(1, 'Excel', 'Client A budget')];
    const blocks = buildEvidenceBlocks(samples, { projectRules });
    const timesheet = buildTimesheet(blocks);

    const explanation = explainProject(timesheet, 'Client A');
    expect(explanation.blocks.length).toBeGreaterThan(0);
    expect(explanation.blocks[0]).toHaveProperty('confidence');
    expect(explanation.blocks[0]).toHaveProperty('evidence');
  });

  it('returns null when explaining a project that does not exist', () => {
    const timesheet = buildTimesheet([]);
    expect(explainProject(timesheet, 'Nope')).toBeNull();
  });

  it('marks a line approved without touching others', () => {
    const samples = [sample(0, 'Excel', 'Client A budget'), sample(10, 'Word', 'Client B memo')];
    const blocks = buildEvidenceBlocks(samples, { projectRules });
    const timesheet = buildTimesheet(blocks);

    approveLine(timesheet, 'Client A');
    expect(timesheet.lines.find((l) => l.project === 'Client A').status).toBe('approved');
    expect(timesheet.lines.find((l) => l.project === 'Client B').status).toBe('pending');
  });
});
