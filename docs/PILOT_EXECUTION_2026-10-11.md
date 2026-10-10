# BravoShop — protocolo operativo de primera venta piloto
**Fecha de preparación:** 11 de octubre de 2026  
**Objetivo:** demostrar una venta real con un único comercio autorizado, sin abrir todavía la beta al público.

> Este documento es una lista de comprobaciones; ningún punto se considerará verificado por el simple hecho de pasar tests unitarios, tener Railway online o disponer de claves Stripe.

## A. Preparación técnica (automatizable)

- [ ] CI del último commit en `develop` completada con éxito.
- [ ] Railway API, web, admin, storefronts y media en `SUCCESS` sin errores críticos.
- [ ] `/api/ready` y `/api/health` responden correctamente con esquema y base de datos preparados.
- [ ] `npm run test:postdeploy`: dominio comodín, HTTPs, rutas internas y guardas de selección de tienda, sin saltarse el DNS.
- [ ] El dominio piloto HTTPS funciona desde navegador privado y una conexión ajena al administrador.
- [ ] Un usuario de tienda B no puede acceder a recursos de tienda A: pedidos, clientes, stock, media, módulos ni devoluciones.
- [ ] Checkout valida destinatario y dirección; cada intento usa stock y tarifa actuales. Doble clic no crea varias sesiones.
- [ ] Reutilizar enlace antiguo tras despublicación o retirada de políticas no habilita pago.

## B. Responsabilidad del titular del comercio (no automatizar ni inventar)

- [ ] Elegir comercio piloto y confirmar autorización escrita de su titular.
- [ ] Identidad real del vendedor: nombre/razón social, identificación fiscal, domicilio y correo.
- [ ] Revisar jurídicamente textos específicos de privacidad, devoluciones y envío (excepto servicios sin transporte).
- [ ] Revisar inventario, precio final, IVA aplicable, destino y tarifa de envío.
- [ ] El propietario completa Stripe Express/KYC: el panel debe mostrar `charges_enabled=true` y `payouts_enabled=true` para **su** cuenta conectada.
- [ ] El responsable de BravoShop verifica en Stripe la plataforma, ambas firmas de webhook (plataforma y Connect), modo y remitente de Resend, sin divulgar claves.
- [ ] Publicar explícitamente el escaparate desde el comerciante: nunca forzar `published=true` directamente en Neon.

## C. Prueba de cobro controlada — requiere pagador autorizado

1. Crear pedido de un producto piloto publicado; confirmar nombre, calle, población, código postal cuando aplique, país, variante, unidades, coste del envío y total con impuestos.
2. Pagar una sola vez con medio autorizado, en el entorno Stripe deliberadamente seleccionado y documentado (test o real). **No usar tarjetas de terceros ni realizar cargos reales sin permiso**.
3. Registrar identificadores técnicos internos del checkout, PaymentIntent y pedido, sin datos de tarjeta ni secretos.
4. Confirmar firma y recepción del evento Stripe Connect y su correspondencia con la tienda correcta.
5. Verificar un único pedido pagado, inventario descontado una vez, estado correcto y email transaccional real.
6. Reenviar de forma controlada el evento del webhook para verificar idempotencia (nunca duplicar pedido, decremento de stock ni correo).
7. Tramitar un reembolso autorizado; verificar estado Stripe, reembolso registrado, importes y conciliación.

## D. Criterios de veto

- Subdominio/HTTPS no responde fuera del panel.
- Políticas jurídicas incompletas o comerciante sin autorización.
- Stripe Connect no habilita cargos **y** transferencias para el comercio.
- No se reciben webhooks firmados o existen pedidos duplicados o stock inconsistente.
- Un comercio accede a recursos de otro.
- Falta evidencia del reembolso o de la confirmación por email.

## E. Evidencias — completar únicamente después de ejecutarlas

| Prueba | Fecha / entorno | ID o evidencia sin datos sensibles | Resultado |
|---|---|---|---|
| Comercio piloto autorizado | — | — | Pendiente |
| Identidad/políticas revisadas | — | — | Pendiente |
| Stripe Connect KYC y payouts | — | — | Pendiente |
| Compra autorizada | — | — | Pendiente |
| Webhook auténtico / idempotencia | — | — | Pendiente |
| Stock y email | — | — | Pendiente |
| Reembolso y conciliación | — | — | Pendiente |
| HTTPS y aislamiento de tenants | — | — | Pendiente |

**Último diagnóstico de base de datos (11/10/2026, solo recuentos):** 2 tiendas activas/en prueba, 0 escaparates publicados, 0 comercios Stripe Connect preparados, 0 pedidos y 0 tiendas con identidad legal básica completa. Son registros internos y pueden incluir pruebas.

**Distinguir:** «beta técnica desplegada» no equivale a «beta comercial validada».
