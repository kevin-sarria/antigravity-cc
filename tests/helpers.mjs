/**
 * Shared test helpers: a fake Antigravity CLI and throwaway git repositories.
 */

import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const wrapperPath = path.resolve(__dirname, '../bin/agy-wrapper.mjs');
export const IS_WINDOWS = process.platform === 'win32';

/**
 * Fake `agy`: advertises agy-only flags in --help, reads one stream-json event from stdin and
 * answers with stream-json events. Behaviour switches:
 * - "--json-schema" in argv -> returns a structured review in `structured_output`
 * - prompt contains "SLEEPME" -> waits 60 s (to test cancel)
 * - prompt contains "DENYME"  -> empty answer with a denied tool
 * Otherwise it echoes argv and the prompt back as JSON in `response`.
 */
export function createFakeAgy() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agy-fake-'));
  writeFileSync(
    path.join(dir, 'fake-agy.mjs'),
    `
const argv = process.argv.slice(2);
if (argv.includes('--help')) {
  console.log('Usage of agy.exe:');
  console.log('  --input-format');
  console.log('  --print-timeout');
  process.exit(0);
}
if (argv.includes('--version')) { console.log('9.9.9'); process.exit(0); }
let stdin = '';
process.stdin.on('data', (c) => (stdin += c));
process.stdin.on('end', () => {
  const content = JSON.parse(stdin.trim()).message.content;
  const conv = argv.includes('--conversation') ? argv[argv.indexOf('--conversation') + 1] : '11111111-2222-3333-4444-555555555555';
  const emit = (result) => {
    console.log(JSON.stringify({ event: 'init', init: {} }));
    console.log(JSON.stringify({ event: 'result', result: { conversation_id: conv, duration_seconds: 1.5, usage: { total_tokens: 2000 }, ...result } }));
  };
  if (content.includes('SLEEPME')) { setTimeout(() => emit({ status: 'SUCCESS', response: 'tarde' }), 60000); return; }
  if (content.includes('DENYME')) { emit({ status: 'SUCCESS', response: '', denied_actions: [{ action: 'command', display_name: 'RunCommand' }] }); return; }
  if (argv.includes('--json-schema')) {
    emit({ status: 'SUCCESS', response: '', structured_output: {
      verdict: 'needs-attention',
      summary: 'No publicar todavía.',
      findings: [
        { severity: 'low', title: 'Detalle menor', body: 'Algo pequeño.', file: 'app.js', line_start: 2, line_end: 2, confidence: 0.4, recommendation: 'Ajustar.' },
        { severity: 'critical', title: 'Inyección SQL', body: 'Concatena entrada del usuario.', file: process.cwd() + '/app.js', line_start: 1, line_end: 3, confidence: 0.9, recommendation: 'Usar parámetros.' }
      ],
      next_steps: ['Corregir la inyección']
    }, prompt: content });
    return;
  }
  emit({ status: 'SUCCESS', response: JSON.stringify({ args: argv, content, hasKey: Boolean(process.env.GEMINI_API_KEY) }) });
});
`
  );
  let bin;
  if (IS_WINDOWS) {
    bin = path.join(dir, 'agy.cmd');
    writeFileSync(bin, '@node "%~dp0fake-agy.mjs" %*\r\n');
  } else {
    bin = path.join(dir, 'agy');
    writeFileSync(bin, `#!/bin/sh\nexec node "${path.join(dir, 'fake-agy.mjs')}" "$@"\n`);
    chmodSync(bin, 0o755);
  }
  return { dir, bin };
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** A git repo with one commit on `main`. */
export function createRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agy-repo-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  writeFileSync(path.join(dir, 'app.js'), 'const a = 1;\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'init');
  return { dir, git: (...args) => git(dir, ...args) };
}

/** Run the wrapper and return stdout/stderr/exit code without throwing. */
export function runWrapper(args, { cwd, input = '', env = {} } = {}) {
  try {
    const stdout = execFileSync('node', [wrapperPath, ...args], {
      cwd,
      input,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return { code: err.status ?? 1, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}
