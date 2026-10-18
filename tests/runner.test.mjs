import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const runner = resolve(dirname(fileURLToPath(import.meta.url)), '../dsh-delegate/scripts/run.mjs');
const fake = `#!${process.execPath}
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { join } from 'node:path';
const mode = process.env.FAKE_MODE;
let input = '';
for await (const chunk of process.stdin) input += chunk;
writeFileSync(join(process.env.DSH_HOME, 'invocation.json'), JSON.stringify({ args: process.argv.slice(2), input }));
const emit = value => process.stdout.write(JSON.stringify(value) + '\\n');
const session = () => emit({ type: 'session', sessionId: 'test-session', cwd: process.cwd() });
const end = kind => emit({ type: 'status', phase: 'turn_end', turn: 1, reason: { kind } });
const final = () => emit({ type: 'final', text: 'private answer 日本語' });
if (mode === 'hang' || mode === 'orphan') {
  if (mode === 'orphan') {
    spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{}); require('node:fs').writeFileSync(process.argv[1],String(process.pid)); setInterval(()=>{},1000)", join(process.env.DSH_HOME, 'child.pid')], { stdio: 'ignore' });
  }
  session();
  writeFileSync(join(process.env.DSH_HOME, 'ready'), 'yes');
  setInterval(() => {}, 1000);
} else if (mode === 'flood') {
  process.stdout.write('x'.repeat(100000));
} else if (mode === 'stderr-flood') {
  process.stderr.write('x'.repeat(100000));
} else if (mode === 'line') {
  process.stdout.write('x'.repeat(300000) + '\\n');
} else if (mode === 'invalid') {
  process.stdout.write('private invalid JSON\\n');
  setInterval(() => {}, 1000);
} else if (mode.startsWith('success-orphan')) {
  const child = spawn(process.execPath, ['-e', "const fs=require('node:fs'); process.on('SIGTERM',()=>fs.writeFileSync('cleanup.txt','TERM received')); fs.writeFileSync(process.argv[1],String(process.pid)); setTimeout(()=>fs.writeFileSync('result.txt','late mutation'),2300); process.send('ready'); process.disconnect(); setInterval(()=>{},1000)", join(process.env.DSH_HOME, 'child.pid')], { stdio: ['ignore', mode.endsWith('-pipes') ? 'inherit' : 'ignore', mode.endsWith('-pipes') ? 'inherit' : 'ignore', 'ipc'] });
  await new Promise(resolve => child.once('message', resolve));
  child.unref();
  session(); end('completed'); final();
} else if (mode.startsWith('code:')) {
  emit({ type: 'error', error: { code: mode.slice(5) } });
  process.exitCode = 1;
} else if (mode === 'before-session-error') {
  emit({ type: 'error', error: { code: 'ENOTFOUND' } });
} else {
  session();
  emit({ type: 'status', phase: 'turn_start', turn: 1 });
  if (mode === 'turn-reason-error') {
    emit({ type: 'status', phase: 'turn_end', turn: 1, reason: { kind: 'error', error: { code: 'AUTH', status: 401 } } }); final();
  } else if (mode === 'zero-error') {
    emit({ type: 'error', message: 'quota exhausted' }); end('completed'); final();
  } else if (mode.startsWith('error:')) {
    emit({ type: 'error', error: mode.slice(6) });
    process.stderr.write('sensitive stderr ' + mode.slice(6));
    end('error'); final(); process.exitCode = 1;
  } else if (mode === 'max-tokens') { end('max-tokens'); final(); }
  else if (mode === 'false-final') { end('aborted'); final(); }
  else if (mode === 'missing-final') { end('completed'); }
  else if (mode === 'final-first') { final(); end('completed'); }
  else if (mode === 'later-error') { end('completed'); end('error'); final(); }
  else if (mode === 'later-start') { end('completed'); final(); emit({ type: 'status', phase: 'turn_start', turn: 2 }); }
  else if (mode === 'no-newline') { end('completed'); process.stdout.write(JSON.stringify({ type: 'final', text: 'no newline' })); }
  else if (mode === 'stage') {
    writeFileSync('result.txt', 'changed'); execFileSync('git', ['add', 'result.txt']); end('completed'); final();
  } else if (mode === 'commit') {
    writeFileSync('result.txt', 'changed'); execFileSync('git', ['add', 'result.txt']);
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'unexpected']); end('completed'); final();
  } else if (mode === 'split') {
    end('completed');
    const bytes = Buffer.from(JSON.stringify({ type: 'final', text: '日本語' }) + '\\n');
    const split = bytes.indexOf(Buffer.from('日')) + 1;
    process.stdout.write(bytes.subarray(0, split));
    setTimeout(() => process.stdout.write(bytes.subarray(split)), 10);
  } else {
    if (mode === 'git-status') execFileSync('git', ['status', '--porcelain']);
    writeFileSync('result.txt', 'changed'); end('completed'); final();
  }
}
`;

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-test-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo'); const home = join(root, 'state'); const artifacts = join(root, 'runs');
  for (const path of [repo, home, artifacts]) mkdirSync(path, { mode: 0o700 });
  git(repo, 'init', '-q');
  writeFileSync(join(repo, 'result.txt'), 'original');
  git(repo, 'add', 'result.txt');
  git(repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  const bin = join(root, 'fake-dsh.mjs'); writeFileSync(bin, fake); chmodSync(bin, 0o700);
  const task = join(root, 'task.txt'); writeFileSync(task, 'Change result.txt. $(touch INJECTED) ; echo literal');
  return { root, repo, home, artifacts, bin, task };
}
function run(f, mode = 'success', extra = [], env = {}) {
  const bounds = extra.includes('--timeout-seconds') ? [] : ['--timeout-seconds', '6'];
  const child = spawn(process.execPath, [runner, '--repo', f.repo, '--task-file', f.task, '--artifacts-dir', f.artifacts, ...bounds, ...extra], {
    env: { ...process.env, DSH_BIN: f.bin, DSH_HOME: f.home, FAKE_MODE: mode, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const done = new Promise((resolve, reject) => {
    let stdout = ''; let stderr = '';
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr, summary: JSON.parse(stdout.trim()) }));
  });
  return { child, done };
}
async function waitFor(path) {
  for (let i = 0; i < 400; i++) {
    if (existsSync(path)) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail('Fixture process did not become ready');
}

test('prints the same help and exits 0 for -h and --help without configuration', async () => {
  const env = { ...process.env };
  delete env.DSH_BIN; delete env.DSH_HOME;
  const help = async alias => {
    const child = spawn(process.execPath, [runner, alias], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    return { code, stdout, stderr };
  };
  const short = await help('-h'); const long = await help('--help');
  for (const result of [short, long]) {
    assert.equal(result.code, 0);
    assert.match(result.stdout, /^Usage:/);
    assert.match(result.stdout, /-h \| --help/);
    assert.equal(result.stderr, '');
  }
  assert.equal(short.stdout, long.stdout);
});

test('one process receives stdin literally, preserves credentials, and produces private review evidence', async t => {
  const f = fixture(t); const credentials = join(f.home, '.credentials.yaml');
  writeFileSync(credentials, 'test credential fixture', { mode: 0o600 });
  const { code, stdout, stderr, summary } = await run(f).done;
  assert.equal(code, 0); assert.equal(summary.outcome, 'completed'); assert.equal(summary.codexVerified, false);
  assert.equal(summary.category, null); assert.equal(summary.sessionId, 'test-session');
  assert.equal(readFileSync(credentials, 'utf8'), 'test credential fixture');
  assert.equal(readFileSync(join(f.repo, 'result.txt'), 'utf8'), 'changed');
  assert.equal(existsSync(join(f.repo, 'INJECTED')), false);
  const invocation = JSON.parse(readFileSync(join(f.home, 'invocation.json')));
  assert.deepEqual(invocation.args.filter(arg => arg === 'headless' || arg === '--json'), ['headless', '--json']);
  assert.ok(invocation.input.includes('$(touch INJECTED) ; echo literal'));
  assert.equal(invocation.args.some(arg => arg.includes('Change result.txt')), false);
  const evidence = dirname(summary.summaryPath);
  assert.equal(statSync(summary.runDir).mode & 0o777, 0o700);
  assert.equal(statSync(evidence).mode & 0o777, 0o700);
  for (const file of readdirSync(evidence)) assert.equal(statSync(join(evidence, file)).mode & 0o777, 0o600);
  assert.equal(readFileSync(join(evidence, 'answer.txt'), 'utf8'), 'private answer 日本語');
  assert.ok(!stdout.includes('private answer') && !stderr.includes('private answer'));
  const patch = readFileSync(join(evidence, 'patch.yml'), 'utf8');
  assert.match(patch, /opencode-go:/); assert.match(patch, /maxRetries: 0/); assert.match(patch, /maxTokens: 8192/);
});

for (const mode of ['false-final', 'missing-final', 'final-first', 'later-error', 'later-start', 'invalid', 'zero-error']) {
  test(`does not report success for ${mode}`, async t => {
    const result = await run(fixture(t), mode).done;
    assert.equal(result.code, 1); assert.equal(result.summary.outcome, 'failed');
  });
}

test('classifies errors reported in turn reasons or before session initialization', async t => {
  for (const [mode, category] of [['turn-reason-error', 'authentication'], ['before-session-error', 'transport']]) {
    const result = await run(fixture(t), mode).done;
    assert.equal(result.code, 1); assert.equal(result.summary.category, category);
  }
});

for (const code of ['AUTH', 'INVALID_CREDENTIAL', 'MISSING_CREDENTIAL', 'AUTH_OTHER', 'MISSING_CREDENTIALS']) {
  test(`classifies code-only ${code} without stderr`, async t => {
    const result = await run(fixture(t), `code:${code}`).done;
    assert.equal(result.code, 1);
    assert.equal(result.summary.category, ['AUTH', 'INVALID_CREDENTIAL', 'MISSING_CREDENTIAL'].includes(code) ? 'authentication' : 'unknown');
    assert.equal(readFileSync(join(dirname(result.summary.summaryPath), 'stderr.log'), 'utf8'), '');
  });
}

test('preserves max-tokens turn reason without reporting completion', async t => {
  const result = await run(fixture(t), 'max-tokens').done;
  assert.equal(result.code, 1); assert.equal(result.summary.outcome, 'failed');
  assert.equal(result.summary.lastTurnReason, 'max-tokens');
});

test('ordinary Git status and allowed edits preserve semantic index integrity', async t => {
  const result = await run(fixture(t), 'git-status').done;
  assert.equal(result.code, 0); assert.equal(result.summary.integrityFailure, false);
});

test('decodes multibyte UTF-8 across chunks', async t => {
  const { summary, code } = await run(fixture(t), 'split').done;
  assert.equal(code, 0);
  assert.equal(readFileSync(join(dirname(summary.summaryPath), 'answer.txt'), 'utf8'), '日本語');
});

test('accepts a final JSON line without a newline', async t => {
  const { summary, code } = await run(fixture(t), 'no-newline').done;
  assert.equal(code, 0); assert.equal(summary.outcome, 'completed');
});

for (const [error, category] of [
  ['401 api_key_expired', 'api_key_expired'], ['401 unauthorized', 'authentication'],
  ['429 quota exhausted', 'quota'], ['429 too many requests', 'rate_limit'],
  ['TRANSPORT ENOTFOUND', 'transport'], ['unrecognized failure', 'unknown'],
]) {
  test(`classifies ${category} without printing provider content`, async t => {
    const result = await run(fixture(t), `error:${error}`).done;
    assert.equal(result.summary.category, category); assert.equal(result.code, 1);
    assert.ok(!result.stdout.includes('sensitive stderr') && !result.stderr.includes(error));
  });
}

for (const dirt of ['tracked', 'staged', 'untracked']) {
  test(`refuses ${dirt} work before invoking DSH`, async t => {
    const f = fixture(t);
    writeFileSync(join(f.repo, dirt === 'untracked' ? 'new.txt' : 'result.txt'), 'keep user work');
    if (dirt === 'staged') git(f.repo, 'add', 'result.txt');
    const before = git(f.repo, 'status', '--porcelain');
    const result = await run(f).done;
    assert.equal(result.code, 1); assert.equal(existsSync(join(f.home, 'invocation.json')), false);
    assert.equal(git(f.repo, 'status', '--porcelain'), before);
  });
}

test('refuses subdirectories and repositories without HEAD', async t => {
  for (const mode of ['subdirectory', 'unborn']) {
    const f = fixture(t);
    if (mode === 'subdirectory') { mkdirSync(join(f.repo, 'sub')); f.repo = join(f.repo, 'sub'); }
    else { f.repo = join(f.root, 'unborn'); mkdirSync(f.repo); git(f.repo, 'init', '-q'); }
    assert.equal((await run(f).done).code, 1);
    assert.equal(existsSync(join(f.home, 'invocation.json')), false);
  }
});

test('checks canonical artifact containment through symlinks', async t => {
  for (const target of ['repo', 'home']) {
    const f = fixture(t); const link = join(f.root, 'alias');
    symlinkSync(f[target], link); f.artifacts = link;
    const result = await run(f).done;
    assert.equal(result.code, 1); assert.equal(existsSync(join(f.home, 'invocation.json')), false);
  }
});

test('refuses a whitespace-only task before invoking DSH', async t => {
  const f = fixture(t); writeFileSync(f.task, ' \n\t');
  const result = await run(f).done;
  assert.equal(result.code, 1); assert.equal(existsSync(join(f.home, 'invocation.json')), false);
});

for (const mode of ['stage', 'commit']) {
  test(`records unexpected ${mode} as integrity failure without rollback`, async t => {
    const f = fixture(t); const result = await run(f, mode).done;
    assert.equal(result.summary.category, 'integrity'); assert.equal(result.code, 1);
    assert.equal(readFileSync(join(f.repo, 'result.txt'), 'utf8'), 'changed');
  });
}

test('bounds total stdout and stderr bytes and stops oversized lines', async t => {
  for (const [mode, args, expected, bound] of [
    ['flood', ['--max-log-bytes', '1024'], 'output_limit', 1024],
    ['stderr-flood', ['--max-log-bytes', '1024'], 'output_limit', 1024],
    ['line', [], 'line_limit', 8388608],
  ]) {
    const result = await run(fixture(t), mode, args).done;
    assert.equal(result.summary.category, expected); assert.equal(result.code, 1);
    const directory = dirname(result.summary.summaryPath);
    assert.ok(statSync(join(directory, 'events.jsonl')).size + statSync(join(directory, 'stderr.log')).size <= bound);
  }
});

for (const mode of ['success-orphan', 'success-orphan-pipes']) {
  test(`successful leader exit cleans ${mode} before the after snapshot`, async t => {
    const f = fixture(t);
    let pid;
    t.after(() => {
      if (!pid) return;
      try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    });
    const result = await run(f, mode).done;
    pid = Number(readFileSync(join(f.home, 'child.pid'), 'utf8'));
    assert.equal(result.code, 0); assert.equal(result.summary.outcome, 'completed');
    assert.equal(result.summary.stopReason, null);
    let alive = true;
    for (let i = 0; i < 80; i++) {
      try { process.kill(pid, 0); } catch (error) { assert.equal(error.code, 'ESRCH'); alive = false; break; }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(alive, false, 'Descendant must not survive successful runner completion');
    const after = JSON.parse(readFileSync(join(dirname(result.summary.summaryPath), 'after.json'), 'utf8'));
    assert.ok(after.status.includes('cleanup.txt'), 'Snapshot must include cleanup activity before completion');
    await new Promise(resolve => setTimeout(resolve, 1000));
    assert.equal(readFileSync(join(f.repo, 'result.txt'), 'utf8'), 'original', 'No delayed mutation after the summary');
  });
}

test('timeout kills a TERM-resistant descendant after its leader exits', async t => {
  const f = fixture(t); const result = await run(f, 'orphan', ['--timeout-seconds', '1']).done;
  assert.equal(result.summary.category, 'timeout'); assert.equal(result.code, 1);
  const pid = Number(readFileSync(join(f.home, 'child.pid'), 'utf8'));
  let alive = true;
  for (let i = 0; i < 80; i++) {
    try { process.kill(pid, 0); } catch { alive = false; break; }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal(alive, false, 'Descendant must not survive runner completion');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`handles ${signal} with a saved cancellation outcome`, async t => {
    const f = fixture(t); const invocation = run(f, 'hang');
    try {
      await waitFor(join(f.home, 'ready'));
      invocation.child.kill(signal);
      const result = await invocation.done;
      assert.equal(result.code, 1); assert.equal(result.summary.category, `cancelled_${signal.toLowerCase()}`);
      assert.equal(JSON.parse(readFileSync(result.summary.summaryPath)).category, result.summary.category);
    } finally {
      if (invocation.child.exitCode === null && invocation.child.signalCode === null) invocation.child.kill('SIGTERM');
      await invocation.done;
    }
  });
}
