# El equipo consulta la versión de Brújula desde la terminal

## Historia
Como miembro del equipo que usa Brújula, quiero ejecutar `brujula --version` y ver la versión instalada, para saber si tengo la última antes de reportar un fallo o pedir ayuda.

## Contexto
Hoy Brújula no expone ningún comando de terminal: `package.json` no declara `bin`. Ya existe la función `version()` en `src/version.ts`, que lee y valida con zod el campo `version` de `package.json`, y está cubierta por `test/version.test.ts`. Falta el punto de entrada que la use.

## Criterios de aceptación
- **Dado** Brújula instalado, **cuando** ejecuto `brujula --version`, **entonces** se imprime en stdout exactamente la versión de `package.json` (por ejemplo `0.1.0`) y el proceso termina con código 0.
- **Dado** Brújula instalado, **cuando** ejecuto `brujula -v`, **entonces** obtengo la misma salida y el mismo código que con `--version`.
- **Dado** un `package.json` sin campo `version` o con un valor que no es texto, **cuando** ejecuto `brujula --version`, **entonces** se imprime en stderr un error claro y el proceso termina con código distinto de 0.
- **Dado** una opción desconocida, **cuando** ejecuto `brujula --foo`, **entonces** se imprime en stderr el uso disponible y el proceso termina con código distinto de 0.

## Fuera de alcance
- Otros subcomandos de la CLI (ayuda completa, ingesta, consultas al RAG).
- Publicar el paquete en un registro npm.
- Comprobar si hay una versión más reciente disponible.

## Definición de hecho
- [ ] Tests automáticos para los cuatro escenarios anteriores.
- [ ] `package.json` declara `bin` con el comando `brujula`.
- [ ] Documentado en el README cómo instalar el comando en local.
- [ ] `npm run check` en verde.
- [ ] Revisado por una persona del equipo.

## Estimación
S

## Dependencias
- Ninguna.

## Riesgos
- Que el comando lea un `package.json` distinto al instalado (por ruta relativa al directorio actual); mitigación: resolver la ruta desde el propio módulo, como ya hace `src/version.ts`.
- Que el ejecutable TypeScript no arranque sin compilar; mitigación: decidir el mecanismo de ejecución antes de implementar (ver preguntas abiertas).

## Preguntas abiertas
- ¿Cómo se ejecuta la CLI: compilando a JavaScript con `tsc` o lanzando TypeScript directamente con Node 22?
- ¿Cómo se instala el comando en el equipo (`npm link`, instalación global desde el repo u otra vía)? El paquete es `private`.

Work item: #22214 https://dev.azure.com/contoso-brains/9f83c449-7ae1-463d-9fa1-e196a55a6273/_workitems/edit/22214
