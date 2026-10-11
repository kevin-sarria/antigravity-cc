---
name: antigravity-challenge
description: Desafía una decisión de diseño, elección de arquitectura o hipótesis técnica pidiendo al modelo de Gemini/Codex un análisis escéptico y adversarial.
---

# Antigravity Challenge

Esta habilidad actúa como un revisor de arquitectura escéptico y riguroso. Envía la propuesta de Claude a Antigravity (Gemini/Codex) para buscar puntos ciegos, cuellos de botella de escalabilidad, edge cases y alternativas superiores.

## Cuándo usar
- Antes de adoptar una biblioteca o arquitectura nueva (p. ej. "¿Es viable usar SQLite WAL con 50 workers concurrentes?").
- Cuando se evalúa un trade-off complejo entre consistencia eventual vs inmediata.
- Para contrarrestar posibles sesgos de confirmación o complacencia del modelo orquestador.

## Cómo se ejecuta
```bash
node ./bin/agy-wrapper.mjs challenge "¿Es viable usar SQLite WAL mode con 50 workers concurrentes?"
```
O directamente en Claude Code:
```text
/antigravity:challenge ¿Es viable usar SQLite WAL mode con 50 workers concurrentes?
```

## Salida esperada
Un informe crítico que detalla:
- Casos límite (edge cases) y condiciones de falla.
- Cuellos de botella potenciales de hardware, I/O o red.
- Comparativa con patrones arquitectónicos alternativos.
