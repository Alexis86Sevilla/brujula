# Brújula

Plugin y toolkit de Claude Code para un equipo en Azure DevOps. Node 22, TypeScript ESM,
vitest, zod. Se construye por módulos; lo que aún no existe está marcado como (futuro).

## Comandos
- Todo en verde antes de dar algo por hecho: `npm run check` (typecheck + lint + format + tests)
- Tests: `npm test`. Un solo fichero: `npx vitest run test/ruta/fichero.test.ts`
- Un test por nombre: `npx vitest run -t "nombre del test"`
- Formatear: `npm run format`
- Comprobar este fichero: `npm run claude-md:check`
- Comprobar el entorno: `npm run env:check` (si existe)

## Reglas
- Imports relativos con extensión `.js` (`import { x } from "./x.js"`), aunque el fichero sea
  `.ts`. Motivo: ESM con `NodeNext` exige la extensión resuelta; sin ella falla en runtime
  aunque el typecheck pase.
- Validar con `zod` todo dato que cruza un límite (ficheros leídos, argumentos de herramientas
  MCP, respuestas de la API de Azure DevOps). Motivo: el agente alucina formas de datos; el
  esquema las rechaza con un error claro.
- En `src/mcp/` aplican reglas propias (stdout reservado al protocolo): ver
  `.claude/rules/mcp-server.md`.
- No usar `any`. Usar `unknown` y estrechar con zod. Motivo: `strict` solo protege si no hay
  agujeros explícitos.

## Lo que no es obvio
- Los textos de usuario y las tarjetas de trabajo se escriben en español; el código, los
  comentarios, los nombres de ficheros y de commits, en inglés.
- La fuente del RAG es un clon local del wiki de Azure DevOps (un repo git). Nunca indexar
  ficheros con secretos ni datos de clientes. Ver `.claude/rules/rag.md` (futuro).
- Los work items siguen un estándar de calidad fijo: título como resultado, historia o
  problema, contexto, criterios en Given/When/Then, fuera de alcance, definición de hecho,
  tamaño, dependencias y riesgos. Lo implementa la skill `tarjeta` (futuro, módulo 3).

## Flujo
- Rama desde `main`, commits en Conventional Commits, PR pequeñas.
- No dar nada por hecho sin ejecutar `npm run check` y mostrar su salida.
- Antes de un cambio de más de dos ficheros, proponer plan y esperar confirmación.

## Al compactar
Conserva siempre: la lista de ficheros modificados, el comando de test que se está usando,
las decisiones tomadas y lo que queda pendiente.