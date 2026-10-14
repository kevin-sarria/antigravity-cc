#!/usr/bin/env node
/**
 * Antigravity Plugin for Claude Code (agy-cc)
 * Dual-agent orchestrator connecting Claude Code with Google Antigravity CLI (`agy`),
 * legacy Gemini CLI (enterprise accounts only) or Codex.
 */

import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArgv, splitLeadingFlags } from '../lib/args.mjs';
import {
  DEFAULT_BACKGROUND_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  ENGINE_LABELS,
  INSTALL_AGY_STEPS,
  IS_WINDOWS,
  backendVersion,
  buildChildEnv,
  compactFileLinks,
  diagnoseError,
  geminiHome,
  getGeminiAuthInfo,
  killTree,
  resolveBackend,
  runBackend,
  setEngineOverride,
  validateRunOptions,
} from '../lib/backend.mjs';
import { collectReviewContext, isGitRepo, repoSubfolder, resolveReviewTarget } from '../lib/git.mjs';
import {
  EFFORT_LABELS,
  describeAliases,
  isEffortWord,
  loadCatalog,
  normalizeEffort,
  readConfig,
  resolveApproval,
  resolveModelSelection,
  resolveRunModel,
  writeConfig,
} from '../lib/models.mjs';
import {
  createJob,
  findJob,
  isActive,
  lastConversationId,
  listJobs,
  workspaceRoot,
  readJobInput,
  readJobOutput,
  updateJob,
  writeJobOutput,
} from '../lib/jobs.mjs';
import {
  REVIEW_SCHEMA_PATH,
  buildAdversarialPrompt,
  buildReviewPrompt,
  parseReviewResult,
  renderReview,
} from '../lib/review.mjs';

// Re-exported for tests and for anyone importing the wrapper as a module.
export * from '../lib/backend.mjs';
export { parseArgv, splitLeadingFlags } from '../lib/args.mjs';

const WRAPPER_PATH = fileURLToPath(import.meta.url);
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version;

const REVIEW_KINDS = new Set(['review', 'adversarial-review']);
const TEXT_ACTIONS = new Set(['task', 'delegate', 'challenge', 'explore', 'review', 'adversarial-review']);
// Which earlier conversations --resume may continue for each kind.
const RESUME_KINDS = {
  delegate: ['delegate', 'task'],
  task: ['delegate', 'task'],
  challenge: ['challenge'],
  explore: ['explore'],
};

const KIND_LABELS = {
  review: 'Revisión',
  'adversarial-review': 'Revisión adversarial',
  challenge: 'Crítica de arquitectura',
  explore: 'Investigación',
  delegate: 'Tarea delegada',
  task: 'Pipeline task',
};

class UsageError extends Error {}

// ---------------------------------------------------------------------------
// Preparing an action: everything that depends on the user's input or the repo state happens
// here, in the foreground, so a background worker runs exactly what the user asked for.
// ---------------------------------------------------------------------------

function prepareReview(kind, text, flags, cwd) {
  if (!isGitRepo(cwd)) {
    throw new UsageError('El directorio actual no es un repositorio Git. Inicializa Git (`git init`) para revisar cambios.');
  }
  const target = resolveReviewTarget(cwd, { base: flags.base, scope: flags.scope || 'auto' });
  const context = collectReviewContext(cwd, target);
  if (context.empty) {
    return { nothingToDo: `✔ No hay nada que revisar (${context.label}).` };
  }
  const prompt = kind === 'review' ? buildReviewPrompt(context, text) : buildAdversarialPrompt(context, text);
  return {
    title: `${KIND_LABELS[kind]}: ${context.label}`,
    mode: 'read',
    prompt,
    structured: true,
    detail: context.summary,
  };
}

function prepareChallenge(text) {
  if (!text) {
    throw new UsageError(
      'Proporciona el planteamiento técnico a contrastar.\n' +
        'Ejemplo: /antigravity:challenge ¿Es viable usar SQLite WAL mode con 50 workers concurrentes?'
    );
  }
  return {
    title: KIND_LABELS.challenge,
    mode: 'read',
    prompt: [
      'Actúa como un arquitecto de software escéptico y riguroso. Puedes leer el repositorio para obtener contexto, pero NO modifiques nada.',
      'Evalúa críticamente el siguiente planteamiento o solución propuesta:',
      '<<<PLANTEAMIENTO',
      text,
      'PLANTEAMIENTO>>>',
      'Identifica:',
      '1. Casos límite (edge cases) y condiciones imprevistas de fallo.',
      '2. Cuellos de botella potenciales en hardware, I/O, red o concurrencia.',
      '3. Alternativas arquitectónicas superiores con sus pros y contras.',
      '4. Recomendación final pragmática.',
    ].join('\n'),
  };
}

function prepareExplore(text) {
  if (!text) {
    throw new UsageError(
      'Indica qué hay que investigar.\nEjemplo: /antigravity:explore ¿Dónde se calcula el total del carrito y quién lo usa?'
    );
  }
  return {
    title: KIND_LABELS.explore,
    mode: 'read',
    // The answer lands in Claude's context: keep it short and pointed so Claude never has to
    // re-read the files Antigravity already went through.
    prompt: [
      'Investiga el repositorio para responder la pregunta de Claude Code. Solo lectura: NO modifiques nada.',
      '<<<PREGUNTA',
      text,
      'PREGUNTA>>>',
      '',
      'Lee todo lo que necesites, pero tu respuesta debe ser un resumen breve (máximo ~350 palabras) con:',
      '1. **Respuesta directa** a la pregunta, en 2-4 frases.',
      '2. **Dónde está:** lista de `ruta/relativa:línea` con una frase de qué hay en cada punto (solo lo relevante).',
      '3. **Cómo fluye** (si aplica): la cadena de llamadas o datos en pasos cortos, con `archivo:línea`.',
      '4. **Ojo con:** riesgos, casos raros o dudas que encontraste (omite la sección si no hay).',
      'No pegues bloques de código largos: como máximo 3 líneas por fragmento y solo si son imprescindibles.',
      'Si algo no lo pudiste confirmar leyendo el código, dilo en vez de suponerlo.',
    ].join('\n'),
  };
}

function prepareDelegate(text) {
  if (!text) {
    throw new UsageError(
      'Especifica la tarea a delegar.\nEjemplo: /antigravity:delegate Escribir tests unitarios con Vitest para src/auth.ts'
    );
  }
  return {
    title: KIND_LABELS.delegate,
    mode: 'write',
    prompt: [
      'Tarea técnica delegada desde Claude Code:',
      '<<<TAREA',
      text,
      'TAREA>>>',
      '',
      'Instrucciones de ejecución:',
      '1. Realiza las modificaciones o creaciones necesarias directamente en los archivos del repositorio local.',
      '2. Cuando termines los cambios de archivos, corre las pruebas asociadas si hace falta (ejecutar comandos puede requerir permiso del usuario).',
      '3. Devuelve únicamente un resumen con:',
      '   - Archivos afectados / creados',
      '   - Cambios implementados',
      '   - Pruebas ejecutadas y resultados (o "no ejecutadas")',
      '   - Advertencias o pasos pendientes',
    ].join('\n'),
    footer: 'Verifica con `git status` / `git diff` los cambios reales en disco.',
  };
}

function prepareTask(text) {
  if (!text) {
    throw new UsageError(
      'Especifica la descripción de la tarea a ejecutar.\n' +
        'Ejemplo: /antigravity:task "Crear módulo de multi-envío de correos con validación de Excel..."'
    );
  }
  return {
    title: KIND_LABELS.task,
    mode: 'write',
    prompt: [
      'Eres el sub-agente ejecutor de desarrollo (Antigravity) trabajando en equipo con Claude Code.',
      'ESPECIFICACIÓN A IMPLEMENTAR:',
      '<<<ESPECIFICACION',
      text,
      'ESPECIFICACION>>>',
      '',
      'INSTRUCCIONES DE EJECUCIÓN DIRECTA EN EL PROYECTO:',
      '1. Analiza la arquitectura del repositorio actual y los estándares del proyecto.',
      '2. Crea y modifica directamente en el sistema de archivos todos los módulos, componentes, tipos, servicios y pruebas necesarias.',
      '3. Incluye manejo de errores, validaciones de seguridad y tipado riguroso.',
      '4. Escribe pruebas automatizadas y, al final, ejecútalas (ejecutar comandos puede requerir permiso del usuario).',
      '5. DEVUELVE ÚNICAMENTE un informe estructurado con:',
      '   - Lista detallada de archivos creados y modificados.',
      '   - Resumen técnico de la implementación realizada.',
      '   - Pruebas añadidas y estado de ejecución.',
      '   - Puntos de atención, decisiones técnicas o posibles edge cases para auditoría.',
    ].join('\n'),
    footer: [
      '## Señal para Claude Code · Fase 3: auditoría',
      '1. Ejecuta `git status` y `git diff` para ver los cambios REALES en disco (no confíes solo en el resumen).',
      '2. Ejecuta la suite de pruebas del proyecto (ej: npm test, pytest, etc.).',
      '3. Si detectas inconsistencias, bugs, edge cases o advertencias del linter, corrígelos directamente.',
      '4. Entrega al usuario el reporte final consolidado de la tarea terminada.',
    ].join('\n'),
  };
}

function resolveSelection(flags) {
  try {
    return resolveRunModel(flags, resolveBackend());
  } catch (error) {
    throw new UsageError(error.message);
  }
}

/** The receipt names the model so the user can tell Flash from Pro at a glance. */
function withModel(receipt, label) {
  const model = label ? `modelo ${label}` : 'modelo predeterminado de agy';
  return receipt.includes(' · carpeta: ') ? receipt.replace(' · carpeta: ', ` · ${model} · carpeta: `) : `${receipt} · ${model}`;
}

function resolveConversation(kind, flags, cwd) {
  if (flags.conversation) return flags.conversation;
  if (!flags.resume || flags.fresh) return undefined;
  const kinds = RESUME_KINDS[kind];
  if (!kinds) throw new UsageError(`--resume no aplica a ${kind}.`);
  const id = lastConversationId(cwd, kinds);
  if (!id) throw new UsageError('No hay una conversación anterior de Antigravity para continuar en este repositorio.');
  return id;
}

/**
 * Turn an action + user input into a self-contained payload a worker can run later.
 */
export function prepareAction(kind, text, flags, cwd = process.cwd()) {
  let prepared;
  if (REVIEW_KINDS.has(kind)) prepared = prepareReview(kind, text, flags, cwd);
  else if (kind === 'challenge') prepared = prepareChallenge(text);
  else if (kind === 'explore') prepared = prepareExplore(text);
  else if (kind === 'delegate') prepared = prepareDelegate(text);
  else if (kind === 'task') prepared = prepareTask(text);
  else throw new UsageError(`Acción desconocida: ${kind}`);
  if (prepared.nothingToDo) return prepared;

  const subfolder = flags.launchSubfolder || '';
  if (subfolder) {
    prepared.prompt =
      `Nota: Claude Code estaba en la subcarpeta "${subfolder}" del proyecto; ` +
      `las rutas relativas del texto pueden referirse a ella. Tu espacio de trabajo es el repositorio completo.\n\n${prepared.prompt}`;
  }
  const selection = resolveSelection(flags);
  const { model, effort, conversationId } = validateRunOptions({
    model: selection.model,
    effort: selection.effort,
    conversationId: resolveConversation(kind, flags, cwd),
  });
  const writeApproval = prepared.mode === 'write' ? resolveApproval(flags).mode : undefined;
  return {
    ...prepared,
    kind,
    engine: flags.engine || null,
    model,
    effort,
    modelLabel: selection.label,
    conversationId,
    writeApproval,
  };
}

function firstLine(text, limit = 100) {
  const line = (text || '').split('\n').map((l) => l.replace(/^[#>*\-\s]+/, '').trim()).find(Boolean) || '';
  return line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
}

/**
 * Run a prepared payload against the backend and render the final Markdown.
 * @returns {Promise<{ output: string, conversationId: string|null, summary: string }>}
 */
export async function runPrepared(payload, { timeoutMs, onSpawn } = {}) {
  if (payload.engine) setEngineOverride(payload.engine);
  const backend = resolveBackend();
  if (payload.conversationId && backend && backend.type !== 'antigravity') {
    throw new UsageError('--resume/--conversation solo están disponibles con Antigravity CLI (agy).');
  }

  const result = await runBackend(payload.prompt, {
    mode: payload.mode,
    timeoutMs,
    model: payload.model,
    effort: payload.effort,
    conversationId: payload.conversationId,
    schemaPath: payload.structured ? REVIEW_SCHEMA_PATH : undefined,
    writeApproval: payload.writeApproval,
    onSpawn,
  });

  let body;
  let summary;
  if (payload.structured) {
    const data = parseReviewResult(result.structured, result.text);
    if (data) {
      body = renderReview(data, { title: payload.title });
      summary = `${data.verdict === 'approve' ? 'Aprobado' : 'Requiere atención'} · ${data.findings.length} hallazgo(s)`;
    } else {
      body = `# ${payload.title}\n\n_(La respuesta no llegó en formato estructurado; se muestra tal cual.)_\n\n${compactFileLinks(result.text)}`;
      summary = firstLine(result.text);
    }
    if (result.deniedNote && data) body += `\n\n⚠️ Acciones denegadas (esperado en solo lectura): ${result.deniedNote}.`;
  } else {
    body = `# ${payload.title}\n\n${compactFileLinks(result.text)}`;
    summary = firstLine(result.text);
  }
  if (payload.footer) body += `\n\n${payload.footer}`;
  return { output: `${body}\n\n---\n${withModel(result.receipt, payload.modelLabel)}`, conversationId: result.conversationId, summary };
}

// ---------------------------------------------------------------------------
// Foreground, background and worker execution
// ---------------------------------------------------------------------------

function jobHint(job) {
  return `Trabajo ${job.id} · /antigravity:result ${job.id}`;
}

async function runForeground(payload, cwd) {
  const job = createJob(cwd, { kind: payload.kind, title: payload.title });
  updateJob(cwd, job.id, { status: 'running', pid: process.pid, startedAt: new Date().toISOString() });
  console.error(`🛰️ [Antigravity] ${payload.title}${payload.detail ? ` (${payload.detail})` : ''}...`);
  try {
    const { output, conversationId, summary } = await runPrepared(payload, { timeoutMs: DEFAULT_TIMEOUT_MS });
    writeJobOutput(cwd, job.id, output);
    updateJob(cwd, job.id, { status: 'completed', finishedAt: new Date().toISOString(), conversationId, summary });
    console.log(output);
    console.log(`\n${jobHint(job)}`);
  } catch (error) {
    updateJob(cwd, job.id, { status: 'failed', finishedAt: new Date().toISOString(), error: error.message });
    throw error;
  }
}

function startBackground(payload, cwd) {
  const job = createJob(cwd, { kind: payload.kind, title: payload.title, background: true, request: payload });
  const child = spawn(process.execPath, [WRAPPER_PATH, '__worker', job.id], {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env,
  });
  child.unref();
  updateJob(cwd, job.id, { pid: child.pid });
  console.log(`🛰️ ${payload.title} iniciada en segundo plano como ${job.id}.`);
  console.log(`Consulta el avance con /antigravity:status ${job.id} y el resultado con /antigravity:result ${job.id}.`);
  console.log(`Para detenerla: /antigravity:cancel ${job.id}`);
}

/** Internal: runs a background job created by startBackground. */
async function runWorker(jobId) {
  const cwd = process.cwd();
  const payload = readJobInput(cwd, jobId);
  updateJob(cwd, jobId, { status: 'running', pid: process.pid, startedAt: new Date().toISOString() });
  const timeoutMs = Number(process.env.AGY_BACKGROUND_TIMEOUT_MS) || DEFAULT_BACKGROUND_TIMEOUT_MS;
  try {
    const { output, conversationId, summary } = await runPrepared(payload, { timeoutMs });
    writeJobOutput(cwd, jobId, output);
    updateJob(cwd, jobId, { status: 'completed', finishedAt: new Date().toISOString(), conversationId, summary });
  } catch (error) {
    const hints = diagnoseError(error.message);
    writeJobOutput(cwd, jobId, [`# Error`, '', error.message, '', ...hints].join('\n'));
    updateJob(cwd, jobId, { status: 'failed', finishedAt: new Date().toISOString(), error: error.message });
  }
}

// ---------------------------------------------------------------------------
// Job commands: status, result, cancel
// ---------------------------------------------------------------------------

const STATUS_LABELS = {
  queued: '⏳ en cola',
  running: '🔄 en curso',
  completed: '✅ terminado',
  failed: '❌ falló',
  cancelled: '⛔ cancelado',
};

function formatDuration(job) {
  const start = Date.parse(job.startedAt || job.createdAt);
  const end = job.finishedAt ? Date.parse(job.finishedAt) : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function cell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function backendLine() {
  const backend = resolveBackend();
  if (!backend) return '❌ Sin backend: Antigravity CLI no está instalado. Ejecuta /antigravity:setup.';
  const warn = backend.fallback ? ' · ⚠️ respaldo legado (Gemini CLI ya no atiende cuentas personales)' : '';
  return `Motor: ${ENGINE_LABELS[backend.type]} v${backendVersion(backend)}${warn}`;
}

function handleStatus(reference, flags, cwd) {
  if (reference) {
    const job = findJob(cwd, reference);
    if (!job) throw new UsageError(`No encontré el trabajo "${reference}" en este repositorio.`);
    const out = [
      `# ${job.id} · ${KIND_LABELS[job.kind] || job.kind}`,
      '',
      `- **Estado:** ${STATUS_LABELS[job.status] || job.status}`,
      `- **Título:** ${job.title}`,
      `- **Modo:** ${job.background ? 'segundo plano' : 'primer plano'}`,
      `- **Creado:** ${job.createdAt}`,
      `- **Duración:** ${formatDuration(job)}`,
    ];
    if (job.conversationId) out.push(`- **Conversación agy:** ${job.conversationId}`);
    if (job.summary) out.push(`- **Resumen:** ${job.summary}`);
    if (job.error) out.push(`- **Error:** ${job.error}`);
    out.push('', isActive(job) ? `Cancelar: /antigravity:cancel ${job.id}` : `Resultado: /antigravity:result ${job.id}`);
    console.log(out.join('\n'));
    return;
  }

  const jobs = listJobs(cwd);
  const shown = flags.all ? jobs : jobs.slice(0, 10);
  const out = [`# Antigravity · estado (v${VERSION})`, '', backendLine(), ''];
  if (shown.length === 0) {
    out.push('No hay trabajos registrados en este repositorio todavía.');
  } else {
    out.push('| ID | Tipo | Estado | Duración | Resumen |', '| --- | --- | --- | --- | --- |');
    for (const job of shown) {
      out.push(
        `| ${job.id} | ${cell(KIND_LABELS[job.kind] || job.kind)}${job.background ? ' (bg)' : ''} | ${STATUS_LABELS[job.status] || job.status} | ${formatDuration(job)} | ${cell(job.summary || job.error || job.title)} |`
      );
    }
    if (!flags.all && jobs.length > shown.length) out.push('', `(${jobs.length - shown.length} más; usa --all)`);
    out.push('', 'Detalle: /antigravity:status <id> · Resultado: /antigravity:result <id> · Cancelar: /antigravity:cancel <id>');
  }
  out.push('', `Plataforma: ${process.platform} (${process.arch}) · Node.js ${process.version}`);
  console.log(out.join('\n'));
}

function handleResult(reference, cwd) {
  const job = findJob(cwd, reference, reference ? () => true : (j) => !isActive(j));
  if (!job) {
    throw new UsageError(reference ? `No encontré el trabajo "${reference}".` : 'No hay trabajos terminados en este repositorio.');
  }
  if (isActive(job)) {
    console.log(`${job.id} sigue ${STATUS_LABELS[job.status]} (${formatDuration(job)}). Vuelve a consultar con /antigravity:result ${job.id}.`);
    return;
  }
  const output = readJobOutput(cwd, job.id);
  console.log(`<!-- ${job.id} · ${STATUS_LABELS[job.status]} · ${job.title} -->`);
  console.log(output || `(Sin salida guardada.${job.error ? ` Error: ${job.error}` : ''})`);
}

function handleCancel(reference, cwd) {
  const job = findJob(cwd, reference, reference ? () => true : isActive);
  if (!job) throw new UsageError(reference ? `No encontré el trabajo "${reference}".` : 'No hay trabajos en curso para cancelar.');
  if (!isActive(job)) {
    console.log(`${job.id} ya está ${STATUS_LABELS[job.status]}; no hay nada que cancelar.`);
    return;
  }
  killTree(job.pid);
  updateJob(cwd, job.id, { status: 'cancelled', finishedAt: new Date().toISOString(), error: 'Cancelado por el usuario.' });
  console.log(`⛔ ${job.id} cancelado (${job.title}).`);
}

// ---------------------------------------------------------------------------
// Setup, test and login
// ---------------------------------------------------------------------------

function commandExists(cmd) {
  const res = spawnSync(IS_WINDOWS ? 'where.exe' : 'which', [cmd], { stdio: 'ignore', windowsHide: true });
  return res.status === 0;
}

function installCommand() {
  if (IS_WINDOWS) {
    return commandExists('winget')
      ? 'winget install Google.AntigravityCLI'
      : 'powershell -NoProfile -Command "irm https://antigravity.google/cli/install.ps1 | iex"';
  }
  return 'curl -fsSL https://antigravity.google/cli/install.sh | bash';
}

async function collectSetupReport({ ping = true } = {}) {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const backend = resolveBackend();
  const report = {
    version: VERSION,
    node: { version: process.version, ok: nodeMajor >= 18 },
    git: { ok: commandExists('git') },
    backend: backend
      ? { type: backend.type, label: ENGINE_LABELS[backend.type], bin: backend.bin, version: backendVersion(backend), fallback: Boolean(backend.fallback) }
      : null,
    auth: { checked: false, ok: false, error: null },
    install: backend && backend.type === 'antigravity' ? null : { command: installCommand() },
    approvalMode: resolveApproval({}).mode,
    model: { label: null, error: null },
  };
  let selection = {};
  try {
    selection = resolveRunModel({}, backend);
    report.model.label = selection.label;
  } catch (error) {
    report.model.error = error.message;
  }
  if (backend && ping) {
    report.auth.checked = true;
    try {
      // The ping uses the chosen default model, so setup also proves that model works.
      await runBackend('Responde exactamente y únicamente: OK', { mode: 'read', timeoutMs: 120000, model: selection.model, effort: selection.effort });
      report.auth.ok = true;
    } catch (error) {
      report.auth.error = error.message;
    }
  }
  report.ready = Boolean(report.node.ok && report.git.ok && backend && backend.type === 'antigravity' && report.auth.ok);
  return report;
}

function renderSetupReport(report) {
  const ok = (v) => (v ? '✅' : '❌');
  const out = [`# Antigravity · setup (v${report.version})`, ''];
  out.push(`${ok(report.node.ok)} Node.js ${report.node.version}${report.node.ok ? '' : ' (se necesita 18 o superior)'}`);
  out.push(`${ok(report.git.ok)} git${report.git.ok ? '' : ' no encontrado'}`);
  if (!report.backend) {
    out.push('❌ Antigravity CLI (agy) no encontrado');
  } else {
    out.push(`${report.backend.type === 'antigravity' ? '✅' : '⚠️'} ${report.backend.label} v${report.backend.version} · ${report.backend.bin}`);
    if (report.backend.fallback) {
      out.push('   ⚠️ Gemini CLI ya no atiende cuentas personales (Google AI Pro) desde el 18-jun-2026; instala agy.');
    }
    if (report.backend.type === 'gemini') out.push(`   Autenticación: ${getGeminiAuthInfo()}`);
  }
  if (report.auth.checked) {
    out.push(`${ok(report.auth.ok)} Sesión: ${report.auth.ok ? 'activa (respondió a una prueba)' : 'falló la prueba'}`);
    if (report.auth.error) out.push(`   ${report.auth.error.split('\n')[0]}`);
  }
  if (report.model.error) out.push(`❌ Modelo: ${report.model.error} Cámbialo con /antigravity:model.`);
  else out.push(`ℹ️ Modelo: ${report.model.label || 'predeterminado de agy (Flash)'} · cámbialo con /antigravity:model`);
  out.push(
    `ℹ️ Permisos: review/adversarial-review/challenge/explore solo lectura · delegate/task ${report.approvalMode === 'yolo' ? '⚠️ ACCESO TOTAL (ejecutan comandos sin preguntar)' : 'editan archivos y preguntan antes de ejecutar comandos'} · cámbialo con /antigravity:permissions`
  );
  out.push('');
  if (report.ready) {
    out.push('**Listo.** Prueba: `/antigravity:review --background` y luego `/antigravity:status`.');
  } else if (report.install) {
    out.push('**Falta instalar Antigravity CLI.** Comando:', '', `    ${report.install.command}`, '', 'Después ejecuta /antigravity:setup otra vez.');
  } else if (report.auth.checked && !report.auth.ok) {
    out.push('**Falta iniciar sesión o la sesión no es válida.** Ejecuta /antigravity:login y luego /antigravity:setup.');
    for (const hint of diagnoseError(report.auth.error || '')) out.push(hint);
  }
  return out.join('\n');
}

async function handleSetup(flags) {
  const report = await collectSetupReport();
  if (flags.json) console.log(JSON.stringify(report, null, 2));
  else console.log(renderSetupReport(report));
}

async function handleTest(flags) {
  const backend = resolveBackend();
  console.log(`Probando conectividad con ${backend ? ENGINE_LABELS[backend.type] : 'el sub-agente'}...`);
  if (backend?.type === 'gemini') console.log(`ℹ️ Método de autenticación activo: ${getGeminiAuthInfo()}`);
  const selection = resolveSelection(flags);
  const { text, receipt } = await runBackend('Responde exactamente y únicamente: "Antigravity CLI conectado correctamente"', {
    mode: 'read',
    model: selection.model,
    effort: selection.effort,
  });
  console.log(`✔ Resultado: ${text}\n\n${withModel(receipt, selection.label)}`);
}

/**
 * /antigravity:permissions — what delegate/task may do on this machine.
 *   permissions            → current mode
 *   permissions total      → run commands without asking (agy --dangerously-skip-permissions)
 *   permissions preguntar  → default: edit files, ask before any command
 */
function handlePermissions(text) {
  const word = (text || '').trim().split(/\s+/)[0]?.toLowerCase() || '';
  const FULL = ['total', 'full', 'todo', 'yolo'];
  const ASK = ['preguntar', 'ask', 'normal', 'reset', 'default'];
  if (word && !FULL.includes(word) && !ASK.includes(word)) {
    throw new UsageError(`Opción no válida: "${word}". Usa /antigravity:permissions total o /antigravity:permissions preguntar.`);
  }
  if (FULL.includes(word)) {
    writeConfig({ approval: 'full' });
    console.log(
      [
        '⚠️ **Acceso total activado.** En delegate y task, Antigravity ejecutará comandos en tu PC sin preguntar',
        '(tests, instalaciones, git, borrar archivos...). review, adversarial-review, challenge y explore siguen siendo de solo lectura.',
        '',
        'Para volver a que pregunte antes de ejecutar: `/antigravity:permissions preguntar`',
      ].join('\n')
    );
  } else if (ASK.includes(word)) {
    writeConfig({ approval: undefined });
    console.log(
      '✔ **Modo preguntar** (predeterminado): Antigravity edita archivos del proyecto y, si quiere ejecutar un comando, se detiene y Claude te pregunta.'
    );
  } else {
    const { mode, source } = resolveApproval({});
    const where = { env: 'definido por AGY_APPROVAL_MODE', config: 'guardado con /antigravity:permissions', default: 'predeterminado' }[source];
    console.log(
      [
        '# Antigravity · permisos',
        '',
        mode === 'yolo'
          ? `**Ahora:** ⚠️ acceso total: ejecuta comandos sin preguntar (${where}).`
          : `**Ahora:** preguntar: edita archivos y pide permiso antes de ejecutar comandos (${where}).`,
        '',
        '| Modo | delegate / task | Cómo activarlo |',
        '| --- | --- | --- |',
        '| preguntar (predeterminado) | Lee y edita archivos del proyecto. Si quiere ejecutar un comando, se detiene y Claude te pregunta. | `/antigravity:permissions preguntar` |',
        '| total | Además ejecuta cualquier comando sin preguntar (tests, instalaciones, git...). | `/antigravity:permissions total` |',
        '',
        'review, adversarial-review, challenge y explore son siempre de solo lectura.',
      ].join('\n')
    );
  }
  if (word && process.env.AGY_APPROVAL_MODE) {
    console.log(`⚠️ AGY_APPROVAL_MODE=${process.env.AGY_APPROVAL_MODE} está definida en el entorno y tiene prioridad sobre esta preferencia.`);
  }
}

/**
 * /antigravity:model — show or change the default model and effort.
 *   model                → current default + available models
 *   model pro alto       → save a default ("pro", "flash alto", "bajo", an agy ID...)
 *   model --reset        → back to agy's own default
 */
function handleModel(text, flags) {
  const backend = resolveBackend();
  const words = (text || '').split(/\s+/).filter(Boolean);
  const current = readConfig();

  if (flags.reset || ['reset', 'default', 'predeterminado'].includes(words[0]?.toLowerCase())) {
    writeConfig({ model: undefined, effort: undefined });
    console.log('✔ Volviste al modelo predeterminado de agy (Flash). Cada comando puede usar otro con --model.');
    return;
  }

  if (words.length > 0) {
    // "alto" alone changes only the effort; otherwise the first word is the model.
    const [first, second] = words;
    const model = isEffortWord(first) && words.length === 1 ? current.model : first;
    const effort = isEffortWord(first) && words.length === 1 ? first : second;
    let resolved;
    try {
      resolved = resolveModelSelection({ model, effort, explicitEffort: Boolean(effort) }, loadCatalog(backend, { refresh: true }));
    } catch (error) {
      throw new UsageError(error.message);
    }
    writeConfig({ model: model?.toLowerCase(), effort: normalizeEffort(effort) });
    console.log(`✔ Modelo predeterminado: **${resolved.label || 'predeterminado de agy'}**`);
    console.log('Se usará en review, adversarial-review, challenge, explore, delegate y task. Un --model en el comando tiene prioridad.');
    if (process.env.AGY_MODEL || process.env.AGY_EFFORT) {
      console.log('⚠️ AGY_MODEL/AGY_EFFORT están definidas en el entorno y tienen prioridad sobre esta preferencia.');
    }
    return;
  }

  const catalog = loadCatalog(backend);
  const aliases = describeAliases(catalog);
  let active = null;
  try {
    active = resolveRunModel({}, backend).label;
  } catch (error) {
    active = `⚠️ ${error.message}`;
  }
  if (flags.json) {
    console.log(JSON.stringify({ current: { ...current, label: active }, aliases, models: catalog || [] }, null, 2));
    return;
  }
  const out = ['# Antigravity · modelo', '', `**Ahora:** ${active || 'predeterminado de agy (Flash)'}`, ''];
  if (!catalog) {
    out.push('No se pudo leer la lista de modelos (`agy models`). Revisa /antigravity:setup.');
  } else {
    out.push('| Nombre | Modelo | Esfuerzo | Para qué |', '| --- | --- | --- | --- |');
    for (const row of aliases.filter((r) => r.available)) {
      const efforts = row.efforts.length ? row.efforts.map((e) => EFFORT_LABELS[e]).join(', ') : '—';
      out.push(`| \`${row.alias}\` | ${row.label} | ${efforts} | ${row.hint} |`);
    }
  }
  out.push(
    '',
    'Cambiar el predeterminado: `/antigravity:model pro alto` · solo el esfuerzo: `/antigravity:model bajo` · volver al de agy: `/antigravity:model reset`',
    'Solo para un comando: `/antigravity:review --model pro` o `--model flash --effort bajo`'
  );
  console.log(out.join('\n'));
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
 * Antigravity CLI: opens an interactive `agy` session, which signs in with the Google account
 * (the same account as the Antigravity app) when there is no session yet.
 * Legacy Gemini CLI: runs a one-shot headless prompt, because in Gemini CLI 0.63 the interactive
 * "Sign in with Google" dialog fails with "Authentication consent could not be obtained" while
 * the headless path asks for consent with a plain [Y/n] prompt.
 */
function handleLogin(flags) {
  const backend = resolveBackend();
  const env = buildChildEnv();
  const out = ['# Inicio de sesión con Google (Google AI Pro)', ''];

  if (!backend || backend.type === 'codex') {
    out.push('No se encontró Antigravity CLI.', ...INSTALL_AGY_STEPS);
    console.log(out.join('\n'));
    return;
  }

  if (backend.type === 'antigravity') {
    if (flags.reset) {
      out.push('ℹ️ --reset no aplica a Antigravity CLI: para cambiar de cuenta usa el comando de cuenta/logout dentro de agy.', '');
    }
    const opened = openConsole('Antigravity Login', /\s/.test(backend.bin) ? `"${backend.bin}"` : backend.bin, env);
    out.push(opened ? 'Se abrió una nueva ventana de consola ("Antigravity Login") con agy.' : `Abre una terminal normal y ejecuta: ${backend.bin}`);
    out.push(
      '',
      '1. Si pide iniciar sesión, sigue el enlace y entra con la cuenta que TIENE Google AI Pro.',
      '2. Si ya muestra el prompt de agy, la sesión está activa: puedes cerrarla.',
      '3. Vuelve a Claude Code y ejecuta /antigravity:setup para verificar.'
    );
    console.log(out.join('\n'));
    return;
  }

  if (flags.reset) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (const file of ['oauth_creds.json', 'google_accounts.json']) {
      const p = path.join(geminiHome(), file);
      if (existsSync(p)) {
        renameSync(p, `${p}.bak-${stamp}`);
        out.push(`✔ Sesión anterior respaldada: ${file} -> ${file}.bak-${stamp}`);
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
  out.push(
    '⚠️ Usas Gemini CLI (legado): solo funciona con cuentas empresariales (Standard/Enterprise).',
    '   Para Google AI Pro instala Antigravity CLI: winget install Google.AntigravityCLI',
    '',
    opened ? 'Se abrió una nueva ventana de consola ("Gemini Login").' : `Abre una terminal normal y ejecuta: ${command}`,
    '1. Cuando pregunte "Do you want to continue? [Y/n]", pulsa Enter.',
    '2. Inicia sesión en el navegador y acepta.',
    '3. Si la consola responde, el login funcionó. Vuelve y ejecuta /antigravity:setup.',
    'Si el navegador no se abre: set NO_BROWSER=true en esa consola y repite el comando.'
  );
  console.log(out.join('\n'));
}

function showHelp() {
  console.log(`
Antigravity Plugin for Claude Code (agy-cc) v${VERSION}
Orquestación multi-agente entre Claude Code y Antigravity CLI (agy) / Codex.

USO:
  node bin/agy-wrapper.mjs <comando> [opciones] [texto]
  (el texto, y las opciones al inicio del texto, también pueden llegar por stdin)

COMANDOS:
  review [foco]              Revisión estructurada (solo lectura) de los cambios locales o de la rama.
  adversarial-review [foco]  Revisión que intenta romper el cambio y cuestiona el diseño (solo lectura).
  challenge <idea>           Crítica de arquitectura de un planteamiento (solo lectura).
  explore <pregunta>         Investiga el código y devuelve un resumen corto con archivo:línea (solo lectura).
  delegate <tarea>           Delega trabajo pesado al sub-agente (lee y edita archivos).
  task <especificación>      Pipeline: el sub-agente codifica en disco + señal de auditoría para Claude.
  status [id] [--all]        Trabajos de este repositorio (o el detalle de uno).
  result [id]                Salida guardada de un trabajo terminado (el último si no hay id).
  cancel [id]                Cancela un trabajo en curso.
  setup [--json]             Verifica Node, git, Antigravity CLI y la sesión.
  model [nombre] [esfuerzo]  Muestra o cambia el modelo predeterminado (p. ej. "model pro alto", "model reset").
  permissions [total|preguntar]  Acceso total (comandos sin preguntar) o preguntar antes de ejecutar (predeterminado).
  login [--reset]            Abre una consola para iniciar sesión con tu cuenta Google AI Pro.
  test                       Prueba de humo de la conexión.

OPCIONES:
  --background               Ejecuta en segundo plano (sin el límite de 10 min de Claude Code).
  --base <ref>               review/adversarial-review: revisa la rama actual contra <ref>.
  --scope <auto|working-tree|branch>  Qué revisar (auto: cambios locales si hay, si no la rama).
  --resume                   delegate/task/challenge/explore: continúa la última conversación de agy.
  --conversation <id>        Continúa una conversación concreta de agy.
  --model <modelo>           flash, pro, opus, sonnet, gpt o un ID de "agy models".
  --effort <bajo|medio|alto> Esfuerzo de razonamiento (también low|medium|high|xhigh|max).
  --file <ruta>              Lee el texto (p. ej. una especificación larga) desde un archivo.
  --full-access              delegate/task: solo esta vez, ejecuta comandos sin preguntar.
  --engine <antigravity|gemini|codex>   Fuerza el motor.
  -h, --help / -v, --version

VARIABLES DE ENTORNO:
  AGY_BIN, AGY_ENGINE, AGY_MODEL, AGY_EFFORT, AGY_CONFIG_DIR, AGY_APPROVAL_MODE (auto_edit|yolo), AGY_TIMEOUT_MS (defecto ${DEFAULT_TIMEOUT_MS}),
  AGY_BACKGROUND_TIMEOUT_MS (defecto ${DEFAULT_BACKGROUND_TIMEOUT_MS}), AGY_STATE_DIR, AGY_DEBUG=1, AGY_AUTH_MODE.
`);
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

function readTextFile(file) {
  const resolved = path.resolve(file);
  if (!existsSync(resolved)) throw new UsageError(`No existe el archivo indicado en --file: ${resolved}`);
  return readFileSync(resolved, 'utf-8').replace(/^﻿/, '').trim();
}

function reportFailure(action, error) {
  const label = action.startsWith('/') ? action : `/antigravity:${action}`;
  console.error(`\n❌ Error en ${label}: ${error.message}\n`);
  const hints = error instanceof UsageError ? [] : diagnoseError(error.message);
  if (hints.length > 0) {
    console.error('──────────────────────────────────────────────────────');
    for (const line of hints) console.error(line);
    console.error('──────────────────────────────────────────────────────\n');
  }
  process.exitCode = 1;
}

async function main(argv) {
  let parsed;
  try {
    parsed = parseArgv(argv);
  } catch (error) {
    reportFailure('wrapper', error);
    return;
  }
  const { action } = parsed;
  let { flags, text } = parsed;
  // agy only reads and writes inside its workspace folder. Started from a subfolder (e.g. after
  // `cd backend`), it would treat the rest of the repository as outside the project and deny it.
  const launchDir = process.cwd();
  const launchSubfolder = repoSubfolder(launchDir);
  const cwd = workspaceRoot(launchDir);
  if (cwd !== path.resolve(launchDir)) process.chdir(cwd);
  flags = { ...flags, launchDir, launchSubfolder };

  try {
    if ((TEXT_ACTIONS.has(action) || action === 'model' || action === 'permissions') && !text) {
      const piped = splitLeadingFlags(await readPipedStdin());
      flags = { ...flags, ...piped.flags };
      text = piped.text;
    }
    if (flags.file && TEXT_ACTIONS.has(action)) {
      // Long specs travel in a file: big heredocs are fragile in Claude Code's Bash tool.
      const fromFile = splitLeadingFlags(readTextFile(path.resolve(launchDir, flags.file)));
      flags = { ...fromFile.flags, ...flags };
      text = [text, fromFile.text].filter(Boolean).join('\n\n');
    }
    if (flags.engine) setEngineOverride(flags.engine);

    switch (action) {
      case 'review':
      case 'adversarial-review':
      case 'challenge':
      case 'explore':
      case 'delegate':
      case 'task': {
        const payload = prepareAction(action, text, flags, cwd);
        if (payload.nothingToDo) {
          console.log(payload.nothingToDo);
          return;
        }
        if (flags.background && !flags.wait) startBackground(payload, cwd);
        else await runForeground(payload, cwd);
        return;
      }
      case '__worker':
        await runWorker(text);
        return;
      case 'status':
        handleStatus(text, flags, cwd);
        return;
      case 'result':
        handleResult(text, cwd);
        return;
      case 'cancel':
        handleCancel(text, cwd);
        return;
      case 'setup':
        await handleSetup(flags);
        return;
      case 'test':
        await handleTest(flags);
        return;
      case 'model':
        handleModel(text, flags);
        return;
      case 'permissions':
        handlePermissions(text);
        return;
      case 'login':
        handleLogin(flags);
        return;
      case 'version':
        console.log(`antigravity-cc v${VERSION}`);
        return;
      case 'help':
        showHelp();
        return;
      default:
        console.log(`Comando desconocido "${action}".\n`);
        showHelp();
    }
  } catch (error) {
    reportFailure(action, error);
  }
}

// Only auto-run if directly executed via CLI
const isDirectRun = process.argv[1] && /agy-wrapper(\.mjs)?$/.test(process.argv[1]);

if (isDirectRun) {
  main(process.argv.slice(2));
}

export { main };
