---
description: Pipeline dual-agent completo - Claude especifica, Antigravity codifica en disco, Claude audita y corrige
argument-hint: '[--background] [--model <m>] [--effort <nivel>] <requerimiento>'
allowed-tools: Write, Bash(node:*), Bash(git status:*), Bash(git diff:*)
---

Requerimiento del usuario:

$ARGUMENTS

## Fase 1 - Especificación (tú, Claude)
Analiza el requerimiento y el repositorio. Escribe una especificación técnica concreta: archivos a crear/modificar, interfaces y esquemas, reglas de validación y seguridad, casos de prueba esperados y convenciones del proyecto a respetar. Si el requerimiento es ambiguo en algo que cambia el diseño, pregunta al usuario antes de seguir.

## Fase 2 - Codificación (Antigravity)
1. Guarda la especificación completa con la herramienta **Write** en un archivo `.md` fuera del repositorio (tu directorio scratchpad si tienes uno; si no, la carpeta temporal del sistema). No la pongas dentro del comando de Bash: los textos largos con comillas rompen el comando.
2. Ejecuta el wrapper con la herramienta Bash usando `timeout: 600000` y pásale solo la ruta:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" task --file "<ruta del archivo>"
```

Si el usuario pasó `--model`, `--effort` o `--background`, añádelos al comando antes de `--file`. Con `--background`, informa el ID y retoma la Fase 3 cuando el usuario lo pida (después de `/antigravity:result`).
Para una segunda vuelta sobre lo mismo (por ejemplo, corregir lo que falló), usa `delegate --resume` con solo la instrucción nueva.

## Fase 3 - Auditoría (tú, Claude)
1. Ejecuta `git status` y `git diff` para ver los cambios reales en disco; no confíes solo en el resumen de Antigravity.
2. Ejecuta las pruebas del proyecto (`npm test`, `pytest`, etc.). Antigravity, por defecto, no puede ejecutar comandos.
3. Corrige directamente errores de sintaxis, tipos, linter, edge cases o desviaciones de la especificación.

## Fase 4 - Entrega
Muestra al usuario el reporte final: qué se implementó, archivos tocados, qué corrigió Claude sobre lo de Antigravity y el estado real de las pruebas (con la salida si fallan).

Si el wrapper falla, muestra su diagnóstico y no sigas con la Fase 3.

Copia siempre al usuario, sin cambios, la línea final que empieza con "🛰️ Respondido por Antigravity CLI": es la prueba de que la respuesta vino de agy (el ID de conversación se puede verificar en ~/.gemini/antigravity-cli/conversations/).
