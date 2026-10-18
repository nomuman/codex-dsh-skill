#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process';
import { constants, accessSync, closeSync, fstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';

const usage = `Usage: DSH_BIN=/absolute/dsh DSH_HOME=/absolute/existing-state node run.mjs
  --repo /absolute/clean-git-root --task-file /absolute/private/task.txt
  [--route auto|opencode-go|opencode-free] (default: auto)
  [--timeout-seconds 900] [--max-log-bytes 8388608] [--max-tokens 8192]
  [--artifacts-dir /absolute/existing-parent]
  [-h | --help]
Node 22+, macOS/Linux. One invocation, no automatic retries. Limits are not cost caps.`;
let activeResult;
const routes = {
  'opencode-go': {
    provider: 'opencode-go', model: 'deepseek-v4.1-flash',
    displayName: 'OpenCode Go (subscription)', apiKeyEnv: 'OPENCODE_GO_API_KEY',
    baseURL: 'https://opencode.ai/inference/go/openai/v1',
  },
  'opencode-free': {
    provider: 'opencode', model: 'deepseek-v4.1-flash-free',
    displayName: 'OpenCode (limited-time free)', apiKeyEnv: 'OPENCODE_API_KEY',
    baseURL: 'https://opencode.ai/inference/openai/v1',
  },
};

function reject(message) { const error = new Error(message); error.safeMessage = message; throw error; }
function inside(path, root) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel));
}
function existing(path, kind) {
  if (!path || !isAbsolute(path)) reject(`${kind} must be an existing absolute path`);
  return realpathSync(path);
}
function git(repo, args) {
  return execFileSync('git', ['--no-optional-locks', '-C', repo, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
function snapshot(repo) {
  return {
    head: git(repo, ['rev-parse', '--verify', 'HEAD']).trim(),
    index: createHash('sha256').update(git(repo, ['ls-files', '--stage', '-z'])).digest('hex'),
    status: git(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    staged: git(repo, ['diff', '--cached', '--name-only', '-z']),
  };
}
function privateFile(path, value, exclusive = true) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | (exclusive ? constants.O_EXCL : constants.O_TRUNC), 0o600);
  try { writeFileSync(fd, value); } finally { closeSync(fd); }
}
function classify(text) {
  if (/api_key_expired/i.test(text)) return 'api_key_expired';
  if (/"code"\s*:\s*"(?:AUTH|INVALID_CREDENTIAL|MISSING_CREDENTIAL)"/.test(text) || /\b401\b|unauthorized|invalid[_ -]?api[_ -]?key|authentication/i.test(text)) return 'authentication';
  if (/quota|insufficient[_ -]?(credit|balance)|usage[_ -]?limit|subscription[_ -]?limit/i.test(text)) return 'quota';
  if (/\b429\b|rate[_ -]?limit|too many requests/i.test(text)) return 'rate_limit';
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|TRANSPORT|connection error|fetch failed|network error/i.test(text)) return 'transport';
  return 'unknown';
}
function patch(route, maxTokens) {
  const disabled = ['session-title-llm', 'compaction-basic', 'command-compact', 'image-offload', 'tool-subagent', 'tool-subagent-fork', 'tool-subagent-control', 'tool-subagent-list-agents', 'tool-workflow', 'workflow-ptc', 'subagent-spawn-in-process', 'subagent-fork-in-process', 'goal-round-driver', 'command-goal', 'tool-goal'];
  return `- id: credentials
  disabled: false
- id: llm-pi-ai
  config:
    providers:
      ${route.provider}:
        displayName: ${route.displayName}
        apiKeyEnv: ${route.apiKeyEnv}
        baseURL: ${route.baseURL}
        reasoning: high
        retryPolicy:
          mode: normal
          maxRetries: 0
        models:
          - id: ${route.model}
            maxTokens: ${maxTokens}
- id: agent-default-model
  config:
    provider: ${route.provider}
    model: ${route.model}
    reasoningEffort: high
${disabled.map(id => `- id: ${id}\n  disabled: true\n`).join('')}`;
}

async function resolveRoute(requested, bin, home, repo, env) {
  if (requested !== 'auto') return requested;
  try {
    const modulePath = createRequire(bin).resolve('@deepseek-ai/dsh-credentials-local');
    const { parseCredentialsDocument } = await import(pathToFileURL(modulePath).href);
    if (typeof parseCredentialsDocument !== 'function') throw new Error('Incompatible credential parser');

    const credentialsPath = join(home, '.credentials.yaml');
    let credentials;
    try {
      const fd = openSync(credentialsPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const metadata = fstatSync(fd);
        if (!metadata.isFile() || metadata.uid !== process.getuid() || (metadata.mode & 0o077) !== 0) throw new Error('Unsafe credential file');
        credentials = readFileSync(fd, 'utf8');
      } finally { closeSync(fd); }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (credentials !== undefined) {
      const document = parseCredentialsDocument(credentials, credentialsPath);
      if (!(document?.refs instanceof Map)) throw new Error('Incompatible credential document');
      if (document.refs.has('OPENCODE_GO_API_KEY')) return 'opencode-go';
    }

    if (env.OPENCODE_GO_API_KEY) return 'opencode-go';
    const dotenv = path => {
      let fd;
      try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
      catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
      try {
        if (!fstatSync(fd).isFile()) throw new Error('Invalid dotenv file');
        return parseEnv(readFileSync(fd, 'utf8'));
      } finally { closeSync(fd); }
    };
    const project = dotenv(join(repo, '.env'));
    const state = dotenv(join(home, '.env'));
    const value = Object.hasOwn(project, 'OPENCODE_GO_API_KEY') ? project.OPENCODE_GO_API_KEY : state.OPENCODE_GO_API_KEY;
    return value ? 'opencode-go' : 'opencode-free';
  } catch {
    reject('Automatic route selection could not read compatible local DSH credential metadata');
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(usage); return; }
  const options = { '--route': 'auto', '--timeout-seconds': '900', '--max-log-bytes': '8388608', '--max-tokens': '8192' };
  const allowed = new Set(['--repo', '--task-file', '--artifacts-dir', ...Object.keys(options)]);
  const supplied = new Set();
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.has(args[i]) || supplied.has(args[i]) || !args[i + 1]) reject('Invalid or duplicate option; use --help');
    supplied.add(args[i]); options[args[i]] = args[i + 1];
  }
  if (options['--route'] !== 'auto' && !Object.hasOwn(routes, options['--route'])) reject('--route must be auto, opencode-go, or opencode-free');
  const positive = key => {
    const value = Number(options[key]);
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483) reject(`${key} must be an integer between 1 and 2147483`);
    return value;
  };
  const timeoutMs = positive('--timeout-seconds') * 1000;
  const maxTokens = positive('--max-tokens');
  const maxLogBytes = Number(options['--max-log-bytes']);
  if (!Number.isSafeInteger(maxLogBytes) || maxLogBytes < 256 || maxLogBytes > 64 * 1024 * 1024) reject('--max-log-bytes must be between 256 and 67108864');
  if (process.platform === 'win32') reject('This runner requires macOS or Linux process groups');
  const repo = existing(options['--repo'], '--repo');
  const bin = existing(process.env.DSH_BIN, 'DSH_BIN');
  const home = existing(process.env.DSH_HOME, 'DSH_HOME');
  accessSync(bin, constants.X_OK);
  if (!statSync(home).isDirectory()) reject('DSH_HOME must be a directory');
  if (inside(home, repo)) reject('DSH_HOME must be outside the repository');
  if (existing(git(repo, ['rev-parse', '--show-toplevel']).trim(), 'Git root') !== repo) reject('--repo must be the exact Git root');
  const before = snapshot(repo);
  if (before.status || before.staged) reject('Repository must have no tracked, staged, or untracked changes');
  const taskPath = existing(options['--task-file'], '--task-file');
  if (inside(taskPath, repo)) reject('Keep the task file outside the repository');
  const taskFd = openSync(taskPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let task;
  try {
    const metadata = fstatSync(taskFd);
    if (!metadata.isFile() || metadata.size === 0 || metadata.size > 1024 * 1024) reject('Task file must contain 1 to 1048576 bytes');
    task = readFileSync(taskFd, 'utf8');
    if (!task.trim()) reject('Task file must contain a non-whitespace instruction');
  } finally { closeSync(taskFd); }
  const parent = existing(options['--artifacts-dir'] || realpathSync(tmpdir()), '--artifacts-dir');
  if (!statSync(parent).isDirectory() || inside(parent, repo) || inside(parent, home)) reject('Artifact parent must be a directory outside the repository and DSH_HOME');
  const selectedRoute = await resolveRoute(options['--route'], bin, home, repo, process.env);
  const route = routes[selectedRoute];
  const runDir = mkdtempSync(join(parent, 'dsh-delegate-'));
  mkdirSync(join(runDir, 'evidence'), { mode: 0o700 });
  const files = Object.fromEntries(['summary.json', 'before.json', 'after.json', 'prompt.txt', 'patch.yml', 'events.jsonl', 'stderr.log', 'answer.txt'].map(name => [name, join(runDir, 'evidence', name)]));
  const result = {
    outcome: 'incomplete', category: 'unknown', codexVerified: false,
    requestedRoute: options['--route'], route: selectedRoute, provider: route.provider, model: route.model,
    runDir, summaryPath: files['summary.json'], exitCode: null, signal: null,
    sessionId: null, lastTurnReason: null, stopReason: null, outputBytes: 0,
    protocolError: false, integrityFailure: false,
  };
  activeResult = result;
  const save = () => privateFile(files['summary.json'], JSON.stringify(result, null, 2) + '\n', false);
  privateFile(files['summary.json'], JSON.stringify(result, null, 2) + '\n');
  privateFile(files['before.json'], JSON.stringify(before, null, 2) + '\n');
  const prompt = `Work only on the task below in the current repository. Preserve unrelated files and secrets.
Do not commit, push, deploy, change credentials, or change Git history. Report changes, tests actually run, and remaining limitations.
Follow repository instructions. Stop and report when blocked instead of retrying provider requests.
\nTask:\n${task}`;
  privateFile(files['prompt.txt'], prompt);
  privateFile(files['patch.yml'], patch(route, maxTokens));
  const stdoutFd = openSync(files['events.jsonl'], 'wx', 0o600);
  const stderrFd = openSync(files['stderr.log'], 'wx', 0o600);
  let finalText = '';
  let stderrTail = '';
  let eventErrors = '';
  let line = '';
  let finalSeen = false;
  let turnEnded = false;
  let eventIndex = 0;
  let lastEndIndex = -1;
  let finalIndex = -1;
  let lastProgress = 0;
  const decoder = new StringDecoder('utf8');
  const child = spawn(bin, ['headless', '--patch', files['patch.yml'], '--json'], {
    cwd: repo, env: { ...process.env, DSH_HOME: home }, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  console.error('dsh-delegate: started');
  let stopWait;
  let drainTimer;
  let finishProcess;
  const processFinished = new Promise(done => { finishProcess = done; });
  const boundDrain = () => {
    drainTimer ||= setTimeout(() => {
      result.stopReason ||= 'stream_drain_timeout';
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
      child.unref();
      finishProcess();
    }, 2000);
  };
  const killGroup = signal => {
    if (!child.pid) return;
    try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') result.integrityFailure = true; }
  };
  const groupExists = () => {
    if (!child.pid) return false;
    try { process.kill(-child.pid, 0); return true; }
    catch (error) {
      if (error.code === 'ESRCH') return false;
      result.integrityFailure = true;
      return true;
    }
  };
  const terminateGroup = () => {
    killGroup('SIGTERM');
    return new Promise(done => setTimeout(() => { killGroup('SIGKILL'); done(); }, 1500));
  };
  const stop = reason => {
    if (result.stopReason) return;
    result.stopReason = reason;
    stopWait ||= terminateGroup();
    boundDrain();
  };
  const cancel = signal => stop(signal === 'SIGINT' ? 'cancelled_sigint' : 'cancelled_sigterm');
  const onInt = () => cancel('SIGINT');
  const onTerm = () => cancel('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  const timer = setTimeout(() => stop('timeout'), timeoutMs);
  const protocol = () => { result.protocolError = true; stop('protocol'); };
  function event(raw) {
    if (!raw.trim() || result.protocolError) return;
    if (Buffer.byteLength(raw) > Math.min(maxLogBytes, 256 * 1024)) { result.protocolError = true; stop('line_limit'); return; }
    let value;
    try { value = JSON.parse(raw); } catch { protocol(); return; }
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.type !== 'string') { protocol(); return; }
    if (finalSeen) { protocol(); return; }
    eventIndex++;
    if (value.type === 'status' && ['turn_start', 'step_end', 'turn_end'].includes(value.phase) && Date.now() - lastProgress > 1000) {
      console.error(`dsh-delegate: ${value.phase} event=${eventIndex}`); lastProgress = Date.now();
    }
    if (value.type === 'session') {
      if (result.sessionId || typeof value.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.sessionId) || value.cwd !== repo) protocol();
      else result.sessionId = value.sessionId;
    } else if (!result.sessionId && value.type !== 'error' && !(value.type === 'status' && value.phase === 'error')) protocol();
    if (value.type === 'error' || (value.type === 'status' && value.phase === 'error')) eventErrors += JSON.stringify(value).slice(0, 16384);
    if (value.type === 'status' && value.phase === 'turn_start') turnEnded = false;
    if (value.type === 'status' && value.phase === 'turn_end') {
      result.lastTurnReason = typeof value.reason?.kind === 'string' && /^[a-z_-]{1,64}$/.test(value.reason.kind) ? value.reason.kind : null;
      if (value.reason?.error) eventErrors += JSON.stringify(value.reason.error).slice(0, 16384);
      turnEnded = true; lastEndIndex = eventIndex;
    }
    if (value.type === 'final') {
      if (finalSeen || !turnEnded || typeof value.text !== 'string') protocol();
      finalSeen = true; finalText = typeof value.text === 'string' ? value.text : ''; finalIndex = eventIndex;
    }
  }
  function consume(chunk, fd, stdout) {
    const remaining = Math.max(0, maxLogBytes - result.outputBytes);
    const kept = chunk.subarray(0, remaining);
    if (kept.length) writeSync(fd, kept);
    result.outputBytes += kept.length;
    if (chunk.length > remaining) stop('output_limit');
    if (!stdout) { stderrTail = (stderrTail + kept.toString('utf8')).slice(-65536); return; }
    line += decoder.write(kept);
    let newline;
    while ((newline = line.indexOf('\n')) !== -1) {
      const raw = line.slice(0, newline); line = line.slice(newline + 1); event(raw);
    }
    if (Buffer.byteLength(line) > Math.min(maxLogBytes, 256 * 1024)) { result.protocolError = true; line = ''; stop('line_limit'); }
  }
  const receive = (chunk, fd, stdout) => {
    try { consume(chunk, fd, stdout); } catch { stop('runner_io_error'); }
  };
  child.stdout.on('data', chunk => receive(chunk, stdoutFd, true));
  child.stderr.on('data', chunk => receive(chunk, stderrFd, false));
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);
  child.on('error', () => { result.category = 'spawn_error'; });
  child.once('exit', (code, signal) => {
    result.exitCode = code; result.signal = signal;
    if (!stopWait && groupExists()) stopWait = terminateGroup();
    boundDrain();
  });
  child.once('close', (code, signal) => {
    result.exitCode = code; result.signal = signal;
    clearTimeout(drainTimer);
    finishProcess();
  });
  await processFinished;
  clearTimeout(timer);
  line += decoder.end();
  if (line) event(line);
  if (!stopWait && groupExists()) stopWait = terminateGroup();
  if (stopWait) await stopWait;
  process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
  closeSync(stdoutFd); closeSync(stderrFd);
  privateFile(files['answer.txt'], finalText);
  try {
    const after = snapshot(repo);
    privateFile(files['after.json'], JSON.stringify(after, null, 2) + '\n');
    result.integrityFailure ||= after.head !== before.head || after.index !== before.index || !!after.staged;
  } catch { result.integrityFailure = true; }
  const completed = result.exitCode === 0 && result.sessionId && result.lastTurnReason === 'completed' && turnEnded && finalSeen && finalIndex > lastEndIndex && !eventErrors && !result.protocolError && !result.stopReason && !result.integrityFailure;
  result.outcome = completed ? 'completed' : 'failed';
  if (completed) result.category = null;
  else if (result.integrityFailure) result.category = 'integrity';
  else if (result.stopReason) result.category = result.stopReason;
  else if (result.protocolError) result.category = 'protocol';
  else if (result.lastTurnReason === 'max-tokens') result.category = 'max_tokens';
  else if (result.category !== 'spawn_error') result.category = classify(eventErrors + '\n' + stderrTail);
  save();
  console.log(JSON.stringify(result));
  process.exitCode = completed ? 0 : 1;
}

main().catch(error => {
  const result = activeResult || { outcome: 'failed', codexVerified: false };
  result.category = activeResult ? 'runner_error' : 'preflight_or_runner_error';
  if (activeResult) {
    try { privateFile(result.summaryPath, JSON.stringify(result, null, 2) + '\n', false); } catch {}
  }
  console.log(JSON.stringify({ ...result, detail: error.safeMessage, advice: 'Check --help and local path, permission, and Git prerequisites. No automatic retry.' }));
  process.exitCode = 1;
});
