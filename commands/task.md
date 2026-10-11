---
description: Pipeline dual-agent completo - Claude especifica, Antigravity codifica en disco, Claude audita y corrige
argument-hint: <requerimiento>
allowed-tools: Bash(node:*), Bash(git status:*), Bash(git diff:*)
---

Requerimiento del usuario:

$ARGUMENTS

## Fase 1 - Especificación (tú, Claude)
Analiza el requerimiento y el repositorio. Escribe una especificación técnica concreta: archivos a crear/modificar, interfaces y esquemas, reglas de validación y seguridad, casos de prueba esperados y convenciones del proyecto a respetar. Si el requerimiento es ambiguo en algo que cambia el diseño, pregunta al usuario antes de seguir.

## Fase 2 - Codificación (Antigravity)
Envía la especificación al wrapper con la herramienta Bash usando `timeout: 600000`. Pon la especificación completa dentro del heredoc (las comillas en `'AGY_EOF'` evitan que el shell la interprete):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" task <<'AGY_EOF'
<especificación técnica completa>
AGY_EOF
```

## Fase 3 - Auditoría (tú, Claude)
1. Ejecuta `git status` y `git diff` para ver los cambios reales en disco; no confíes solo en el resumen de Antigravity.
2. Ejecuta las pruebas del proyecto (`npm test`, `pytest`, etc.). Antigravity, por defecto, no puede ejecutar comandos.
3. Corrige directamente errores de sintaxis, tipos, linter, edge cases o desviaciones de la especificación.

## Fase 4 - Entrega
Muestra al usuario el reporte final: qué se implementó, archivos tocados, qué corrigió Claude sobre lo de Antigravity y el estado real de las pruebas (con la salida si fallan).

Si el wrapper falla, muestra su diagnóstico y no sigas con la Fase 3.
