# Notas del corpus (wiki de Azure DevOps)

Fuente: análisis estructural de `~/repos/wiki` (2026-10-19). No se leyó el contenido de las páginas.

## 1. Estructura
- 79 ficheros `.md`, profundidad máxima 5 (lo habitual, 2–3). Patrón de Azure: `X.md` junto a la carpeta `X/`.
- Sin frontmatter (0/79): el título sale del primer `# ` o del nombre del fichero.
- Páginas cortas: mediana ≈30 líneas y máximo 285 (`Drools-cheatsheet`). Hay páginas vacías.
- 48/79 páginas tienen encabezados; 31 no tienen ninguno (toda la página es una sección con `headingPath = []`).
- 19 ficheros con bloques de código y 13 con tablas.
- Nombres con codificación URL (`%2D`): hay que decodificarlos al mostrar títulos y rutas.

## 2. Parámetros de `chunkMarkdown`
- `maxChars`: subir de 800 a **~1500**. A ~40–50 caracteres por línea (estimación sin medir), una página
  mediana ocupa 1200–1500 caracteres, así que la mayoría de las secciones caben en un solo chunk y conservan
  su contexto. Con 800, muchas páginas de 30 líneas se partirían sin necesidad. Habría que medir los
  caracteres reales antes de fijar el valor.
- `overlapLines`: **1–2**. Al ser páginas cortas habrá pocos cortes, y el solapamiento solo importa en las
  páginas largas (cheatsheet, integraciones). Si pasa de 2, se repiten filas de tabla sin su cabecera.
- Los bloques de código no se parten nunca (spec), así que el cheatsheet puede dar chunks grandes, y es aceptable.

## 3. `ignoreDirs`
- Los valores por defecto (`.git`, `.attachments`, `node_modules`) ya cubren el corpus: los 55 adjuntos
  viven en `.attachments`.
- `.order`, png, docx, pdf, pptx y sql no son `.md`: `findMarkdownFiles` ya los excluye y no hace falta añadirlos.
- Queda pendiente decidir si `Versiones/` es histórico; si lo es, hay que añadirlo (ver el riesgo 1).

## 4. Riesgos para el RAG
1. **Páginas obsoletas**: no hay frontmatter con fecha ni estado. El agente puede citar documentación
   caducada como si estuviera vigente. Mitigación: guardar la fecha del último commit (`git log`) en cada
   chunk y mostrarla al citar; valorar excluir `Versiones/`.
2. **Tablas**: una tabla es un único bloque y no se parte, pero el solapamiento puede llevar filas sueltas
   sin cabecera al chunk siguiente, y una tabla grande puede superar `maxChars`. Mitigación: mantener
   `overlapLines` bajo y, en el futuro, repetir la cabecera.
3. **Contenido sensible**: nadie ha revisado si hay secretos o datos de clientes (y los `.sql` de
   `.attachments` lo hacen sospechar). Mitigación: escanear antes de indexar y aplicar una lista de
   exclusión según `.claude/rules/rag.md`. Las páginas vacías deben filtrarse antes de generar embeddings.
