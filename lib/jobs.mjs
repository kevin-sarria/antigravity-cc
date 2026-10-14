/**
 * Job registry. Every run (foreground or background) is recorded per repository under
 * ~/.antigravity-cc/state/<repo>-<hash>/jobs so /antigravity:status, /result, /cancel and
 * --resume can find it. Nothing is written inside the user's repository.
 */

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_JOBS = 50;
const ACTIVE = new Set(['queued', 'running']);
// A worker gets a few seconds to start before a missing PID counts as a crash.
const STARTUP_GRACE_MS = 15000;

export function workspaceRoot(cwd) {
  const res = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf-8', windowsHide: true });
  const top = res.status === 0 ? res.stdout.trim() : '';
  // VS Code hands out "c:\..." paths. agy compares paths case-sensitively, so with a lowercase drive
  // every file looks outside the workspace and edits are denied even in accept-edits mode.
  return path.resolve(top || cwd).replace(/^[a-z]:/, (drive) => drive.toUpperCase());
}

export function stateDir(cwd) {
  const root = workspaceRoot(cwd);
  const base = process.env.AGY_STATE_DIR || path.join(os.homedir(), '.antigravity-cc', 'state');
  const slug = (path.basename(root) || 'workspace').replace(/[^A-Za-z0-9._-]+/g, '-');
  const hash = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 12);
  return path.join(base, `${slug}-${hash}`);
}

function jobsDir(cwd) {
  const dir = path.join(stateDir(cwd), 'jobs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function jobFile(cwd, id, suffix = '.json') {
  if (!/^agy-[a-z0-9-]+$/.test(id)) throw new Error(`ID de trabajo no válido: "${id}"`);
  return path.join(jobsDir(cwd), `${id}${suffix}`);
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file);
}

export function newJobId() {
  return `agy-${Date.now().toString(36)}-${randomBytes(2).toString('hex')}`;
}

/**
 * @param {{ kind: string, title: string, background?: boolean, request?: object }} fields
 */
export function createJob(cwd, { kind, title, background = false, request = null }) {
  const job = {
    id: newJobId(),
    kind,
    title,
    background,
    status: 'queued',
    cwd: path.resolve(cwd),
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    pid: null,
    conversationId: null,
    summary: null,
    error: null,
  };
  writeJsonAtomic(jobFile(cwd, job.id), job);
  // The request (prompt, flags) is kept apart so listings stay small.
  if (request) writeJsonAtomic(jobFile(cwd, job.id, '.input.json'), request);
  pruneJobs(cwd);
  return job;
}

export function readJob(cwd, id) {
  try {
    return JSON.parse(readFileSync(jobFile(cwd, id), 'utf-8'));
  } catch {
    return null;
  }
}

export function updateJob(cwd, id, patch) {
  const job = readJob(cwd, id);
  if (!job) throw new Error(`No existe el trabajo ${id}`);
  // A cancelled job stays cancelled even if its worker reports back late.
  if (job.status === 'cancelled' && patch.status && patch.status !== 'cancelled') return job;
  const next = { ...job, ...patch };
  writeJsonAtomic(jobFile(cwd, id), next);
  return next;
}

export function readJobInput(cwd, id) {
  return JSON.parse(readFileSync(jobFile(cwd, id, '.input.json'), 'utf-8'));
}

export function writeJobOutput(cwd, id, text) {
  writeFileSync(jobFile(cwd, id, '.out.md'), text);
}

export function readJobOutput(cwd, id) {
  const file = jobFile(cwd, id, '.out.md');
  return existsSync(file) ? readFileSync(file, 'utf-8') : null;
}

export function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/** Mark active jobs whose worker vanished (crash, reboot, killed terminal) as failed. */
function reconcile(cwd, job) {
  if (!ACTIVE.has(job.status)) return job;
  const age = Date.now() - Date.parse(job.startedAt || job.createdAt);
  const lost = job.pid ? !isPidAlive(job.pid) : age > STARTUP_GRACE_MS;
  if (!lost) return job;
  return updateJob(cwd, job.id, {
    status: 'failed',
    finishedAt: new Date().toISOString(),
    error: 'El proceso del trabajo terminó inesperadamente (cierre de la terminal, reinicio o fallo).',
  });
}

/** Jobs for the repository of `cwd`, newest first. */
export function listJobs(cwd) {
  let files = [];
  try {
    files = readdirSync(jobsDir(cwd)).filter((f) => /^agy-[a-z0-9-]+\.json$/.test(f));
  } catch {
    return [];
  }
  return files
    .map((f) => readJob(cwd, f.slice(0, -'.json'.length)))
    .filter(Boolean)
    .map((job) => reconcile(cwd, job))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function pruneJobs(cwd) {
  const jobs = listJobs(cwd);
  for (const job of jobs.slice(MAX_JOBS)) {
    if (ACTIVE.has(job.status)) continue;
    for (const suffix of ['.json', '.input.json', '.out.md']) {
      rmSync(jobFile(cwd, job.id, suffix), { force: true });
    }
  }
}

/**
 * Find a job by full ID or unique prefix; without a reference, the newest job matching `predicate`.
 */
export function findJob(cwd, reference, predicate = () => true) {
  const jobs = listJobs(cwd).filter(predicate);
  if (!reference) return jobs[0] || null;
  const exact = jobs.find((j) => j.id === reference);
  if (exact) return exact;
  const matches = jobs.filter((j) => j.id.startsWith(reference));
  if (matches.length > 1) throw new Error(`"${reference}" coincide con varios trabajos; usa el ID completo.`);
  return matches[0] || null;
}

export function isActive(job) {
  return ACTIVE.has(job.status);
}

/** Conversation ID of the newest finished job of one of `kinds`, for --resume. */
export function lastConversationId(cwd, kinds) {
  const job = listJobs(cwd).find((j) => kinds.includes(j.kind) && j.status === 'completed' && j.conversationId);
  return job ? job.conversationId : null;
}
