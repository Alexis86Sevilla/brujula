# 0001. Vector store del RAG: SQLite + sqlite-vec

Estado: aceptada

## Contexto
El RAG sobre el wiki del equipo necesita almacenar embeddings. No podemos crear recursos en
Azure y el índice debe poder reconstruirse en local y en un pipeline.

## Decisión
SQLite con la extensión sqlite-vec, accedido desde Node con better-sqlite3.

## Consecuencias
- Un solo fichero local, sin servicio que mantener.
- La búsqueda híbrida (BM25 + vectores) se implementa sobre el mismo fichero.
- Cambiar de store exige un nuevo ADR.