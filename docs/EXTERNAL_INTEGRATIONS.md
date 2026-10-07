# BravoShop — integración final de proveedores

Este documento define el último paso antes de habilitar venta real. BravoShop puede compartir cuentas de proveedor con Herencia cuando ambas aplicaciones pertenecen a la misma empresa, pero mantiene aislados los datos, sesiones, dominios y almacenamiento de cada producto.

## Variables que pueden reutilizar la misma cuenta/proveedor

### Stripe
- `STRIPE_SECRET_KEY`: puede pertenecer a la misma cuenta Stripe usada por Herencia.
- `STRIPE_PUBLISHABLE_KEY`: puede pertenecer a la misma cuenta Stripe.
- `STRIPE_WEBHOOK_SECRET`: **debe ser propio del endpoint webhook de BravoShop**. No reutilizar el signing secret del webhook de Herencia.

BravoShop usa Stripe Connect para que cada tienda conecte su propia cuenta de cobro. La plataforma no debe almacenar datos bancarios.

### Resend
- `RESEND_API_KEY`: puede reutilizar la misma cuenta Resend.
- `BRAVOSHOP_EMAIL_FROM`: debe ser un remitente/dominio autorizado para BravoShop. Puede usar el mismo dominio empresarial si está verificado en Resend.

### IA / proveedores comunes
Si BravoShop habilita posteriormente módulos de IA, las cuentas de Groq/Gemini pueden ser las mismas que Herencia, pero las variables deben configurarse explícitamente en BravoShop y sus límites/costes deben controlarse por separado.

## Variables y recursos que deben seguir separados

No copiar desde Herencia:
- `DATABASE_URL`
- `SESSION_SECRET` / `JWT_SECRET`
- variables `HERENCIA_*`
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
- tablas o memoria Neural de Herencia
- dominios `herenciamarket.es`
- CORS / frontend URLs de Herencia

### Archivos / R2
Se puede reutilizar la misma cuenta Cloudflare, pero BravoShop debe usar un bucket o prefijo exclusivo. Actualmente el MVP usa el servicio `bravoshop-media` con volumen Railway persistente de 5 GB.

## Dominios personalizados automáticos
BravoShop ya conoce:
- `BRAVOSHOP_RAILWAY_PROJECT_ID`
- `BRAVOSHOP_RAILWAY_ENVIRONMENT_ID`
- `BRAVOSHOP_STOREFRONT_SERVICE_ID`

Falta una credencial de Railway para que el runtime aprovisione dominios:
- preferida: `BRAVOSHOP_RAILWAY_PROJECT_TOKEN`
- alternativa: `BRAVOSHOP_RAILWAY_API_TOKEN`

No copiar tokens específicos de Herencia.

## Orden de activación recomendado

1. Añadir Stripe platform keys a `bravoshop-api`.
2. Crear en Stripe un webhook exclusivo para BravoShop y guardar su signing secret.
3. Confirmar que `/api/ready` devuelve `integrations.payments=true`.
4. Conectar una tienda de prueba mediante Stripe Connect.
5. Ejecutar una compra real de importe mínimo y comprobar pedido, inventario, cliente y webhook.
6. Añadir Resend y comprobar `integrations.notifications=true`.
7. Probar confirmación de pedido y una campaña a un correo controlado.
8. Ejecutar `REQUIRE_LIVE_INTEGRATIONS=1 npm run test:postdeploy` (o el equivalente del workflow) para exigir pagos y notificaciones reales antes del lanzamiento comercial.
9. Añadir token Railway para dominios personalizados y probar un dominio de prueba.
10. Ejecutar el smoke multitienda destructivo únicamente contra una base de datos aislada, nunca contra producción.

## Estado esperado antes del lanzamiento comercial

El código puede considerarse listo cuando CI, production readiness y los cinco servicios Railway estén verdes. La venta real requiere además:
- pagos = true
- notificaciones = true
- al menos una cuenta Stripe Connect de prueba completamente habilitada

Los dominios personalizados automáticos pueden activarse después sin bloquear el subdominio `*.bravoshop.online`.
