# Credenciales de git para el marketplace

Claude Code ejecuta el `git` de la máquina sin terminal: una credencial que git tuviera que
pedir falla en silencio. Hay que dejarla guardada antes. Nunca pongas un token en este repo.

## Vía usada en este equipo: Git Credential Manager de Windows desde WSL

    git config --global credential.helper "/mnt/c/Program\ Files/Git/ucrt64/bin/git-credential-manager.exe"
    git config --global credential.https://dev.azure.com.useHttpPath true

La ruta del ejecutable depende de la instalación de Git for Windows (en otras versiones está en
`mingw64/bin`). La primera vez abre el navegador de Windows para iniciar sesión.

## Alternativas

- SSH: clave sin passphrase cargada en `ssh-agent`, `ssh.dev.azure.com` en `known_hosts` y la
  URL `git@github.com:Alexis86Sevilla/brujula.git`.
- PAT de solo lectura (Code: Read), caducidad corta, guardado con el gestor de credenciales.
  Con `credential.helper store` queda en texto plano en `~/.git-credentials`: solo si es de
  ámbito mínimo.

## Comprobación

    GIT_TERMINAL_PROMPT=0 git ls-remote "https://github.com/Alexis86Sevilla/brujula.git" HEAD

Debe imprimir un hash sin preguntar nada. `/brujula:doctor` hace la misma comprobación.
