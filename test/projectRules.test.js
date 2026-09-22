'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadProjectRules, saveProjectRules } = require('../src/projectRules');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'timeproof-rules-')), 'project-rules.json');
}

describe('projectRules', () => {
  it('returns an empty array when the file does not exist yet', () => {
    expect(loadProjectRules(tmpFile())).toEqual([]);
  });

  it('round-trips saved rules', () => {
    const file = tmpFile();
    const rules = [{ name: 'Client ABC', keywords: ['client abc', 'abc-corp'] }];
    saveProjectRules(file, rules);
    expect(loadProjectRules(file)).toEqual(rules);
  });

  it('creates parent directories on save if needed', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'timeproof-rules-')), 'nested', 'project-rules.json');
    saveProjectRules(file, [{ name: 'X', keywords: ['x'] }]);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('treats a corrupt file as no rules rather than throwing', () => {
    const file = tmpFile();
    fs.writeFileSync(file, 'not valid json{{{', 'utf8');
    expect(loadProjectRules(file)).toEqual([]);
  });

  it('treats a non-array JSON value as no rules', () => {
    const file = tmpFile();
    fs.writeFileSync(file, JSON.stringify({ oops: true }), 'utf8');
    expect(loadProjectRules(file)).toEqual([]);
  });
});
