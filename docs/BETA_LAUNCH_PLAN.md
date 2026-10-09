# BravoShop — lanzamiento beta comercial controlado

**Prioridad actual:** vender con una tienda piloto real, no imitar todas las funciones de Shopify o Wix. Este documento define criterios de salida comprobables; ni CI verde ni servicios ONLINE significan cobros verificados.

## Evidencia inicial (9 de octubre de 2026)

- Railway: cinco servicios ONLINE/SUCCESS en la última inspección.
- Neon: dos planes comerciales con importes válidos.
- Neon: cero tiendas con Stripe Connect activo, cobros y transferencias habilitados.
- Neon: cero pedidos registrados y cero escaparates publicados en `store_settings.settings.published`.
- Hay numerosas tiendas de pruebas potenciales; no contarlas automáticamente como clientes reales. **No borrar datos de pruebas sin permiso explícito**.
- El panel Super Admin → **Lanzamiento beta** muestra requisitos por comercio y está protegido con autenticación de superadministrador.

## Alcance mínimo de la beta

1. **Cuenta y tienda:** alta, inicio de sesión, creación y aislamiento de tenant.
2. **Catálogo real:** un producto activo, variante con precio, inventario comprobado.
3. **Configuración comercial:** plan vigente, diseño, información legal, envío cuando proceda y correo transaccional.
4. **Cobro:** conectar y verificar la cuenta Stripe Express del comercio (charges y payouts enabled), más claves de plataforma y webhooks válidos.
5. **Publicación:** publicar explícitamente el escaparate. La publicación de catálogo no garantiza checkout si faltan requisitos comerciales.
6. **Compra piloto:** realizar un pago controlado, verificar recepción y autenticidad del webhook, comprobar pedido, inventario y confirmación por correo.
7. **Recuperación:** comprobar reembolso y conciliación sin duplicados con webhook repetido.
8. **Comprobación exterior:** visitar el subdominio con HTTPS y hacer una compra desde un navegador ajeno al Administrador General.
9. **Control de riesgos:** corroborar que un usuario de otra tienda no accede a pedidos, clientes, inventario ni pagos del piloto.

## Puertas de calidad

- `npm run check`: sintaxis backend, pruebas y build.
- `npm run test:postdeploy`: salud, planes, DNS, SPA y rutas de aislamiento (técnico).
- Workflow manual `commercial-readiness.yml`: exige credenciales de pagos y emails de plataforma, pero **no demuestra una compra real**.
- Panel **Lanzamiento beta**: solo indica requisitos técnicos por tienda. Un pedido Stripe registrado no sustituye la comprobación humana del pago, webhook, reembolso y conciliación.
- No habilitar una beta abierta sin los puntos 6, 7, 8 y 9. Registrar manualmente la fecha y los resultados del ensayo.

## Trabajo aplazado para después de la primera venta

Importación completa de ZIP React/Vite/GitHub, edición libre de componentes tipo Wix Studio, despliegues de miles de tiendas, soporte empresarial, analítica avanzada, afiliados, marketplace de apps y automatizaciones de marketing. Evitar expandir el alcance hasta pasar las puertas de calidad.

## Dependencias que requieren acción autorizada

- Un propietario debe completar el onboarding KYC de su cuenta Stripe Connect.
- La persona que administra Stripe debe confirmar cuentas, webhooks y modo prueba/real, sin compartir claves por chat.
- Para una transacción real es necesario consentimiento del pagador y coordinación del reembolso.
- Nunca simular ingresos ni activar cobros de comercios ajenos para pasar un test.
