# Brújula: instalación

Requisitos: WSL2 con Node.js 22, git, `jq` (sin él, las protecciones del plugin no funcionan),
la CLI de Azure con `az login` hecho, Claude Code con sesión iniciada y acceso de lectura a este repo
en Azure Repos. `/brujula:doctor` comprueba todo lo que puede y te dice qué falta.

## 1. Credenciales de git (una vez)

Claude Code clona el marketplace con el `git` de tu máquina y sin poder preguntarte nada.
Comprueba que no te pide credenciales:

    GIT_TERMINAL_PROMPT=0 git ls-remote "https://github.com/Alexis86Sevilla/brujula.git" HEAD

Debe imprimir un hash. Si falla, configura Git Credential Manager o una clave SSH
(ver `docs/credenciales.md`) y repite.

## 2. Instalar

    claude plugin marketplace add "https://github.com/Alexis86Sevilla/brujula.git"
    claude plugin install brujula@brujula-equipo

Para habilitarlo solo en un repo concreto, usa `--scope project` en el segundo comando y haz
commit de `.claude/settings.json`. En este repo no hace falta: `.claude/settings.json` ya
registra el marketplace y habilita el plugin cuando aceptas la confianza de la carpeta.

## 3. Primer arranque

Abre `claude` en cualquier proyecto. Claude Code te pedirá `ado_org`: el nombre de tu
organización de Azure DevOps (lo que aparece en `dev.azure.com/<org>`). Si no lo pide,
ejecuta `/plugin configure brujula@brujula-equipo`.

Ejecuta `/mcp`: `plugin:brujula:brujula` y `plugin:brujula:ado` deben aparecer conectados.

## 4. Comprobar que funciona

En una sesión de `claude`:

- `/plugin` lista `brujula@brujula-equipo` como habilitado.
- `/brujula:` muestra las skills (backlog, bienvenida, configurar, doctor, empezar, explica-modulo, pr-prep,
  publicar, sprint-sync, tareas, tarjeta, tarjeta-a-boards).
- Pregunta: "Usa brujula_conventions y dime qué reglas devuelve". Debe llamar a la herramienta.
- `/brujula:doctor` termina con todas las comprobaciones en verde.

## 5. Actualizar

El orden importa. Cuando se publica una versión nueva:

1. Trae los cambios del repo (`git pull`), cierra Claude y ábrelo otra vez en este repo. Al
   arrancar, Claude Code registra la etiqueta nueva del marketplace; sin este paso, el siguiente
   no encuentra nada que actualizar.
2. En una terminal:

       claude plugin marketplace update brujula-equipo
       claude plugin update brujula@brujula-equipo --scope user && claude plugin update brujula@brujula-equipo --scope project

3. Cierra Claude y ábrelo de nuevo (no `--resume`).

Si `update` responde "already at the latest version" con la versión vieja, te has saltado el
paso 1. `/brujula:doctor` lo detecta y te dice qué ejecutar. No desinstales para arreglarlo:
no ayuda y borra tu configuración (`ado_org`).

Por qué: este repo fija el marketplace a una etiqueta (`ref` en `.claude/settings.json`), no a
`main`. Los hooks y servidores MCP del plugin se ejecutan en la máquina de cada compañero, así que
solo cambian cuando alguien publica una etiqueta nueva y sube `version` en
`plugin/.claude-plugin/plugin.json`.

## Primeros pasos

Abre `claude` y sigue lo que te diga: la primera vez, Claude te da la bienvenida, comprueba él
mismo que todo está bien instalado, te pregunta qué haces en ese proyecto y te propone una primera
cosa que probar. Para verlo otra vez, escríbele "ayúdame a empezar con Brújula".

La guía completa de uso está en `docs/USO.md`.

## Consejos

- Tras instalar o actualizar el plugin, cierra Claude y abre un `claude` nuevo (no `--resume`).
- Cada proyecto declara si usa pull requests, su rama base, su comando de tests y su proyecto de
  Azure DevOps: en `.claude/brujula.json` (versionado, lo decide el equipo) o en
  `.claude/brujula.local.json` (tuyo, nunca versionado). `/brujula:configurar` lo hace por ti.
  Detalles en `docs/USO.md`.
- Si un hook estorba en otro proyecto: `BRUJULA_HOOKS_OFF=1 claude`. Siguen activos la protección de
  ficheros (`.env`, configuración), el bloqueo de secretos y la confirmación de escrituras en Azure
  DevOps.
- Las escrituras en Azure Boards siempre piden confirmación: lee el texto exacto antes de aprobar.

## Si algo falla

Ejecuta `/brujula:doctor`: dice qué falla y el comando exacto que lo arregla. Si no basta:

1. `/plugin`, pestaña Errors: qué componente no cargó y por qué.
2. `claude plugin details brujula`: inventario de lo cargado.
3. Un hook estorba en un proyecto: `BRUJULA_HOOKS_OFF=1 claude`.
4. `claude plugin validate ./plugin` si has modificado el plugin.
