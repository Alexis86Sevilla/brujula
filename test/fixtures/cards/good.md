# El equipo consulta la versión de Brújula desde la terminal

## Por qué

Cuando algo falla nadie sabe qué versión del plugin tiene instalada y hay que abrir ficheros a mano.

## Qué cambia

Un comando `brujula --version` que imprime la versión de `plugin.json`.

## Hecho cuando

- [ ] `brujula --version` imprime la misma versión que `plugin/.claude-plugin/plugin.json`.
- [ ] Con un `plugin.json` ilegible, el comando sale con código 2 y un mensaje claro.

**Fuera de alcance:** actualizar el plugin · **Estimación:** XS · **Dependencias:** ninguna
