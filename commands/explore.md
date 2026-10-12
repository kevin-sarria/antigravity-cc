---
description: Antigravity investiga el código y devuelve un resumen corto con archivo:línea (solo lectura, ahorra contexto de Claude)
argument-hint: '[--resume] [--model <m>] [--effort <nivel>] <pregunta sobre el código>'
allowed-tools: Bash(node:*)
---

Ejecuta con la herramienta Bash usando `timeout: 600000`. Copia los argumentos dentro del heredoc sin cambios (texto y opciones):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" explore <<'AGY_EOF'
$ARGUMENTS
AGY_EOF
```

- `--resume` continúa la última investigación en la misma conversación de Antigravity (para repreguntar o profundizar).

Muestra la respuesta completa al usuario. Si después hay que trabajar sobre ese código, usa los punteros `archivo:línea` y lee solo los rangos necesarios en lugar de releer archivos completos. Si el comando falla, muestra el diagnóstico que imprime el wrapper.

Copia siempre al usuario, sin cambios, la línea final que empieza con "🛰️ Respondido por Antigravity CLI": es la prueba de que la respuesta vino de agy (el ID de conversación se puede verificar en ~/.gemini/antigravity-cli/conversations/).
