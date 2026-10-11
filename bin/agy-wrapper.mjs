#!/usr/bin/env node
/**
 * Antigravity Plugin for Claude Code (agy-cc)
 * Dual-agent orchestrator connecting Claude Code with Google Antigravity / Gemini CLI or Codex.
 */

import { spawn, execSync } from 'node:child_process';
import process from 'node:process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const VERSION = '1.0.0';

// Parse arguments
const args = process.argv.slice(2);
let action = args[0] || 'help';
let rawUserPrompt = '';
let engineOverride = null;

// Handle options and flags
const positional = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--engine' && i + 1 < args.length) {
    engineOverride = args[++i];
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
 * Detect available CLI binary in system PATH or environment.
 */
function resolveBackend() {
  const customBin = process.env.AGY_BIN || process.env.ANTIGRAVITY_BIN;
  if (customBin) {
    return { bin: customBin, type: 'custom' };
  }

  const requestedEngine = engineOverride || process.env.AGY_ENGINE || 'antigravity';

  if (requestedEngine.toLowerCase() === 'codex') {
    const codexBin = process.env.CODEX_BIN || (isCommandAvailable('codex') ? 'codex' : null);
    if (codexBin) {
      return { bin: codexBin, type: 'codex' };
    }
  }

  // Check for agy first
  if (isCommandAvailable('agy')) {
    return { bin: 'agy', type: 'antigravity' };
  }

  // Fallback to gemini CLI
  if (isCommandAvailable('gemini')) {
    return { bin: 'gemini', type: 'gemini' };
  }

  // Fallback to codex if present
  if (isCommandAvailable('codex')) {
    return { bin: 'codex', type: 'codex' };
  }

  return null;
}

/**
 * Check if a command is executable in PATH
 */
function isCommandAvailable(command) {
  try {
    const isWindows = process.platform === 'win32';
    const testCmd = isWindows ? `where.exe ${command}` : `which ${command}`;
    execSync(testCmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect current authentication mode without exposing secret values
 */
function getAuthMethodInfo() {
  const isExplicitApiKeyMode = process.env.AGY_AUTH_MODE === 'apikey';

  if (isExplicitApiKeyMode) {
    const hasKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    return {
      type: `API Key (${hasKey ? 'Configurada en entorno' : 'No detectada'} - AGY_AUTH_MODE=apikey)`,
      isApiKey: true,
    };
  }

  // Check Google login state in ~/.gemini
  try {
    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    const googleAccountsPath = path.join(homeDir, '.gemini', 'google_accounts.json');
    if (existsSync(googleAccountsPath)) {
      const data = JSON.parse(readFileSync(googleAccountsPath, 'utf-8'));
      if (data.active) {
        const [user, domain] = data.active.split('@');
        const masked = user.length > 2 ? `${user.slice(0, 2)}***@${domain}` : `***@${domain}`;
        return {
          type: `Login con Google (OAuth - Google AI Pro: ${masked})`,
          isApiKey: false,
          account: data.active,
        };
      }
    }
  } catch {
    // Ignore read errors
  }

  return {
    type: 'Login con Google (OAuth - Google AI Pro por defecto)',
    isApiKey: false,
  };
}

/**
 * Filter out noisy terminal banners or CLI initialization warnings
 */
function cleanOutput(raw) {
  if (!raw) return '';
  return raw
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('Warning: 256-color support not detected')) return false;
      if (trimmed.startsWith('Ripgrep is not available')) return false;
      if (trimmed.startsWith('Attempt ') && trimmed.includes('failed with status')) return false;
      return true;
    })
    .join('\n')
    .trim();
}

/**
 * Mask sensitive credentials if they appear in text (defense in depth)
 */
function sanitizeSensitiveData(text) {
  if (!text) return '';
  return text
    .replace(/(AIza[0-9A-Za-z-_]{35})/g, 'AIza[REDACTED_API_KEY]')
    .replace(/(sk-ant-[a-zA-Z0-9_\-]{20,})/g, 'sk-ant-[REDACTED_ANTHROPIC_KEY]')
    .replace(/(sk-[a-zA-Z0-9]{20,})/g, 'sk-[REDACTED_API_KEY]')
    .replace(/(ghp_[a-zA-Z0-9]{20,})/g, 'ghp_[REDACTED_GITHUB_TOKEN]')
    .replace(/(Bearer\s+[a-zA-Z0-9_\-\.]{25,})/gi, 'Bearer [REDACTED_TOKEN]');
}

/**
 * Executes the backend CLI in non-interactive/headless mode.
 */
export function runBackend(promptText, extraFlags = []) {
  return new Promise((resolve, reject) => {
    const backend = resolveBackend();
    if (!backend) {
      return reject(
        new Error(
          'No se encontró ningún binario compatible (agy, gemini, o codex) en tu PATH.\n' +
          'Instala Antigravity CLI o Gemini CLI (`npm install -g @google/gemini-cli`) o configura AGY_BIN=<ruta>.'
        )
      );
    }

    const env = {
      ...process.env,
      GEMINI_CLI_TRUST_WORKSPACE: 'true',
    };

    // By default, prioritize Google Account / OAuth (Google AI Pro) over API key
    if (process.env.AGY_AUTH_MODE !== 'apikey') {
      delete env.GEMINI_API_KEY;
      delete env.GOOGLE_API_KEY;
    }

    let cliArgs = [];
    let useStdin = false;

    if (backend.type === 'gemini' || backend.type === 'antigravity') {
      cliArgs.push('--skip-trust');
      const model = process.env.AGY_MODEL;
      if (model) {
        cliArgs.push('-m', model);
      }
      cliArgs.push('-p', 'subagent-task');
      useStdin = true;
    } else if (backend.type === 'codex') {
      cliArgs = ['exec', promptText];
    } else {
      cliArgs = ['-p', 'subagent-task'];
      useStdin = true;
    }

    if (extraFlags.length > 0) {
      cliArgs.push(...extraFlags);
    }

    const child = spawn(backend.bin, cliArgs, {
      stdio: [useStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env,
    });

    let stdout = '';
    let stderr = '';

    if (useStdin && child.stdin) {
      child.stdin.write(promptText);
      child.stdin.end();
    }

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Fallo al iniciar ${backend.bin}: ${err.message}`));
    });

    child.on('close', (code) => {
      const cleaned = cleanOutput(stdout);
      if (code !== 0) {
        const errDetails = cleanOutput(stderr) || cleaned;
        return reject(new Error(`${backend.bin} terminó con código ${code}: ${sanitizeSensitiveData(errDetails)}`));
      }
      resolve(sanitizeSensitiveData(cleaned));
    });
  });
}

/**
 * Retrieve local git changes (diff & status)
 */
export function getLocalGitDiff() {
  try {
    // Check if git is available and inside a git repo
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  } catch {
    return { isGit: false, diff: '' };
  }

  let diff = '';
  try {
    diff = execSync('git diff HEAD', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    // If no commits exist yet (empty repo), fall back to git diff against empty tree
    try {
      diff = execSync('git diff', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      diff = '';
    }
  }

  // Also capture staged changes if diff HEAD didn't capture or was empty
  if (!diff) {
    try {
      diff = execSync('git diff --cached', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      diff = '';
    }
  }

  // If still empty, check for untracked files
  if (!diff) {
    try {
      const status = execSync('git status --short', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (status) {
        diff = `Archivos modificados/sin rastrear detectados:\n${status}`;
      }
    } catch {
      diff = '';
    }
  }

  return { isGit: true, diff };
}

/**
 * Action: review
 */
async function handleReview() {
  const { isGit, diff } = getLocalGitDiff();

  if (!isGit) {
    console.log('ℹ️ El directorio actual no es un repositorio Git. Inicializa Git (`git init`) para usar /antigravity:review.');
    return;
  }

  if (!diff) {
    console.log('✔ No se encontraron cambios locales sin confirmar para revisar.');
    return;
  }

  console.log('🛰️ [Antigravity] Analizando git diff con sub-agente (Gemini/Codex)...');

  const prompt = [
    'Eres un revisor de código senior y especialista en seguridad de software.',
    'Analiza el siguiente git diff de manera concisa y objetiva.',
    'Estructura tu reporte exactamente con estas secciones:',
    '1. Riesgos de Seguridad e Inyección (OWASP, escape de datos, validaciones faltantes)',
    '2. Lógica, Bugs y Condiciones de Carrera (concurrencia, null pointers, memory leaks)',
    '3. Rendimiento y Buenas Prácticas (consultas N+1, operaciones sincrónicas bloqueantes)',
    '4. Veredicto Final: "APROBADO" o "REQUIERE ATENCIÓN" con justificación sintética.',
    '\n--- GIT DIFF INICIO ---',
    diff,
    '--- GIT DIFF FIN ---'
  ].join('\n');

  try {
    const output = await runBackend(prompt);
    console.log('\n======================================================');
    console.log('       REVISIÓN CRUZADA: ANTIGRAVITY (GEMINI)');
    console.log('======================================================\n');
    console.log(output);
    console.log('\n======================================================\n');
  } catch (error) {
    console.error(`❌ Error en /antigravity:review: ${error.message}`);
    process.exit(1);
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

  console.log(`🛰️ [Antigravity] Ejecutando tarea delegada: "${task}"...`);

  const prompt = [
    `Tarea técnica delegada desde Claude Code: "${task}"`,
    'Instrucciones de ejecución:',
    '1. Realiza las modificaciones o creaciones necesarias en el repositorio local.',
    '2. Corre las pruebas locales asociadas si aplica.',
    '3. Devuelve únicamente un resumen con:',
    '   - Archivos afectados / creados',
    '   - Cambios implementados',
    '   - Pruebas ejecutadas y resultados',
    '   - Advertencias o pasos pendientes'
  ].join('\n');

  try {
    const output = await runBackend(prompt);
    console.log('\n======================================================');
    console.log('          RESUMEN DE EJECUCIÓN (ANTIGRAVITY)');
    console.log('======================================================\n');
    console.log(output);
    console.log('\n======================================================\n');
  } catch (error) {
    console.error(`❌ Error en /antigravity:delegate: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Action: task
 * Orquesta el flujo autónomo completo (Round-Trip / Ping-Pong):
 * 1. Envía el requerimiento a Gemini para que codifique en disco y genere tests.
 * 2. Emite la señal estructurada para que Claude Code audite, ejecute pruebas y corrija.
 */
async function handleTask(task) {
  if (!task) {
    console.error('❌ Especifica la descripción de la tarea a ejecutar.');
    console.error('Ejemplo: /antigravity:task "Crear módulo de multi-envío de correos con validación de Excel..."');
    process.exit(1);
  }

  console.log('\n🛰️ [Antigravity Task Orchestrator] Iniciando pipeline dual-agent...');
  console.log(`📋 Requerimiento a procesar: "${task}"\n`);
  console.log('⚡ Fase 1: Delegando codificación, creación de archivos y tests a Gemini/Antigravity...');

  const prompt = [
    'Eres el sub-agente ejecutor de desarrollo (Gemini/Antigravity) trabajando en equipo con Claude Code.',
    'REQUERIMIENTO A IMPLEMENTAR:',
    `"${task}"`,
    '',
    'INSTRUCCIONES DE EJECUCIÓN DIRECTA EN EL PROYECTO:',
    '1. Analiza la arquitectura del repositorio actual y los estándares del proyecto.',
    '2. Crea y modifica directamente en el sistema de archivos todos los módulos, componentes, tipos, servicios y pruebas necesarias.',
    '3. Asegúrate de incluir el manejo de errores, validaciones de seguridad y tipado riguroso.',
    '4. Ejecuta o crea pruebas automatizadas locales para validar la funcionalidad.',
    '5. DEVUELVE ÚNICAMENTE un informe estructurado con:',
    '   - Lista detallada de archivos creados y modificados.',
    '   - Resumen técnico de la implementación realizada.',
    '   - Pruebas añadidas y estado de ejecución.',
    '   - Puntos de atención, decisiones técnicas o posibles edge cases para auditoría.'
  ].join('\n');

  try {
    const output = await runBackend(prompt);
    console.log('\n======================================================');
    console.log('       FASE 1 COMPLETADA: EJECUCIÓN POR GEMINI');
    console.log('======================================================\n');
    console.log(output);
    console.log('\n======================================================');
    console.log('  🛰️ SEÑAL PARA CLAUDE CODE - FASE 2: AUDITORÍA Y CONTROL');
    console.log('======================================================');
    console.log('INSTRUCCIONES PARA CLAUDE CODE:');
    console.log('1. Revisa e inspecciona los archivos modificados/creados por Gemini en el disco.');
    console.log('2. Ejecuta la suite de pruebas del proyecto (ej: npm test, pytest, etc.) para verificar la integridad.');
    console.log('3. Si detectas inconsistencias, bugs, edge cases o advertencias del linter, corrígelos directamente.');
    console.log('4. Entrega al usuario el reporte final consolidado de la tarea terminada para su retroalimentación.');
    console.log('======================================================\n');
  } catch (error) {
    console.error(`❌ Error en /antigravity:task: ${error.message}`);
    process.exit(1);
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

  console.log('🛰️ [Antigravity] Contrastando hipótesis técnica con pensamiento crítico...');

  const prompt = [
    'Actúa como un arquitecto de software escéptico y riguroso.',
    `Evalúa críticamente el siguiente planteamiento o solución propuesta: "${question}"`,
    'Identifica:',
    '1. Casos límite (edge cases) y condiciones imprevistas de fallo.',
    '2. Cuellos de botella potenciales en hardware, I/O, red o concurrencia.',
    '3. Alternativas arquitectónicas superiores con sus pros y contras.',
    '4. Recomendación final pragmática.'
  ].join('\n');

  try {
    const output = await runBackend(prompt);
    console.log('\n======================================================');
    console.log('        CRÍTICA DE ARQUITECTURA (GEMINI/CODEX)');
    console.log('======================================================\n');
    console.log(output);
    console.log('\n======================================================\n');
  } catch (error) {
    console.error(`❌ Error en /antigravity:challenge: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Action: status
 */
async function handleStatus() {
  const backend = resolveBackend();
  const authInfo = getAuthMethodInfo();
  console.log('\n======================================================');
  console.log(`  ESTADO DE INTEGRACIÓN ANTIGRAVITY-CC (v${VERSION})`);
  console.log('======================================================');
  if (!backend) {
    console.log('❌ Estado: Sin backend conectado.');
    console.log('   Ni `agy`, ni `gemini`, ni `codex` fueron encontrados en el PATH.');
    console.log('   Por favor instala @google/gemini-cli o define AGY_BIN.');
  } else {
    console.log(`✔ Binario en uso  : ${backend.bin}`);
    console.log(`✔ Tipo de motor   : ${backend.type}`);
    console.log(`✔ Autenticación   : ${authInfo.type}`);
    if (process.env.AGY_MODEL) {
      console.log(`✔ Modelo forzado  : ${process.env.AGY_MODEL}`);
    }
    console.log(`✔ Plataforma      : ${process.platform} (${process.arch})`);
    console.log(`✔ Node.js         : ${process.version}`);
  }
  console.log('======================================================\n');
}

/**
 * Action: test
 */
async function handleTest() {
  const authInfo = getAuthMethodInfo();
  console.log('Probando conectividad con el motor de Antigravity / Gemini...');
  console.log(`ℹ️ Método de autenticación activo: ${authInfo.type}`);

  try {
    const ping = await runBackend('Responde exactamente y únicamente: "Antigravity CLI conectado correctamente"');
    console.log(`✔ Resultado: ${ping}`);
  } catch (error) {
    console.error(`\n❌ Prueba fallida: ${error.message}\n`);

    if (error.message.includes('429') || error.message.includes('Quota exceeded') || error.message.includes('free_tier_requests')) {
      console.error('──────────────────────────────────────────────────────');
      console.error('⚠️ DIAGNÓSTICO: Error 429 (Cuota de API Key gratuita agotada)');
      console.error('El CLI de Gemini alcanzó el límite diario del tier gratuito de una API Key.');
      console.error('Si tienes suscripción Google AI Pro, debes usar el inicio de sesión con Google.\n');
      console.error('PASOS PARA RESOLVER:');
      console.error('1. Elimina la clave de tus variables de entorno en PowerShell:');
      console.error('   [System.Environment]::SetEnvironmentVariable("GEMINI_API_KEY", $null, "User")');
      console.error('   [System.Environment]::SetEnvironmentVariable("GOOGLE_API_KEY", $null, "User")');
      console.error('2. Abre una terminal normal de Windows y autentica con Google:');
      console.error('   gemini');
      console.error('   (Elige "Sign in with Google" o ejecuta `/auth` para vincular tu cuenta con Google AI Pro).');
      console.error('──────────────────────────────────────────────────────\n');
    } else if (error.message.includes('IneligibleTierError') || error.message.includes('UNSUPPORTED_CLIENT')) {
      console.error('──────────────────────────────────────────────────────');
      console.error('⚠️ DIAGNÓSTICO: Sesión OAuth antigua o desactualizada');
      console.error('La sesión previa guardada en ~/.gemini/oauth_creds.json requiere re-autenticación interactiva.\n');
      console.error('PASOS PARA RESOLVER:');
      console.error('1. Abre una terminal normal de Windows (CMD o PowerShell fuera de Claude) y ejecuta:');
      console.error('   gemini');
      console.error('2. Selecciona "Sign in with Google" (o escribe `/auth`) y completa el inicio de sesión en tu navegador con tu cuenta Google AI Pro.');
      console.error('3. Sal de la terminal interactiva escribiendo `/exit` y vuelve a probar `node bin/agy-wrapper.mjs test`.');
      console.error('──────────────────────────────────────────────────────\n');
    }

    process.exit(1);
  }
}

/**
 * Display help instructions
 */
function showHelp() {
  console.log(`
Antigravity Plugin for Claude Code (agy-cc) v${VERSION}
Orquestación multi-agente entre Claude Code y Antigravity (Gemini/Codex).

USO:
  node bin/agy-wrapper.mjs <comando> [argumentos] [opciones]

COMANDOS:
  task <tarea>        Ejecuta el ciclo completo: codificación en disco por Gemini + auditoría para Claude.
  review              Analiza el git diff local y emite reporte de seguridad y bugs.
  delegate <tarea>    Delega scaffolding, pruebas o refactors pesados al sub-agente.
  challenge <idea>    Somete una propuesta o diseño a crítica arquitectónica rigurosa.
  status              Verifica el binario activo y configuración del sistema.
  test                Ejecuta una prueba de humo para validar la conexión.
  help                Muestra este mensaje de ayuda.

OPCIONES:
  --engine <nombre>   Fuerza el motor ('antigravity', 'gemini' o 'codex').
  -h, --help          Muestra ayuda.
  -v, --version       Muestra la versión instalada.

VARIABLES DE ENTORNO:
  AGY_BIN             Ruta personalizada al binario de Antigravity o Gemini.
  AGY_ENGINE          Motor por defecto ('antigravity' o 'codex').
`);
}

async function main() {
  switch (action) {
    case 'task':
      await handleTask(rawUserPrompt);
      break;
    case 'review':
      await handleReview();
      break;
    case 'delegate':
      await handleDelegate(rawUserPrompt);
      break;
    case 'challenge':
      await handleChallenge(rawUserPrompt);
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
