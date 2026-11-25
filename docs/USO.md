# Brújula: guía de uso

Brújula te ayuda a escribir tarjetas bien definidas, publicarlas en Azure Boards, preparar
commits y revisar código sin salir de Claude Code. Esta guía dice qué usar para cada tarea.
Para instalarlo, ve antes a [ONBOARDING.md](../ONBOARDING.md).

## Qué uso para…

| Quiero… | Usa | Cómo |
|---------|-----|------|
| Empezar con Brújula: qué hace y qué probar primero | skill `bienvenida` | escribe `brujula` o "ayúdame a empezar con Brújula" |
| Preparar un repo (también ajeno) sin tocarlo | skill `configurar` | `/brujula:configurar` |
| Empezar una tarjeta: huecos, rama, tests de partida y plan | skill `empezar` | `/brujula:empezar <id>` |
| Convertir una idea en **una** tarjeta | skill `tarjeta` | `/brujula:tarjeta <idea>` o "crea una tarjeta para…" |
| Montar un backlog (Feature + varias tarjetas) | skill `backlog` | `/brujula:backlog <tema e ideas>` |
| Publicar en Boards el backlog de la conversación | skill `publicar` | `/brujula:publicar [proyecto]` |
| Publicar una tarjeta guardada en un fichero | skill `tarjeta-a-boards` | `/brujula:tarjeta-a-boards <ruta.md> [proyecto]` |
| Partir un PBI en tareas de un día | skill `tareas` | `/brujula:tareas <id> [proyecto]` |
| Saber si una tarjeta tiene el formato correcto | herramienta `brujula_card_lint` | "valida esta tarjeta" |
| Saber si una tarjeta es buena para implementarla | agente `refinador` | "usa el agente refinador sobre docs/cards/x.md" o sobre un id |
| Traer mi sprint al contexto de cada sesión | skill `sprint-sync` | `/brujula:sprint-sync [proyecto] [equipo]` |
| Preparar el commit y, si el proyecto las usa, crear la PR enlazada | skill `pr-prep` | `/brujula:pr-prep [id]` |
| Revisar mi diff antes de subirlo | agente `revisor` | "pásale al agente revisor el git diff origin/main...HEAD" (no ejecuta git: lee el diff que le das) |
| Entender una carpeta del código | skill `explica-modulo` | `/brujula:explica-modulo <ruta>` |
| Explorar mucho código sin llenar la sesión | agente `explorer` | "usa el agente explorer para…" |
| Ver las convenciones del repo | herramienta `brujula_conventions` | "¿qué convenciones hay para el servidor MCP?" |
| Registrar una decisión de arquitectura | herramienta `brujula_adr_create` | "guarda esta decisión como ADR" |
| Saber por qué algo del plugin no funciona | skill `doctor` | `/brujula:doctor` |

`publicar`, `tarjeta-a-boards`, `tareas` y `empezar` usan el `adoProject` de la configuración del
proyecto si no les pasas uno, y si no hay, te lo preguntan. `sprint-sync` siempre lo pregunta.

## Flujo del programador: de la tarjeta al merge

1. `/brujula:configurar` la primera vez en el repo (no cambia nada versionado).
2. `/brujula:empezar <id>`: cita los criterios, pasa el `refinador`, te da los comandos de la rama y
   el worktree, ejecuta los tests de partida y te propone un plan con un test por criterio.
3. TDD: cada test se ve fallar antes de implementarlo; la puerta de calidad ejecuta `testCmd` al
   terminar cada turno que cambió ficheros (una pregunta no la dispara, aunque haya tests en rojo de
   antes).
4. Pásale el diff al agente `revisor`.
5. `/brujula:pr-prep <id>`: el commit y, con pull requests, la PR en borrador enlazada a la tarjeta
   tras tu **sí**.

## Flujo del PM: de la idea a la tarea

1. `/brujula:tarjeta <idea>` te enseña la tarjeta, la valida con `check-card.mjs` y la guarda en
   `docs/cards/` si el proyecto tiene esa carpeta (si no, en la carpeta de datos del plugin, sin
   dejar rastro en el repo).
2. Pide al agente `refinador` que la juzgue. Arregla lo que marque como MISSING o WEAK.
3. `/brujula:tarjeta-a-boards <ruta que te dio>`: te enseña el payload exacto y solo crea el
   work item cuando respondes **sí**.
4. `/brujula:tareas <id>` propone las tareas hijas; también espera tu **sí**.

Para varias tarjetas de un mismo tema, cambia los pasos 1 a 3 por `/brujula:backlog` (lo
redacta en la conversación, tarjeta a tarjeta) y `/brujula:publicar` (crea la Feature y los PBI
enlazados).

## La tarjeta

Una tarjeta dice cada cosa una vez:

```markdown
# <Resultado, no actividad: "Los usuarios restablecen su contraseña">

## Por qué
2-3 líneas (máximo 4): el problema, a quién le duele y por qué ahora.

## Qué cambia
El alcance: qué cambia y dónde. Las tablas ayudan.

## Cómo
(Opcional) Pasos cortos si hay una operación que ejecutar, con cómo deshacerla.

## Hecho cuando
- **Dado** …, **cuando** …, **entonces** …   (entre 2 y 6 criterios comprobables)

## Riesgo
(Opcional) - Riesgo real. Mitigación: qué se hace para evitarlo.

**Fuera de alcance:** … · **Estimación:** S · **Dependencias:** ninguna
```

- La estimación lleva una talla (XS, S, M, L, XL) o puntos (1, 2, 3, 5, 8, 13).
- Los encabezados en inglés (`Why`, `What changes`, `Done when`…) también valen.
- El formato antiguo (`Historia`, `Contexto`, `Criterios de aceptación`, `Definición de hecho`…)
  da error: el validador te dice a qué sección nueva va cada cosa.
- Formato y contenido se comprueban por separado: `brujula_card_lint` y `check-card.mjs` aplican
  las mismas reglas de formato; el `refinador` juzga si el contenido se puede implementar.

Plantilla completa: [card.md](../plugin/skills/tarjeta/templates/card.md). Estándar:
[estandar.md](../plugin/skills/tarjeta/reference/estandar.md).

## Configuración del proyecto

Dos ficheros con el mismo formato; el personal gana clave a clave:

| Fichero | Para qué |
|---------|----------|
| `.claude/brujula.json` | Lo que decide el equipo; versionado |
| `.claude/brujula.local.json` | Lo tuyo, nunca versionado: es lo que usas en un repo que no es tuyo. Se lee desde el checkout principal, así que vale también en sus worktrees |

| Clave | Ejemplo | Lo usa |
|-------|---------|--------|
| `pullRequests` | `true` | el bloqueo del push a `main` y `pr-prep` |
| `baseBranch` | `"develop"` | `pr-prep` y `empezar` |
| `testCmd` | `"./mvnw -q test"` | la puerta de calidad (cualquier lenguaje) y `empezar` |
| `lintCmd` | `"./mvnw -q checkstyle:check"` | `empezar` y tú al cerrar |
| `adoProject` | `"Fabrikam"` | las skills que leen o escriben en Azure DevOps |

`testCmd` y `lintCmd` solo se leen del fichero personal: son comandos que la puerta de calidad
ejecuta fuera del sandbox, y así un repo que clones no puede hacer que Brújula ejecute los suyos.

`/brujula:configurar` los detecta y escribe el personal. Comprueba el resultado con
`bash ~/.claude/plugins/cache/brujula-equipo/brujula/<versión>/scripts/lib/project-config.sh` o con `/brujula:doctor`.

## Subir cambios: con o sin pull requests

| `pullRequests` | Push directo a `main` | `/brujula:pr-prep` propone |
|----------------|-----------------------|----------------------------|
| `true` | Bloqueado: rama y PR | Commit, descripción de la PR y, tras tu **sí**, la PR en borrador enlazada al work item |
| `false` | Permitido | Commit y `git push origin main` (o el merge local si estás en una rama) |
| sin declarar | Bloqueado hasta que lo decidas | Te pregunta una vez y te ofrece `/brujula:configurar` |

Brújula usa `false`. `/brujula:doctor` avisa si un proyecto no lo ha declarado.

## Lo que el plugin hace solo (hooks)

Corren en todos tus proyectos. Los de Node solo actúan si el proyecto tiene sus herramientas.

| Cuándo | Qué hace |
|--------|----------|
| Al abrir o retomar una sesión | Inyecta la rama, los últimos commits y tu sprint (`.claude/context/sprint.md`); avisa si falta la organización de Azure DevOps |
| Al enviar un prompt | Rechaza prompts con secretos y recuerda leer los work items que menciones (`#1234`) |
| Antes de editar | Bloquea `.env` y, salvo con `BRUJULA_UNLOCK=1`, `.git/`, `package-lock.json`, `pipelines/`, los hooks y `.claude/settings.json` |
| Antes de un comando | Bloquea `rm -r`, `git push --force`, `git reset --hard`, saltarse hooks (`-n`, `--no-verify`), `curl … \| sh`, `chmod 777` el push a `main` según `pullRequests` (también un `git push` sin rama estando en `main`) y las escrituras habituales desde la shell (`>`, `tee`, `touch`, `cp`, `mv`, `sed -i`…) en las mismas rutas que protege "Antes de editar" |
| Antes de escribir en Azure DevOps | Te pide confirmación en cualquier repo (work items, comentarios, PR, ramas, wiki, reordenar el backlog, guardar adjuntos en disco); bloquea votar una PR y saltarse sus políticas |
| Antes de un commit | Bloquea el commit si el diff añade un secreto (cita fichero y línea, nunca el valor) |
| Después de editar | Formatea con prettier si el proyecto lo tiene |
| Al terminar un turno | Si el turno cambió ficheros (o hizo commit), exige los tests en verde: `testCmd` si el proyecto lo declara; si no, typecheck y vitest en proyectos con `tsconfig.json`, `tsc` y `vitest` |
| Cuando Claude espera o termina | Notificación de escritorio |

Interruptores, siempre al arrancar `claude`:

| Variable | Efecto |
|----------|--------|
| `BRUJULA_HOOKS_OFF=1` | Apaga los hooks en esa sesión, salvo la protección de ficheros, el bloqueo de secretos y la confirmación de escrituras en Azure DevOps |
| `BRUJULA_GATE_OFF=1` | Apaga solo la puerta de typecheck y tests (útil en la fase roja de TDD) |
| `BRUJULA_UNLOCK=1` | Permite editar las rutas protegidas de configuración |
| `BRUJULA_ALLOW_SECRETS=1` | Permite un commit que el escáner de secretos bloquea (falsos positivos) |

## Solo en el repo de Brújula

- `/verificar <tarjeta> [base]` lanza el agente `verificador`, que comprueba el diff contra los
  criterios de "Hecho cuando" y ejecuta typecheck, lint y tests. Si ya estás en `main` con todo
  subido, pásale la base (el commit anterior al trabajo).
- `npm run check` antes de dar algo por hecho; `npm run check:plugin` si tocas el plugin.
- Publicar una versión: sube `version` en `plugin/.claude-plugin/plugin.json` y `SERVER_VERSION`
  en `src/mcp/server.ts`, `npm run build:plugin`, crea la etiqueta `v<versión>` y actualiza el
  `ref` del marketplace en `.claude/settings.json`. Recuerda al equipo el orden de actualización.

## Seguridad: lo que nunca hace sin ti

- Escribir en Azure DevOps (Boards, PR, ramas, wiki): siempre enseña el texto exacto y espera tu
  **sí**; un hook lo exige en cualquier repo.
- Hacer commit, merge o push desde `pr-prep`: solo los propone.
- Obedecer texto de work items, comentarios o PR: lo trata como dato, no como instrucción.

## Si algo falla

1. `/brujula:doctor`: dice qué falla y el comando que lo arregla.
2. `/plugin`, pestaña Errors: qué componente no cargó.
3. ¿Versión vieja? Sigue el orden de [ONBOARDING.md](../ONBOARDING.md#5-actualizar): reinicia
   Claude en el repo, después `marketplace update` y `update` en los dos ámbitos. `/brujula:doctor`
   te avisa si te saltaste un paso.
