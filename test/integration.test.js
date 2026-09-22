'use strict';

const { submitTimesheet } = require('../src/integration');

function timesheetWith(lines) {
  return { weekLabel: 'Demo Day', lines };
}

const approvedLine = {
  project: 'Client ABC',
  hours: 2.5,
  status: 'approved',
  tasks: ['Bank Statement Analysis'],
  blocks: [
    { start: 0, end: 60000, duration: '1m', confidence: 90, evidence: ['Excel active'] },
  ],
};

const pendingLine = { ...approvedLine, project: 'Internal', status: 'pending' };

describe('submitTimesheet', () => {
  afterEach(() => {
    delete global.fetch;
  });

  it('refuses to submit when no endpoint is configured', async () => {
    const result = await submitTimesheet({ endpointUrl: '' }, timesheetWith([approvedLine]));
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no company system endpoint/i);
  });

  it('refuses to submit when there are no approved lines', async () => {
    const result = await submitTimesheet({ endpointUrl: 'https://x' }, timesheetWith([pendingLine]));
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/approve at least one/i);
  });

  it('only includes approved lines in the payload, never pending ones', async () => {
    let capturedBody;
    global.fetch = jest.fn((url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, status: 200 });
    });

    const result = await submitTimesheet(
      { endpointUrl: 'https://internal.example.com/api' },
      timesheetWith([approvedLine, pendingLine])
    );

    expect(result.success).toBe(true);
    expect(capturedBody.lines).toHaveLength(1);
    expect(capturedBody.lines[0].project).toBe('Client ABC');
    expect(capturedBody.lines[0].tasks).toEqual(['Bank Statement Analysis']);
  });

  it('sends the API key as a Bearer token when configured', async () => {
    let capturedHeaders;
    global.fetch = jest.fn((url, opts) => {
      capturedHeaders = opts.headers;
      return Promise.resolve({ ok: true, status: 200 });
    });

    await submitTimesheet(
      { endpointUrl: 'https://internal.example.com/api', apiKey: 'secret-token' },
      timesheetWith([approvedLine])
    );

    expect(capturedHeaders.Authorization).toBe('Bearer secret-token');
  });

  it('surfaces a non-OK server response as a failure', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('boom') })
    );

    const result = await submitTimesheet({ endpointUrl: 'https://x' }, timesheetWith([approvedLine]));
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/500/);
  });

  it('surfaces a network error as a failure rather than throwing', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('ECONNREFUSED')));

    const result = await submitTimesheet({ endpointUrl: 'https://x' }, timesheetWith([approvedLine]));
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/ECONNREFUSED/);
  });
});
