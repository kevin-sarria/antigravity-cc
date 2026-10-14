/**
 * Model and effort selection. Users type short names ("pro alto"); agy needs exact IDs.
 *
 * In agy the effort is part of the model ID (gemini-3.1-pro-low). Passing a model plus an
 * --effort it does not offer makes agy silently fall back to its default model, so we always
 * resolve to one concrete variant ID and never send --effort alongside --model.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { EFFORT_LEVELS, SAFE_TOKEN, buildChildEnv, needsShell, shellSafeBin } from './backend.mjs';

const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
const VARIANT = new RegExp(`^(.+)-(${EFFORT_LEVELS.join('|')})$`);

/** Short names → model family. The newest version of the family wins. */
export const MODEL_ALIASES = {
  flash: { pattern: /^gemini-[\d.]+-flash$/, fallback: 'gemini-3.8-flash', hint: 'rápido y gasta poca cuota (predeterminado de agy)' },
  pro: { pattern: /^gemini-[\d.]+-pro$/, fallback: 'gemini-3.1-pro', hint: 'más potente, gasta más cuota' },
  opus: { pattern: /^claude-opus-/, fallback: 'claude-opus-4-6-thinking', hint: 'Claude Opus vía Antigravity' },
  sonnet: { pattern: /^claude-sonnet-/, fallback: 'claude-sonnet-4-6', hint: 'Claude Sonnet vía Antigravity' },
  gpt: { pattern: /^gpt-oss-/, fallback: 'gpt-oss-120b', hint: 'GPT-OSS vía Antigravity' },
};

const EFFORT_WORDS = {
  low: 'low', bajo: 'low', baja: 'low',
  medium: 'medium', medio: 'medium', media: 'medium',
  high: 'high', alto: 'high', alta: 'high',
  xhigh: 'xhigh', 'muy-alto': 'xhigh',
  max: 'max', maximo: 'max', máximo: 'max',
};

export const EFFORT_LABELS = { low: 'bajo', medium: 'medio', high: 'alto', xhigh: 'muy alto', max: 'máximo' };

export function isEffortWord(word) {
  return Boolean(word && EFFORT_WORDS[word.toLowerCase()]);
}

export function normalizeEffort(effort) {
  if (!effort) return undefined;
  const value = EFFORT_WORDS[String(effort).toLowerCase()];
  if (!value) throw new Error(`Esfuerzo no válido: "${effort}". Usa bajo, medio o alto (o ${EFFORT_LEVELS.join(', ')}).`);
  return value;
}

// ---------------------------------------------------------------------------
// User config (~/.antigravity-cc/config.json). Only preferences: never credentials.
// ---------------------------------------------------------------------------

export function configDir() {
  if (process.env.AGY_CONFIG_DIR) return process.env.AGY_CONFIG_DIR;
  // When the state is relocated (tests, portable installs) the config travels with it.
  if (process.env.AGY_STATE_DIR) return path.join(process.env.AGY_STATE_DIR, 'config');
  return path.join(os.homedir(), '.antigravity-cc');
}

function readJsonFile(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJsonFile(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, file);
}

export function readConfig() {
  const data = readJsonFile(path.join(configDir(), 'config.json')) || {};
  return {
    model: data.model || undefined,
    effort: data.effort || undefined,
    approval: data.approval === 'full' ? 'full' : undefined,
  };
}

/** Merge `patch` into the config; a key set to undefined is removed. */
export function writeConfig(patch) {
  const file = path.join(configDir(), 'config.json');
  const next = { ...readConfig(), ...patch };
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
  if (Object.keys(next).length === 0) {
    rmSync(file, { force: true });
    return;
  }
  writeJsonFile(file, next);
}

/**
 * Approval for delegate/task: --full-access > AGY_APPROVAL_MODE > /antigravity:permissions.
 * @returns {{ mode: 'auto_edit'|'yolo', source: 'flag'|'env'|'config'|'default' }}
 */
export function resolveApproval(flags = {}) {
  if (flags['full-access']) return { mode: 'yolo', source: 'flag' };
  if (process.env.AGY_APPROVAL_MODE) return { mode: process.env.AGY_APPROVAL_MODE, source: 'env' };
  if (readConfig().approval === 'full') return { mode: 'yolo', source: 'config' };
  return { mode: 'auto_edit', source: 'default' };
}

// ---------------------------------------------------------------------------
// Catalog (`agy models`), cached for a day per binary.
// ---------------------------------------------------------------------------

/** Parse `agy models` output: one "id<TAB>label" per line. */
export function parseModelList(text) {
  const models = [];
  for (const line of (text || '').split(/\r?\n/)) {
    const match = /^([a-z0-9][a-z0-9._-]*)\t+(.+)$/i.exec(line.trim());
    if (match) models.push({ id: match[1], label: match[2].trim() });
  }
  return models;
}

export function loadCatalog(backend, { refresh = false } = {}) {
  if (!backend || backend.type !== 'antigravity') return null;
  const file = path.join(configDir(), 'models-cache.json');
  const cached = readJsonFile(file);
  if (!refresh && cached?.bin === backend.bin && Date.now() - cached.fetchedAt < CATALOG_TTL_MS && cached.models?.length) {
    return cached.models;
  }
  const run = spawnSync(shellSafeBin(backend.bin), ['models'], {
    encoding: 'utf-8',
    timeout: 30000,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: needsShell(backend.bin),
    env: buildChildEnv(),
  });
  const models = parseModelList(run.stdout);
  if (models.length === 0) return cached?.models?.length ? cached.models : null;
  try {
    writeJsonFile(file, { bin: backend.bin, fetchedAt: Date.now(), models });
  } catch {
    // A read-only home only costs us the cache.
  }
  return models;
}

/** Group variant IDs under their base: gemini-3.1-pro → { low, high }. */
export function groupCatalog(models) {
  const groups = new Map();
  for (const model of models || []) {
    const match = VARIANT.exec(model.id);
    const base = match ? match[1] : model.id;
    if (!groups.has(base)) groups.set(base, { base, variants: {}, plain: null });
    if (match) groups.get(base).variants[match[2]] = model;
    else groups.get(base).plain = model;
  }
  return groups;
}

function versionKey(id) {
  return (id.match(/\d+/g) || []).map(Number);
}

function compareVersions(a, b) {
  const ka = versionKey(a);
  const kb = versionKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const diff = (ka[i] ?? -1) - (kb[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

function familyLabel(group) {
  const sample = group.plain || Object.values(group.variants)[0];
  return sample ? sample.label.replace(/\s*\((Low|Medium|High|XHigh|Max)\)\s*$/i, '') : group.base;
}

function availableEfforts(group) {
  return EFFORT_LEVELS.filter((level) => group.variants[level]);
}

/**
 * Resolve what the user asked for into the exact agy arguments.
 * @param {{ model?: string, effort?: string, explicitEffort?: boolean }} request
 * @param {Array<{id:string,label:string}>|null} catalog `agy models`; null when unavailable.
 * @returns {{ model?: string, effort?: string, label: string|null }}
 */
export function resolveModelSelection({ model, effort, explicitEffort = true } = {}, catalog) {
  let wantedEffort = normalizeEffort(effort);
  const requested = model ? String(model).trim().toLowerCase() : '';
  if (requested && !SAFE_TOKEN.test(requested)) throw new Error(`Modelo no válido: "${model}"`);

  const groups = groupCatalog(catalog);
  if (groups.size === 0) {
    // No catalog (other engine, agy offline): best effort without validation.
    if (!requested) return { effort: wantedEffort, label: wantedEffort ? `predeterminado (esfuerzo ${EFFORT_LABELS[wantedEffort]})` : null };
    const id = MODEL_ALIASES[requested]?.fallback || requested;
    const variant = VARIANT.exec(id);
    if (variant && wantedEffort) return { model: variant[1], effort: wantedEffort, label: `${variant[1]} (${wantedEffort})` };
    return { model: id, effort: wantedEffort, label: wantedEffort ? `${id} (${wantedEffort})` : id };
  }

  // Effort alone tunes agy's default model, which is the newest Flash.
  const name = requested || (wantedEffort ? 'flash' : '');
  if (!name) return { label: null };

  let base;
  if (MODEL_ALIASES[name]) {
    const family = [...groups.keys()].filter((key) => MODEL_ALIASES[name].pattern.test(key)).sort(compareVersions);
    base = family.at(-1);
    if (!base) throw new Error(`Tu cuenta de Antigravity no ofrece modelos "${name}". Revisa la lista con /antigravity:model.`);
  } else if (groups.has(name)) {
    base = name;
  } else {
    const exact = (catalog || []).find((m) => m.id === name);
    const variant = exact && VARIANT.exec(name);
    if (!variant) {
      throw new Error(
        `Modelo desconocido: "${model}". Usa ${Object.keys(MODEL_ALIASES).join(', ')} o un ID de \`agy models\`.`
      );
    }
    base = variant[1];
    // An explicit variant ID wins over a default effort from the config.
    if (!explicitEffort || !wantedEffort) {
      wantedEffort = variant[2];
      explicitEffort = true;
    }
  }

  const group = groups.get(base);
  const efforts = availableEfforts(group);
  if (efforts.length === 0) {
    if (wantedEffort && explicitEffort) throw new Error(`${familyLabel(group)} no admite niveles de esfuerzo.`);
    return { model: group.plain.id, label: group.plain.label };
  }
  if (wantedEffort && !efforts.includes(wantedEffort)) {
    if (explicitEffort) {
      throw new Error(
        `${familyLabel(group)} admite esfuerzo ${efforts.map((e) => `${EFFORT_LABELS[e]} (${e})`).join(', ')}.`
      );
    }
    wantedEffort = undefined;
  }
  const chosen = wantedEffort || (efforts.includes('high') ? 'high' : efforts.at(-1));
  return { model: group.variants[chosen].id, label: group.variants[chosen].label };
}

/** Where the model/effort for a run come from: flags > environment > /antigravity:model config. */
export function requestedSelection(flags = {}) {
  const config = readConfig();
  const model = flags.model || process.env.AGY_MODEL || config.model;
  const explicitEffort = Boolean(flags.effort || process.env.AGY_EFFORT);
  const effort = flags.effort || process.env.AGY_EFFORT || config.effort;
  return { model, effort, explicitEffort };
}

/**
 * Resolve the run's model, refreshing a stale catalog once before giving up on an unknown name.
 */
export function resolveRunModel(flags, backend) {
  const request = requestedSelection(flags);
  if (!request.model && !request.effort) return { label: null };
  if (!backend || backend.type !== 'antigravity') {
    const effort = normalizeEffort(request.effort);
    if (request.model && !SAFE_TOKEN.test(request.model)) throw new Error(`Modelo no válido: "${request.model}"`);
    return { model: request.model, effort, label: request.model || null };
  }
  try {
    return resolveModelSelection(request, loadCatalog(backend));
  } catch (error) {
    if (!/desconocido|no ofrece/.test(error.message)) throw error;
    return resolveModelSelection(request, loadCatalog(backend, { refresh: true }));
  }
}

/** Rows for /antigravity:model: each alias with what it resolves to and its effort levels. */
export function describeAliases(catalog) {
  const groups = groupCatalog(catalog);
  return Object.entries(MODEL_ALIASES).map(([alias, info]) => {
    const base = [...groups.keys()].filter((key) => info.pattern.test(key)).sort(compareVersions).at(-1);
    const group = base && groups.get(base);
    return {
      alias,
      hint: info.hint,
      available: Boolean(group),
      label: group ? familyLabel(group) : null,
      efforts: group ? availableEfforts(group) : [],
    };
  });
}

export function configFileExists() {
  return existsSync(path.join(configDir(), 'config.json'));
}
