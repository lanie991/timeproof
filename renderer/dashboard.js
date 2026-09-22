'use strict';

async function renderIntegrity() {
  const result = await window.timeproof.verifyIntegrity();
  const el = document.getElementById('integrity-status');
  if (result.valid) {
    const lock = result.encryptedAtRest ? 'encrypted' : 'unencrypted (OS keychain unavailable)';
    el.textContent = `✅ Log integrity verified — ${result.count} record(s), ${lock}`;
    el.className = 'integrity ok';
  } else {
    el.textContent = `⚠️ Integrity check failed at entry ${result.brokenAtIndex}: ${result.reason}`;
    el.className = 'integrity bad';
  }
}

async function renderTimesheet() {
  const timesheet = await window.timeproof.getTimesheet();
  document.getElementById('total-hours').textContent = `Total: ${timesheet.totalHours}h`;

  const body = document.getElementById('timesheet-body');
  body.innerHTML = '';

  for (const line of timesheet.lines) {
    const tr = document.createElement('tr');

    const statusIcon = line.status === 'approved' ? '✅' : '⏳';
    tr.innerHTML = `
      <td>${line.project}</td>
      <td>${line.hours}</td>
      <td>${statusIcon} ${line.status}</td>
      <td>
        <button class="explain-btn" data-project="${line.project}">Why?</button>
        <button class="approve-btn" data-project="${line.project}" ${line.status === 'approved' ? 'disabled' : ''}>Approve</button>
      </td>
    `;
    body.appendChild(tr);
  }

  body.querySelectorAll('.explain-btn').forEach((btn) => {
    btn.addEventListener('click', () => showEvidence(btn.dataset.project));
  });
  body.querySelectorAll('.approve-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.timeproof.approve(btn.dataset.project);
      renderTimesheet();
    });
  });
}

async function showEvidence(projectName) {
  const explanation = await window.timeproof.explain(projectName);
  if (!explanation) return;

  document.getElementById('evidence-title').textContent =
    `${explanation.project} — ${explanation.hours}h`;

  const list = document.getElementById('evidence-list');
  list.innerHTML = '';
  for (const block of explanation.blocks) {
    const li = document.createElement('li');
    li.innerHTML = `
      <strong>${block.range}</strong> — ${block.duration}
      <span class="confidence">Confidence: ${block.confidence}%</span>
      <ul>${block.evidence.map((e) => `<li>${e}</li>`).join('')}</ul>
    `;
    list.appendChild(li);
  }

  document.getElementById('evidence').classList.remove('hidden');
}

async function renderPrivacy() {
  const privacy = await window.timeproof.getPrivacy();
  document.getElementById('privacy-collects').innerHTML = privacy.collects
    .map((c) => `<li>${c}</li>`)
    .join('');
  document.getElementById('privacy-never').innerHTML = privacy.neverCollects
    .map((c) => `<li>${c}</li>`)
    .join('');
  document.getElementById('screenshots-toggle').checked = privacy.collects.some((c) =>
    c.startsWith('Screenshots every')
  );
}

document.getElementById('close-evidence').addEventListener('click', () => {
  document.getElementById('evidence').classList.add('hidden');
});

document.getElementById('screenshots-toggle').addEventListener('change', async (e) => {
  await window.timeproof.setScreenshots(e.target.checked);
  renderPrivacy();
});

renderTimesheet();
renderPrivacy();
renderIntegrity();
