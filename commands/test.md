---
description: Prueba de conectividad y autenticación con Antigravity CLI
allowed-tools: Bash(node:*)
---

Ejecuta con la herramienta Bash usando `timeout: 300000`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" test
```

Si falla por autenticación, muestra el diagnóstico y sugiere `/antigravity:login --reset`.
