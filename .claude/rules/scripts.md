---
paths:
  - "scripts/**"
---
# Scripts bash

- Cabecera `#!/usr/bin/env bash` y `set -euo pipefail` en todos los scripts. Motivo: sin
  ellos un fallo intermedio (o una variable vacía) sigue adelante y el script acaba "bien"
  habiendo hecho la mitad.
- Idempotentes: relanzar un script no duplica efectos (comprobar antes de crear, `mkdir -p`,
  sobrescribir en vez de añadir). Motivo: en un pipeline se reintenta, y un reintento no puede
  crear dos tarjetas ni dos comentarios.
- `claude -p` siempre con `--output-format json` y las herramientas acotadas con
  `--allowedTools`; la salida se valida (`jq -e`) antes de usarla. Motivo: sin restricciones el
  agente puede hacer cualquier cosa, y su salida en texto libre no es un contrato.
- Variables entre comillas (`"$var"`) y argumentos con nombre documentados en un comentario
  de uso al principio. Motivo: rutas con espacios rompen scripts sin comillas.
- Ficheros temporales con `mktemp` y limpieza con `trap '...' EXIT`. Motivo: un script
  interrumpido no debe dejar basura que cambie la siguiente ejecución.
- Errores a stderr y código de salida distinto de 0. Motivo: el pipeline y el agente solo
  distinguen fallo de éxito por el código de salida.
