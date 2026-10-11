#!/usr/bin/env node
/**
 * Antigravity Plugin for Claude Code (agy-cc)
 * Dual-agent orchestrator connecting Claude Code with Google Antigravity CLI (`agy`),
 * legacy Gemini CLI (enterprise accounts only) or Codex.
 */

import { spawn, spawnSync, execSync } from 'node:child_process';
import process from 'node:process';
import { existsSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VERSION = '1.2.0';
const IS_WINDOWS = process.platform === 'win32';

// Bash tool in Claude Code allows at most 10 minutes; stay below it so we can report the timeout ourselves.
const DEFAULT_TIMEOUT_MS = 570000;
const MAX_DIFF_CHARS = 150000;
const SAFE_TOKEN = /^[A-Za-z0-9._:\/-]+$/;
const WRITE_APPROVAL_MODES = ['auto_edit', 'yolo'];
const ENGINE_LABELS = {
  antigravity: 'Antigravity CLI (agy)',
  gemini: 'Gemini CLI (legado)',
  codex: 'Codex CLI',
};

// Parse arguments
const args = process.argv.slice(2);
let action = args[0] || 'help';
let rawUserPrompt = '';
let engineOverride = null;
let resetLogin = false;

// Handle options and flags
const positional = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--engine' && i + 1 < args.length) {
    engineOverride = args[++i];
  } else if (arg === '--reset') {
    resetLogin = true;
  } else if (arg === '--help' || arg === '-h') {
    action = 'help';
  } else if (arg === '--version' || arg === '-v') {
    action = 'version';
  } else {
    positional.push(arg);
  }
}

if (positional.length > 0) {
  action = positional[0];
  rawUserPrompt = positional.slice(1).join(' ').trim();
}

/**
 * All matches for a command in PATH, as absolute paths. On Windows only entries with an
 * executable extension are kept (npm also drops extension-less sh scripts next to the .cmd).
 */
function whichAll(command) {
  try {
    const out = execSync(IS_WINDOWS ? `where.exe ${command}` : `which -a ${command}`, {
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
function needsShell(bin) {
  return IS_WINDOWS && /\.(cmd|bat)$/i.test(bin);
}

function shellSafeBin(bin) {
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

  const requestedEngine = (engineOverride || process.env.AGY_ENGINE || 'antigravity').toLowerCase();

  if (requestedEngine === 'codex') {
    const codexBin = process.env.CODEX_BIN || whichAll('codex')[0];
    // An explicit Codex request must not silently fall back to another engine.
    return codexBin ? { bin: codexBin, type: 'codex' } : null;
  }

  if (requestedEngine !== 'gemini') {
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
    return { bin: geminiBin, type: 'gemini', fallback: requestedEngine !== 'gemini' };
  }

  return null;
}

function geminiHome() {
  return path.join(os.homedir(), '.gemini');
}

/**
 * Environment for the sub-agent. Unless API key mode is requested explicitly, API keys are
 * removed so Gemini CLI uses the Google Account login (Google AI Pro).
 */
function buildChildEnv() {
  const env = { ...process.env, GEMINI_CLI_TRUST_WORKSPACE: 'true' };
  if (process.env.AGY_AUTH_MODE !== 'apikey') {
    delete env.GEMINI_API_KEY;
    delete env.GOOGLE_API_KEY;
    // Selects "Login with Google" even when ~/.gemini/settings.json has no auth type yet.
    env.GOOGLE_GENAI_USE_GCA = 'true';
  }
  return env;
}

/**
 * Detect current authentication mode without exposing secret values
 */
function getAuthMethodInfo() {
  if (process.env.AGY_AUTH_MODE === 'apikey') {
    const hasKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    return {
      type: `API Key (${hasKey ? 'Configurada en entorno' : 'No detectada'} - AGY_AUTH_MODE=apikey)`,
      isApiKey: true,
    };
  }

  try {
    const googleAccountsPath = path.join(geminiHome(), 'google_accounts.json');
    if (existsSync(googleAccountsPath)) {
      const data = JSON.parse(readFileSync(googleAccountsPath, 'utf-8'));
      if (data.active) {
        const [user, domain] = data.active.split('@');
        const masked = user.length > 2 ? `${user.slice(0, 2)}***@${domain}` : `***@${domain}`;
        return { type: `Login con Google (OAuth - ${masked})`, isApiKey: false, loggedIn: true };
      }
    }
  } catch {
    // Ignore read errors
  }

  return {
    type: 'Login con Google (sin sesión detectada - ejecuta /antigravity:login)',
    isApiKey: false,
    loggedIn: false,
  };
}

/**
 * Filter out noisy terminal banners or CLI initialization warnings
 */
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
 * payload of the final `result` event ({ status, response, error, denied_actions, ... }).
 * Returns null when no result event is present.
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
export function toolPolicy(backend, mode) {
  if (backend.type !== 'antigravity') return '';
  const canRunCommands = mode === 'write' && process.env.AGY_APPROVAL_MODE === 'yolo';
  if (canRunCommands) return '';
  const rules = [
    'REGLAS DE HERRAMIENTAS (obligatorias):',
    '- Estás en modo headless SIN permiso para ejecutar comandos de terminal. NO uses RunCommand ni ningún comando de shell',
    '  (ni para listar archivos, ni git, ni tests, ni instalar): cualquier intento aborta tu turno sin respuesta.',
    '- Usa solo herramientas de archivos: listar directorios, buscar por nombre, buscar texto (grep) y leer archivos.',
    `- Trabaja SOLO dentro del directorio del proyecto: ${process.cwd()}`,
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
 * Build CLI arguments. Every argument is a fixed or validated token: user content always travels
 * through stdin, so nothing user-controlled reaches the command line.
 * @param {'read'|'write'} mode read = sub-agent may only read the repo; write = may edit files.
 */
export function buildBackendArgs(backend, mode, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const model = process.env.AGY_MODEL;
  if (model && !SAFE_TOKEN.test(model)) {
    throw new Error(`AGY_MODEL contiene caracteres no válidos: "${model}"`);
  }

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

function killTree(child) {
  if (!child.pid) return;
  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function describeDenied(denied) {
  if (!Array.isArray(denied) || denied.length === 0) return '';
  const names = [...new Set(denied.map((d) => d.display_name || d.action).filter(Boolean))];
  return names.join(', ');
}

/**
 * Executes the backend CLI in non-interactive/headless mode.
 * @param {string} promptText
 * @param {{ mode?: 'read'|'write' }} [options]
 */
export function runBackend(promptText, { mode = 'read' } = {}) {
  return new Promise((resolve, reject) => {
    const backend = resolveBackend();
    if (!backend) {
      const requested = (engineOverride || process.env.AGY_ENGINE || '').toLowerCase();
      return reject(
        new Error(
          requested === 'codex'
            ? 'Se pidió el motor Codex pero `codex` no está en el PATH. Instálalo o define CODEX_BIN.'
            : 'NOT_INSTALLED: No se encontró Antigravity CLI (`agy`).'
        )
      );
    }

    const timeoutMs = Number(process.env.AGY_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
    let cliArgs;
    try {
      cliArgs = buildBackendArgs(backend, mode, timeoutMs);
    } catch (err) {
      return reject(err);
    }

    const child = spawn(shellSafeBin(backend.bin), cliArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      // Only .cmd shims use a shell; arguments are fixed/validated tokens (see buildBackendArgs).
      shell: needsShell(backend.bin),
      env: buildChildEnv(),
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
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
              'Divide la tarea en partes más pequeñas o ajusta AGY_TIMEOUT_MS.'
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
        if (!text && denied) {
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
        return resolve(sanitizeSensitiveData(text));
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
      resolve(sanitizeSensitiveData(text.trim()));
    });
  });
}

const INSTALL_AGY_STEPS = [
  'Instala Antigravity CLI (sucesor oficial de Gemini CLI):',
  '   Windows  : winget install Google.AntigravityCLI',
  '              (o en PowerShell: irm https://antigravity.google/cli/install.ps1 | iex)',
  '   mac/Linux: curl -fsSL https://antigravity.google/cli/install.sh | bash',
  'Luego ejecuta /antigravity:login para iniciar sesión con tu cuenta Google AI Pro y /antigravity:test.',
];

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
      'Si ya usas la cuenta Google, espera a que se renueve la cuota o cambia de modelo con AGY_MODEL.'
    );
  } else if (/ProjectIdRequired|GOOGLE_CLOUD_PROJECT/i.test(message)) {
    hints.push(
      'DIAGNÓSTICO: La cuenta requiere un proyecto de Google Cloud.',
      'Esto ocurre con cuentas de Workspace/empresa. Define GOOGLE_CLOUD_PROJECT=<id-proyecto> o usa tu cuenta personal con AI Pro.'
    );
  } else if (/^DENIED:/.test(message)) {
    hints.push(
      'DIAGNÓSTICO: En modo headless, Antigravity corta el turno cuando una herramienta no tiene permiso.',
      'review/challenge/test son de solo lectura; delegate/task pueden editar archivos pero no ejecutar comandos.',
      'Para permitir comandos en delegate/task: AGY_APPROVAL_MODE=yolo (aprueba todo; úsalo con cuidado).'
    );
  } else if (/^TIMEOUT:/.test(message)) {
    hints.push('DIAGNÓSTICO: El sub-agente excedió el tiempo máximo. Divide la tarea o aumenta AGY_TIMEOUT_MS (máx. recomendado 570000).');
  } else if (/login|auth|credential|sign in/i.test(message)) {
    hints.push('DIAGNÓSTICO: Problema de autenticación. Ejecuta /antigravity:login para iniciar sesión con tu cuenta Google AI Pro.');
  }
  return hints;
}

function reportFailure(label, error) {
  console.error(`\n❌ Error en ${label}: ${error.message}\n`);
  const hints = diagnoseError(error.message);
  if (hints.length > 0) {
    console.error('──────────────────────────────────────────────────────');
    for (const line of hints) console.error(line);
    console.error('──────────────────────────────────────────────────────\n');
  }
  process.exit(1);
}

/**
 * Read prompt text from stdin when it is piped (e.g. a heredoc from a Claude Code command).
 * Passing user text through stdin avoids shell quoting and injection problems.
 */
function readPipedStdin() {
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    let data = '';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(idle);
      process.stdin.pause();
      resolve(data.trim());
    };
    // Guard against an open stdin that never sends anything.
    const idle = setTimeout(finish, 3000);
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      clearTimeout(idle);
      data += chunk;
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
  });
}

function git(command) {
  return execSync(command, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

/**
 * Retrieve local git changes (tracked diff against HEAD + untracked files)
 */
export function getLocalGitDiff() {
  try {
    git('git rev-parse --is-inside-work-tree');
  } catch {
    return { isGit: false, diff: '', untracked: [] };
  }

  let diff = '';
  try {
    diff = git('git diff HEAD');
  } catch {
    // Repo without commits yet: show staged + unstaged changes
    try {
      diff = [git('git diff --cached'), git('git diff')].filter(Boolean).join('\n');
    } catch {
      diff = '';
    }
  }

  let untracked = [];
  try {
    const list = git('git ls-files --others --exclude-standard');
    untracked = list ? list.split('\n').map((f) => f.trim()).filter(Boolean) : [];
  } catch {
    untracked = [];
  }

  if (diff.length > MAX_DIFF_CHARS) {
    diff = `${diff.slice(0, MAX_DIFF_CHARS)}\n\n[... diff truncado a ${MAX_DIFF_CHARS} caracteres; lee los archivos directamente para el resto ...]`;
  }

  return { isGit: true, diff, untracked };
}

/**
 * Action: review
 */
async function handleReview(focus) {
  const { isGit, diff, untracked } = getLocalGitDiff();

  if (!isGit) {
    console.log('ℹ️ El directorio actual no es un repositorio Git. Inicializa Git (`git init`) para usar /antigravity:review.');
    return;
  }

  if (!diff && untracked.length === 0) {
    console.log('✔ No se encontraron cambios locales sin confirmar para revisar.');
    return;
  }

  console.log('🛰️ [Antigravity] Analizando cambios locales con el sub-agente (solo lectura)...');

  const prompt = [
    'Eres un revisor de código senior y especialista en seguridad de software.',
    'Analiza los cambios locales de manera concisa y objetiva. Puedes leer archivos del repositorio para obtener contexto, pero NO modifiques nada.',
    focus ? `Foco solicitado por el usuario: ${focus}` : '',
    'Estructura tu reporte exactamente con estas secciones:',
    '1. Riesgos de Seguridad e Inyección (OWASP, escape de datos, validaciones faltantes)',
    '2. Lógica, Bugs y Condiciones de Carrera (concurrencia, null pointers, memory leaks)',
    '3. Rendimiento y Buenas Prácticas (consultas N+1, operaciones sincrónicas bloqueantes)',
    '4. Veredicto Final: "APROBADO" o "REQUIERE ATENCIÓN" con justificación sintética.',
    'Cita cada hallazgo como ruta:línea.',
    untracked.length > 0
      ? `\nArchivos nuevos sin seguimiento (léelos con tus herramientas):\n${untracked.map((f) => `- ${f}`).join('\n')}`
      : '',
    '\n--- GIT DIFF INICIO ---',
    diff || '(sin cambios en archivos con seguimiento)',
    '--- GIT DIFF FIN ---',
  ]
    .filter((line) => line !== '')
    .join('\n');

  try {
    const output = await runBackend(prompt, { mode: 'read' });
    console.log('\n======================================================');
    console.log('       REVISIÓN CRUZADA: ANTIGRAVITY');
    console.log('======================================================\n');
    console.log(output);
    console.log('\n======================================================\n');
  } catch (error) {
    reportFailure('/antigravity:review', error);
  }
}

/**
 * Action: delegate
 */
async function handleDelegate(task) {
  if (!task) {
    console.error('❌ Especifica la tarea a delegar.');
    console.error('Ejemplo: /antigravity:delegate Escribir tests unitarios con Vitest para src/auth.ts');
    process.exit(1);
  }

  console.log('🛰️ [Antigravity] Ejecutando tarea delegada (con permiso de edición de archivos)...');

  const prompt = [
    'Tarea técnica delegada desde Claude Code:',
    '<<<TAREA',
    task,
    'TAREA>>>',
    '',
    'Instrucciones de ejecución:',
    '1. Realiza las modificaciones o creaciones necesarias directamente en los archivos del repositorio local.',
    '2. Si puedes ejecutar comandos, corre las pruebas asociadas. Si no tienes permiso de shell, indícalo: Claude Code las ejecutará.',
    '3. Devuelve únicamente un resumen con:',
    '   - Archivos afectados / creados',
    '   - Cambios implementados',
    '   - Pruebas ejecutadas y resultados (o "no ejecutadas")',
    '   - Advertencias o pasos pendientes',
  ].join('\n');

  try {
    const output = await runBackend(prompt, { mode: 'write' });
    console.log('\n======================================================');
    console.log('          RESUMEN DE EJECUCIÓN (ANTIGRAVITY)');
    console.log('======================================================\n');
    console.log(output);
    console.log('\n======================================================');
    console.log('Verifica con `git status` / `git diff` los cambios reales en disco.\n');
  } catch (error) {
    reportFailure('/antigravity:delegate', error);
  }
}

/**
 * Action: task
 * Orquesta el flujo autónomo completo (Round-Trip / Ping-Pong):
 * 1. Envía la especificación al sub-agente para que codifique en disco y genere tests.
 * 2. Emite la señal estructurada para que Claude Code audite, ejecute pruebas y corrija.
 */
async function handleTask(task) {
  if (!task) {
    console.error('❌ Especifica la descripción de la tarea a ejecutar.');
    console.error('Ejemplo: /antigravity:task "Crear módulo de multi-envío de correos con validación de Excel..."');
    process.exit(1);
  }

  console.log('\n🛰️ [Antigravity Task Orchestrator] Iniciando pipeline dual-agent...');
  console.log('⚡ Fase 2: Delegando codificación, creación de archivos y tests a Antigravity...');

  const prompt = [
    'Eres el sub-agente ejecutor de desarrollo (Antigravity) trabajando en equipo con Claude Code.',
    'ESPECIFICACIÓN A IMPLEMENTAR:',
    '<<<ESPECIFICACION',
    task,
    'ESPECIFICACION>>>',
    '',
    'INSTRUCCIONES DE EJECUCIÓN DIRECTA EN EL PROYECTO:',
    '1. Analiza la arquitectura del repositorio actual y los estándares del proyecto.',
    '2. Crea y modifica directamente en el sistema de archivos todos los módulos, componentes, tipos, servicios y pruebas necesarias.',
    '3. Incluye manejo de errores, validaciones de seguridad y tipado riguroso.',
    '4. Escribe pruebas automatizadas. Ejecútalas solo si tienes permiso de shell; si no, indícalo (Claude Code las ejecutará).',
    '5. DEVUELVE ÚNICAMENTE un informe estructurado con:',
    '   - Lista detallada de archivos creados y modificados.',
    '   - Resumen técnico de la implementación realizada.',
    '   - Pruebas añadidas y estado de ejecución.',
    '   - Puntos de atención, decisiones técnicas o posibles edge cases para auditoría.',
  ].join('\n');

  try {
    const output = await runBackend(prompt, { mode: 'write' });
    console.log('\n======================================================');
    console.log('       FASE 2 COMPLETADA: EJECUCIÓN POR ANTIGRAVITY');
    console.log('======================================================\n');
    console.log(output);
    console.log('\n======================================================');
    console.log('  🛰️ SEÑAL PARA CLAUDE CODE - FASE 3: AUDITORÍA Y CONTROL');
    console.log('======================================================');
    console.log('INSTRUCCIONES PARA CLAUDE CODE:');
    console.log('1. Ejecuta `git status` y `git diff` para ver los cambios REALES en disco (no confíes solo en el resumen).');
    console.log('2. Ejecuta la suite de pruebas del proyecto (ej: npm test, pytest, etc.) para verificar la integridad.');
    console.log('3. Si detectas inconsistencias, bugs, edge cases o advertencias del linter, corrígelos directamente.');
    console.log('4. Entrega al usuario el reporte final consolidado de la tarea terminada para su retroalimentación.');
    console.log('======================================================\n');
  } catch (error) {
    reportFailure('/antigravity:task', error);
  }
}

/**
 * Action: challenge
 */
async function handleChallenge(question) {
  if (!question) {
    console.error('❌ Proporciona el planteamiento técnico a contrastar.');
    console.error('Ejemplo: /antigravity:challenge ¿Es viable usar SQLite WAL mode con 50 workers concurrentes?');
    process.exit(1);
  }

  console.log('🛰️ [Antigravity] Contrastando hipótesis técnica con pensamiento crítico (solo lectura)...');

  const prompt = [
    'Actúa como un arquitecto de software escéptico y riguroso. Puedes leer el repositorio para obtener contexto, pero NO modifiques nada.',
    'Evalúa críticamente el siguiente planteamiento o solución propuesta:',
    '<<<PLANTEAMIENTO',
    question,
    'PLANTEAMIENTO>>>',
    'Identifica:',
    '1. Casos límite (edge cases) y condiciones imprevistas de fallo.',
    '2. Cuellos de botella potenciales en hardware, I/O, red o concurrencia.',
    '3. Alternativas arquitectónicas superiores con sus pros y contras.',
    '4. Recomendación final pragmática.',
  ].join('\n');

  try {
    const output = await runBackend(prompt, { mode: 'read' });
    console.log('\n======================================================');
    console.log('        CRÍTICA DE ARQUITECTURA (ANTIGRAVITY)');
    console.log('======================================================\n');
    console.log(output);
    console.log('\n======================================================\n');
  } catch (error) {
    reportFailure('/antigravity:challenge', error);
  }
}

function getBackendVersion(backend) {
  try {
    const res = spawnSync(shellSafeBin(backend.bin), ['--version'], {
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

/**
 * Action: status
 */
async function handleStatus() {
  const backend = resolveBackend();
  const approval = process.env.AGY_APPROVAL_MODE || 'auto_edit';
  console.log('\n======================================================');
  console.log(`  ESTADO DE INTEGRACIÓN ANTIGRAVITY-CC (v${VERSION})`);
  console.log('======================================================');
  if (!backend) {
    console.log('❌ Estado: Sin backend conectado.');
    console.log('   No se encontró Antigravity CLI (`agy`) ni Gemini CLI (o falta `codex` si AGY_ENGINE=codex).');
    for (const line of INSTALL_AGY_STEPS) console.log(`   ${line}`);
  } else {
    console.log(`✔ Motor            : ${ENGINE_LABELS[backend.type]} v${getBackendVersion(backend)}`);
    console.log(`✔ Binario          : ${backend.bin}`);
    if (backend.type === 'antigravity') {
      console.log('✔ Autenticación    : cuenta de Antigravity (sesión gestionada por agy; cámbiala con /antigravity:login)');
      console.log('✔ Modo lectura     : review, challenge, test (escrituras y comandos denegados)');
      console.log(
        `✔ Modo escritura   : delegate, task (${approval === 'yolo' ? '--dangerously-skip-permissions' : '--mode accept-edits, sin comandos de shell'})`
      );
    } else if (backend.type === 'gemini') {
      console.log(`✔ Autenticación    : ${getAuthMethodInfo().type}`);
      console.log('✔ Modo lectura     : review, challenge, test (--approval-mode default: escrituras denegadas)');
      console.log(`✔ Modo escritura   : delegate, task (--approval-mode ${approval})`);
      if (backend.fallback) {
        console.log('⚠️ Aviso           : no se encontró Antigravity CLI; se usa Gemini CLI como respaldo.');
        console.log('                     Gemini CLI ya no atiende cuentas personales (AI Pro) desde el 18-jun-2026.');
        console.log('                     Instala agy: winget install Google.AntigravityCLI');
      }
    }
    if (process.env.AGY_MODEL) {
      console.log(`✔ Modelo forzado   : ${process.env.AGY_MODEL}`);
    }
    console.log(`✔ Timeout          : ${Math.round((Number(process.env.AGY_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS) / 1000)} s`);
    console.log(`✔ Plataforma       : ${process.platform} (${process.arch})`);
    console.log(`✔ Node.js          : ${process.version}`);
  }
  console.log('======================================================\n');
}

/**
 * Action: test
 */
async function handleTest() {
  const backend = resolveBackend();
  console.log(`Probando conectividad con ${backend ? ENGINE_LABELS[backend.type] : 'el sub-agente'}...`);
  if (backend?.type === 'gemini') {
    console.log(`ℹ️ Método de autenticación activo: ${getAuthMethodInfo().type}`);
  }

  try {
    const ping = await runBackend('Responde exactamente y únicamente: "Antigravity CLI conectado correctamente"', { mode: 'read' });
    console.log(`✔ Resultado: ${ping}`);
  } catch (error) {
    reportFailure('/antigravity:test', error);
  }
}

/**
 * Open `command` in a NEW console window. Claude Code's Bash tool is not interactive, so a
 * browser sign-in cannot happen inside it.
 */
function openConsole(title, command, env) {
  try {
    if (IS_WINDOWS) {
      const child = spawn('cmd.exe', ['/d', '/c', `start "${title}" cmd /k ${command}`], {
        env,
        detached: true,
        stdio: 'ignore',
        windowsVerbatimArguments: true,
      });
      child.unref();
      return true;
    }
    if (process.platform === 'darwin') {
      const script = `tell application "Terminal" to do script "${command}"`;
      return spawnSync('osascript', ['-e', script], { stdio: 'ignore' }).status === 0;
    }
  } catch {
    // fall through to manual instructions
  }
  return false;
}

/**
 * Action: login
 * Antigravity CLI: opens an interactive `agy` session, which signs in with the Google account
 * (the same account as the Antigravity app) when there is no session yet.
 * Legacy Gemini CLI: runs a one-shot headless prompt, because in Gemini CLI 0.63 the interactive
 * "Sign in with Google" dialog fails with "Authentication consent could not be obtained" while
 * the headless path asks for consent with a plain [Y/n] prompt.
 */
async function handleLogin() {
  const backend = resolveBackend();
  const env = buildChildEnv();

  console.log('\n======================================================');
  console.log('      INICIO DE SESIÓN CON GOOGLE (GOOGLE AI PRO)');
  console.log('======================================================');

  if (!backend || backend.type === 'codex') {
    console.log('No se encontró Antigravity CLI.');
    for (const line of INSTALL_AGY_STEPS) console.log(line);
    console.log('======================================================\n');
    return;
  }

  if (backend.type === 'antigravity') {
    if (resetLogin) {
      console.log('ℹ️ --reset no aplica a Antigravity CLI: para cambiar de cuenta usa el comando de cuenta/logout');
      console.log('   dentro de la sesión de agy (escribe / para ver los comandos disponibles).');
    }
    const opened = openConsole('Antigravity Login', /\s/.test(backend.bin) ? `"${backend.bin}"` : backend.bin, env);
    console.log(opened ? 'Se abrió una nueva ventana de consola ("Antigravity Login") con agy.' : `Abre una terminal normal y ejecuta: ${backend.bin}`);
    console.log('');
    console.log('En esa consola:');
    console.log('1. Si pide iniciar sesión, sigue el enlace y entra con la cuenta que TIENE Google AI Pro.');
    console.log('2. Si ya muestra el prompt de agy, la sesión está activa: puedes cerrarla.');
    console.log('3. Vuelve a Claude Code y ejecuta /antigravity:test para verificar.');
    console.log('======================================================\n');
    return;
  }

  if (resetLogin) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (const file of ['oauth_creds.json', 'google_accounts.json']) {
      const p = path.join(geminiHome(), file);
      if (existsSync(p)) {
        renameSync(p, `${p}.bak-${stamp}`);
        console.log(`✔ Sesión anterior respaldada: ${file} -> ${file}.bak-${stamp}`);
      }
    }
  }

  // Fixed, space-free prompt so it survives cmd.exe / AppleScript quoting untouched.
  const loginArgs = '--skip-trust -p Responde_solamente:_LOGIN_OK';
  const bin = /\s/.test(backend.bin) ? `"${backend.bin}"` : backend.bin;
  const command = IS_WINDOWS
    ? `${bin} ${loginArgs}`
    : `unset GEMINI_API_KEY GOOGLE_API_KEY; export GOOGLE_GENAI_USE_GCA=true; ${bin} ${loginArgs}`;
  const opened = openConsole('Gemini Login', command, env);

  console.log('⚠️ Usas Gemini CLI (legado): solo funciona con cuentas empresariales (Standard/Enterprise).');
  console.log('   Para Google AI Pro instala Antigravity CLI: winget install Google.AntigravityCLI');
  console.log('');
  console.log(opened ? 'Se abrió una nueva ventana de consola ("Gemini Login").' : `Abre una terminal normal y ejecuta: ${command}`);
  console.log('1. Cuando pregunte "Do you want to continue? [Y/n]", pulsa Enter.');
  console.log('2. Inicia sesión en el navegador y acepta.');
  console.log('3. Si la consola responde, el login funcionó. Vuelve y ejecuta /antigravity:test.');
  console.log('Si el navegador no se abre: set NO_BROWSER=true en esa consola y repite el comando.');
  console.log('======================================================\n');
}

/**
 * Display help instructions
 */
function showHelp() {
  console.log(`
Antigravity Plugin for Claude Code (agy-cc) v${VERSION}
Orquestación multi-agente entre Claude Code y Antigravity CLI (agy) / Codex.

USO:
  node bin/agy-wrapper.mjs <comando> [argumentos] [opciones]
  (task, delegate, challenge y review también aceptan el texto por stdin)

COMANDOS:
  task <especificación> El sub-agente codifica en disco + señal de auditoría para Claude.
  review [foco]         Revisa el git diff local (solo lectura) y emite reporte de seguridad y bugs.
  delegate <tarea>      Delega scaffolding, pruebas o refactors pesados al sub-agente (edita archivos).
  challenge <idea>      Somete una propuesta o diseño a crítica arquitectónica (solo lectura).
  login [--reset]       Abre una consola para iniciar sesión con tu cuenta Google AI Pro.
  status                Verifica el binario activo, autenticación y configuración.
  test                  Ejecuta una prueba de humo para validar la conexión.
  help                  Muestra este mensaje de ayuda.

OPCIONES:
  --engine <nombre>     Fuerza el motor ('antigravity', 'gemini' o 'codex').
  -h, --help            Muestra ayuda.
  -v, --version         Muestra la versión instalada.

VARIABLES DE ENTORNO:
  AGY_BIN               Ruta personalizada al binario (agy o gemini; se detecta cuál es).
  AGY_ENGINE            Motor por defecto: 'antigravity' (defecto), 'gemini' (legado, solo empresas) o 'codex'.
  AGY_MODEL             Modelo a usar (lista: agy models).
  AGY_APPROVAL_MODE     Permisos de escritura para delegate/task: 'auto_edit' (defecto, sin shell) o 'yolo' (también shell).
  AGY_TIMEOUT_MS        Tiempo máximo por ejecución (defecto ${DEFAULT_TIMEOUT_MS}).
  AGY_AUTH_MODE         'google' (defecto) o 'apikey' (quita/conserva GEMINI_API_KEY en el sub-agente).
`);
}

async function main() {
  const needsText = ['task', 'delegate', 'challenge', 'review'].includes(action);
  if (needsText && !rawUserPrompt) {
    rawUserPrompt = await readPipedStdin();
  }

  switch (action) {
    case 'task':
      await handleTask(rawUserPrompt);
      break;
    case 'review':
      await handleReview(rawUserPrompt);
      break;
    case 'delegate':
      await handleDelegate(rawUserPrompt);
      break;
    case 'challenge':
      await handleChallenge(rawUserPrompt);
      break;
    case 'login':
      await handleLogin();
      break;
    case 'status':
      await handleStatus();
      break;
    case 'test':
      await handleTest();
      break;
    case 'version':
      console.log(`antigravity-cc v${VERSION}`);
      break;
    case 'help':
    default:
      if (action !== 'help') {
        console.log(`Comando desconocido "${action}".\n`);
      }
      showHelp();
      break;
  }
}

// Only auto-run if directly executed via CLI
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('agy-wrapper.mjs') ||
  process.argv[1].endsWith('agy-wrapper')
);

if (isDirectRun) {
  main();
}
