'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Project/client keyword rules, persisted as JSON so they survive app
 * restarts without requiring a code edit. A missing or corrupt file is
 * treated as "no rules yet" rather than an error — this is user-editable
 * config, not the activity log, so there's nothing to preserve by failing.
 */
function loadProjectRules(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
  } catch (err) {
    // No file yet, or it's unreadable — start with an empty rule set.
  }
  return [];
}

function saveProjectRules(filePath, rules) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(rules, null, 2), 'utf8');
}

module.exports = { loadProjectRules, saveProjectRules };
