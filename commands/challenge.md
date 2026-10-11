---
description: Pide a Antigravity que critique y busque fallos de arquitectura en un planteamiento (solo lectura)
argument-hint: <planteamiento o decisión a contrastar>
allowed-tools: Bash(node:*)
---

Ejecuta este comando con la herramienta Bash usando `timeout: 600000` (Antigravity puede tardar varios minutos). Copia el heredoc tal cual: el texto viaja por stdin y el shell no lo interpreta.

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" challenge <<'AGY_EOF'
$ARGUMENTS
AGY_EOF
```

Analiza la crítica devuelta por Antigravity: separa los puntos sólidos de los débiles, di con cuáles estás de acuerdo y por qué, y contrasta las alternativas arquitectónicas con el usuario. Si el comando falla, muestra el diagnóstico que imprime el wrapper.

Copia siempre al usuario, sin cambios, la línea final que empieza con "🛰️ Respondido por Antigravity CLI": es la prueba de que la respuesta vino de agy (el ID de conversación se puede verificar en ~/.gemini/antigravity-cli/conversations/).
