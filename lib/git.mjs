/**
 * Review target selection and context collection. Every git call uses an argument array
 * (no shell), and refs coming from users are validated before use.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const MAX_CONTEXT_CHARS = 150000;
const MAX_UNTRACKED_FILE_BYTES = 24 * 1024;
const MAX_UNTRACKED_TOTAL_CHARS = 60000;
const SAFE_REF = /^(?!-)[A-Za-z0-9._\/~^@-]+$/;
export const REVIEW_SCOPES = ['auto', 'working-tree', 'branch'];

function git(cwd, args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return { ok: res.status === 0, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function gitOrThrow(cwd, args) {
  const res = git(cwd, args);
  if (!res.ok) throw new Error(`git ${args.join(' ')} falló: ${res.stderr.trim() || 'sin detalle'}`);
  return res.stdout;
}

function lines(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

export function isGitRepo(cwd) {
  return git(cwd, ['rev-parse', '--is-inside-work-tree']).ok;
}

/** Path of `cwd` inside its repository, with forward slashes and no trailing slash ('' at the root or outside git). */
export function repoSubfolder(cwd) {
  try {
    const res = spawnSync('git', ['rev-parse', '--show-prefix'], { cwd, encoding: 'utf-8', windowsHide: true });
    if (res.error || res.status !== 0 || !res.stdout) return '';
    return res.stdout.trim().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function validateRef(ref) {
  if (!SAFE_REF.test(ref)) throw new Error(`Referencia de git no válida: "${ref}"`);
  return ref;
}

export function workingTreeState(cwd) {
  const staged = lines(git(cwd, ['diff', '--cached', '--name-only']).stdout);
  const unstaged = lines(git(cwd, ['diff', '--name-only']).stdout);
  const untracked = lines(git(cwd, ['ls-files', '--others', '--exclude-standard']).stdout);
  return { staged, unstaged, untracked, dirty: staged.length + unstaged.length + untracked.length > 0 };
}

/** origin/HEAD when known, otherwise the first existing of main/master/trunk. */
export function detectDefaultBranch(cwd) {
  const head = git(cwd, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  if (head.ok && head.stdout.trim().startsWith('refs/remotes/origin/')) {
    return head.stdout.trim().replace('refs/remotes/', '');
  }
  for (const name of ['main', 'master', 'trunk']) {
    if (git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`]).ok) return name;
    if (git(cwd, ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${name}`]).ok) return `origin/${name}`;
  }
  throw new Error('No se pudo detectar la rama principal. Usa --base <rama> o --scope working-tree.');
}

/**
 * Decide what to review.
 * - --base <ref>: branch diff against <ref>
 * - --scope working-tree: uncommitted changes (staged, unstaged and untracked)
 * - --scope branch: branch diff against the default branch
 * - auto (default): uncommitted changes when there are any, otherwise the branch diff
 */
export function resolveReviewTarget(cwd, { base, scope = 'auto' } = {}) {
  if (!REVIEW_SCOPES.includes(scope)) {
    throw new Error(`--scope debe ser uno de: ${REVIEW_SCOPES.join(', ')}`);
  }
  if (base) {
    return { mode: 'branch', baseRef: validateRef(base), label: `rama actual contra ${base}` };
  }
  if (scope === 'working-tree') {
    return { mode: 'working-tree', label: 'cambios sin confirmar' };
  }
  if (scope === 'auto' && workingTreeState(cwd).dirty) {
    return { mode: 'working-tree', label: 'cambios sin confirmar' };
  }
  const detected = detectDefaultBranch(cwd);
  return { mode: 'branch', baseRef: detected, label: `rama actual contra ${detected}` };
}

function isProbablyText(buffer) {
  const sample = buffer.subarray(0, 8000);
  return !sample.includes(0);
}

function section(title, body) {
  return `## ${title}\n\n${body && body.trim() ? body.trim() : '(ninguno)'}\n`;
}

function untrackedFileBlock(cwd, relativePath) {
  const absolute = path.join(cwd, relativePath);
  let stat;
  try {
    stat = statSync(absolute);
  } catch {
    return `### ${relativePath}\n(omitido: no se pudo leer)`;
  }
  if (stat.isDirectory()) return `### ${relativePath}\n(omitido: directorio)`;
  if (stat.size > MAX_UNTRACKED_FILE_BYTES) {
    return `### ${relativePath}\n(omitido: ${stat.size} bytes; léelo con tus herramientas si es relevante)`;
  }
  const buffer = readFileSync(absolute);
  if (!isProbablyText(buffer)) return `### ${relativePath}\n(omitido: archivo binario)`;
  return `### ${relativePath}\n\`\`\`\n${buffer.toString('utf-8').trimEnd()}\n\`\`\``;
}

function untrackedSection(cwd, files) {
  const blocks = [];
  let total = 0;
  for (const file of files) {
    const block = untrackedFileBlock(cwd, file);
    if (total + block.length > MAX_UNTRACKED_TOTAL_CHARS) {
      blocks.push(`### ${file}\n(omitido: límite de contexto; léelo con tus herramientas)`);
      continue;
    }
    total += block.length;
    blocks.push(block);
  }
  return blocks.join('\n\n');
}

function truncate(content) {
  if (content.length <= MAX_CONTEXT_CHARS) return content;
  return `${content.slice(0, MAX_CONTEXT_CHARS)}\n\n[... contexto truncado a ${MAX_CONTEXT_CHARS} caracteres; lee los archivos cambiados directamente para el resto ...]`;
}

/**
 * Collect the material the reviewer works from.
 * @returns {{ label: string, summary: string, content: string, changedFiles: string[], empty: boolean }}
 */
export function collectReviewContext(cwd, target) {
  if (target.mode === 'working-tree') {
    const state = workingTreeState(cwd);
    const changedFiles = [...new Set([...state.staged, ...state.unstaged, ...state.untracked])];
    const content = [
      section('Estado de git', git(cwd, ['status', '--short', '--untracked-files=all']).stdout),
      section('Cambios preparados (staged)', git(cwd, ['diff', '--cached', '--no-ext-diff']).stdout),
      section('Cambios sin preparar', git(cwd, ['diff', '--no-ext-diff']).stdout),
      section('Archivos nuevos sin seguimiento', untrackedSection(cwd, state.untracked)),
    ].join('\n');
    return {
      label: target.label,
      summary: `${state.staged.length} preparado(s), ${state.unstaged.length} sin preparar y ${state.untracked.length} nuevo(s)`,
      content: truncate(content),
      changedFiles,
      empty: changedFiles.length === 0,
    };
  }

  const range = `${target.baseRef}...HEAD`;
  const mergeBase = gitOrThrow(cwd, ['merge-base', target.baseRef, 'HEAD']).trim();
  const changedFiles = lines(gitOrThrow(cwd, ['diff', '--name-only', range]));
  const content = [
    section('Commits', gitOrThrow(cwd, ['log', '--oneline', range.replace('...', '..')])),
    section('Resumen del diff', gitOrThrow(cwd, ['diff', '--stat', range])),
    section('Diff de la rama', gitOrThrow(cwd, ['diff', '--no-ext-diff', range])),
  ].join('\n');
  const branch = git(cwd, ['branch', '--show-current']).stdout.trim() || 'HEAD';
  return {
    label: target.label,
    summary: `rama ${branch} contra ${target.baseRef} (merge-base ${mergeBase.slice(0, 7)}), ${changedFiles.length} archivo(s)`,
    content: truncate(content),
    changedFiles,
    empty: changedFiles.length === 0,
  };
}
