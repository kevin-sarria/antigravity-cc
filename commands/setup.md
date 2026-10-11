---
description: Verifica que Antigravity CLI esté instalado y con sesión, y ofrece instalarlo si falta
allowed-tools: Bash(node:*), Bash(winget install:*), Bash(curl:*), Bash(powershell:*), AskUserQuestion
---

Ejecuta con Bash usando `timeout: 300000`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" setup --json
```

Lee el JSON:
- `ready: true`: muestra al usuario que todo está listo (versión de agy y binario) y sugiere `/antigravity:review --background` como primera prueba.
- `install` no es null (falta Antigravity CLI): usa AskUserQuestion una sola vez con "Instalar Antigravity CLI ahora (Recomendado)" y "Lo instalo yo después". Si acepta, ejecuta exactamente `install.command` con Bash (`timeout: 600000`) y luego vuelve a ejecutar el setup. Si no, muestra el comando para que lo ejecute él.
- `auth.ok: false` con agy instalado: la sesión no es válida. Muestra el primer renglón de `auth.error` y pide ejecutar `/antigravity:login` y después `/antigravity:setup`.
- `node.ok` o `git.ok` en false: indica qué instalar.

Presenta el resultado como una lista corta con ✅/❌ por punto (Node.js, git, Antigravity CLI, sesión) y el siguiente paso concreto.
