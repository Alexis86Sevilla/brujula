# Las claves de la API de pagos están rotadas en QA y prod sin cortes

## Por qué
La clave actual de la pasarela de pagos apareció en un log compartido y se considera comprometida.
Mientras siga activa, quien la tenga puede emitir cobros contra nuestra cuenta.

## Qué cambia
Clave nueva en la pasarela y en los tres servicios que la usan, en cada entorno:

| Servicio | Variable |
|---|---|
| API de pedidos | `PAYMENTS_API_KEY` |
| Worker de reembolsos | `REFUNDS_PAYMENTS_KEY` |
| Panel de administración | `ADMIN_PAYMENTS_KEY` |

## Cómo
1. Primero en QA, después en prod.
2. Crear la clave nueva en la consola de la pasarela sin revocar la antigua (admite dos a la vez).
3. Cambiar las tres variables y reiniciar los servicios uno a uno.
4. Comprobar "Hecho cuando" y solo entonces revocar la clave antigua.
5. Vuelta atrás: mientras la antigua no esté revocada, basta con volver a poner su valor en la variable.

## Hecho cuando
- **Dado** la clave nueva, **cuando** se crea un pedido de prueba, **entonces** el cobro se autoriza.
- **Dado** la clave nueva, **cuando** se revisa el log de los tres servicios, **entonces** no aparece `401 invalid_api_key`.
- **Dado** la clave antigua revocada, **cuando** se llama a la API con ella, **entonces** responde `401 invalid_api_key`.

## Riesgo
- Olvidar una variable deja ese servicio sin cobros al revocar la antigua; mitigación: no revocar hasta comprobar los tres servicios.

**Fuera de alcance:** limpiar el log donde apareció la clave · **Estimación:** S · **Dependencias:** acceso de administrador a la consola de la pasarela
