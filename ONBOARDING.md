# Brújula: instalación

Funciona en Windows (desde `cmd` o PowerShell) y en WSL/Linux. No hace falta instalar `jq` ni la
CLI de Azure: Azure DevOps se conecta iniciando sesión con tu cuenta de Microsoft en el navegador.

## Requisitos (una vez)

- **Node.js 22 o superior** (versión LTS de [nodejs.org](https://nodejs.org)).
- **Git**. En Windows, [Git for Windows](https://git-scm.com/download/win): trae Git Bash, que
  Claude Code usa para ejecutar las protecciones de Brújula.
- **Claude Code** con tu sesión iniciada.

El plugin se descarga de GitHub (repositorio público, sin credenciales) y trabaja contra tu
organización de Azure DevOps.

## 1. Instala

    claude plugin marketplace add Alexis86Sevilla/brujula
    claude plugin install brujula@brujula-equipo

Si ya lo tenías instalado desde Azure Repos, quita antes el marketplace anterior:
`claude plugin marketplace remove brujula-equipo`.

## 2. Primer arranque

Abre `claude` en cualquier carpeta. Claude Code te pide dos datos:

- **Organización de Azure DevOps**: lo que aparece en `dev.azure.com/<organización>`.
- **Cómo iniciar sesión**: deja `interactive` (navegador). Elige `azcli` solo si ya usas la CLI de
  Azure con `az login`.

Si no te los pide, escribe `/plugin configure brujula@brujula-equipo`. La primera vez que Brújula
use Azure DevOps se abrirá el navegador para que inicies sesión con tu cuenta de Microsoft.

## 3. Comprueba que funciona

La primera vez, Claude te da la bienvenida él solo: comprueba la instalación, te pregunta qué haces
en ese proyecto y te propone algo que probar. Si algo falla, escribe `/brujula:doctor`: dice qué
falla y cómo arreglarlo.

## 4. Actualizar

El orden importa. Cuando se publica una versión nueva:

1. Solo si trabajas en este repo (fija la versión con una etiqueta): `git pull`, cierra Claude y
   ábrelo otra vez aquí. Al arrancar, Claude Code registra la etiqueta nueva; sin este paso, el
   siguiente no encuentra nada que actualizar. Si instalaste Brújula con los comandos del paso 1,
   sáltate este paso.
2. En una terminal:

       claude plugin marketplace update brujula-equipo
       claude plugin update brujula@brujula-equipo --scope user && claude plugin update brujula@brujula-equipo --scope project

3. Cierra Claude y ábrelo de nuevo (no `--resume`).

Si `update` responde "already at the latest version" con la versión vieja, te has saltado el
paso 1. `/brujula:doctor` lo detecta y te dice qué ejecutar. No desinstales para arreglarlo:
no ayuda y borra tu configuración (`ado_org`).

Tras actualizar, si Azure DevOps no responde (Claude dice que no tiene acceso, o `/mcp` no muestra
`plugin:brujula:ado`): la actualización puede borrar la organización, y sin ella Claude Code no
arranca la conexión con Azure DevOps ni avisa. Escribe en Claude:

    /plugin configure brujula@brujula-equipo

Rellena la organización (lo que aparece en `https://dev.azure.com/<organización>`), deja el inicio
de sesión en `interactive` y reinicia Claude. Al arrancar, Brújula también te avisa si falta.

Por qué: este repo fija el marketplace a una etiqueta (`ref` en `.claude/settings.json`), no a
`main`. Los hooks y servidores MCP del plugin se ejecutan en la máquina de cada compañero, así que
solo cambian cuando alguien publica una etiqueta nueva y sube `version` en
`plugin/.claude-plugin/plugin.json`.

## Cómo se usa

La guía de uso, con qué usar para cada tarea, está en [docs/USO.md](docs/USO.md).

## Consejos

- Tras instalar o actualizar el plugin, cierra Claude y abre un `claude` nuevo (no `--resume`).
- Cada proyecto declara si usa pull requests, su rama base, su comando de tests y su proyecto de
  Azure DevOps: en `.claude/brujula.json` (versionado, lo decide el equipo) o en
  `.claude/brujula.local.json` (tuyo, nunca versionado). `/brujula:configurar` lo hace por ti.
  Detalles en `docs/USO.md`.
- Si un hook estorba en otro proyecto, arranca con `BRUJULA_HOOKS_OFF=1 claude` (en `cmd`:
  `set BRUJULA_HOOKS_OFF=1 && claude`). Siguen activos la protección de
  ficheros (`.env`, configuración), el bloqueo de secretos y la confirmación de escrituras en Azure
  DevOps.
- Las escrituras en Azure Boards siempre piden confirmación: lee el texto exacto antes de aprobar.

## Si algo falla

Ejecuta `/brujula:doctor`: dice qué falla y el comando exacto que lo arregla. Si no basta:

1. `/plugin`, pestaña Errors: qué componente no cargó y por qué.
2. `claude plugin details brujula`: inventario de lo cargado.
3. Un hook estorba en un proyecto: `BRUJULA_HOOKS_OFF=1 claude`.
4. `claude plugin validate ./plugin` si has modificado el plugin.
