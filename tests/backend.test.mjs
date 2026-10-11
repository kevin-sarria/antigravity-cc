import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBackendArgs,
  parseGeminiJson,
  parseAgyStream,
  encodePrompt,
  toolPolicy,
  diagnoseError,
  cleanOutput,
} from '../bin/agy-wrapper.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wrapperPath = path.resolve(__dirname, '../bin/agy-wrapper.mjs');
const IS_WINDOWS = process.platform === 'win32';

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('buildBackendArgs', () => {
  const gemini = { bin: 'gemini', type: 'gemini' };
  const codex = { bin: 'codex', type: 'codex' };
  const agy = { bin: 'agy', type: 'antigravity' };

  test('read mode keeps Gemini default approval (writes denied in headless)', () => {
    const args = withEnv({ AGY_MODEL: undefined }, () => buildBackendArgs(gemini, 'read'));
    assert.deepEqual(args.slice(args.indexOf('--approval-mode'), args.indexOf('--approval-mode') + 2), ['--approval-mode', 'default']);
    assert.ok(args.includes('--output-format'));
    assert.ok(args.includes('-p'));
  });

  test('write mode uses auto_edit by default and yolo on request', () => {
    const def = withEnv({ AGY_APPROVAL_MODE: undefined }, () => buildBackendArgs(gemini, 'write'));
    assert.equal(def[def.indexOf('--approval-mode') + 1], 'auto_edit');
    const yolo = withEnv({ AGY_APPROVAL_MODE: 'yolo' }, () => buildBackendArgs(gemini, 'write'));
    assert.equal(yolo[yolo.indexOf('--approval-mode') + 1], 'yolo');
  });

  test('rejects invalid approval mode and unsafe model names', () => {
    assert.throws(() => withEnv({ AGY_APPROVAL_MODE: 'plan' }, () => buildBackendArgs(gemini, 'write')));
    assert.throws(() => withEnv({ AGY_MODEL: 'x & calc' }, () => buildBackendArgs(gemini, 'read')));
  });

  test('codex reads prompt from stdin with the right sandbox', () => {
    const read = withEnv({ AGY_MODEL: undefined }, () => buildBackendArgs(codex, 'read'));
    assert.equal(read[read.indexOf('--sandbox') + 1], 'read-only');
    assert.equal(read.at(-1), '-');
    const write = withEnv({ AGY_MODEL: undefined }, () => buildBackendArgs(codex, 'write'));
    assert.equal(write[write.indexOf('--sandbox') + 1], 'workspace-write');
  });

  test('antigravity: stream-json over stdin, read mode grants nothing, write mode accept-edits or yolo', () => {
    const read = withEnv({ AGY_MODEL: undefined }, () => buildBackendArgs(agy, 'read', 120000));
    assert.deepEqual(read.slice(0, 4), ['--input-format', 'stream-json', '--output-format', 'stream-json']);
    assert.equal(read[read.indexOf('--print-timeout') + 1], '105s');
    assert.equal(read.at(-1), '-p=');
    assert.ok(!read.includes('--mode') && !read.includes('--dangerously-skip-permissions'));

    const write = withEnv({ AGY_APPROVAL_MODE: undefined }, () => buildBackendArgs(agy, 'write'));
    assert.equal(write[write.indexOf('--mode') + 1], 'accept-edits');
    const yolo = withEnv({ AGY_APPROVAL_MODE: 'yolo' }, () => buildBackendArgs(agy, 'write'));
    assert.ok(yolo.includes('--dangerously-skip-permissions'));
    assert.ok(!yolo.includes('--mode'));
  });

  test('never places user text in arguments', () => {
    for (const mode of ['read', 'write']) {
      for (const backend of [gemini, codex, agy]) {
        const args = withEnv({ AGY_MODEL: undefined, AGY_APPROVAL_MODE: undefined }, () => buildBackendArgs(backend, mode));
        for (const a of args) assert.match(a, /^[A-Za-z0-9._:\/=-]+$/);
      }
    }
  });
});

describe('antigravity prompt encoding', () => {
  const agy = { bin: 'agy', type: 'antigravity' };

  test('encodePrompt wraps text in a stream-json user event', () => {
    const line = encodePrompt(agy, 'hola "mundo"\n& rm');
    assert.ok(line.endsWith('\n'));
    assert.deepEqual(JSON.parse(line), { event: 'user', message: { content: 'hola "mundo"\n& rm' } });
  });

  test('toolPolicy forbids shell unless yolo and forbids writes in read mode', () => {
    const read = withEnv({ AGY_APPROVAL_MODE: undefined }, () => toolPolicy(agy, 'read'));
    assert.match(read, /NO uses RunCommand/);
    assert.match(read, /NO crees, edites ni borres/);
    const write = withEnv({ AGY_APPROVAL_MODE: undefined }, () => toolPolicy(agy, 'write'));
    assert.match(write, /Puedes crear y editar/);
    assert.equal(withEnv({ AGY_APPROVAL_MODE: 'yolo' }, () => toolPolicy(agy, 'write')), '');
    assert.equal(toolPolicy({ bin: 'gemini', type: 'gemini' }, 'read'), '');
  });

  test('parseAgyStream returns the final result event', () => {
    const out = [
      '{"event":"init","init":{}}',
      'jetski: ruido',
      '{"event":"step_update","step_update":{}}',
      '{"event":"result","result":{"status":"SUCCESS","response":"OK"}}',
    ].join('\n');
    assert.deepEqual(parseAgyStream(out), { status: 'SUCCESS', response: 'OK' });
    assert.equal(parseAgyStream('sin eventos'), null);
  });
});

describe('output helpers', () => {
  test('parseGeminiJson extracts response and tolerates leading noise', () => {
    const parsed = parseGeminiJson('Warning: x\n{"response":"hola","stats":{}}');
    assert.equal(parsed.response, 'hola');
    assert.equal(parseGeminiJson('texto plano'), null);
  });

  test('cleanOutput drops color and ripgrep banners', () => {
    const raw = 'Warning: True color (24-bit) support not detected. foo\nRipgrep is not available. x\nreal';
    assert.equal(cleanOutput(raw), 'real');
  });

  test('diagnoseError points to Antigravity CLI for ineligible tier and missing backend', () => {
    const hints = diagnoseError('IneligibleTierError: UNSUPPORTED_CLIENT').join('\n');
    assert.match(hints, /winget install Google\.AntigravityCLI/);
    assert.match(diagnoseError('NOT_INSTALLED: x').join('\n'), /antigravity\.google\/cli/);
    assert.match(diagnoseError('DENIED: x').join('\n'), /AGY_APPROVAL_MODE=yolo/);
  });
});

describe('end-to-end with a fake Gemini backend', () => {
  let dir;
  let fakeBin;

  before(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'agy-fake-'));
    // Echo back what the wrapper sent, in Gemini's JSON output format.
    writeFileSync(
      path.join(dir, 'fake.mjs'),
      [
        "let stdin = '';",
        "process.stdin.on('data', (c) => (stdin += c));",
        "process.stdin.on('end', () => {",
        '  const report = { args: process.argv.slice(2), stdin, hasKey: Boolean(process.env.GEMINI_API_KEY) };',
        '  process.stdout.write(JSON.stringify({ response: JSON.stringify(report) }));',
        '});',
      ].join('\n')
    );
    if (IS_WINDOWS) {
      fakeBin = path.join(dir, 'fake-gemini.cmd');
      writeFileSync(fakeBin, '@node "%~dp0fake.mjs" %*\r\n');
    } else {
      fakeBin = path.join(dir, 'fake-gemini');
      writeFileSync(fakeBin, `#!/bin/sh\nexec node "${path.join(dir, 'fake.mjs')}" "$@"\n`);
      chmodSync(fakeBin, 0o755);
    }
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  function run(action, input, extraEnv = {}) {
    const out = execFileSync('node', [wrapperPath, action], {
      input,
      encoding: 'utf-8',
      env: { ...process.env, AGY_BIN: fakeBin, GEMINI_API_KEY: 'dummy-value', AGY_AUTH_MODE: '', ...extraEnv },
    });
    const json = out.slice(out.indexOf('{"args"'), out.lastIndexOf('}') + 1);
    return JSON.parse(json);
  }

  test('delegate sends stdin text (with shell metacharacters) intact and in write mode', () => {
    const tricky = 'Crear "x" & echo PWNED | y; `z` $(w)';
    const report = run('delegate', tricky);
    assert.ok(report.stdin.includes(tricky));
    assert.equal(report.args[report.args.indexOf('--approval-mode') + 1], 'auto_edit');
  });

  test('challenge runs read-only', () => {
    const report = run('challenge', '¿Usar Redis?');
    assert.equal(report.args[report.args.indexOf('--approval-mode') + 1], 'default');
  });

  test('API keys are stripped unless AGY_AUTH_MODE=apikey', () => {
    assert.equal(run('challenge', 'a').hasKey, false);
    assert.equal(run('challenge', 'a', { AGY_AUTH_MODE: 'apikey' }).hasKey, true);
  });
});

describe('end-to-end with a fake Antigravity CLI (agy)', () => {
  let dir;
  let fakeBin;

  before(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'agy-fake-agy-'));
    // Mimics agy: advertises agy-only flags in --help, reads one stream-json event from stdin and
    // emits stream-json events. "DENYME" in the prompt simulates a turn aborted by a denied tool.
    writeFileSync(
      path.join(dir, 'fake-agy.mjs'),
      [
        "if (process.argv.includes('--help')) {",
        "  console.log('Usage of agy.exe:');",
        "  console.log('  --input-format');",
        "  console.log('  --print-timeout');",
        '  process.exit(0);',
        '}',
        "let stdin = '';",
        "process.stdin.on('data', (c) => (stdin += c));",
        "process.stdin.on('end', () => {",
        '  const msg = JSON.parse(stdin.trim());',
        '  const content = msg.message.content;',
        "  console.log(JSON.stringify({ event: 'init', init: {} }));",
        "  if (content.includes('DENYME')) {",
        "    console.log(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: '', denied_actions: [{ action: 'command', display_name: 'RunCommand' }] } }));",
        '    return;',
        '  }',
        '  const report = { args: process.argv.slice(2), content, hasKey: Boolean(process.env.GEMINI_API_KEY) };',
        "  console.log(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: JSON.stringify(report) } }));",
        '});',
      ].join('\n')
    );
    if (IS_WINDOWS) {
      fakeBin = path.join(dir, 'agy.cmd');
      writeFileSync(fakeBin, '@node "%~dp0fake-agy.mjs" %*\r\n');
    } else {
      fakeBin = path.join(dir, 'agy');
      writeFileSync(fakeBin, `#!/bin/sh\nexec node "${path.join(dir, 'fake-agy.mjs')}" "$@"\n`);
      chmodSync(fakeBin, 0o755);
    }
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  function run(action, input, extraEnv = {}) {
    const out = execFileSync('node', [wrapperPath, action], {
      input,
      encoding: 'utf-8',
      env: { ...process.env, AGY_BIN: fakeBin, GEMINI_API_KEY: 'dummy-value', AGY_AUTH_MODE: '', AGY_APPROVAL_MODE: '', ...extraEnv },
    });
    return JSON.parse(out.slice(out.indexOf('{"args"'), out.lastIndexOf('}') + 1));
  }

  test('is detected as Antigravity and receives the prompt as a stream-json event', () => {
    const tricky = 'Crear "x" & echo PWNED | y; `z` $(w)';
    const report = run('delegate', tricky);
    assert.ok(report.content.includes(tricky));
    assert.match(report.content, /REGLAS DE HERRAMIENTAS/);
    assert.equal(report.args[report.args.indexOf('--mode') + 1], 'accept-edits');
    assert.equal(report.args.at(-1), '-p=');
  });

  test('challenge runs without write permissions', () => {
    const report = run('challenge', '¿Usar Redis?');
    assert.ok(!report.args.includes('--mode'));
    assert.match(report.content, /NO crees, edites ni borres/);
  });

  test('API keys are stripped by default', () => {
    assert.equal(run('challenge', 'a').hasKey, false);
  });

  test('a turn aborted by a denied tool fails with a DENIED diagnosis', () => {
    let failed = false;
    try {
      execFileSync('node', [wrapperPath, 'challenge'], {
        input: 'DENYME',
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, AGY_BIN: fakeBin },
      });
    } catch (err) {
      failed = true;
      assert.match(err.stderr, /DENIED: .*RunCommand/);
    }
    assert.ok(failed, 'expected a non-zero exit');
  });
});

describe('agy receipt', () => {
  test('includes conversation id, duration, tokens and folder', async () => {
    const { formatAgyReceipt } = await import('../bin/agy-wrapper.mjs');
    const line = formatAgyReceipt({ conversation_id: 'abc-123', duration_seconds: 12.34, usage: { total_tokens: 41200 } });
    assert.match(line, /^🛰️ Respondido por Antigravity CLI \(agy\)/);
    assert.match(line, /conversación abc-123/);
    assert.match(line, /12\.3 s/);
    assert.match(line, /41\.2k tokens/);
    assert.ok(line.includes(process.cwd()));
  });
});
