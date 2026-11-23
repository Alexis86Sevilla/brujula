# El equipo consulta la versión de Brújula desde la terminal

## Por qué
Antes de reportar un fallo nadie sabe qué versión de Brújula tiene instalada: no hay comando de terminal (`package.json` no declara `bin`).
Ya existe `version()` en `src/version.ts`, validada con zod y cubierta por `test/version.test.ts`; falta el punto de entrada.

## Qué cambia
- Comando `brujula` declarado en `bin` de `package.json`, con `--version` y `-v`.
- README: cómo instalar el comando en local.

## Hecho cuando
- **Dado** Brújula instalado, **cuando** ejecuto `brujula --version`, **entonces** se imprime en stdout exactamente la versión de `package.json` (por ejemplo `0.1.0`) y el proceso termina con código 0.
- **Dado** Brújula instalado, **cuando** ejecuto `brujula -v`, **entonces** obtengo la misma salida y el mismo código que con `--version`.
- **Dado** un `package.json` sin campo `version` o con un valor que no es texto, **cuando** ejecuto `brujula --version`, **entonces** se imprime en stderr un error claro y el proceso termina con código distinto de 0.
- **Dado** una opción desconocida, **cuando** ejecuto `brujula --foo`, **entonces** se imprime en stderr el uso disponible y el proceso termina con código distinto de 0.

## Riesgo
- Que el comando lea un `package.json` distinto al instalado (ruta relativa al directorio actual); mitigación: resolver la ruta desde el propio módulo, como ya hace `src/version.ts`.
- Que el ejecutable TypeScript no arranque sin compilar; mitigación: decidir el mecanismo de ejecución antes de implementar (ver preguntas abiertas).

**Fuera de alcance:** otros subcomandos, publicar en npm, avisar de versiones nuevas · **Estimación:** S · **Dependencias:** ninguna

## Preguntas abiertas
- ¿Cómo se ejecuta la CLI: compilando a JavaScript con `tsc` o lanzando TypeScript directamente con Node 22?
- ¿Cómo se instala el comando en el equipo (`npm link`, instalación global desde el repo u otra vía)? El paquete es `private`.

Work item: #22214 https://dev.azure.com/contoso-brains/9f83c449-7ae1-463d-9fa1-e196a55a6273/_workitems/edit/22214
