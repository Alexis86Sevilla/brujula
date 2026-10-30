# ADR-0002: Usar un servidor MCP stdio propio con el SDK v2 de TypeScript

- Status: proposed
- Date: 2026-10-30

## Context
Queremos que cualquier agente acceda a las reglas y a los ADR del equipo con esquemas validados. La alternativa considerada eran scripts sueltos, que cada agente invoca a su manera y sin validar argumentos.

## Decision
Exponemos las reglas, los ADR y el estándar de tarjetas mediante un servidor MCP stdio propio (brujula), escrito con el SDK v2 de TypeScript, en lugar de scripts sueltos.

## Consequences
Más fácil: cualquier cliente MCP (Claude Code, el Inspector) descubre las tools y valida argumentos con zod; las reglas y el estándar de tarjetas se sirven desde una sola fuente (tools, recursos y prompts); la lógica se testea con un cliente en memoria sin levantar el proceso. Más difícil: stdout queda reservado al protocolo y un solo console.log rompe la conexión; hay que registrar el servidor en .mcp.json; el Inspector no hereda el entorno del shell, así que BRUJULA_ROOT se pasa con -e. A revisar: dependemos del SDK v2 y del Inspector 2.x, que cambian deprisa; la UI web del Inspector no conectó desde WSL.
