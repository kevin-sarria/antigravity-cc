---
description: Abre una consola para iniciar sesión en Antigravity CLI (agy) con tu cuenta Google AI Pro
argument-hint: [--reset]
allowed-tools: Bash(node:*)
---

El inicio de sesión con Google necesita una consola interactiva y un navegador, así que el wrapper abre una ventana de consola nueva con `agy`.

Argumentos recibidos: `$ARGUMENTS`

Si los argumentos incluyen `--reset` (solo aplica al motor legado Gemini CLI: respalda su sesión guardada), ejecuta con Bash:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" login --reset
```

Si no, ejecuta:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" login
```

Muestra al usuario los pasos que imprime el wrapper y espera a que confirme que terminó. Luego ejecuta `/antigravity:test` para verificar.
