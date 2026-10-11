---
name: antigravity-review
description: Usar cuando el usuario pida una segunda opinión, una revisión cruzada o una auditoría de los cambios locales sin confirmar (git diff) antes de un commit o merge, especialmente en código de seguridad, autenticación, concurrencia o refactors grandes. Antigravity revisa en modo solo lectura.
---

# Antigravity Review

Un segundo agente (Google Antigravity) audita de forma independiente los cambios locales (`git diff HEAD` + archivos nuevos sin seguimiento). Antigravity corre en modo solo lectura: puede leer el repositorio para obtener contexto, pero sus intentos de escritura se rechazan.

## Cómo se ejecuta
Usa la herramienta Bash con `timeout: 600000`. El foco es opcional; si no hay, deja el heredoc vacío.

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" review <<'AGY_EOF'
<foco opcional, ej. "seguridad del flujo de login">
AGY_EOF
```

## Qué hacer con la salida
El reporte trae: 1) seguridad e inyección, 2) bugs y condiciones de carrera, 3) rendimiento, 4) veredicto **APROBADO** / **REQUIERE ATENCIÓN**.
Antes de presentar un hallazgo como cierto, verifícalo en el código; Antigravity puede equivocarse. Si el wrapper falla, muestra su diagnóstico (p. ej. sugerirá `/antigravity:login` si la sesión no es válida).
