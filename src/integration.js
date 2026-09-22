'use strict';

/**
 * Submits approved timesheet lines to the company's internal system as
 * JSON. The endpoint is whatever the company points TimeProof at — see
 * README.md for the payload contract an internal API needs to accept.
 *
 * Only APPROVED lines are ever sent: nothing pending or unreviewed
 * leaves the machine.
 */
async function submitTimesheet({ endpointUrl, apiKey, employeeId } = {}, timesheet) {
  if (!endpointUrl) {
    return { success: false, message: 'No company system endpoint configured yet.' };
  }

  const approvedLines = (timesheet.lines || []).filter((l) => l.status === 'approved');
  if (approvedLines.length === 0) {
    return { success: false, message: 'Approve at least one line before submitting.' };
  }

  const payload = {
    employeeId: employeeId || null,
    weekLabel: timesheet.weekLabel || null,
    submittedAt: new Date().toISOString(),
    lines: approvedLines.map((line) => ({
      project: line.project,
      hours: line.hours,
      tasks: line.tasks || [],
      evidence: line.blocks.map((block) => ({
        range: `${formatTime(block.start)}–${formatTime(block.end)}`,
        duration: block.duration,
        confidence: block.confidence,
        evidence: block.evidence,
      })),
    })),
  };

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { success: false, message: `Server responded ${response.status}: ${text.slice(0, 200)}` };
    }
    return { success: true, message: `Submitted ${approvedLines.length} line(s) to the company system.` };
  } catch (err) {
    return { success: false, message: `Network error: ${err.message}` };
  }
}

function formatTime(ms) {
  return new Date(ms).toTimeString().slice(0, 5);
}

module.exports = { submitTimesheet };
