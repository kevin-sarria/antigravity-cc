---
description: Delega una tarea técnica a Antigravity (lee y edita archivos en disco) y devuelve un resumen
argument-hint: '[--background] [--resume] [--full-access] [--model <m>] [--effort <nivel>] <tarea>'
allowed-tools: Bash(node:*), Bash(git status:*), Bash(git diff:*), AskUserQuestion
---

Ejecuta con la herramienta Bash usando `timeout: 600000`. Copia los argumentos dentro del heredoc sin cambios (texto y opciones):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" delegate <<'AGY_EOF'
$ARGUMENTS
AGY_EOF
```

- `--resume` continúa la última tarea delegada en la misma conversación de Antigravity. Úsalo cuando el usuario diga "sigue", "aplica el siguiente paso" o "corrige lo que quedó". Envía solo la instrucción nueva, no repitas la tarea entera.
- Con `--background`, el wrapper responde enseguida con un ID: díselo al usuario junto con `/antigravity:status` y `/antigravity:result`, y no esperes.

**Si falla con `DENIED_COMMAND`** (Antigravity quiso ejecutar un comando y por defecto debe preguntarse antes), usa AskUserQuestion una sola vez. Pregunta si permite que Antigravity ejecute comandos en esta tarea, nombrando el comando o la herramienta que indica el error. Opciones: "Sí, solo esta tarea", "Sí, siempre (acceso total)" y "No, sigue sin comandos".
- **Solo esta tarea:** repite `delegate` con `--full-access --conversation <id del error>` en la primera línea del heredoc, y como texto "Continúa la tarea donde quedó; ya puedes ejecutar comandos."
- **Siempre:** ejecuta `node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" permissions total` y luego repite como en el caso anterior, sin `--full-access`.
- **No:** ejecuta tú lo que hacía falta, o pide a Antigravity que continúe sin comandos (`--conversation <id>`).

En primer plano, al terminar ejecuta `git status` y `git diff --stat` para confirmar qué cambió realmente en disco. Muestra el resumen de Antigravity junto con esa verificación; si el resumen afirma cambios que no aparecen en git, dilo claramente. Si el comando falla, muestra el diagnóstico que imprime el wrapper.

Copia siempre al usuario, sin cambios, la línea final que empieza con "🛰️ Respondido por Antigravity CLI": es la prueba de que la respuesta vino de agy (el ID de conversación se puede verificar en ~/.gemini/antigravity-cli/conversations/).
