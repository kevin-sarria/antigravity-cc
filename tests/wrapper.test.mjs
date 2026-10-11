import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wrapperPath = path.resolve(__dirname, '../bin/agy-wrapper.mjs');

describe('Antigravity CC Wrapper Functional Tests', () => {
  test('should display version with --version flag', () => {
    const output = execSync(`node "${wrapperPath}" --version`, { encoding: 'utf-8' });
    assert.match(output, /antigravity-cc v\d+\.\d+\.\d+/);
  });

  test('should display help menu with --help flag', () => {
    const output = execSync(`node "${wrapperPath}" --help`, { encoding: 'utf-8' });
    assert.match(output, /USO:/);
    assert.match(output, /task/);
    assert.match(output, /review/);
    assert.match(output, /delegate/);
    assert.match(output, /challenge/);
    assert.match(output, /status/);
  });

  test('should report backend status with status command', () => {
    const output = execSync(`node "${wrapperPath}" status`, { encoding: 'utf-8' });
    assert.match(output, /ESTADO DE INTEGRACI/);
    assert.match(output, /Plataforma/);
    assert.match(output, /Node\.js/);
  });

  test('should require a description for task command', () => {
    let errorCaught = false;
    try {
      execSync(`node "${wrapperPath}" task`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      errorCaught = true;
      const combined = (err.stdout || '') + (err.stderr || '');
      assert.match(combined, /Especifica la descripci/);
    }
    assert.ok(errorCaught, 'Expected process to exit with error when task description is missing');
  });

  test('should require a task parameter for delegate command', () => {
    let errorCaught = false;
    try {
      execSync(`node "${wrapperPath}" delegate`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      errorCaught = true;
      const combined = (err.stdout || '') + (err.stderr || '');
      assert.match(combined, /Especifica la tarea a delegar/);
    }
    assert.ok(errorCaught, 'Expected process to exit with error when task is missing');
  });

  test('should require a prompt parameter for challenge command', () => {
    let errorCaught = false;
    try {
      execSync(`node "${wrapperPath}" challenge`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      errorCaught = true;
      const combined = (err.stdout || '') + (err.stderr || '');
      assert.match(combined, /Proporciona el planteamiento/);
    }
    assert.ok(errorCaught, 'Expected process to exit with error when challenge prompt is missing');
  });
});

describe('Release version consistency', () => {
  const root = path.resolve(__dirname, '..');
  const readJson = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf-8'));

  test('package.json, manifests, marketplace, wrapper and CHANGELOG share one version', () => {
    const version = readJson('package.json').version;
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.equal(readJson('.claude-plugin/plugin.json').version, version, '.claude-plugin/plugin.json');
    assert.equal(readJson('.codex-plugin/plugin.json').version, version, '.codex-plugin/plugin.json');
    const entry = readJson('.claude-plugin/marketplace.json').plugins.find((p) => p.name === 'antigravity');
    assert.equal(entry.version, version, 'marketplace.json');
    const wrapperVersion = execSync(`node "${wrapperPath}" --version`, { encoding: 'utf-8' }).trim();
    assert.equal(wrapperVersion, `antigravity-cc v${version}`, 'bin/agy-wrapper.mjs VERSION');
    const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8');
    assert.ok(changelog.includes(`## [${version}]`), `CHANGELOG.md needs a "## [${version}]" section`);
  });
});
