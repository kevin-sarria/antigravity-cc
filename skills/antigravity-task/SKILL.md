---
name: antigravity-task
description: Orquesta el pipeline dual-agent completo de desarrollo: Claude diseña la arquitectura y especificación técnica, Gemini/Antigravity codifica masivamente en disco, y Claude audita, corre pruebas y corrige el resultado.
---

# Antigravity Task (Dual-Agent Pipeline)

Utiliza esta habilidad cuando el usuario invoque `/antigravity:task <requerimiento>` o solicite la implementación autónoma de una funcionalidad o módulo completo combinando la inteligencia de **Claude Code** y **Google Antigravity (Gemini)**.

## Protocolo de Ejecución en 4 Fases

### Fase 1: Arquitectura y Refinamiento (Claude Code)
1. Analiza el requerimiento del usuario y el estado del repositorio actual.
2. Si el requerimiento es informal o ambiguo, refínalo internamente en una especificación técnica sólida:
   - Contratos de interfaces y esquemas de datos.
   - Rutas de archivos a crear/modificar.
   - Reglas de validación, seguridad y permisos requeridos.
   - Casos de prueba automatizados que deben implementarse.

### Fase 2: Delegación y Codificación en Disco (Gemini / Antigravity)
Invoca el comando del wrapper con la especificación técnica:
```bash
node ./bin/agy-wrapper.mjs task "<especificación técnica detallada>"
```
O bien:
```text
/antigravity:task <especificación técnica detallada>
```
El sub-agente Gemini:
- Creará físicamente todos los archivos en el disco local.
- Escribirá el código fuente, componentes, lógica de negocio y tests unitarios.
- Retornará únicamente un *digest* condensado con los archivos modificados y resultados de ejecución.

### Fase 3: Auditoría y Control de Calidad (Claude Code)
Al recibir la señal de finalización de Gemini:
1. Inspecciona los archivos creados/modificados utilizando herramientas de lectura de archivos.
2. Ejecuta la suite de pruebas local del proyecto (`npm test`, `pytest`, etc.).
3. Si detectas fallos de linter, errores de tipos, edge cases o bugs sutiles, aplica las correcciones directamente en el código.

### Fase 4: Entrega al Usuario
Presenta un informe claro y ejecutivo que incluya:
- Resumen de la solución implementada.
- Lista de archivos creados o actualizados.
- Estado de las pruebas automatizadas (todas pasando).
- Sugerencias o próximos pasos para que el usuario decida.
