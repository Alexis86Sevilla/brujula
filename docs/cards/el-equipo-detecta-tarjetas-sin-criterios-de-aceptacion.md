# El equipo detecta las tarjetas del backlog sin criterios de aceptación

## Historia
Como miembro del equipo que refina el backlog, quiero pedir al asistente, cuando lo necesite, que me avise de las User Story sin criterios de aceptación, para corregirla antes de que entre en un sprint.

## Contexto
El estándar de calidad de tarjetas de Brújula exige criterios de aceptación en formato Dado/cuando/entonces (ver `.claude/skills/tarjeta/reference/estandar.md`). Hoy no hay ningún aviso cuando una User Story del backlog de Azure Boards tiene vacío el campo Acceptance Criteria.

## Criterios de aceptación
- **Dado** una User Story del backlog con el campo Acceptance Criteria vacío, **cuando** pido al asistente que revise el backlog, **entonces** la tarjeta aparece en el aviso con su identificador y título.
- **Dado** una User Story con contenido en el campo Acceptance Criteria, **cuando** el asistente revisa el backlog, **entonces** esa tarjeta no aparece en el aviso.
- **Dado** una User Story cuyo campo Acceptance Criteria solo contiene espacios o HTML sin texto, **cuando** el asistente revisa el backlog, **entonces** se trata como tarjeta sin criterios y aparece en el aviso.
- **Dado** un backlog en el que todas las User Story tienen criterios, **cuando** pido la revisión, **entonces** el asistente responde que no hay User Story sin criterios.
- **Dado** un backlog con work items de otros tipos (Bug, Task) sin criterios, **cuando** pido la revisión, **entonces** esos work items no aparecen en el aviso.
- **Dado** que la API de Azure DevOps no responde o rechaza el acceso, **cuando** pido la revisión, **entonces** el asistente muestra un error claro y no afirma que el backlog está completo.

## Fuera de alcance
- Escribir o completar automáticamente los criterios que faltan.
- Evaluar la calidad de los criterios existentes (formato Dado/cuando/entonces, testabilidad).
- Revisar el resto de secciones del estándar (estimación, riesgos, etc.).
- Revisar tipos de work item distintos de User Story.
- Avisos automáticos al crear o editar una tarjeta, programados o fuera de Claude Code.
- Medir el impacto del aviso.

## Definición de hecho
- [ ] Tests automáticos para los escenarios de los criterios de aceptación, incluido el error de la API.
- [ ] Respuestas de la API de Azure DevOps validadas con zod.
- [ ] Documentado cómo pedir la revisión del backlog.
- [ ] Revisado por una persona del equipo.

## Estimación
S

## Dependencias
- Acceso de lectura a Azure Boards del proyecto del equipo.

## Riesgos
- Hay User Story con los criterios escritos en la descripción y no en Acceptance Criteria, lo que da falsos positivos; mitigación: documentar que la fuente es el campo Acceptance Criteria.
- Backlogs grandes pueden hacer lenta la revisión; mitigación: paginar las consultas a la API.
