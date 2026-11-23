# Los equipos buscan en la wiki sin salir de Claude Code

## Historia

Como desarrollador quiero preguntar a la wiki desde la terminal para no cambiar de contexto.

## Contexto

Wiki del proyecto en Azure DevOps; el índice local se construye en src/rag/.

## Criterios de aceptación

- Dado un índice construido, cuando pregunto por "convenciones de commit", entonces la respuesta cita fichero y encabezado.
- Dado una pregunta sin respuesta en la wiki, cuando la formulo, entonces la respuesta es "no lo sé" y no cita nada.

## Fuera de alcance

- Edición de la wiki.
- Soporte de PDFs.

## Definición de hecho

- [ ] Tests de recuperación en verde.
- [ ] README actualizado y PR enlazada a la tarjeta.

## Estimación

M (2-3 días)

## Dependencias

- Módulo ingest (src/ingest/) mergeado.

## Riesgos

- El modelo de embeddings puede tardar en cargar la primera vez; mitigación: precalentarlo en el arranque.
