---
description: Revisión independiente (solo lectura) del git diff local usando Antigravity
argument-hint: [foco opcional, ej. "seguridad del login"]
allowed-tools: Bash(node:*)
---

Ejecuta este comando con la herramienta Bash usando `timeout: 600000` (Antigravity puede tardar varios minutos). Copia el heredoc tal cual: el texto viaja por stdin y el shell no lo interpreta.

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" review <<'AGY_EOF'
$ARGUMENTS
AGY_EOF
```

Muestra al usuario la salida resumida y señala los hallazgos importantes de seguridad y concurrencia. Verifica contra el código los hallazgos que vayas a destacar antes de presentarlos como ciertos. Si el comando falla, muestra el diagnóstico que imprime el wrapper.

Copia siempre al usuario, sin cambios, la línea final que empieza con "🛰️ Respondido por Antigravity CLI": es la prueba de que la respuesta vino de agy (el ID de conversación se puede verificar en ~/.gemini/antigravity-cli/conversations/).
