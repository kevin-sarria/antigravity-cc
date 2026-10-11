---
description: Muestra los trabajos de Antigravity en este repositorio (en curso y recientes) o el detalle de uno
argument-hint: '[id-del-trabajo] [--all]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Argumentos del usuario: `$ARGUMENTS`

Ejecuta con Bash. Si los argumentos contienen un ID con forma `agy-...`, agrégalo al final; si contienen `--all`, agrégalo; no agregues ningún otro texto:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" status
```

Muestra la salida tal cual (incluye una tabla en Markdown). No agregues explicaciones salvo que haya un trabajo fallido: en ese caso indica el error que aparece.
