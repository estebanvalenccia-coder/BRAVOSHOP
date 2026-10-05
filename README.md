# BravoShop

BravoShop es una plataforma SaaS multi-tenant para crear, personalizar, publicar y gestionar tiendas online profesionales para múltiples sectores.

## Principios del proyecto

- Plataforma neutral: moda, alimentación, belleza, tecnología, hogar, plantas, servicios y otros sectores.
- Arquitectura multi-tenant con aislamiento estricto por tienda.
- Dos superficies administrativas: Merchant Admin y BravoShop Super Admin.
- Configuración dinámica de planes, módulos, plantillas, IA y feature flags.
- Seguridad y permisos aplicados también en backend.
- Reutilización selectiva de aprendizajes/componentes de HERENCIAPP-MARKET sin modificar su producción.
- Desarrollo mediante entornos y cambios comprobables antes de producción.

## Dominios previstos

- `bravoshop.online` — web pública.
- `app.bravoshop.online` — administración de comerciantes.
- `admin.bravoshop.online` — Super Admin.
- `*.bravoshop.online` — storefronts de comerciantes.

## Estado

Proyecto inicializado. La siguiente fase es auditar HERENCIAPP-MARKET, definir la arquitectura multi-tenant y construir el núcleo de BravoShop.

> No copiar secretos, configuración de producción ni datos privados desde Herencia Market.
