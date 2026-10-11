---
description: Pide a Antigravity una crítica escéptica de un planteamiento o decisión de arquitectura (solo lectura)
argument-hint: '[--background] [--resume] [--model <m>] [--effort <nivel>] <planteamiento o decisión>'
allowed-tools: Bash(node:*)
---

Ejecuta con la herramienta Bash usando `timeout: 600000`. Copia los argumentos dentro del heredoc sin cambios (texto y opciones):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" challenge <<'AGY_EOF'
$ARGUMENTS
AGY_EOF
```

- `--resume` continúa la última crítica en la misma conversación de Antigravity (para repreguntar o profundizar).
- Con `--background`, el wrapper responde enseguida con un ID: díselo al usuario junto con `/antigravity:status` y `/antigravity:result`.

Muestra la crítica completa y luego da tu opinión por separado: con qué puntos estás de acuerdo, cuáles no aplican al contexto del usuario y por qué. La decisión es del usuario. Si el comando falla, muestra el diagnóstico que imprime el wrapper.

Copia siempre al usuario, sin cambios, la línea final que empieza con "🛰️ Respondido por Antigravity CLI": es la prueba de que la respuesta vino de agy (el ID de conversación se puede verificar en ~/.gemini/antigravity-cli/conversations/).
