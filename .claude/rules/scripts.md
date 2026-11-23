---
paths:
  - "scripts/**"
  - "**/*.sh"
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
- Con `set -o pipefail`, nunca `cmd | head` ni `cmd | grep -q`: cuando el segundo comando cierra la
  tubería, el primero muere por SIGPIPE (código 141) y el script falla o toma la rama equivocada.
  Usar `git log -n 20`, o guardar la salida en una variable y comprobarla después. Motivo:
  `finish-course.sh` se paró dos veces así en la terminal del usuario.
- Un script no está terminado hasta que se ha ejecutado entero una vez en un entorno desechable
  (clon en `mktemp -d`, perfil vacío). `bash -n` solo comprueba la sintaxis. Para los comandos de
  servicios externos (`az`, APIs) que no se pueden ejecutar ahí, contrastar cada combinación de
  parámetros con la documentación antes de entregarlo. Motivo: `--valid-duration 720` con
  `--queue-on-source-update-only false` falló en Azure; la documentación exige 0.
