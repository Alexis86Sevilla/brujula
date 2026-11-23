# Brújula: instalación

Requisitos: WSL2 con Node.js 22, git, `az login` hecho, Claude Code con sesión iniciada y acceso
de lectura a este repo en Azure Repos.

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
- `/brujula:` muestra las skills (backlog, doctor, explica-modulo, pr-prep, pregunta-wiki,
  publicar, sprint-sync, tareas, tarjeta, tarjeta-a-boards).
- Pregunta: "Usa brujula_conventions y dime qué reglas devuelve". Debe llamar a la herramienta.
- `/brujula:doctor` termina con todas las comprobaciones en verde.

## 5. Actualizar

    claude plugin marketplace update brujula-equipo
    claude plugin update brujula@brujula-equipo

Luego `/reload-plugins` en las sesiones abiertas. Solo llega una versión nueva cuando sube
`version` en `plugin/.claude-plugin/plugin.json`.

## Si algo falla

Ejecuta `/brujula:doctor`: dice qué falla y el comando exacto que lo arregla. Si no basta:

1. `/plugin`, pestaña Errors: qué componente no cargó y por qué.
2. `claude plugin details brujula`: inventario de lo cargado.
3. Un hook estorba en un proyecto: `BRUJULA_HOOKS_OFF=1 claude`.
4. `claude plugin validate ./plugin` si has modificado el plugin.
