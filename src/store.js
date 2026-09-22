'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Append-only local JSONL store for raw activity samples. Deliberately
 * simple (no native deps) so the whole app runs from plain Node/Electron
 * with nothing to compile. One file per calendar day.
 */
class ActivityStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  _fileFor(ts) {
    const day = new Date(ts).toISOString().slice(0, 10);
    return path.join(this.dataDir, `${day}.jsonl`);
  }

  append(sample) {
    const line = JSON.stringify(sample) + '\n';
    fs.appendFileSync(this._fileFor(sample.ts), line, 'utf8');
  }

  readDay(dateStr) {
    const file = path.join(this.dataDir, `${dateStr}.jsonl`);
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  readRange(startDateStr, endDateStr) {
    const files = fs
      .readdirSync(this.dataDir)
      .filter((f) => f.endsWith('.jsonl'))
      .filter((f) => {
        const day = f.slice(0, 10);
        return day >= startDateStr && day <= endDateStr;
      })
      .sort();
    return files.flatMap((f) => this.readDay(f.slice(0, 10)));
  }
}

module.exports = { ActivityStore };
