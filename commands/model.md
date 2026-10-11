---
description: Elige el modelo y el esfuerzo que usa Antigravity (Flash, Pro, Opus...) con un menú o en una línea
argument-hint: '[flash|pro|opus|sonnet|gpt] [bajo|medio|alto] | reset'
allowed-tools: Bash(node:*), AskUserQuestion
---

Argumentos del usuario: `$ARGUMENTS`

**Si hay argumentos**, ejecuta con Bash (`timeout: 120000`) y muestra la salida tal cual:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" model <<'AGY_EOF'
$ARGUMENTS
AGY_EOF
```

**Si no hay argumentos**, ofrece un menú:

1. Ejecuta con Bash (`timeout: 120000`):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" model --json
   ```

2. Con el JSON, usa AskUserQuestion **una sola vez** con dos preguntas:
   - **Modelo** (header "Modelo"): una opción por cada entrada de `aliases` con `available: true`, como máximo 4, en este orden de preferencia: `flash`, `pro`, `opus`, `sonnet`. La etiqueta es el `label` del modelo; la descripción, su `hint`. Marca con "(actual)" la que coincida con `current.label`.
   - **Esfuerzo** (header "Esfuerzo"): "Alto (Recomendado)", "Medio", "Bajo". En la descripción explica que más esfuerzo piensa más y gasta más cuota.
3. Guarda la elección con Bash, usando el `alias` elegido y el esfuerzo en español en minúsculas (`alto`, `medio` o `bajo`):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" model <alias> <esfuerzo>
   ```

   Si el modelo elegido no admite ese esfuerzo, el wrapper lo dice; repite el paso 3 con un esfuerzo de la lista que indica.
4. Muestra la salida tal cual.
