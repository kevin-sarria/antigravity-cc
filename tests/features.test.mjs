import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseArgv, splitLeadingFlags } from '../lib/args.mjs';
import { collectReviewContext, repoSubfolder, resolveReviewTarget } from '../lib/git.mjs';
import { isPidAlive } from '../lib/jobs.mjs';
import { parseReviewResult, renderReview } from '../lib/review.mjs';
import { createFakeAgy, createRepo, runWrapper } from './helpers.mjs';

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

describe('argument parsing', () => {
  test('parseArgv separates action, flags and text', () => {
    const parsed = parseArgv(['review', '--base', 'main', '--background', 'mira', 'la', 'auth']);
    assert.equal(parsed.action, 'review');
    assert.deepEqual(parsed.flags, { base: 'main', background: true });
    assert.equal(parsed.text, 'mira la auth');
    assert.equal(parseArgv(['--version']).action, 'version');
  });

  test('splitLeadingFlags only takes known flags at the start of the text', () => {
    const { flags, text } = splitLeadingFlags('--background --model=gemini-x --effort high Revisa\nel --base que no es flag');
    assert.deepEqual(flags, { background: true, model: 'gemini-x', effort: 'high' });
    assert.equal(text, 'Revisa\nel --base que no es flag');
    assert.deepEqual(splitLeadingFlags('--desconocido texto'), { flags: {}, text: '--desconocido texto' });
    assert.throws(() => splitLeadingFlags('--base'), /Falta el valor/);
  });
});

describe('review target selection', () => {
  let repo;
  before(() => {
    repo = createRepo();
  });
  after(() => rmSync(repo.dir, { recursive: true, force: true }));

  test('auto uses the working tree when dirty and includes untracked file contents', () => {
    writeFileSync(path.join(repo.dir, 'nuevo.js'), 'console.log("hola");\n');
    const target = resolveReviewTarget(repo.dir, {});
    assert.equal(target.mode, 'working-tree');
    const context = collectReviewContext(repo.dir, target);
    assert.ok(context.changedFiles.includes('nuevo.js'));
    assert.match(context.content, /console\.log\("hola"\)/);
    rmSync(path.join(repo.dir, 'nuevo.js'));
  });

  test('auto falls back to the branch diff against main when clean', () => {
    repo.git('switch', '-q', '-c', 'feature');
    writeFileSync(path.join(repo.dir, 'feature.js'), 'export const x = 2;\n');
    repo.git('add', '.');
    repo.git('commit', '-q', '-m', 'feature');
    const target = resolveReviewTarget(repo.dir, {});
    assert.equal(target.mode, 'branch');
    assert.equal(target.baseRef, 'main');
    const context = collectReviewContext(repo.dir, target);
    assert.deepEqual(context.changedFiles, ['feature.js']);
    assert.match(context.content, /export const x = 2/);
  });

  test('rejects unsafe refs and unknown scopes', () => {
    assert.throws(() => resolveReviewTarget(repo.dir, { base: '--output=/tmp/x' }), /no válida/);
    assert.throws(() => resolveReviewTarget(repo.dir, { base: 'main; rm -rf /' }), /no válida/);
    assert.throws(() => resolveReviewTarget(repo.dir, { scope: 'staged' }), /--scope/);
  });

  test('repoSubfolder reports prefix inside git and empty string at root or outside', () => {
    assert.equal(repoSubfolder(repo.dir), '');
    const sub = path.join(repo.dir, 'backend', 'src');
    mkdirSync(sub, { recursive: true });
    assert.equal(repoSubfolder(sub), 'backend/src');
    const nonGit = mkdtempSync(path.join(os.tmpdir(), 'agy-nogit-'));
    try {
      assert.equal(repoSubfolder(nonGit), '');
    } finally {
      rmSync(nonGit, { recursive: true, force: true });
    }
  });
});

describe('review rendering', () => {
  const data = {
    verdict: 'needs-attention',
    summary: 'No publicar.',
    findings: [
      { severity: 'low', title: 'Menor', body: 'b', file: 'a.js', line_start: 5, line_end: 5, confidence: 0.3, recommendation: 'r' },
      { severity: 'critical', title: 'Grave', body: 'b', file: path.join(process.cwd(), 'src', 'b.js'), line_start: 1, line_end: 4, confidence: 0.9, recommendation: 'r' },
    ],
    next_steps: ['Paso'],
  };

  test('orders findings by severity and shows repo-relative paths with line ranges', () => {
    const md = renderReview(data, { title: 'Revisión' });
    assert.ok(md.indexOf('CRÍTICO') < md.indexOf('BAJO'));
    assert.match(md, /`src\/b\.js:1-4`/);
    assert.match(md, /`a\.js:5`/);
    assert.match(md, /REQUIERE ATENCIÓN/);
    assert.match(md, /confianza 90%/);
  });

  test('parseReviewResult accepts structured output or JSON inside text', () => {
    assert.equal(parseReviewResult(data, '').verdict, 'needs-attention');
    assert.equal(parseReviewResult(null, `texto ${JSON.stringify(data)} fin`).findings.length, 2);
    assert.equal(parseReviewResult(null, 'sin json'), null);
  });
});

describe('end-to-end with a fake agy: reviews, jobs, resume, cancel, setup', () => {
  let fake;
  let repo;
  let stateDir;
  let env;

  before(() => {
    fake = createFakeAgy();
    repo = createRepo();
    stateDir = mkdtempSync(path.join(os.tmpdir(), 'agy-state-'));
    env = { AGY_BIN: fake.bin, AGY_STATE_DIR: stateDir, AGY_APPROVAL_MODE: '' };
  });
  after(() => {
    for (const dir of [fake.dir, repo.dir, stateDir]) rmSync(dir, { recursive: true, force: true });
  });

  function waitForStatus(id, wanted, timeoutMs = 20000) {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const out = runWrapper(['status', id], { cwd: repo.dir, env }).stdout;
      if (wanted.some((w) => out.includes(w))) return out;
      if (Date.now() > end) throw new Error(`timeout esperando ${wanted}: ${out}`);
      sleep(300);
    }
  }

  test('review renders structured findings ordered by severity and records a job', () => {
    writeFileSync(path.join(repo.dir, 'app.js'), 'const a = 1;\nconst b = 2;\n');
    const res = runWrapper(['review'], { cwd: repo.dir, env, input: '--scope working-tree revisa la seguridad' });
    assert.equal(res.code, 0, res.stderr);
    assert.ok(res.stdout.indexOf('CRÍTICO') < res.stdout.indexOf('BAJO'));
    assert.match(res.stdout, /`app\.js:1-3`/);
    assert.match(res.stdout, /Respondido por Antigravity CLI \(agy\)/);
    assert.match(res.stdout, /Trabajo agy-/);

    const status = runWrapper(['status'], { cwd: repo.dir, env }).stdout;
    assert.match(status, /Revisión/);
    assert.match(status, /terminado/);
    assert.match(status, /Requiere atención · 2 hallazgo/);
    assert.match(runWrapper(['result'], { cwd: repo.dir, env }).stdout, /Inyección SQL/);
  });

  test('adversarial-review uses the adversarial prompt and the schema', () => {
    const res = runWrapper(['adversarial-review'], { cwd: repo.dir, env, input: 'rollback' });
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /Revisión adversarial/);
  });

  test('runs agy at the repository root when started from a subfolder', () => {
    const sub = path.join(repo.dir, 'backend', 'src');
    mkdirSync(sub, { recursive: true });
    const out = runWrapper(['delegate'], { cwd: sub, env, input: 'Arregla el frontend' });
    assert.equal(out.code, 0, out.stderr);
    const report = JSON.parse(/\{"args".*\}/.exec(out.stdout)[0]);
    assert.equal(realpathSync.native(report.cwd).toLowerCase(), realpathSync.native(repo.dir).toLowerCase());
    assert.match(report.content, /subcarpeta "backend\/src"/);
    assert.ok(!report.content.includes(`${path.sep}backend${path.sep}src\n`), 'the workspace rule names the root');
  });

  test('task reads a long spec with quotes from --file', () => {
    const spec = path.join(repo.dir, '..', `spec-${process.pid}.md`);
    const body = Array.from({ length: 150 }, (_, i) => `- línea ${i}: throw forbidden('No existe'); si \`!ok\``).join('\n');
    writeFileSync(spec, `--effort high\n# Especificación\n${body}`);
    try {
      const out = runWrapper(['task', '--file', spec], { cwd: repo.dir, env });
      assert.equal(out.code, 0, out.stderr);
      assert.match(out.stdout, /línea 149: throw forbidden\('No existe'\)/);
      // Leading options inside the file apply too: "--effort high" picks the Flash High variant.
      assert.match(out.stdout, /gemini-3\.8-flash-high/);
      const missing = runWrapper(['task', '--file', `${spec}.nope`], { cwd: repo.dir, env });
      assert.equal(missing.code, 1);
      assert.match(missing.stderr, /No existe el archivo indicado en --file/);
    } finally {
      rmSync(spec, { force: true });
    }
  });

  test('background delegate completes, then --resume continues its conversation', () => {
    const started = runWrapper(['delegate'], { cwd: repo.dir, env, input: '--background Crea util.js' });
    assert.equal(started.code, 0, started.stderr);
    const id = /(agy-[a-z0-9-]+)/.exec(started.stdout)[1];
    waitForStatus(id, ['terminado']);
    const result = runWrapper(['result', id], { cwd: repo.dir, env }).stdout;
    assert.match(result, /Crea util\.js/);
    assert.match(result, /conversación 11111111-2222-3333-4444-555555555555/);

    const resumed = runWrapper(['delegate'], { cwd: repo.dir, env, input: '--resume aplica el siguiente paso' });
    assert.equal(resumed.code, 0, resumed.stderr);
    assert.match(resumed.stdout, /--conversation/);
    assert.match(resumed.stdout, /11111111-2222-3333-4444-555555555555/);
  });

  test('cancel stops a running background job and its worker', () => {
    const started = runWrapper(['delegate'], { cwd: repo.dir, env, input: '--background SLEEPME' });
    const id = /(agy-[a-z0-9-]+)/.exec(started.stdout)[1];
    const running = waitForStatus(id, ['en curso']);
    assert.match(running, /en curso/);
    const cancelled = runWrapper(['cancel', id], { cwd: repo.dir, env });
    assert.match(cancelled.stdout, /cancelado/);
    assert.match(runWrapper(['status', id], { cwd: repo.dir, env }).stdout, /cancelado/);
  });

  test('setup --json reports a ready Antigravity backend', () => {
    const res = runWrapper(['setup', '--json'], { cwd: repo.dir, env });
    const report = JSON.parse(res.stdout);
    assert.equal(report.backend.type, 'antigravity');
    assert.equal(report.auth.ok, true);
    assert.equal(report.ready, true);
  });

  test('invalid flags fail with a clear message', () => {
    const res = runWrapper(['challenge'], { cwd: repo.dir, env, input: '--effort extremo ¿Redis?' });
    assert.equal(res.code, 1);
    assert.match(res.stderr, /Esfuerzo no válido: "extremo"\. Usa bajo, medio o alto/);
  });

  test('worker processes do not linger after completion', () => {
    const started = runWrapper(['challenge'], { cwd: repo.dir, env, input: '--background ¿Usar colas?' });
    const id = /(agy-[a-z0-9-]+)/.exec(started.stdout)[1];
    waitForStatus(id, ['terminado']);
    const [repoState] = readdirSync(stateDir);
    const job = JSON.parse(readFileSync(path.join(stateDir, repoState, 'jobs', `${id}.json`), 'utf-8'));
    assert.ok(job.pid, 'the worker PID is recorded');
    const end = Date.now() + 5000;
    while (isPidAlive(job.pid) && Date.now() < end) sleep(100);
    assert.equal(isPidAlive(job.pid), false, 'the worker exits after finishing');
  });
});

test('isPidAlive is false for a non-existent PID', () => {
  assert.equal(isPidAlive(999999), false);
});
