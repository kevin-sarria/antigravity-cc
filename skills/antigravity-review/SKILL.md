---
name: antigravity-review
description: Usar cuando el usuario pida una segunda opinión, una revisión cruzada o una auditoría de los cambios locales o de la rama (antes de un commit, merge o publicación), especialmente en seguridad, autenticación, concurrencia o refactors grandes. Antigravity revisa en modo solo lectura y devuelve hallazgos con gravedad y archivo:línea.
---

# Antigravity Review

Un segundo agente (Google Antigravity) audita los cambios en modo solo lectura y devuelve un resultado estructurado: veredicto, hallazgos ordenados por gravedad (crítico → bajo) con `archivo:línea`, confianza y recomendación, y próximos pasos.

## Qué revisar
- Sin opciones: los cambios sin confirmar (incluido el contenido de archivos nuevos); si no hay, la rama actual contra la principal.
- `--base <rama>`: la rama actual contra `<rama>`. `--scope working-tree|branch` fuerza uno de los dos.

## Normal o adversarial
- `review`: corrección, seguridad, fiabilidad y rendimiento.
- `adversarial-review`: intenta romper el cambio y cuestiona el diseño (auth, pérdida de datos, carreras, rollback, migraciones). Úsalo antes de publicar algo arriesgado.

## Cómo se ejecuta
Usa la herramienta Bash con `timeout: 600000`. Opciones y foco van dentro del heredoc:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" review <<'AGY_EOF'
--base main revisa sobre todo la autorización
AGY_EOF
```

Para cambios grandes agrega `--background`: responde con un ID; el resultado se consulta con `/antigravity:result <id>`.

## Después
Sigue la skill `antigravity-result-handling`: muestra el resultado tal cual, verifica en el código los hallazgos que destaques y pregunta qué corregir. No corrijas nada por tu cuenta.
