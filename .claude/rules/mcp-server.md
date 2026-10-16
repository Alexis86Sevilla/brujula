---
paths:
  - "src/mcp/**"
  - "test/mcp/**"
---
# Servidor MCP de Brújula

- stdout es el canal del protocolo. Nunca `console.log`, `process.stdout.write` ni salidas de
  librerías que escriban ahí. Logs a stderr con `console.error`. Motivo: un solo byte extra en
  stdout corrompe la conexión y el cliente muestra un error de transporte sin pista.
- Cada herramienta tiene nombre en `snake_case` con prefijo `brujula_`, una descripción que
  dice CUÁNDO usarla (no solo qué hace) y un esquema `zod` en `.strict()`. Motivo: el modelo
  elige herramientas por nombre y descripción; un esquema permisivo recibe argumentos inventados.
- Los errores de herramienta devuelven un mensaje accionable para el modelo ("falta el campo X,
  valores válidos: ...") con `isError: true`, no un stack trace. Motivo: el agente reintenta con
  lo que lea.
- La salida de una herramienta se acota (máx. unos pocos miles de tokens). Si hay más,
  paginar. Motivo: toda la salida entra en el contexto del agente.