---
paths:
  - "test/**"
  - "**/*.test.ts"
---
# Tests

- vitest. Un fichero de test por módulo de `src/`, en `test/` con la misma ruta.
- Sin red ni disco compartido: los tests usan ficheros temporales (`node:os` `tmpdir`) y se
  limpian solos. Motivo: tienen que correr igual en la máquina de cada uno y en el pipeline.
- Nombres de test como comportamiento: `rejects a card without acceptance criteria`.
- TDD estricto en lógica nueva: primero el test, verlo fallar por la razón correcta, luego la
  implementación mínima. No tocar un test para hacerlo pasar sin entender por qué fallaba.
