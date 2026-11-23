# El equipo detecta las tarjetas del backlog sin criterios de aceptación

## Por qué
Las User Story entran en el sprint con el campo Acceptance Criteria vacío y nadie lo ve hasta que hay que implementarlas.
El estándar de tarjetas exige criterios comprobables (`plugin/skills/tarjeta/reference/estandar.md`), pero hoy no hay ningún aviso.

## Qué cambia
Al pedírselo, el asistente revisa el backlog de Azure Boards y lista las User Story con Acceptance Criteria vacío (identificador y título).
Las respuestas de la API se validan con zod.

## Hecho cuando
- **Dado** una User Story con Acceptance Criteria vacío, o con solo espacios o HTML sin texto, **cuando** pido la revisión, **entonces** aparece en el aviso con su identificador y título.
- **Dado** una User Story con criterios, o un work item de otro tipo (Bug, Task) sin ellos, **cuando** pido la revisión, **entonces** no aparece en el aviso.
- **Dado** un backlog en el que todas las User Story tienen criterios, **cuando** pido la revisión, **entonces** el asistente responde que no hay User Story sin criterios.
- **Dado** que la API de Azure DevOps no responde o rechaza el acceso, **cuando** pido la revisión, **entonces** el asistente muestra un error claro y no afirma que el backlog está completo.

## Riesgo
- User Story con los criterios en la descripción dan falsos positivos; mitigación: documentar que la fuente es el campo Acceptance Criteria.
- Backlogs grandes hacen lenta la revisión; mitigación: paginar las consultas a la API.

**Fuera de alcance:** completar los criterios, juzgar su calidad, avisos automáticos o fuera de Claude Code · **Estimación:** S · **Dependencias:** acceso de lectura a Azure Boards del proyecto
