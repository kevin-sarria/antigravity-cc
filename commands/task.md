---
description: Orquesta el pipeline dual-agent completo: especificación, codificación masiva por Gemini y auditoría con correcciones por Claude
allowed-tools: Bash(node:*)
---

Ejecuta con Bash el wrapper para iniciar la fase de codificación en disco por Gemini:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" task $ARGUMENTS
```

Una vez que Gemini termine de escribir los archivos y emita el resumen de ejecución:
1. Inspecciona los archivos modificados o creados en el repositorio.
2. Ejecuta las pruebas del proyecto (`npm test`, `pytest`, etc.).
3. Si encuentras errores de sintaxis, tipos, linter o edge cases, aplica las correcciones directamente en el código.
4. Muestra al usuario el reporte final consolidado de los cambios aplicados y el estado verificado.
