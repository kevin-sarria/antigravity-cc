/**
 * Backend layer: finds the sub-agent CLI (Antigravity `agy`, legacy Gemini CLI or Codex),
 * builds its arguments and runs it headless. User text always travels through stdin.
 */

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import process from 'node:process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const IS_WINDOWS = process.platform === 'win32';

// Bash tool in Claude Code allows at most 10 minutes; stay below it so we can report the timeout ourselves.
export const DEFAULT_TIMEOUT_MS = 570000;
// Background jobs are not bound by the Bash tool limit.
export const DEFAULT_BACKGROUND_TIMEOUT_MS = 30 * 60 * 1000;

export const SAFE_TOKEN = /^[A-Za-z0-9._:\/-]+$/;
const WRITE_APPROVAL_MODES = ['auto_edit', 'yolo'];
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ENGINE_LABELS = {
  antigravity: 'Antigravity CLI (agy)',
  gemini: 'Gemini CLI (legado)',
  codex: 'Codex CLI',
};

export const INSTALL_AGY_STEPS = [
  'Instala Antigravity CLI (sucesor oficial de Gemini CLI):',
  '   Windows  : winget install Google.AntigravityCLI',
  '              (o en PowerShell: irm https://antigravity.google/cli/install.ps1 | iex)',
  '   mac/Linux: curl -fsSL https://antigravity.google/cli/install.sh | bash',
  'Luego ejecuta /antigravity:setup para verificar la instalación y la sesión.',
];

let engineOverride = null;

/** Engine requested with --engine for this process (overrides AGY_ENGINE). */
export function setEngineOverride(engine) {
  engineOverride = engine || null;
  cachedBackend = undefined;
}

/**
 * All matches for a command in PATH, as absolute paths. On Windows only entries with an
 * executable extension are kept (npm also drops extension-less sh scripts next to the .cmd).
 */
function whichAll(command) {
  try {
    const out = execFileSync(IS_WINDOWS ? 'where.exe' : 'which', IS_WINDOWS ? [command] : ['-a', command], {
      windowsHide: true,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const found = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return IS_WINDOWS ? found.filter((p) => /\.(exe|cmd|bat)$/i.test(p)) : found;
  } catch {
    return [];
  }
}

/** .cmd/.bat shims need a shell on Windows; real executables are spawned directly. */
export function needsShell(bin) {
  return IS_WINDOWS && /\.(cmd|bat)$/i.test(bin);
}

export function shellSafeBin(bin) {
  return needsShell(bin) && /\s/.test(bin) ? `"${bin}"` : bin;
}

/**
 * Install locations of the official Antigravity CLI. Checked in addition to PATH because a
 * process started before the install (e.g. the editor running Claude Code) keeps a stale PATH.
 */
function knownAgyLocations() {
  const home = os.homedir();
  if (!IS_WINDOWS) {
    return [path.join(home, '.local', 'bin', 'agy'), '/usr/local/bin/agy', '/opt/homebrew/bin/agy'];
  }
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const list = [
    path.join(local, 'agy', 'bin', 'agy.exe'),
    path.join(local, 'Microsoft', 'WinGet', 'Links', 'agy.exe'),
  ];
  const pkgs = path.join(local, 'Microsoft', 'WinGet', 'Packages');
  try {
    for (const dir of readdirSync(pkgs)) {
      if (dir.startsWith('Google.AntigravityCLI')) list.push(path.join(pkgs, dir, 'agy.exe'));
    }
  } catch {
    // WinGet not used on this machine
  }
  return list;
}

/**
 * True when `bin` is the official Antigravity CLI. Some machines have an `agy` alias that just
 * runs Gemini CLI, so the name alone is not enough: the help text must list agy-only flags.
 */
export function isAntigravityCli(bin) {
  try {
    const res = spawnSync(shellSafeBin(bin), ['--help'], {
      windowsHide: true,
      encoding: 'utf-8',
      shell: needsShell(bin),
      timeout: 20000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const text = `${res.stdout || ''}${res.stderr || ''}`;
    return text.includes('--print-timeout') && text.includes('--input-format');
  } catch {
    return false;
  }
}

export function requestedEngine() {
  return (engineOverride || process.env.AGY_ENGINE || 'antigravity').toLowerCase();
}

let cachedBackend;

/**
 * Detect the backend CLI.
 * Default: the official Antigravity CLI. Gemini CLI stopped serving personal accounts
 * (free, Google AI Pro and Ultra) on 2026-06-18, so it is only a fallback for enterprise users.
 */
export function resolveBackend() {
  if (cachedBackend !== undefined) return cachedBackend;
  cachedBackend = detectBackend();
  return cachedBackend;
}

function detectBackend() {
  const customBin = process.env.AGY_BIN || process.env.ANTIGRAVITY_BIN;
  if (customBin) {
    return { bin: customBin, type: isAntigravityCli(customBin) ? 'antigravity' : 'gemini' };
  }

  const engine = requestedEngine();

  if (engine === 'codex') {
    const codexBin = process.env.CODEX_BIN || whichAll('codex')[0];
    // An explicit Codex request must not silently fall back to another engine.
    return codexBin ? { bin: codexBin, type: 'codex' } : null;
  }

  if (engine !== 'gemini') {
    const seen = new Set();
    for (const candidate of [...whichAll('agy'), ...knownAgyLocations()]) {
      const key = candidate.toLowerCase();
      if (seen.has(key) || !existsSync(candidate)) continue;
      seen.add(key);
      if (isAntigravityCli(candidate)) return { bin: candidate, type: 'antigravity' };
    }
  }

  const geminiBin = whichAll('gemini')[0];
  if (geminiBin) {
    return { bin: geminiBin, type: 'gemini', fallback: engine !== 'gemini' };
  }

  return null;
}

export function backendVersion(backend) {
  try {
    const res = spawnSync(shellSafeBin(backend.bin), ['--version'], {
      windowsHide: true,
      encoding: 'utf-8',
      shell: needsShell(backend.bin),
      timeout: 30000,
      env: buildChildEnv(),
    });
    const line = (res.stdout || '').trim().split('\n').pop();
    return line || 'desconocida';
  } catch {
    return 'desconocida';
  }
}

export function geminiHome() {
  return path.join(os.homedir(), '.gemini');
}

/**
 * Environment for the sub-agent. Unless API key mode is requested explicitly, API keys are
 * removed so the CLI uses the Google Account login (Google AI Pro).
 */
export function buildChildEnv() {
  const env = { ...process.env, GEMINI_CLI_TRUST_WORKSPACE: 'true' };
  if (process.env.AGY_AUTH_MODE !== 'apikey') {
    delete env.GEMINI_API_KEY;
    delete env.GOOGLE_API_KEY;
    // Legacy Gemini CLI: selects "Login with Google" even without an auth type in settings.json.
    env.GOOGLE_GENAI_USE_GCA = 'true';
  }
  return env;
}

/**
 * Legacy Gemini CLI auth mode, without exposing secret values.
 */
export function getGeminiAuthInfo() {
  if (process.env.AGY_AUTH_MODE === 'apikey') {
    const hasKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    return `API Key (${hasKey ? 'configurada en entorno' : 'no detectada'} - AGY_AUTH_MODE=apikey)`;
  }
  try {
    const accounts = path.join(geminiHome(), 'google_accounts.json');
    if (existsSync(accounts)) {
      const data = JSON.parse(readFileSync(accounts, 'utf-8'));
      if (data.active) {
        const [user, domain] = data.active.split('@');
        const masked = user.length > 2 ? `${user.slice(0, 2)}***@${domain}` : `***@${domain}`;
        return `Login con Google (OAuth - ${masked})`;
      }
    }
  } catch {
    // Ignore read errors
  }
  return 'Login con Google (sin sesión detectada - ejecuta /antigravity:login)';
}

/**
 * Filter out noisy terminal banners or CLI initialization warnings
 */
/**
 * agy writes references as editor links: [`models.mjs:76`](file:///C:/abs/path/lib/models.mjs#L76-L80).
 * The URL is about half of the text and Claude cannot click it, so keep the label and, when the label
 * does not already name the file, append the relative path:line.
 */
export function compactFileLinks(text, root = process.cwd()) {
  if (!text) return text;
  return text.replace(/\[([^\]\n]+)\]\(file:\/\/\/?([^)#\s]+)(?:#L(\d+)(?:-L?\d+)?)?\)/g, (whole, label, rawPath, line, offset, all) => {
    let file;
    try {
      file = decodeURIComponent(rawPath);
    } catch {
      file = rawPath;
    }
    const absolute = /^[A-Za-z]:/.test(file) ? file : `/${file}`;
    let rel = path.relative(root, absolute).split(path.sep).join('/');
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) rel = absolute.replace(/\\/g, '/');
    const base = path.posix.basename(rel);
    if (label.replace(/`/g, '').includes(base)) return label;
    // Skip the note when the same line already names this file (e.g. "- `a.mjs:7`: [`fn`](...)").
    const lineSoFar = all.slice(all.lastIndexOf('\n', offset) + 1, offset);
    if (lineSoFar.includes(base)) return label;
    return `${label} (\`${rel}${line ? `:${line}` : ''}\`)`;
  });
}

export function cleanOutput(raw) {
  if (!raw) return '';
  return raw
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (/^Warning: .*color.*support not detected/i.test(trimmed)) return false;
      if (trimmed.startsWith('Ripgrep is not available')) return false;
      if (trimmed.startsWith('Loaded cached credentials')) return false;
      if (trimmed.startsWith('Attempt ') && trimmed.includes('failed with status')) return false;
      return true;
    })
    .join('\n')
    .trim();
}

/**
 * Mask sensitive credentials if they appear in text (defense in depth)
 */
export function sanitizeSensitiveData(text) {
  if (!text) return '';
  return text
    .replace(/(AIza[0-9A-Za-z-_]{35})/g, 'AIza[REDACTED_API_KEY]')
    .replace(/(sk-ant-[a-zA-Z0-9_\-]{20,})/g, 'sk-ant-[REDACTED_ANTHROPIC_KEY]')
    .replace(/(sk-[a-zA-Z0-9]{20,})/g, 'sk-[REDACTED_API_KEY]')
    .replace(/(ghp_[a-zA-Z0-9]{20,})/g, 'ghp_[REDACTED_GITHUB_TOKEN]')
    .replace(/(Bearer\s+[a-zA-Z0-9_\-\.]{25,})/gi, 'Bearer [REDACTED_TOKEN]');
}

/**
 * Parse Gemini CLI `--output-format json` output ({ response, stats, error }).
 * Returns null when stdout is not JSON.
 */
export function parseGeminiJson(stdout) {
  if (!stdout) return null;
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Parse Antigravity CLI `--output-format stream-json` output (NDJSON events) and return the
 * payload of the final `result` event ({ status, response, structured_output, error,
 * denied_actions, ... }). Returns null when no result event is present.
 */
export function parseAgyStream(stdout) {
  if (!stdout) return null;
  let result = null;
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const event = JSON.parse(trimmed);
      if (event.event === 'result' && event.result) result = event.result;
    } catch {
      // Not an event line
    }
  }
  return result;
}

/**
 * Tool rules prepended to every Antigravity prompt. In headless mode agy ends the turn with an
 * empty response as soon as a tool is denied, so the agent must know up front what it may use.
 */
export function toolPolicy(backend, mode, cwd = process.cwd()) {
  if (backend.type !== 'antigravity') return '';
  const canRunCommands = mode === 'write' && process.env.AGY_APPROVAL_MODE === 'yolo';
  if (canRunCommands) return '';
  const rules = [
    'REGLAS DE HERRAMIENTAS (obligatorias):',
    '- Estás en modo headless SIN permiso para ejecutar comandos de terminal. NO uses RunCommand ni ningún comando de shell',
    '  (ni para listar archivos, ni git, ni tests, ni instalar): cualquier intento aborta tu turno sin respuesta.',
    '- Usa solo herramientas de archivos: listar directorios, buscar por nombre, buscar texto (grep) y leer archivos.',
    `- Trabaja SOLO dentro del directorio del proyecto: ${cwd}`,
    '  No leas ni escribas fuera de él (tampoco proyectos que recuerdes de otras conversaciones): también aborta tu turno.',
  ];
  rules.push(
    mode === 'write'
      ? '- Puedes crear y editar archivos. Las pruebas las ejecutará Claude Code después; tú solo escríbelas.'
      : '- NO crees, edites ni borres archivos: esta tarea es de solo lectura. Si te piden modificar algo, explica qué harías.'
  );
  return `${rules.join('\n')}\n\n`;
}

/** Message written to stdin for each backend. */
export function encodePrompt(backend, promptText) {
  if (backend.type === 'antigravity') {
    // agy -p does not read plain stdin; stream-json input carries the prompt instead of argv.
    return `${JSON.stringify({ event: 'user', message: { content: promptText } })}\n`;
  }
  return promptText;
}

function resolveWriteApproval() {
  const requested = process.env.AGY_APPROVAL_MODE || 'auto_edit';
  if (!WRITE_APPROVAL_MODES.includes(requested)) {
    throw new Error(`AGY_APPROVAL_MODE debe ser uno de: ${WRITE_APPROVAL_MODES.join(', ')}`);
  }
  return requested;
}

/**
 * Validate per-run options coming from users (flags) or the environment.
 * @returns {{ model?: string, effort?: string, conversationId?: string }}
 */
export function validateRunOptions({ model, effort, conversationId } = {}) {
  // AGY_MODEL/AGY_EFFORT and short names ("pro") are resolved by lib/models.mjs before this point.
  const resolvedModel = model || undefined;
  if (resolvedModel && !SAFE_TOKEN.test(resolvedModel)) {
    throw new Error(`Modelo no válido: "${resolvedModel}"`);
  }
  if (effort && !EFFORT_LEVELS.includes(effort)) {
    throw new Error(`--effort debe ser uno de: ${EFFORT_LEVELS.join(', ')}`);
  }
  if (conversationId && !UUID.test(conversationId)) {
    throw new Error(`ID de conversación no válido: "${conversationId}"`);
  }
  return { model: resolvedModel, effort: effort || undefined, conversationId: conversationId || undefined };
}

/**
 * Build CLI arguments. Every argument is a fixed or validated token: user content always travels
 * through stdin, so nothing user-controlled reaches the command line.
 * @param {'read'|'write'} mode read = sub-agent may only read the repo; write = may edit files.
 * @param {{ model?: string, effort?: string, conversationId?: string, schemaPath?: string }} [options]
 */
export function buildBackendArgs(backend, mode, timeoutMs = DEFAULT_TIMEOUT_MS, options = {}) {
  const { model, effort, conversationId } = validateRunOptions(options);

  if (backend.type === 'codex') {
    const cliArgs = ['exec', '--skip-git-repo-check', '--sandbox', mode === 'write' ? 'workspace-write' : 'read-only'];
    if (model) cliArgs.push('-m', model);
    cliArgs.push('-'); // read prompt from stdin
    return cliArgs;
  }

  if (backend.type === 'antigravity') {
    // Headless agy auto-denies any tool that needs permission (file writes, commands) unless a
    // mode grants it. Reads work in the default mode.
    const printTimeout = Math.max(30, Math.floor(timeoutMs / 1000) - 15);
    const cliArgs = ['--input-format', 'stream-json', '--output-format', 'stream-json', '--print-timeout', `${printTimeout}s`];
    if (mode === 'write') {
      if (resolveWriteApproval() === 'yolo') cliArgs.push('--dangerously-skip-permissions');
      else cliArgs.push('--mode', 'accept-edits');
    }
    if (model) cliArgs.push('--model', model);
    if (effort) cliArgs.push('--effort', effort);
    if (conversationId) cliArgs.push('--conversation', conversationId);
    // Plugin-owned file path; agy is spawned without a shell, so spaces in it are safe.
    if (options.schemaPath) cliArgs.push('--json-schema', options.schemaPath);
    cliArgs.push('-p='); // print mode; the prompt arrives through stdin
    return cliArgs;
  }

  // Legacy Gemini CLI. In headless mode any tool that would ask for confirmation is denied,
  // so writes need an explicit approval mode; reads work with the default policy.
  const approvalMode = mode === 'write' ? resolveWriteApproval() : 'default';
  const cliArgs = ['--skip-trust', '--approval-mode', approvalMode, '--output-format', 'json'];
  if (model) cliArgs.push('-m', model);
  // -p turns on headless mode; its text is appended after the stdin prompt.
  cliArgs.push('-p', 'Procede.');
  return cliArgs;
}

export function killTree(pid) {
  if (!pid) return;
  try {
    if (IS_WINDOWS) {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      // Background workers are detached group leaders; agy runs inside their group.
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        process.kill(pid, 'SIGTERM');
      }
    }
  } catch {
    // Already gone
  }
}

/**
 * Proof that the answer came from agy: its conversation ID can be checked against
 * ~/.gemini/antigravity-cli/conversations/<id>.db and the per-run logs in .../log/.
 */
export function formatAgyReceipt(result, cwd = process.cwd()) {
  const parts = ['🛰️ Respondido por Antigravity CLI (agy)'];
  if (result.conversation_id) parts.push(`conversación ${result.conversation_id}`);
  if (typeof result.duration_seconds === 'number') parts.push(`${result.duration_seconds.toFixed(1)} s`);
  const tokens = result.usage?.total_tokens;
  if (typeof tokens === 'number') parts.push(`${(tokens / 1000).toFixed(1)}k tokens`);
  parts.push(`carpeta: ${cwd}`);
  return parts.join(' · ');
}

function describeDenied(denied) {
  if (!Array.isArray(denied) || denied.length === 0) return '';
  const names = [...new Set(denied.map((d) => d.display_name || d.action).filter(Boolean))];
  return names.join(', ');
}

/**
 * Executes the backend CLI in non-interactive/headless mode.
 *
 * @param {string} promptText
 * @param {{ mode?: 'read'|'write', timeoutMs?: number, model?: string, effort?: string,
 *           conversationId?: string, schemaPath?: string, onSpawn?: (pid:number) => void }} [options]
 * @returns {Promise<{ text: string, structured: object|null, conversationId: string|null,
 *                     receipt: string, backend: object }>}
 */
export function runBackend(promptText, options = {}) {
  const { mode = 'read' } = options;
  return new Promise((resolve, reject) => {
    const backend = resolveBackend();
    if (!backend) {
      return reject(
        new Error(
          requestedEngine() === 'codex'
            ? 'Se pidió el motor Codex pero `codex` no está en el PATH. Instálalo o define CODEX_BIN.'
            : 'NOT_INSTALLED: No se encontró Antigravity CLI (`agy`).'
        )
      );
    }

    const timeoutMs = options.timeoutMs || Number(process.env.AGY_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
    let cliArgs;
    try {
      cliArgs = buildBackendArgs(backend, mode, timeoutMs, {
        ...options,
        // Structured output is an agy feature; other engines get the text prompt only.
        schemaPath: backend.type === 'antigravity' ? options.schemaPath : undefined,
      });
    } catch (err) {
      return reject(err);
    }

    const child = spawn(shellSafeBin(backend.bin), cliArgs, {
      // Background workers have no console; without this Windows opens a window for agy.
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Only .cmd shims use a shell; arguments are fixed/validated tokens (see buildBackendArgs).
      shell: needsShell(backend.bin),
      env: buildChildEnv(),
    });
    options.onSpawn?.(child.pid);

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);

    child.stdin.on('error', () => {
      // Child may exit before consuming stdin (e.g. auth failure); the close handler reports it.
    });
    child.stdin.write(encodePrompt(backend, toolPolicy(backend, mode) + promptText));
    child.stdin.end();

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Fallo al iniciar ${backend.bin}: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const name = path.basename(backend.bin);

      if (process.env.AGY_DEBUG === '1') {
        console.error(`\n[AGY_DEBUG] ${name} ${cliArgs.join(' ')} (código ${code})`);
        console.error(`[AGY_DEBUG] stdout:\n${sanitizeSensitiveData(stdout)}`);
        console.error(`[AGY_DEBUG] stderr:\n${sanitizeSensitiveData(stderr)}\n`);
      }

      if (timedOut) {
        return reject(
          new Error(
            `TIMEOUT: ${name} no terminó en ${Math.round(timeoutMs / 1000)} s. ` +
              'Divide la tarea en partes más pequeñas, usa --background o ajusta AGY_TIMEOUT_MS.'
          )
        );
      }

      if (backend.type === 'antigravity') {
        const result = parseAgyStream(stdout);
        if (!result) {
          const errDetails = cleanOutput(stderr) || cleanOutput(stdout) || `código de salida ${code}`;
          return reject(new Error(`${name} no devolvió resultado: ${sanitizeSensitiveData(errDetails)}`));
        }
        if (result.status !== 'SUCCESS') {
          const msg = result.error || cleanOutput(stderr) || 'sin detalle';
          return reject(new Error(`${name} terminó con estado ${result.status}: ${sanitizeSensitiveData(msg)}`));
        }
        let text = (result.response || '').trim();
        const denied = describeDenied(result.denied_actions);
        if (!text && !result.structured_output && denied) {
          return reject(
            new Error(
              `DENIED: ${name} se detuvo sin responder al intentar una acción sin permiso (${denied}). ` +
                'Reformula la tarea para que no requiera esa acción, o usa AGY_APPROVAL_MODE=yolo en delegate/task.'
            )
          );
        }
        if (denied) {
          text += `\n\n⚠️ Acciones denegadas por permisos en modo headless: ${denied}.`;
          if (mode === 'read') text += ' (Esperado: este comando es de solo lectura.)';
          else text += ' Para permitir comandos de shell usa AGY_APPROVAL_MODE=yolo.';
        }
        return resolve({
          text: sanitizeSensitiveData(text),
          structured: result.structured_output ?? null,
          conversationId: result.conversation_id ?? null,
          receipt: formatAgyReceipt(result),
          deniedNote: denied,
          backend,
        });
      }

      const parsed = backend.type === 'gemini' ? parseGeminiJson(stdout) : null;

      if (parsed?.error) {
        const msg = parsed.error.message || JSON.stringify(parsed.error);
        return reject(new Error(`${name} devolvió un error: ${sanitizeSensitiveData(cleanOutput(msg))}`));
      }

      if (code !== 0) {
        const errDetails = cleanOutput(stderr) || cleanOutput(stdout);
        return reject(new Error(`${name} terminó con código ${code}: ${sanitizeSensitiveData(errDetails)}`));
      }

      const text = parsed && typeof parsed.response === 'string' ? parsed.response : cleanOutput(stdout);
      resolve({
        text: sanitizeSensitiveData(text.trim()),
        structured: null,
        conversationId: null,
        receipt: `Respondido por ${ENGINE_LABELS[backend.type]} · carpeta: ${process.cwd()}`,
        backend,
      });
    });
  });
}

/**
 * Print actionable hints for well-known backend failures.
 */
export function diagnoseError(message) {
  const hints = [];
  if (/^NOT_INSTALLED:/.test(message)) {
    hints.push('DIAGNÓSTICO: No hay un backend instalado.', '', ...INSTALL_AGY_STEPS);
  } else if (/IneligibleTierError|UNSUPPORTED_CLIENT|no longer supported/i.test(message)) {
    hints.push(
      'DIAGNÓSTICO: Gemini CLI ya no atiende cuentas personales (gratis, Google AI Pro y Ultra).',
      'Google lo apagó el 18-jun-2026 y lo reemplazó por Antigravity CLI (`agy`).',
      '',
      ...INSTALL_AGY_STEPS
    );
  } else if (/429|Quota exceeded|free_tier_requests|RESOURCE_EXHAUSTED/i.test(message)) {
    hints.push(
      'DIAGNÓSTICO: Cuota agotada (429).',
      'Si usas una API key gratuita, quita AGY_AUTH_MODE=apikey para usar tu cuenta Google AI Pro.',
      'Si ya usas la cuenta Google, espera a que se renueve la cuota o cambia de modelo con --model.'
    );
  } else if (/ProjectIdRequired|GOOGLE_CLOUD_PROJECT/i.test(message)) {
    hints.push(
      'DIAGNÓSTICO: La cuenta requiere un proyecto de Google Cloud.',
      'Esto ocurre con cuentas de Workspace/empresa. Define GOOGLE_CLOUD_PROJECT=<id-proyecto> o usa tu cuenta personal con AI Pro.'
    );
  } else if (/^DENIED:/.test(message)) {
    hints.push(
      'DIAGNÓSTICO: En modo headless, Antigravity corta el turno cuando una herramienta no tiene permiso.',
      'review/adversarial-review/challenge/test son de solo lectura; delegate/task pueden editar archivos pero no ejecutar comandos.',
      'Para permitir comandos en delegate/task: AGY_APPROVAL_MODE=yolo (aprueba todo; úsalo con cuidado).'
    );
  } else if (/^TIMEOUT:/.test(message)) {
    hints.push(
      'DIAGNÓSTICO: El sub-agente excedió el tiempo máximo.',
      'Repite con --background (sin el límite de 10 min de Claude Code) o divide la tarea.'
    );
  } else if (/login|auth|credential|sign in/i.test(message)) {
    hints.push('DIAGNÓSTICO: Problema de autenticación. Ejecuta /antigravity:login para iniciar sesión con tu cuenta Google AI Pro.');
  }
  return hints;
}
