# ADR-0003: Usar node:sqlite con FTS5 para el índice de la documentación

- Status: accepted
- Date: 2026-10-30

## Context
Sustituye al ADR 0001 (SQLite + sqlite-vec con better-sqlite3). El corpus del RAG pasa a ser docs/ del propio repo (11 ficheros Markdown, 72 KB) en lugar del clon de la wiki. Con un corpus tan pequeño la búsqueda vectorial apenas mejora a la léxica y el umbral de abstención no se puede calibrar, así que se descartan embeddings, sqlite-vec y RRF. Sin sqlite-vec desaparece el motivo principal para better-sqlite3 (cargar extensiones), y Node 22 trae SQLite integrado con FTS5.

## Decision
El índice usa node:sqlite (integrado en Node 22) con una tabla FTS5 y puntuación BM25, aislado detrás de un módulo pequeño. No usamos embeddings, sqlite-vec ni better-sqlite3.

## Consequences
Más fácil: ninguna dependencia nativa ni modelo que descargar; el índice sigue siendo un solo fichero local. Más difícil: las preguntas que no comparten palabras con el documento (paráfrasis) no se recuperan; node:sqlite es experimental en Node 22 e imprime un aviso por stderr. A revisar: si el corpus crece o pasa a ser la wiki del equipo, reconsiderar la búsqueda vectorial; si la API de node:sqlite cambia, solo se toca el módulo que la aísla.
