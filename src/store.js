'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GENESIS_HASH = '0'.repeat(64);

/**
 * A safeStorage-shaped object with encryption unavailable — used when no
 * OS keychain is wired in (tests, or a platform where it's unsupported).
 * Data is still base64-framed on disk (never raw JSON text) and clearly
 * marked PLAIN so callers/audits can tell it wasn't OS-encrypted.
 */
function noEncryption() {
  return {
    isEncryptionAvailable: () => false,
    encryptString: (s) => Buffer.from(s, 'utf8'),
    decryptString: (b) => b.toString('utf8'),
  };
}

/** Canonical (key-order-independent) hash of a record, excluding its own hash field. */
function hashRecord(record) {
  const { hash, ...rest } = record;
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Append-only local activity log with two security properties a company
 * deploying this needs:
 *
 * 1. Encryption at rest — each line is encrypted with the OS keychain via
 *    Electron's `safeStorage` (Keychain on macOS, DPAPI on Windows,
 *    libsecret on Linux) when available, so the JSONL file on disk is not
 *    human-readable outside the machine/account it was written on.
 * 2. Tamper-evidence — every record embeds the hash of the previous
 *    record (a hash chain), so editing, reordering, or deleting a past
 *    entry breaks the chain and is detectable via `verifyDay()`. This is
 *    what lets a timesheet built from this log be defended as evidence
 *    rather than a number someone could have hand-edited.
 *
 * No native deps: `safeStorage` is optional and injected so this class
 * stays unit-testable outside Electron.
 */
class ActivityStore {
  constructor(dataDir, { safeStorage } = {}) {
    this.dataDir = dataDir;
    this.safeStorage = safeStorage || noEncryption();
    fs.mkdirSync(this.dataDir, { recursive: true });
    this._lastHashCache = new Map();
  }

  _fileFor(ts) {
    const day = new Date(ts).toISOString().slice(0, 10);
    return path.join(this.dataDir, `${day}.jsonl`);
  }

  _encodeLine(json) {
    const encrypted = this.safeStorage.isEncryptionAvailable();
    const buf = encrypted ? this.safeStorage.encryptString(json) : Buffer.from(json, 'utf8');
    return `${encrypted ? 'ENC' : 'PLAIN'}:${buf.toString('base64')}`;
  }

  _decodeLine(line) {
    const sep = line.indexOf(':');
    const prefix = line.slice(0, sep);
    const buf = Buffer.from(line.slice(sep + 1), 'base64');
    return prefix === 'ENC' ? this.safeStorage.decryptString(buf) : buf.toString('utf8');
  }

  _lastHashFor(dateStr) {
    if (this._lastHashCache.has(dateStr)) return this._lastHashCache.get(dateStr);
    const existing = this.readDay(dateStr);
    const last = existing.length ? existing[existing.length - 1].hash : GENESIS_HASH;
    this._lastHashCache.set(dateStr, last);
    return last;
  }

  append(sample) {
    const dateStr = new Date(sample.ts).toISOString().slice(0, 10);
    const withPrev = { ...sample, prevHash: this._lastHashFor(dateStr) };
    const record = { ...withPrev, hash: hashRecord(withPrev) };

    fs.appendFileSync(this._fileFor(sample.ts), this._encodeLine(JSON.stringify(record)) + '\n', 'utf8');
    this._lastHashCache.set(dateStr, record.hash);
    return record;
  }

  readDay(dateStr) {
    const file = path.join(this.dataDir, `${dateStr}.jsonl`);
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => this._safeDecode(line))
      .filter(Boolean);
  }

  // A single unreadable line (partial write from a crash, disk corruption,
  // foreign format from an old version) must not take down the whole day's
  // timesheet. It's skipped here; the resulting gap in the hash chain is
  // exactly what verifyDay() surfaces as a detected integrity break.
  _safeDecode(line) {
    try {
      return JSON.parse(this._decodeLine(line));
    } catch (err) {
      console.error('[ActivityStore] skipping unreadable record:', err.message);
      return null;
    }
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

  /**
   * Walk a day's hash chain and confirm nothing was inserted, edited, or
   * removed after the fact. Returns { valid: true, count } or
   * { valid: false, brokenAtIndex, reason }.
   */
  verifyDay(dateStr) {
    const records = this.readDay(dateStr);
    let prev = GENESIS_HASH;
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record.prevHash !== prev) {
        return { valid: false, brokenAtIndex: i, reason: 'chain broken (prevHash mismatch)' };
      }
      if (hashRecord(record) !== record.hash) {
        return { valid: false, brokenAtIndex: i, reason: 'record modified (hash mismatch)' };
      }
      prev = record.hash;
    }
    return { valid: true, count: records.length };
  }
}

module.exports = { ActivityStore, hashRecord, GENESIS_HASH };
