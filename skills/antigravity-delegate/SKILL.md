---
name: antigravity-delegate
description: Delega a Antigravity una tarea pesada o repetitiva (scaffolding, generación masiva de tests, DTOs, mocks) que edita archivos en disco, para ahorrar contexto en Claude Code. Solo cuando el usuario lo pida.
disable-model-invocation: true
---

# Antigravity Delegate

Antigravity trabaja sobre el disco en un subproceso aislado y devuelve solo un resumen ("Context Shielding"). Por defecto puede editar archivos, pero antes de ejecutar un comando de shell se detiene con `DENIED_COMMAND` y hay que preguntar al usuario (ver el skill antigravity-result-handling). Con `--full-access` (una vez) o `/antigravity:permissions total` (siempre) ejecuta comandos sin preguntar.

## Cómo se ejecuta
Usa la herramienta Bash con `timeout: 600000`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" delegate <<'AGY_EOF'
Escribir tests unitarios con Vitest para src/auth.ts
AGY_EOF
```

Si la instrucción es larga (más de unas 20 líneas, o con fragmentos de código), guárdala primero con la herramienta Write en un archivo fuera del repositorio y usa `delegate --file "<ruta>"` en lugar del heredoc.

## Después de ejecutar
1. Ejecuta `git status` y `git diff --stat`: confirma que los cambios que el resumen afirma existen realmente en disco.
2. Ejecuta las pruebas si Antigravity no pudo hacerlo.
3. Informa al usuario del resumen y de lo que verificaste.
