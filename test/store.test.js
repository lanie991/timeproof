'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { ActivityStore } = require('../src/store');

const MIN = 60 * 1000;
const DAY = '2026-09-22';
const dayStart = new Date(`${DAY}T09:00:00Z`).getTime();

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'timeproof-store-'));
}

/** A fake safeStorage that actually transforms bytes, to prove the ENC path round-trips. */
function fakeSafeStorage() {
  const KEY = 0x5a;
  return {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(Buffer.from(s, 'utf8').map((b) => b ^ KEY)),
    decryptString: (b) => Buffer.from(Buffer.from(b).map((byte) => byte ^ KEY)).toString('utf8'),
  };
}

describe('ActivityStore', () => {
  it('round-trips records without encryption available (PLAIN framing)', () => {
    const store = new ActivityStore(tmpDir());
    store.append({ ts: dayStart, app: 'Excel', title: 'Doc', idleSeconds: 0, event: 'active' });
    const records = store.readDay(DAY);
    expect(records).toHaveLength(1);
    expect(records[0].app).toBe('Excel');

    const rawLine = fs.readFileSync(path.join(store.dataDir, `${DAY}.jsonl`), 'utf8').trim();
    expect(rawLine.startsWith('PLAIN:')).toBe(true);
    expect(rawLine).not.toContain('Excel'); // base64-framed, not raw JSON on disk
  });

  it('round-trips records through a real encryption backend (ENC framing)', () => {
    const store = new ActivityStore(tmpDir(), { safeStorage: fakeSafeStorage() });
    store.append({ ts: dayStart, app: 'Word', title: 'Report', idleSeconds: 0, event: 'active' });

    const rawLine = fs.readFileSync(path.join(store.dataDir, `${DAY}.jsonl`), 'utf8').trim();
    expect(rawLine.startsWith('ENC:')).toBe(true);
    expect(rawLine).not.toContain('Word');

    const records = store.readDay(DAY);
    expect(records[0].app).toBe('Word');
  });

  it('chains each record to the previous one via prevHash/hash', () => {
    const store = new ActivityStore(tmpDir());
    store.append({ ts: dayStart, app: 'Excel', title: 'A', idleSeconds: 0, event: 'active' });
    store.append({ ts: dayStart + MIN, app: 'Word', title: 'B', idleSeconds: 0, event: 'active' });

    const records = store.readDay(DAY);
    expect(records[0].prevHash).toBe('0'.repeat(64));
    expect(records[1].prevHash).toBe(records[0].hash);
    expect(records[1].hash).not.toBe(records[0].hash);
  });

  it('carries the hash chain across a fresh ActivityStore instance (process restart)', () => {
    const dir = tmpDir();
    const first = new ActivityStore(dir);
    first.append({ ts: dayStart, app: 'Excel', title: 'A', idleSeconds: 0, event: 'active' });

    const second = new ActivityStore(dir);
    second.append({ ts: dayStart + MIN, app: 'Word', title: 'B', idleSeconds: 0, event: 'active' });

    expect(second.verifyDay(DAY)).toEqual({ valid: true, count: 2 });
  });

  it('verifies an untouched day as valid', () => {
    const store = new ActivityStore(tmpDir());
    store.append({ ts: dayStart, app: 'Excel', title: 'A', idleSeconds: 0, event: 'active' });
    store.append({ ts: dayStart + MIN, app: 'Word', title: 'B', idleSeconds: 0, event: 'active' });
    store.append({ ts: dayStart + 2 * MIN, app: 'Slack', title: 'C', idleSeconds: 0, event: 'active' });

    expect(store.verifyDay(DAY)).toEqual({ valid: true, count: 3 });
  });

  it('detects a modified record even if its own hash field is left untouched', () => {
    const store = new ActivityStore(tmpDir());
    store.append({ ts: dayStart, app: 'Excel', title: 'A', idleSeconds: 0, event: 'active' });
    store.append({ ts: dayStart + MIN, app: 'Word', title: 'B', idleSeconds: 0, event: 'active' });

    const file = path.join(store.dataDir, `${DAY}.jsonl`);
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');

    const tampered = JSON.parse(store._decodeLine(lines[1]));
    tampered.app = 'Solitaire'; // attacker inflates/edits a past entry, hash left as-is
    lines[1] = store._encodeLine(JSON.stringify(tampered));
    fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');

    const result = store.verifyDay(DAY);
    expect(result.valid).toBe(false);
    expect(result.brokenAtIndex).toBe(1);
    expect(result.reason).toMatch(/hash mismatch/);
  });

  it('detects a deleted record via a broken prevHash chain', () => {
    const store = new ActivityStore(tmpDir());
    store.append({ ts: dayStart, app: 'Excel', title: 'A', idleSeconds: 0, event: 'active' });
    store.append({ ts: dayStart + MIN, app: 'Word', title: 'B', idleSeconds: 0, event: 'active' });
    store.append({ ts: dayStart + 2 * MIN, app: 'Slack', title: 'C', idleSeconds: 0, event: 'active' });

    const file = path.join(store.dataDir, `${DAY}.jsonl`);
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    lines.splice(1, 1); // remove the middle record
    fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');

    const result = store.verifyDay(DAY);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/prevHash mismatch/);
  });
});
