---
description: Revisión adversarial (solo lectura) que intenta romper tus cambios y cuestiona el diseño, hecha por Antigravity
argument-hint: '[--background|--wait] [--base <rama>] [--scope auto|working-tree|branch] [--model <m>] [--effort <nivel>] [foco]'
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(git status:*), Bash(git diff:*), AskUserQuestion
---

Ejecuta una revisión ADVERSARIAL con Antigravity (solo lectura): busca las razones más fuertes para NO publicar el cambio (auth, pérdida de datos, carreras, rollback, migraciones) y cuestiona el enfoque, no solo los detalles. Revisa los cambios sin confirmar; si no hay, revisa la rama actual contra la rama principal. `--base <rama>` fuerza la comparación de rama.

Argumentos del usuario: `$ARGUMENTS`

Reglas:
- Es solo una revisión. No corrijas nada ni anuncies que vas a cambiar código.
- Muestra la salida del wrapper tal cual: veredicto, hallazgos ordenados por gravedad con `archivo:línea`, próximos pasos y la línea final "🛰️ Respondido por Antigravity CLI". No la resumas ni la reescribas.
- Después de mostrarla, DETENTE y pregunta qué hallazgos quiere corregir el usuario. Nunca apliques arreglos por tu cuenta, aunque sean obvios.

Primer o segundo plano:
- Si los argumentos incluyen `--background` o `--wait`, respétalo sin preguntar.
- Si no, estima el tamaño: `git status --short --untracked-files=all` y `git diff --shortstat` (con `--base <rama>`: `git diff --shortstat <rama>...HEAD`).
  - Si son 1 o 2 archivos pequeños, ejecuta en primer plano sin preguntar.
  - Si no, usa AskUserQuestion una sola vez con "Ejecutar en segundo plano (Recomendado)" y "Esperar el resultado". Si elige segundo plano, escribe `--background` al inicio del heredoc.

Ejecuta con la herramienta Bash usando `timeout: 600000`. Copia los argumentos dentro del heredoc sin cambios (las comillas en `'AGY_EOF'` evitan que el shell los interprete):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" adversarial-review <<'AGY_EOF'
$ARGUMENTS
AGY_EOF
```

En segundo plano, el wrapper responde enseguida con un ID: díselo al usuario junto con `/antigravity:status` y `/antigravity:result`, y no esperes el resultado.
