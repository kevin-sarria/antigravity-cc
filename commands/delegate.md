---
description: Delega una tarea técnica a Antigravity (edita archivos en disco) y devuelve un resumen condensado
argument-hint: <tarea a delegar>
allowed-tools: Bash(node:*), Bash(git status:*), Bash(git diff:*)
---

Ejecuta este comando con la herramienta Bash usando `timeout: 600000` (Antigravity puede tardar varios minutos). Copia el heredoc tal cual: el texto viaja por stdin y el shell no lo interpreta.

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" delegate <<'AGY_EOF'
$ARGUMENTS
AGY_EOF
```

Después, ejecuta `git status` y `git diff --stat` para confirmar qué cambió realmente en disco, y muestra al usuario el resumen de Antigravity junto con esa verificación. Si el resumen afirma cambios que no aparecen en git, dilo claramente. Si el comando falla, muestra el diagnóstico que imprime el wrapper.
