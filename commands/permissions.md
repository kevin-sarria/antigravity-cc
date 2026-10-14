---
description: Cambia lo que Antigravity puede hacer en tu PC - preguntar antes de ejecutar comandos (predeterminado) o acceso total
argument-hint: '[total|preguntar]'
allowed-tools: Bash(node:*)
---

Argumentos del usuario: `$ARGUMENTS`

Ejecuta con Bash (`timeout: 60000`) y muestra la salida tal cual:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" permissions <<'AGY_EOF'
$ARGUMENTS
AGY_EOF
```

Si el usuario activó `total`, recuérdale en una frase que desde ahora `delegate` y `task` ejecutan comandos en su PC sin preguntar, y que lo revierte con `/antigravity:permissions preguntar`.
