# BravoShop · Activación legal para lanzamiento público

BravoShop y Herencia son negocios independientes: **no copiar datos fiscales, identidad
comercial, credenciales ni contratos de Herencia**.

Las rutas `/aviso-legal` y `/privacidad` muestran un aviso de publicación pendiente
hasta que el build público incluya estos cinco valores **públicos y verificados**:

| Variable de Vite para `bravoshop-web` | Dato público |
|---|---|
| `VITE_BRAVOSHOP_LEGAL_NAME` | Titular, razón social o nombre comercial legal |
| `VITE_BRAVOSHOP_TAX_ID` | NIF/CIF |
| `VITE_BRAVOSHOP_LEGAL_ADDRESS` | Domicilio legal o profesional que se debe publicar |
| `VITE_BRAVOSHOP_LEGAL_EMAIL` | Contacto del prestador del servicio |
| `VITE_BRAVOSHOP_PRIVACY_EMAIL` | Dirección para ejercicio de derechos RGPD |

Configurar estas variables en Railway en el servicio público `bravoshop-web`.
Al ser `VITE_*`, estarán incorporadas en el HTML/JS público tras recompilarse:
**nunca poner secretos en variables `VITE_*`**.

Completar los campos no sustituye una revisión jurídica de las políticas de
privacidad, encargados de tratamiento, cookies, condiciones de contratación,
renovación/cancelación de suscripciones ni obligaciones fiscales, y no certifica
la legitimidad de los datos declarados.

## Puerta de lanzamiento comercial

1. Usar una cuenta Stripe propia de BravoShop, separada de Herencia; verificar LIVE fuera de la app.
2. Crear un comerciante piloto real, con tienda y cuenta Connect habilitada para cobros y pagos.
3. Registrar evidencias de un pedido pagado, webhook idempotente, reembolso y suscripción Stripe activa.
4. Verificar envío real y recepción de emails, inventario, storefront DNS/HTTPS y permisos entre tiendas.
5. Ejecutar `BravoShop commercial readiness` manualmente (sin escrituras) y exigir **éxito**.
6. Publicar identidad legal verificada y revisar las políticas con la asesoría correspondiente.
7. Confirmar que los datos ficticios `smoke-*` no se muestran como comercios reales.

Las pruebas automáticas de deploy no equivalen a habilitar el comercio.
