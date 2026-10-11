---
name: antigravity-delegate
description: Delega una tarea pesada o repetitiva (scaffolding, generación masiva de tests, creación de DTOs, mocks) al sub-agente Antigravity para ahorrar contexto en Claude Code.
---

# Antigravity Delegate

Esta habilidad delega trabajo intensivo de archivos locales a Google Antigravity (Gemini/Codex) en un subproceso aislado. El sub-agente realiza el trabajo sobre el disco y retorna únicamente un resumen ejecutivo de lo realizado ("Context Shielding").

## Cuándo usar
- Creación repetitiva de tests unitarios o mocks para múltiples módulos.
- Scaffolding de APIs, interfaces, DTOs o esquemas.
- Tareas intensivas en tokens que saturarían el contexto de Claude Code.

## Cómo se ejecuta
```bash
node ./bin/agy-wrapper.mjs delegate "Escribir tests unitarios con Vitest para src/auth.ts"
```
O directamente en Claude Code:
```text
/antigravity:delegate Escribir tests unitarios con Vitest para src/auth.ts
```

## Salida esperada
Un resumen con:
- Archivos creados o modificados.
- Cambios implementados.
- Pruebas ejecutadas y su resultado.
- Advertencias o pasos pendientes.
