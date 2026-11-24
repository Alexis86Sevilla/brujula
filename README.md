# Brújula

Asistente del equipo dentro de Claude Code para trabajar con Azure DevOps. Sirve para que el
trabajo esté bien definido antes de empezarlo y bien revisado antes de entregarlo, sin salir de
Claude y sin necesidad de saber comandos.

Funciona en Windows (`cmd` o PowerShell) y en WSL/Linux.

## Qué hace

**Para quien gestiona el trabajo (PM)**

- Convierte una idea suelta en una tarjeta clara: resultado, por qué, qué cambia y cómo se sabe
  que está hecha. La revisa sola con un comprobador de formato.
- Monta un backlog completo de un tema (una Feature con sus historias) y lo publica en Azure Boards.
- Parte una historia en tareas de un día.

**Para quien lidera el equipo técnico (tech lead)**

- Juzga si una tarjeta está lista para implementarse y dice qué le falta.
- Registra las decisiones de arquitectura.

**Para quien programa**

- Prepara cualquier repositorio sin dejar rastro en él.
- Arranca una tarjeta: cita sus criterios, propone la rama, ejecuta los tests de partida y plantea
  un plan con un test por criterio.
- Prepara el commit y, si el proyecto las usa, la pull request enlazada a la tarjeta.
- Revisa el código antes de subirlo y explica partes del código que no conoces.

**Lo que hace solo, en segundo plano**

- No deja terminar un cambio con los tests en rojo.
- Bloquea secretos, ficheros sensibles (`.env`, lockfiles, configuración) y comandos peligrosos
  (`rm -r`, `git push --force`, push a `main` en proyectos con pull requests).
- **Siempre pide confirmación** antes de escribir en Azure Boards o en una pull request.

## Cómo funciona

Brújula es un plugin de Claude Code con cuatro piezas:

| Pieza          | Qué es                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skills         | Flujos guiados que Claude sigue: `tarjeta`, `backlog`, `publicar`, `empezar`, `pr-prep`, `bienvenida`, `doctor`…                                  |
| Agentes        | Ayudantes especializados de solo lectura: `refinador` (juzga tarjetas), `revisor` (revisa código), `explorer` (explora el repo)                   |
| Hooks          | Protecciones automáticas que se ejecutan antes y después de cada acción de Claude                                                                 |
| Servidores MCP | `ado`, el servidor oficial de Microsoft para Azure DevOps, y `brujula`, con las herramientas propias (convenciones, ADR, comprobador de tarjetas) |

La primera vez, Claude te da la bienvenida y te guía. Después le pides las cosas con tus palabras
("crea una tarjeta para…", "créame un backlog sobre…") o con su comando (`/brujula:tarjeta`).

## Instalación

Requisitos: Node.js 22 o superior, Git (en Windows, Git for Windows), Claude Code con tu sesión
iniciada y acceso de lectura a este repositorio.

    claude plugin marketplace add "https://github.com/Alexis86Sevilla/brujula.git"
    claude plugin install brujula@brujula-equipo

Al abrir `claude` te pide la organización de Azure DevOps y el método de inicio de sesión (deja el
navegador). Los pasos completos, cómo actualizar y qué hacer si algo falla están en
[ONBOARDING.md](ONBOARDING.md). Qué usar para cada tarea, en [docs/USO.md](docs/USO.md).

## Desarrollo del plugin

Node 22 y TypeScript (ESM). `npm install` y, antes de dar algo por hecho, `npm run check`
(typecheck, lint, formato y tests); `npm run check:plugin` valida además el plugin. Las decisiones
están en `docs/adr/` y las convenciones en `CLAUDE.md` y `.claude/rules/`.

El hook `secret-scan` bloquea los commits que añaden secretos. Para saltarlo en una sesión (decisión
humana, tras comprobar que es un falso positivo), arranca con `BRUJULA_ALLOW_SECRETS=1 claude`.
