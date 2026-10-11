---
description: Cancela un trabajo de Antigravity en curso en este repositorio
argument-hint: '[id-del-trabajo]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Argumentos del usuario: `$ARGUMENTS`

Ejecuta con Bash. Si los argumentos contienen un ID con forma `agy-...`, agrégalo al final; si no, se cancela el último trabajo en curso:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" cancel
```

Muestra la salida tal cual. Si el trabajo era `delegate` o `task`, avisa que puede haber dejado archivos editados a medias y sugiere revisar `git status`.
