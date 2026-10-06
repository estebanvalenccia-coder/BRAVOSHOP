# BravoShop

BravoShop es una plataforma SaaS multi-tenant para crear, personalizar, publicar y gestionar tiendas online profesionales para múltiples sectores.

## Principios del proyecto

- Plataforma neutral: moda, alimentación, belleza, tecnología, hogar, plantas, servicios y otros sectores.
- Arquitectura multi-tenant con aislamiento estricto por tienda.
- Dos superficies administrativas: Merchant Admin y BravoShop Super Admin.
- Configuración dinámica de planes, módulos, plantillas, IA y feature flags.
- Seguridad y permisos aplicados también en backend.
- Proyecto, usuarios, datos, base de datos y despliegues independientes de Herencia Market.
- Desarrollo mediante entornos y cambios comprobables antes de producción.

## Dominios previstos

- `bravoshop.online` — web pública.
- `app.bravoshop.online` — administración de comerciantes.
- `admin.bravoshop.online` — Super Admin.
- `*.bravoshop.online` — storefronts de comerciantes.

## Estado

BravoShop usa Neon PostgreSQL como fuente de datos y mantiene las migraciones en
`database/migrations`. La API ya centraliza el contexto de tienda, permisos tenant y
verificación de dominios/Stripe. La preparación completa para producción aún requiere
ejecutar migraciones y pruebas de integración en una base Neon aislada, además de validar
los servicios externos de Stripe, DNS/TLS y almacenamiento multimedia.

> No copiar secretos, configuración de producción ni datos privados desde Herencia Market.
