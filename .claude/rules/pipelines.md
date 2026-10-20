---
paths:
  - "pipelines/**"
---
# Azure Pipelines

- Ningún secreto en el YAML: tokens, claves y cadenas de conexión vienen de un variable group
  enlazado a Key Vault. Motivo: el YAML vive en git y cualquier valor escrito ahí queda en el
  historial para siempre.
- Las variables secretas se declaran como secretas (`isSecret`/Key Vault) y se pasan a los
  scripts por `env:`, nunca interpoladas con `$(VAR)` en la línea de comandos. Motivo: Azure
  solo enmascara lo que sabe que es secreto, y la interpolación lo expone en el log del paso.
- Nunca `echo`, `set -x` ni `printenv` en pasos que manejan secretos. Motivo: el log del
  pipeline es visible para todo el proyecto.
- Variables no secretas en un bloque `variables:` al principio o en una plantilla, con nombres
  en `UPPER_SNAKE_CASE`. Motivo: el agente debe encontrar en un sitio qué se puede configurar.
- Pasos repetidos en plantillas de `pipelines/templates/` con `parameters:` tipados. Motivo:
  copiar pasos entre pipelines hace que diverjan sin que nadie lo note.
- Fijar versiones de tareas (`Task@2`) e imágenes (`ubuntu-24.04`, no `ubuntu-latest`).
  Motivo: un cambio de versión ajeno rompe el pipeline sin ningún commit nuestro.
