---
name: antigravity-task
description: Pipeline dual-agent completo - Claude escribe la especificación, Antigravity codifica en disco y Claude audita, prueba y corrige. Solo cuando el usuario lo pida.
disable-model-invocation: true
---

# Antigravity Task (Dual-Agent Pipeline)

## Fase 1: Especificación (Claude)
Analiza el requerimiento y el repositorio. Escribe una especificación técnica concreta: archivos a crear/modificar, interfaces y esquemas, validaciones y seguridad, casos de prueba y convenciones del proyecto. Si algo ambiguo cambia el diseño, pregunta al usuario.

## Fase 2: Codificación en disco (Antigravity)
Guarda la especificación con la herramienta **Write** en un archivo `.md` fuera del repositorio (tu scratchpad o la carpeta temporal del sistema); no la metas en el comando de Bash, porque los textos largos con comillas lo rompen. Luego usa la herramienta Bash con `timeout: 600000`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" task --file "<ruta del archivo>"
```

Antigravity edita archivos (`--mode accept-edits`). Por defecto no ejecuta comandos de shell, así que las pruebas las corres tú en la Fase 3.

## Fase 3: Auditoría (Claude)
1. `git status` y `git diff`: revisa los cambios reales en disco; no confíes solo en el resumen.
2. Ejecuta la suite de pruebas del proyecto.
3. Corrige errores de sintaxis, tipos, linter, edge cases y desviaciones de la especificación.

## Fase 4: Entrega
Informa: qué se implementó, archivos tocados, qué corregiste sobre lo de Antigravity y el estado real de las pruebas (con la salida si fallan).

Si el wrapper falla, muestra su diagnóstico y detente.
