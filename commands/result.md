---
description: Muestra la salida guardada de un trabajo de Antigravity terminado (el último si no das ID)
argument-hint: '[id-del-trabajo]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Argumentos del usuario: `$ARGUMENTS`

Ejecuta con Bash. Si los argumentos contienen un ID con forma `agy-...`, agrégalo al final; si no, ejecútalo sin argumentos:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" result
```

Muestra la salida completa tal cual, sin resumirla: veredicto, hallazgos con `archivo:línea`, archivos tocados, errores y la línea final "🛰️ Respondido por Antigravity CLI".
Si es una revisión, después DETENTE y pregunta qué hallazgos quiere corregir el usuario; no corrijas nada por tu cuenta.
Si es un trabajo `delegate` o `task` que editó archivos, revisa `git status` y `git diff --stat` antes de dar el trabajo por bueno.
