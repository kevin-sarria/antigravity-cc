---
name: antigravity-explore
description: Usar ANTES de investigar el código por tu cuenta cuando responder una pregunta exigiría leer muchos archivos o buscar sin saber dónde está algo (¿dónde se calcula X?, ¿cómo fluye Y de la API a la base de datos?, ¿quién usa Z?, ¿qué falta para implementar W?). Antigravity lee el repositorio en solo lectura y devuelve un resumen corto con archivo:línea, y así esas lecturas no llenan tu contexto. No usar si ya sabes qué 1-3 archivos mirar.
---

# Antigravity Explore

Cada archivo que lees se queda en tu contexto el resto de la sesión y se vuelve a pagar en cada respuesta. Antigravity puede leer por ti y devolverte solo lo que importa.

## Cuándo usarlo
- Tendrías que leer más de ~4 archivos, o abrir archivos largos, para responder.
- No sabes dónde vive algo y habría que buscar por varias carpetas.
- Necesitas entender un flujo completo (frontend → API → servicio → base de datos) antes de cambiarlo.
- Vas a planear una tarea y necesitas el mapa de lo que existe.

## Cuándo NO
- Ya sabes qué 1-3 archivos mirar: léelos tú (con `offset`/`limit` si son largos).
- Basta con un `Grep` para encontrar la línea.
- La respuesta corre prisa y es pequeña: Antigravity tarda entre 30 s y 2 min.

## Cómo se ejecuta
Usa la herramienta Bash con `timeout: 600000`. Escribe una pregunta concreta, con el contexto que ya tengas (qué buscas y para qué):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/agy-wrapper.mjs" explore <<'AGY_EOF'
¿Dónde se valida el stock al crear una venta y qué pasa si dos ventas llegan a la vez? Lo necesito para añadir reservas de stock.
AGY_EOF
```

Para repreguntar sobre la misma investigación sin repetir el contexto, empieza el texto con `--resume`.

## Qué hacer con la respuesta
1. Trabaja con el resumen y los punteros `archivo:línea`. No releas archivos completos para "comprobar" lo que ya dice.
2. Cuando vayas a editar, lee solo el rango que necesitas (`Read` con `offset`/`limit` alrededor de la línea indicada).
3. Si el resumen dice que algo no lo pudo confirmar, verifícalo tú en ese punto concreto.
4. Al usuario no le pegues la respuesta entera: dile la conclusión con tus palabras, más la línea final "🛰️ Respondido por Antigravity CLI" tal cual.
