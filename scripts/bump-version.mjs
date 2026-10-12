#!/usr/bin/env node
/**
 * Release helper.
 *
 *   node scripts/bump-version.mjs <patch|minor|major|X.Y.Z> [--date YYYY-MM-DD] [--root <dir>]
 *   node scripts/bump-version.mjs --check [--root <dir>]
 *
 * Bumping updates every version reference (package.json, both plugin manifests, the marketplace
 * entry, the README status sample) and turns the CHANGELOG "Unreleased" notes into a dated release
 * section with its compare link. --check fails when any reference disagrees with package.json.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const REPO_URL = 'https://github.com/kevin-sarria/antigravity-plugin-cc';
const PLUGIN_NAME = 'antigravity';

const JSON_FILES = {
  'package.json': (data) => [data, 'version'],
  '.claude-plugin/plugin.json': (data) => [data, 'version'],
  '.codex-plugin/plugin.json': (data) => [data, 'version'],
  '.claude-plugin/marketplace.json': (data) => [data.plugins.find((p) => p.name === PLUGIN_NAME), 'version'],
};

export function nextVersion(current, bump) {
  if (SEMVER.test(bump)) return bump;
  const [, major, minor, patch] = SEMVER.exec(current).map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Bump no válido: "${bump}" (usa patch, minor, major o X.Y.Z)`);
}

function readJson(root, file) {
  return JSON.parse(readFileSync(path.join(root, file), 'utf-8'));
}

function writeJson(root, file, data) {
  writeFileSync(path.join(root, file), `${JSON.stringify(data, null, 2)}\n`);
}

/** Every version reference that must match package.json. */
export function collectVersions(root) {
  const versions = {};
  for (const [file, locate] of Object.entries(JSON_FILES)) {
    const [owner, key] = locate(readJson(root, file));
    versions[file] = owner?.[key];
  }
  const readme = readFileSync(path.join(root, 'README.md'), 'utf-8');
  const sample = /ANTIGRAVITY-CC \(v(\d+\.\d+\.\d+)\)|Antigravity · estado \(v(\d+\.\d+\.\d+)\)/.exec(readme);
  if (sample) versions['README.md'] = sample[1] || sample[2];
  return versions;
}

export function checkVersions(root) {
  const expected = readJson(root, 'package.json').version;
  const problems = [];
  for (const [file, version] of Object.entries(collectVersions(root))) {
    if (version !== expected) problems.push(`${file}: ${version ?? '(sin versión)'} ≠ ${expected}`);
  }
  const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8');
  if (!changelog.includes(`## [${expected}]`)) problems.push(`CHANGELOG.md: falta la sección "## [${expected}]"`);
  return { expected, problems };
}

/** Move the Unreleased notes into a dated section and fix the compare links. */
export function releaseChangelog(text, previous, version, date) {
  const heading = '## [Unreleased]';
  const start = text.indexOf(heading);
  if (start === -1) throw new Error('CHANGELOG.md no tiene la sección "## [Unreleased]"');
  const bodyStart = start + heading.length;
  const next = text.indexOf('\n## [', bodyStart);
  const notes = text.slice(bodyStart, next === -1 ? undefined : next).trim();
  if (!notes) throw new Error('La sección [Unreleased] del CHANGELOG está vacía: anota los cambios antes de publicar.');

  let out = `${text.slice(0, start)}${heading}\n\n## [${version}] - ${date}\n\n${notes}\n${next === -1 ? '' : text.slice(next)}`;
  out = out.replace(/^\[Unreleased\]: .*$/m, `[Unreleased]: ${REPO_URL}/compare/v${version}...HEAD`);
  const link = `[${version}]: ${REPO_URL}/compare/v${previous}...v${version}`;
  out = out.replace(/^(\[Unreleased\]: .*)$/m, `$1\n${link}`);
  return out;
}

export function bump(root, bumpArg, date = new Date().toISOString().slice(0, 10)) {
  const previous = readJson(root, 'package.json').version;
  const version = nextVersion(previous, bumpArg);
  for (const [file, locate] of Object.entries(JSON_FILES)) {
    const data = readJson(root, file);
    const [owner, key] = locate(data);
    owner[key] = version;
    writeJson(root, file, data);
  }
  const readmePath = path.join(root, 'README.md');
  const readme = readFileSync(readmePath, 'utf-8')
    .replace(/(ANTIGRAVITY-CC \(v)\d+\.\d+\.\d+(\))/g, `$1${version}$2`)
    .replace(/(Antigravity · estado \(v)\d+\.\d+\.\d+(\))/g, `$1${version}$2`);
  writeFileSync(readmePath, readme);
  const changelogPath = path.join(root, 'CHANGELOG.md');
  writeFileSync(changelogPath, releaseChangelog(readFileSync(changelogPath, 'utf-8'), previous, version, date));
  return { previous, version };
}

function main(argv) {
  const rootIndex = argv.indexOf('--root');
  const root = rootIndex !== -1 ? path.resolve(argv[rootIndex + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dateIndex = argv.indexOf('--date');
  const date = dateIndex !== -1 ? argv[dateIndex + 1] : undefined;

  if (argv.includes('--check')) {
    const { expected, problems } = checkVersions(root);
    if (problems.length > 0) {
      console.error(`❌ Versiones desincronizadas (package.json = ${expected}):\n- ${problems.join('\n- ')}`);
      process.exit(1);
    }
    console.log(`✔ Todas las referencias están en ${expected}.`);
    return;
  }

  const bumpArg = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--root' && argv[i - 1] !== '--date');
  if (!bumpArg) {
    console.error('Uso: node scripts/bump-version.mjs <patch|minor|major|X.Y.Z> [--date YYYY-MM-DD] | --check');
    process.exit(1);
  }
  const { previous, version } = bump(root, bumpArg, date);
  console.log(`✔ ${previous} → ${version}`);
  console.log('Siguiente: npm test, commit "chore(release): v' + version + '", git tag -a v' + version + ' y git push origin main v' + version);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}
