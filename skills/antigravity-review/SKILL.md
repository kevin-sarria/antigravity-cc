---
name: antigravity-review
description: Ejecuta una revisión cruzada independiente del git diff local utilizando el sub-agente Antigravity (Gemini/Codex) para detectar vulnerabilidades, bugs de concurrencia y optimizaciones críticas.
---

# Antigravity Review

Utiliza esta habilidad cuando quieras que un segundo agente de inteligencia artificial (Google Antigravity / Gemini o Codex) audite de manera independiente los cambios locales (`git diff`) antes de confirmar un commit o fusionar una rama.

## Cuándo usar
- Antes de hacer git commit de código complejo o crítico para la seguridad.
- Para obtener una segunda opinión no sesgada sobre refactors, modelos de datos o autenticación.
- Para verificar que no se introdujeron regresiones o condiciones de carrera.

## Cómo se ejecuta
Ejecuta el comando en terminal:
```bash
node ./bin/agy-wrapper.mjs review
```
O directamente con el comando de Claude Code:
```text
/antigravity:review
```

## Salida esperada
El sub-agente devuelve un reporte condensado clasificando:
1. Riesgos de seguridad o inyecciones.
2. Bugs de lógica y condiciones de carrera.
3. Recomendaciones de rendimiento.
O bien un veredicto explícito de **APROBADO**.
