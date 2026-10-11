import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';
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
