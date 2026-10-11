---
name: antigravity-challenge
description: Usar cuando haya que decidir una arquitectura, adoptar una biblioteca o elegir entre trade-offs (consistencia, concurrencia, escalabilidad) y convenga una crítica adversarial de otro modelo para encontrar puntos ciegos. Antigravity analiza en modo solo lectura.
---

# Antigravity Challenge

Envía un planteamiento a Antigravity para que lo critique como un arquitecto escéptico: edge cases, cuellos de botella, alternativas superiores y una recomendación pragmática. Sirve para contrarrestar el sesgo de confirmación del agente orquestador.

## Cómo se ejecuta
Usa la herramienta Bash con `timeout: 600000`. Escribe el planteamiento con el contexto necesario (restricciones, volumen, stack) dentro del heredoc:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" challenge <<'AGY_EOF'
¿Es viable usar SQLite en modo WAL con 50 workers concurrentes escribiendo?
AGY_EOF
```

## Qué hacer con la salida
No la copies tal cual: di con qué puntos estás de acuerdo, cuáles no aplican al contexto del usuario y por qué, y deja la decisión al usuario.
