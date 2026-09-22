'use strict';

// Window/app titles come from other applications, so they're not trusted
// input — escape before inserting into innerHTML rather than relying on
// the page's CSP alone to contain them.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    const project = escapeHtml(line.project);

    const statusIcon = line.status === 'approved' ? '✅' : '⏳';
    const taskSubtitle = line.tasks && line.tasks.length
      ? `<div class="task-subtitle">${escapeHtml(line.tasks.join(', '))}</div>`
      : '';
    tr.innerHTML = `
      <td>${project}${taskSubtitle}</td>
      <td>${line.hours}</td>
      <td>${statusIcon} ${escapeHtml(line.status)}</td>
      <td>
        <button class="explain-btn" data-project="${project}">Why?</button>
        <button class="approve-btn" data-project="${project}" ${line.status === 'approved' ? 'disabled' : ''}>Approve</button>
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
    const taskLine = block.taskLabel ? ` — ${escapeHtml(block.taskLabel)}` : '';
    li.innerHTML = `
      <strong>${escapeHtml(block.range)}</strong>${taskLine} — ${escapeHtml(block.duration)}
      <span class="confidence">Confidence: ${block.confidence}%</span>
      <ul>${block.evidence.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
    `;
    list.appendChild(li);
  }

  document.getElementById('evidence').classList.remove('hidden');
}

async function renderProjects() {
  const rules = await window.timeproof.getProjects();
  const list = document.getElementById('project-list');

  if (rules.length === 0) {
    list.innerHTML = '<li class="hint">No projects yet — activity will show as "Unclassified".</li>';
    return;
  }

  list.innerHTML = rules
    .map(
      (r) => `
        <li>
          <strong>${escapeHtml(r.name)}</strong> — ${escapeHtml(r.keywords.join(', '))}
          <button class="remove-project-btn" data-name="${escapeHtml(r.name)}">Remove</button>
        </li>
      `
    )
    .join('');

  list.querySelectorAll('.remove-project-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.timeproof.removeProject(btn.dataset.name);
      renderProjects();
    });
  });
}

async function renderPrivacy() {
  const privacy = await window.timeproof.getPrivacy();
  document.getElementById('privacy-collects').innerHTML = privacy.collects
    .map((c) => `<li>${escapeHtml(c)}</li>`)
    .join('');
  document.getElementById('privacy-never').innerHTML = privacy.neverCollects
    .map((c) => `<li>${escapeHtml(c)}</li>`)
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

async function renderIntegrationStatus() {
  const cfg = await window.timeproof.getIntegrationConfig();
  document.getElementById('integration-endpoint').value = cfg.endpointUrl || '';
  document.getElementById('integration-employee').value = cfg.employeeId || '';
  document.getElementById('integration-status').textContent = cfg.hasApiKey
    ? 'API key is set.'
    : 'No API key set yet.';
}

document.getElementById('integration-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const endpointUrl = document.getElementById('integration-endpoint').value.trim();
  const employeeId = document.getElementById('integration-employee').value.trim();
  const apiKeyInput = document.getElementById('integration-apikey');
  const apiKey = apiKeyInput.value; // blank means "keep the existing key"

  const result = await window.timeproof.setIntegrationConfig({ endpointUrl, employeeId, apiKey });
  apiKeyInput.value = '';

  const statusEl = document.getElementById('integration-status');
  if (result && result.error) {
    statusEl.textContent = `⚠️ ${result.error}`;
  } else {
    renderIntegrationStatus();
  }
});

document.getElementById('submit-btn').addEventListener('click', async () => {
  const resultEl = document.getElementById('submit-result');
  resultEl.textContent = 'Submitting…';
  resultEl.className = 'hint';

  const result = await window.timeproof.submitTimesheet();
  resultEl.textContent = result.success ? `✅ ${result.message}` : `⚠️ ${result.message}`;
  resultEl.className = result.success ? 'hint ok' : 'hint bad';
});

document.getElementById('project-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('project-name');
  const keywordsInput = document.getElementById('project-keywords');

  const name = nameInput.value.trim();
  const keywords = keywordsInput.value
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  if (!name || keywords.length === 0) return;

  await window.timeproof.addProject({ name, keywords });
  e.target.reset();
  renderProjects();
});

function refreshAll() {
  renderTimesheet();
  renderPrivacy();
  renderIntegrity();
}

document.getElementById('refresh-btn').addEventListener('click', refreshAll);

refreshAll();
renderProjects();
renderIntegrationStatus();
setInterval(refreshAll, 30000); // keep the view live while the app sits open
