import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bump, checkVersions, nextVersion } from '../scripts/bump-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('bump-version', () => {
  let copy;

  before(() => {
    copy = mkdtempSync(path.join(os.tmpdir(), 'agy-bump-'));
    for (const file of ['package.json', 'README.md', 'CHANGELOG.md']) cpSync(path.join(root, file), path.join(copy, file));
    for (const dir of ['.claude-plugin', '.codex-plugin']) cpSync(path.join(root, dir), path.join(copy, dir), { recursive: true });
  });
  after(() => rmSync(copy, { recursive: true, force: true }));

  test('nextVersion follows semantic versioning', () => {
    assert.equal(nextVersion('1.3.0', 'patch'), '1.3.1');
    assert.equal(nextVersion('1.3.0', 'minor'), '1.4.0');
    assert.equal(nextVersion('1.3.7', 'major'), '2.0.0');
    assert.equal(nextVersion('1.3.0', '5.0.0'), '5.0.0');
    assert.throws(() => nextVersion('1.3.0', 'mayor'), /Bump no válido/);
  });

  test('the real repository is in sync', () => {
    assert.deepEqual(checkVersions(root).problems, []);
  });

  test('bump updates every reference and dates the Unreleased notes', () => {
    const changelogPath = path.join(copy, 'CHANGELOG.md');
    const changelog = readFileSync(changelogPath, 'utf-8').replace('## [Unreleased]', '## [Unreleased]\n\n### Added\n- Algo nuevo de prueba.');
    writeFileSync(changelogPath, changelog);

    const current = JSON.parse(readFileSync(path.join(copy, 'package.json'), 'utf-8')).version;
    const { version } = bump(copy, 'patch', '2030-01-02');
    assert.equal(version, nextVersion(current, 'patch'));
    assert.deepEqual(checkVersions(copy).problems, []);

    const released = readFileSync(changelogPath, 'utf-8');
    assert.match(released, new RegExp(`## \\[Unreleased\\]\\n\\n## \\[${version.replace(/\./g, '\\.')}\\] - 2030-01-02\\n\\n### Added\\n- Algo nuevo de prueba\\.`));
    assert.match(released, new RegExp(`\\[Unreleased\\]: .*/compare/v${version.replace(/\./g, '\\.')}\\.\\.\\.HEAD`));
    assert.match(released, new RegExp(`\\[${version.replace(/\./g, '\\.')}\\]: .*/compare/v${current.replace(/\./g, '\\.')}\\.\\.\\.v`));
  });

  test('refuses to release an empty Unreleased section', () => {
    assert.throws(() => bump(copy, 'patch'), /está vacía/);
  });

  test('check reports a manifest that drifted', () => {
    const drift = mkdtempSync(path.join(os.tmpdir(), 'agy-drift-'));
    try {
      cpSync(copy, drift, { recursive: true });
      const manifest = path.join(drift, '.claude-plugin', 'plugin.json');
      const data = JSON.parse(readFileSync(manifest, 'utf-8'));
      data.version = '0.0.1';
      mkdirSync(path.dirname(manifest), { recursive: true });
      writeFileSync(manifest, JSON.stringify(data));
      assert.match(checkVersions(drift).problems.join('\n'), /\.claude-plugin\/plugin\.json: 0\.0\.1/);
    } finally {
      rmSync(drift, { recursive: true, force: true });
    }
  });
});
