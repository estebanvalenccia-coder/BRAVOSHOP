# BravoShop — aceptación integral de la primera tienda piloto

**El objetivo de este runbook es confirmar una primera tienda que pueda vender de forma legítima y aislada.**
Verde en GitHub, Railway y el panel de preparación **no** equivale a haber procesado una venta ni acredita liquidación o cumplimiento legal.

## Preparación

- Administrador General: `https://admin.bravoshop.online` → **Lanzamiento beta**. Buscar por nombre, subdominio o ID: la búsqueda consulta todas las tiendas activas/no retiradas, no solo la muestra inicial de 120.
- Propietario autorizado: `https://app.bravoshop.online` → abrir su tienda y completar los apartados marcados en **Inicio**.
- No insertar pedidos, activar suscripciones artificialmente, copiar secretos Stripe por chat, suplantar identidades ni enviar pagos sin autorización.

## Las siete fases y sus pruebas de aceptación

| Fase | Responsable | Acciones reales | Aceptación verificable |
|---|---|---|---|
| 1. Cuenta y plan | Propietario / plataforma | Crear comercio, verificar la titularidad, completar el trial válido o suscribirse desde **Plan y suscripción** | Estado `active` o `trial` con suscripción o prueba vigente; login sin acceso a otros comercios |
| 2. Catálogo y diseño | Propietario | Publicar un producto, variante con precio, inventario disponible y elegir plantilla | Catálogo muestra al menos una variante realmente vendible y el diseño se previsualiza |
| 3. Legal, envíos y correos | Propietario / plataforma | Completar identidad, fiscalidad, privacidad, devoluciones y envío por país con tarifa activa; confirmar remitente Resend | Validación legal, zona con tarifa (salvo servicios) y notificaciones habilitadas |
| 4. Cobro | Propietario / administrador Stripe | Realizar KYC Stripe Connect y confirmar `charges_enabled`, `payouts_enabled`, claves, webhooks y modo correcto | Cuenta Connect activa y conexión de plataforma operativa, **sin simular cobros** |
| 5. Publicación | Propietario | Publicar expresamente desde **Inicio**, confirmar catálogo y checkout, revisar interruptor global | Escaparate visible en dominio HTTPS, compra no accesible antes de completar condiciones |
| 6. Compra, webhook y correo | Comprador que consiente + operadores | Desde navegador ajeno al admin realizar compra controlada autorizada | Confirmar cargo en Stripe, PaymentIntent, webhook firmado `payment_intent.succeeded` procesado, pedido persistido una sola vez, stock consumido y confirmación recibida |
| 7. Reembolso y aislamiento | Operadores autorizados | Reembolsar con autorización, comprobar conciliación, reintentar webhook y acceder con segunda cuenta ajena | Reembolso finalizado y stock consistente, ningún duplicado, email correcto, cuenta B obtiene 403/404 ante datos privados de A |

### Evidencia que el panel puede recuperar automáticamente

Para una misma tienda el panel toma el **último pedido cobrado por Stripe** (incluye los que fueron reembolsados), comprueba en la base de datos:

1. `orders.paid_at`, `orders.payment_provider='stripe'` y `provider_payment_id` como registro de compra cobrada.
2. `stripe_webhook_events` con `payment_intent_id` idéntico, estado `processed` y tipo `payment_intent.succeeded`.
3. `notification_outbox` `order.confirmed` de ese pedido con estado `sent`.
4. `order_refunds` del mismo pedido con `status='succeeded'` y referencia de Stripe.

Estos indicadores **no** sustituyen comprobar el pago en Stripe ni la recepción humana del correo. Una señal `sent` significa que el proveedor aceptó el envío, no que la persona abrió o recibió el email.

Si el último pedido es posterior a uno verificado previamente, el panel puede mostrar una prueba parcial nueva. No mezcla evidencias de varios pedidos para declararlas completas.

El endpoint de estado `/api/ready` incluye `commercial_evidence.coherent_pilot`. Solo se vuelve verdadero cuando los registros de Connect, suscripción y un pedido Stripe con su webhook y reembolso corresponden a una misma tienda y a un mismo pedido. Es una verificación de **consistencia de registros**, no una certificación externa de Stripe LIVE.

### Condiciones que siempre requieren comprobación externa

- Navegador de comprador independiente: acceso HTTPS al dominio real, carrito, país/tarifa correcta, totales e impuestos, redirecciones, pago y visualización del recibo.
- Autorización por segundo tenant: usuario con acceso solo a tienda B no puede leer ni editar pedidos, clientes, pagos ni stock de tienda A. Repetir con petición directa al API, no solo ocultando botones.
- Conciliación: correlacionar cargo y devolución en el Dashboard oficial de Stripe, comprobar idempotencia del webhook y estado de stock; no basta con que existan las filas.
- Verificar entrega efectiva del email y consentimiento de compra/devolución; no inferirlos por un registro de envío.

### Cierre

La beta pública permanece **cerrada** hasta que el propietario haya aprobado los siete bloques con evidencia, los tests automáticos sean verdes, HTTPS y aislamiento estén comprobados, y el cobro/reembolso piloto estén reconciliados. Nunca marcar resultados falsos para superar una puerta de salida.

### Comandos técnicos sin mutaciones

```sh
npm run check
npm run test:postdeploy
```

El segundo comando comprueba API, media, planes, esquema, dominios, SPA y aislamiento de rutas de forma no destructiva. No realiza compras reales ni reemplaza las pruebas con un segundo tenant.
