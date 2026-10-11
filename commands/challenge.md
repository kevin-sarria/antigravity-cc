---
description: Pide a Gemini/Antigravity que critique y busque fallos de arquitectura en la solución actual de Claude
allowed-tools: Bash(node:*)
---

Ejecuta con Bash:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" challenge $ARGUMENTS
```

Analiza la crítica devuelta por Gemini, evalúa los puntos clave y contrasta las alternativas arquitectónicas con el usuario.
