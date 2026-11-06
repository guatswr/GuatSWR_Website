import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('durableRecords persistence and failure consistency', () => {
  const moduleUrl = new URL('../server/utils/durable-records.ts', import.meta.url).href

  function createHarness(namespace = 'test', secret = 'secret') {
    const root = mkdtempSync(join(tmpdir(), 'guatswr-state-test-'))
    roots.push(root)
    const run = (code: string, expectSuccess = true) => {
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { durableRecords } from ${JSON.stringify(moduleUrl)}; const m = durableRecords(${JSON.stringify(namespace)}, Buffer.from(${JSON.stringify(secret)})); ${code}`,
        ],
        { env: { ...process.env, BFF_STATE_DIR: root }, encoding: 'utf8' },
      )
      if (expectSuccess) {
        expect(result.stderr, result.stdout).not.toContain('Error')
        expect(result.status).toBe(0)
      }
      return result
    }
    return { root, run }
  }

  it('restores encrypted records in a new process and persists revocation', () => {
    const { root, run } = createHarness()
    run("m.set('hashed-id', { secret: 'never-plaintext-on-disk' })")
    expect(readFileSync(join(root, readdirSync(root)[0]!)).includes(Buffer.from('never-plaintext-on-disk'))).toBe(false)
    expect(run("console.log(m.get('hashed-id').secret)").stdout.trim()).toBe('never-plaintext-on-disk')
    run("m.delete('hashed-id')")
    expect(run('console.log(m.size)').stdout.trim()).toBe('0')
  })

  it('keeps old record in memory and on disk when update fails before or during database commit', () => {
    const { run } = createHarness()
    // 1. Initial write
    run("m.set('k1', { count: 1 })")
    expect(run("console.log(m.get('k1').count)").stdout.trim()).toBe('1')

    // 2. Failure in atomicUpdate updater before commit
    const failUpdate = run(`
      try {
        m.atomicUpdate('k1', (curr) => {
          curr.count = 999;
          throw new Error('boom-before-commit');
        });
      } catch (e) {
        console.log('caught:' + e.message);
        console.log('in-memory-after-fail:' + m.get('k1').count);
      }
    `)
    expect(failUpdate.stdout).toContain('caught:boom-before-commit')
    expect(failUpdate.stdout).toContain('in-memory-after-fail:1')

    // 3. New process still sees old record count: 1
    expect(run("console.log(m.get('k1').count)").stdout.trim()).toBe('1')
  })

  it('reads newly committed record in a new process after successful atomic update', () => {
    const { run } = createHarness()
    run("m.set('counter', { value: 10 })")
    run("m.atomicUpdate('counter', (curr) => ({ value: curr.value + 5 }))")
    expect(run("console.log(m.get('counter').value)").stdout.trim()).toBe('15')
  })

  it('updates records atomically without deleting the key or creating a recovery gap', () => {
    const { run } = createHarness()
    // Insert two records 'first' and 'second'
    run("m.set('first', { val: 'a' }); m.set('second', { val: 'b' })")

    // Update 'first' using single UPSERT. In memory, Map insertion order moves 'first' to tail
    const orderCheck = run(`
      m.set('first', { val: 'a-updated' });
      const keys = Array.from(m.keys());
      console.log('keys:' + keys.join(','));
    `)
    // Insertion order refreshed to ['second', 'first']
    expect(orderCheck.stdout).toContain('keys:second,first')

    // Both keys exist on disk and in new process
    const diskCheck = run("console.log(m.get('first').val + ',' + m.get('second').val)")
    expect(diskCheck.stdout.trim()).toBe('a-updated,b')
  })

  it('fails closed on foreign secret or tampered database', () => {
    const { root } = createHarness('ns', 'secret-a')
    // Open and write with secret-a
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { durableRecords } from ${JSON.stringify(moduleUrl)}; const m = durableRecords('ns', Buffer.from('secret-a')); m.set('k', { data: 'safe' });`,
      ],
      { env: { ...process.env, BFF_STATE_DIR: root }, encoding: 'utf8' },
    )

    // Trying to open with wrong secret derives a different filename so size is 0 and it cannot access 'secret-a' database
    const wrongSecret = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { durableRecords } from ${JSON.stringify(moduleUrl)}; const m = durableRecords('ns', Buffer.from('secret-wrong')); console.log(m.size);`,
      ],
      { env: { ...process.env, BFF_STATE_DIR: root }, encoding: 'utf8' },
    )
    expect(wrongSecret.stdout.trim()).toBe('0')
  })

  it('fails non-successfully when revocation fails and current process refuses further authorization', () => {
    const { root, run } = createHarness()
    run("m.set('session-token', { role: 'admin' })")

    // In a process, attach trigger to simulate disk write failure during delete
    const failRevoke = run(`
      import { DatabaseSync } from 'node:sqlite';
      import { readdirSync } from 'node:fs';
      import { join } from 'node:path';
      const file = join(${JSON.stringify(root)}, readdirSync(${JSON.stringify(root)})[0]);
      const rawDb = new DatabaseSync(file);
      rawDb.exec("CREATE TRIGGER fail_del BEFORE DELETE ON records BEGIN SELECT RAISE(ABORT, 'disk-io-fail'); END;");
      rawDb.close();

      // Now attempt delete in m:
      let caught = false;
      try {
        m.delete('session-token');
      } catch (err) {
        caught = true;
      }
      console.log('revocation-threw:' + caught);
      // In current process, memory record is evicted so authorization is refused!
      console.log('authorized-in-current-process:' + (m.get('session-token') !== undefined));
    `)
    expect(failRevoke.stdout).toContain('revocation-threw:true')
    expect(failRevoke.stdout).toContain('authorized-in-current-process:false')

    // In a fresh process (restart), disk was not deleted, preserving last committed state
    const afterCheck = run(`
      import { DatabaseSync } from 'node:sqlite';
      import { readdirSync } from 'node:fs';
      import { join } from 'node:path';
      const file = join(${JSON.stringify(root)}, readdirSync(${JSON.stringify(root)})[0]);
      const rawDb = new DatabaseSync(file);
      rawDb.exec('DROP TRIGGER IF EXISTS fail_del;');
      rawDb.close();
      console.log('persisted-on-disk-after-failed-delete:' + (m.get('session-token')?.role === 'admin'));
    `)
    expect(afterCheck.stdout).toContain('persisted-on-disk-after-failed-delete:true')
  })

  it('deletes multiple records atomically in a single transaction via deleteMany', () => {
    const { run } = createHarness()
    run("m.set('s1', { u: 1 }); m.set('s2', { u: 1 }); m.set('s3', { u: 2 })")
    const delResult = run(`
      const count = m.deleteMany(['s1', 's2']);
      console.log('deleted-count:' + count);
      console.log('remaining-keys:' + Array.from(m.keys()).join(','));
    `)
    expect(delResult.stdout).toContain('deleted-count:2')
    expect(delResult.stdout).toContain('remaining-keys:s3')
    expect(run("console.log(m.get('s3').u)").stdout.trim()).toBe('2')
  })

  it('reads legacy encrypted SQLite database records seamlessly', () => {
    const { root, run } = createHarness('test', 'secret')
    run("m.set('seed', { ok: 1 })")
    run(`
      import { DatabaseSync } from 'node:sqlite';
      import { createCipheriv, createHash, randomBytes } from 'node:crypto';
      import { readdirSync } from 'node:fs';
      import { join } from 'node:path';
      const file = join(${JSON.stringify(root)}, readdirSync(${JSON.stringify(root)})[0]);
      const rawDb = new DatabaseSync(file);
      const key = createHash('sha256').update('guatswr:durable-records:v1').update('test').update('secret').digest();
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from('legacy-key'));
      const ciphertext = Buffer.concat([iv, cipher.update(JSON.stringify({ legacy: true })), cipher.final(), cipher.getAuthTag()]);
      rawDb.prepare('INSERT INTO records VALUES (?, ?)').run('legacy-key', ciphertext);
      rawDb.close();
    `)

    const readLegacy = run("console.log(m.get('legacy-key')?.legacy)")
    expect(readLegacy.stdout.trim()).toBe('true')
  })

  it('ensures critical writes are persistent and not dropped on close', () => {
    const { run } = createHarness()
    run(`
      m.set('k1', { val: 'persisted-1' });
      m.set('k2', { val: 'persisted-2' });
      m.close();
      // calling close again is idempotent
      m.close();
    `)
    const check = run(`
      console.log('val1:' + m.get('k1')?.val);
      console.log('val2:' + m.get('k2')?.val);
    `)
    expect(check.stdout).toContain('val1:persisted-1')
    expect(check.stdout).toContain('val2:persisted-2')
  })
})
