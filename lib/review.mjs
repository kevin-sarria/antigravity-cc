/**
 * Review prompts (standard and adversarial), structured-output parsing and rendering.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REVIEW_SCHEMA_PATH = fileURLToPath(new URL('../schemas/review-output.schema.json', import.meta.url));

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_LABEL = { critical: '🔴 CRÍTICO', high: '🟠 ALTO', medium: '🟡 MEDIO', low: '🔵 BAJO' };

const OUTPUT_CONTRACT = [
  'FORMATO DE SALIDA:',
  '- Devuelve SOLO JSON que cumpla el schema indicado: verdict, summary, findings, next_steps.',
  '- verdict: "needs-attention" si hay algún riesgo material que justifique frenar el cambio; "approve" si no puedes',
  '  sostener ningún hallazgo con evidencia del contexto.',
  '- Cada hallazgo: severity (critical|high|medium|low), title, body (qué falla y por qué), file (ruta relativa al',
  '  repositorio), line_start, line_end, confidence (0 a 1, honesta) y recommendation (cambio concreto).',
  '- Escribe en español. Sin hallazgos de estilo, nombres o limpieza menor.',
].join('\n');

const GROUNDING = [
  'REGLAS DE EVIDENCIA:',
  '- Cada hallazgo debe poder defenderse con el contexto de abajo o con archivos que leas del repositorio.',
  '- No inventes archivos, líneas, rutas de ejecución ni incidentes. Si algo es una inferencia, dilo en body y baja confidence.',
  '- Mejor un hallazgo sólido que varios débiles. Si el cambio parece seguro, dilo y devuelve findings vacío.',
].join('\n');

function contextBlock(context) {
  return [
    `OBJETIVO DE LA REVISIÓN: ${context.label} (${context.summary})`,
    '',
    '<contexto_del_repositorio>',
    context.content,
    '</contexto_del_repositorio>',
  ].join('\n');
}

/** Standard review: correctness, security, reliability and performance of the change. */
export function buildReviewPrompt(context, focus = '') {
  return [
    'Eres un revisor de código senior y especialista en seguridad. Revisa el cambio descrito abajo.',
    'Puedes leer otros archivos del repositorio para entender el contexto, pero NO modifiques nada.',
    focus ? `FOCO PEDIDO POR EL USUARIO (dale prioridad, pero reporta cualquier otro problema material): ${focus}` : '',
    '',
    'BUSCA, en este orden de prioridad:',
    '1. Seguridad: inyección, autenticación/autorización, validaciones faltantes, exposición de datos o secretos.',
    '2. Corrección: bugs de lógica, casos borde, nulos, errores no manejados, condiciones de carrera.',
    '3. Fiabilidad y rendimiento: fugas, operaciones bloqueantes, consultas N+1, reintentos sin límite.',
    '',
    OUTPUT_CONTRACT,
    '',
    GROUNDING,
    '',
    contextBlock(context),
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** Adversarial review: try to break confidence in the change and its design choices. */
export function buildAdversarialPrompt(context, focus = '') {
  return [
    'Eres un revisor ADVERSARIAL. Tu trabajo es encontrar las razones más fuertes por las que este cambio NO',
    'debería publicarse todavía, no confirmar que está bien. Cuestiona también el enfoque y las decisiones de diseño.',
    'Puedes leer otros archivos del repositorio para obtener contexto, pero NO modifiques nada.',
    focus ? `FOCO PEDIDO POR EL USUARIO (dale mucho peso): ${focus}` : '',
    '',
    'POSTURA: escepticismo por defecto. Si algo solo funciona en el camino feliz, es una debilidad real.',
    'No des crédito por buenas intenciones, arreglos parciales ni trabajo "que se hará después".',
    '',
    'SUPERFICIE DE ATAQUE (prioriza lo caro, peligroso o difícil de detectar):',
    '- autenticación, permisos, aislamiento entre usuarios/empresas y límites de confianza',
    '- pérdida, corrupción o duplicación de datos y cambios de estado irreversibles',
    '- rollback, reintentos, fallos parciales e idempotencia',
    '- condiciones de carrera, orden de eventos, estado obsoleto y reentrada',
    '- estado vacío, nulos, timeouts y dependencias degradadas',
    '- migraciones, cambios de esquema y compatibilidad entre versiones',
    '- falta de observabilidad que oculte fallos o dificulte recuperarse',
    '',
    'MÉTODO: intenta refutar el cambio. Busca invariantes rotas, guardas faltantes y supuestos que dejan de cumplirse',
    'bajo estrés. Sigue cómo viajan entradas malas, reintentos y operaciones concurrentes por el código.',
    'Para cada hallazgo responde: qué puede fallar, por qué ese camino es vulnerable, el impacto probable y qué cambio',
    'concreto reduce el riesgo. Escribe summary como un veredicto corto de publicar / no publicar.',
    '',
    OUTPUT_CONTRACT,
    '',
    GROUNDING,
    '',
    contextBlock(context),
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** Accept agy's parsed structured_output, or JSON embedded in the text response. */
export function parseReviewResult(structured, text) {
  let data = structured;
  if (!data && text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        data = JSON.parse(text.slice(start, end + 1));
      } catch {
        data = null;
      }
    }
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.findings) || !data.verdict) return null;
  return data;
}

function relativeFile(file, cwd) {
  if (!file) return '?';
  const normalized = file.replace(/^file:\/\/\/?/, '');
  if (path.isAbsolute(normalized)) {
    const rel = path.relative(cwd, normalized);
    if (rel && !rel.startsWith('..')) return rel.split(path.sep).join('/');
  }
  return normalized.split(path.sep).join('/');
}

function lineRange(finding) {
  const start = finding.line_start;
  const end = finding.line_end;
  if (!start) return '';
  return end && end !== start ? `:${start}-${end}` : `:${start}`;
}

/**
 * Render a structured review as Markdown: verdict, summary, findings ordered by severity, next steps.
 */
export function renderReview(data, { title, cwd = process.cwd() } = {}) {
  const findings = [...data.findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) || (b.confidence ?? 0) - (a.confidence ?? 0)
  );
  const verdict = data.verdict === 'approve' ? '✅ APROBADO' : '⚠️ REQUIERE ATENCIÓN';
  const out = [`# ${title}`, '', `**Veredicto:** ${verdict}`, '', data.summary || '', ''];

  if (findings.length === 0) {
    out.push('Sin hallazgos materiales.', '');
  } else {
    out.push(`## Hallazgos (${findings.length})`, '');
    findings.forEach((f, i) => {
      const confidence = typeof f.confidence === 'number' ? ` · confianza ${Math.round(f.confidence * 100)}%` : '';
      out.push(`### ${i + 1}. ${SEVERITY_LABEL[f.severity] || f.severity} — ${f.title}`);
      out.push(`\`${relativeFile(f.file, cwd)}${lineRange(f)}\`${confidence}`, '');
      out.push(f.body, '');
      if (f.recommendation) out.push(`**Recomendación:** ${f.recommendation}`, '');
    });
  }

  if (Array.isArray(data.next_steps) && data.next_steps.length > 0) {
    out.push('## Próximos pasos', '', ...data.next_steps.map((s) => `- ${s}`), '');
  }
  return out.join('\n').trim();
}
