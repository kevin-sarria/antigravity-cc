import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describeAliases, groupCatalog, normalizeEffort, parseModelList, resolveModelSelection } from '../lib/models.mjs';
import { FAKE_MODELS, createFakeAgy, createRepo, runWrapper } from './helpers.mjs';

const catalog = FAKE_MODELS.map(([id, label]) => ({ id, label }));

describe('model selection', () => {
  test('parses `agy models` and groups effort variants', () => {
    const parsed = parseModelList('Fetching available models...\ngemini-3.1-pro-high\tGemini 3.1 Pro (High)\r\nclaude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)\n');
    assert.deepEqual(parsed.map((m) => m.id), ['gemini-3.1-pro-high', 'claude-opus-4-6-thinking']);
    const groups = groupCatalog(catalog);
    assert.deepEqual(Object.keys(groups.get('gemini-3.1-pro').variants), ['high', 'low']);
    assert.equal(groups.get('claude-opus-4-6-thinking').plain.id, 'claude-opus-4-6-thinking');
  });

  test('short names pick the newest family and Spanish efforts work', () => {
    assert.equal(resolveModelSelection({ model: 'pro' }, catalog).model, 'gemini-3.1-pro-high');
    assert.equal(resolveModelSelection({ model: 'pro', effort: 'bajo' }, catalog).model, 'gemini-3.1-pro-low');
    assert.equal(resolveModelSelection({ model: 'Flash', effort: 'medio' }, catalog).model, 'gemini-3.8-flash-medium');
    assert.equal(resolveModelSelection({ model: 'opus' }, catalog).label, 'Claude Opus 4.6 (Thinking)');
    assert.equal(normalizeEffort('ALTO'), 'high');
  });

  test('never sends --effort with --model, so agy cannot fall back silently', () => {
    const pick = resolveModelSelection({ model: 'gemini-3.1-pro-high', effort: 'low' }, catalog);
    assert.equal(pick.model, 'gemini-3.1-pro-low');
    assert.equal(pick.effort, undefined);
    // Effort alone tunes the default model (the newest Flash).
    assert.equal(resolveModelSelection({ effort: 'bajo' }, catalog).model, 'gemini-3.8-flash-low');
  });

  test('explains unsupported efforts and unknown models', () => {
    assert.throws(() => resolveModelSelection({ model: 'pro', effort: 'medio' }, catalog), /admite esfuerzo bajo \(low\), alto \(high\)/);
    assert.throws(() => resolveModelSelection({ model: 'opus', effort: 'alto' }, catalog), /no admite niveles de esfuerzo/);
    assert.throws(() => resolveModelSelection({ model: 'gemini-9' }, catalog), /Modelo desconocido/);
    assert.throws(() => resolveModelSelection({ model: 'x & calc' }, catalog), /Modelo no válido/);
  });

  test('a default effort from the config adapts instead of failing', () => {
    assert.equal(resolveModelSelection({ model: 'pro', effort: 'medium', explicitEffort: false }, catalog).model, 'gemini-3.1-pro-high');
    assert.equal(resolveModelSelection({ model: 'opus', effort: 'low', explicitEffort: false }, catalog).model, 'claude-opus-4-6-thinking');
  });

  test('without a catalog the short names still map to real IDs', () => {
    assert.deepEqual(resolveModelSelection({ model: 'pro', effort: 'alto' }, null), { model: 'gemini-3.1-pro', effort: 'high', label: 'gemini-3.1-pro (high)' });
  });

  test('describeAliases lists what each short name means', () => {
    const pro = describeAliases(catalog).find((row) => row.alias === 'pro');
    assert.deepEqual(pro, { alias: 'pro', hint: pro.hint, available: true, label: 'Gemini 3.1 Pro', efforts: ['low', 'high'] });
  });
});

describe('/antigravity:model end to end', () => {
  let fake;
  let repo;
  let stateDir;
  let env;

  before(() => {
    fake = createFakeAgy();
    repo = createRepo();
    stateDir = mkdtempSync(path.join(os.tmpdir(), 'agy-model-state-'));
    env = { AGY_BIN: fake.bin, AGY_STATE_DIR: stateDir, AGY_APPROVAL_MODE: '', AGY_MODEL: '', AGY_EFFORT: '' };
  });
  after(() => {
    for (const dir of [fake.dir, repo.dir, stateDir]) rmSync(dir, { recursive: true, force: true });
  });

  const argsOf = (stdout) => JSON.parse(/\{"args".*\}/.exec(stdout)[0]).args;

  test('a run with --model pro --effort bajo sends one exact model ID and names it in the receipt', () => {
    const out = runWrapper(['challenge'], { cwd: repo.dir, env, input: '--model pro --effort bajo ¿Redis o Postgres?' });
    assert.equal(out.code, 0, out.stderr);
    const args = argsOf(out.stdout);
    assert.equal(args[args.indexOf('--model') + 1], 'gemini-3.1-pro-low');
    assert.ok(!args.includes('--effort'));
    assert.match(out.stdout, /modelo Gemini 3\.1 Pro \(Low\) · carpeta:/);
  });

  test('the saved default applies to every run, and a flag still wins', () => {
    const saved = runWrapper(['model', 'pro', 'alto'], { cwd: repo.dir, env });
    assert.equal(saved.code, 0, saved.stderr);
    assert.match(saved.stdout, /Gemini 3\.1 Pro \(High\)/);

    const run = runWrapper(['challenge'], { cwd: repo.dir, env, input: '¿Colas?' });
    assert.equal(argsOf(run.stdout)[argsOf(run.stdout).indexOf('--model') + 1], 'gemini-3.1-pro-high');

    const override = runWrapper(['challenge'], { cwd: repo.dir, env, input: '--model flash ¿Colas?' });
    const args = argsOf(override.stdout);
    assert.equal(args[args.indexOf('--model') + 1], 'gemini-3.8-flash-high');

    const listing = runWrapper(['model'], { cwd: repo.dir, env });
    assert.match(listing.stdout, /\*\*Ahora:\*\* Gemini 3\.1 Pro \(High\)/);
    assert.match(listing.stdout, /\| `pro` \| Gemini 3\.1 Pro \| bajo, alto \|/);

    assert.equal(runWrapper(['model', 'reset'], { cwd: repo.dir, env }).code, 0);
    const plain = runWrapper(['challenge'], { cwd: repo.dir, env, input: '¿Colas?' });
    assert.ok(!argsOf(plain.stdout).includes('--model'));
    assert.match(plain.stdout, /modelo predeterminado de agy/);
  });

  test('an impossible choice is refused before saving', () => {
    const bad = runWrapper(['model', 'pro', 'medio'], { cwd: repo.dir, env });
    assert.equal(bad.code, 1);
    assert.match(bad.stderr, /admite esfuerzo bajo \(low\), alto \(high\)/);
    assert.match(runWrapper(['model'], { cwd: repo.dir, env }).stdout, /predeterminado de agy/);
  });
});
