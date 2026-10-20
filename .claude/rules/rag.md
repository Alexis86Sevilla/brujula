---
paths:
  - "src/rag/**"
  - "test/rag/**"
---
# RAG sobre el wiki

- Nunca indexar secretos ni datos de clientes: el indexador aplica una lista de exclusión
  explícita (`.env*`, `*.pem`, `*.key`, rutas de clientes) y rechaza fragmentos que parezcan
  credenciales. Motivo: lo indexado acaba en respuestas que cualquiera del equipo puede leer.
- Solo se indexa el clon local del wiki de Azure DevOps; ninguna otra ruta. Motivo: limitar la
  fuente es lo único que garantiza que no entra nada que no debería.
- Cada fragmento guarda su fuente (ruta del fichero, encabezado de sección y commit del wiki).
  Motivo: sin fuente no se puede citar ni reindexar solo lo que cambió.
- Toda respuesta generada cita las fuentes de los fragmentos usados; si no hay fragmentos
  relevantes, se dice que no hay información en vez de responder. Motivo: una respuesta sin
  cita no se puede verificar y el modelo rellena huecos inventando.
- Vector store: SQLite con `sqlite-vec`, en local. Motivo: no podemos crear recursos en Azure.
- Fragmentos y metadatos que se leen del índice se validan con `zod`. Motivo: un índice viejo
  con otro formato debe fallar con un error claro, no devolver basura.
