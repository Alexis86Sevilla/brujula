# Reducir a segundos la consulta de documentación del equipo

## Historia
Como desarrollador del equipo, quiero preguntar a la wiki desde Claude Code y recibir la respuesta con la página citada, para no interrumpir a un compañero ni buscar a mano.

## Contexto
La wiki del proyecto tiene unas 120 páginas y la búsqueda de Azure DevOps solo encuentra coincidencias literales. Ver ADR-0003 y la página "Onboarding/Herramientas".

## Criterios de aceptación
- **Dado** una pregunta cuya respuesta está en la wiki, **cuando** la hago desde Claude Code, **entonces** recibo la respuesta y al menos una cita con página y encabezado.
- **Dado** una pregunta que la wiki no cubre, **cuando** la hago, **entonces** recibo "no lo sé" y ninguna cita inventada.

## Fuera de alcance
- Indexar fuentes que no sean la wiki.
- Editar páginas de la wiki desde el asistente.

## Definición de hecho
- [ ] Tests automáticos para los dos escenarios anteriores.
- [ ] Documentado en la wiki cómo reindexar.
- [ ] Revisado por una persona del equipo.

## Estimación
M

## Dependencias
- Acceso de lectura al repositorio de la wiki.

## Riesgos
- Páginas con información obsoleta pueden dar respuestas erróneas; mitigación: mostrar la fecha de última modificación en la cita.