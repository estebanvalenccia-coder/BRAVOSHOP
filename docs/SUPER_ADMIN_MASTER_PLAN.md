# BravoShop — Mandato de Super Admin y Centro de Frontends

Registro de requisitos procedentes del diálogo con el propietario. Este archivo es una **lista de comprobación de desarrollo**, no una declaración de funcionalidades ya completadas. Revisarlo en cada bloque/PR antes de informar de avances.

## Super Admin: 12 áreas de producto

- [ ] Centro financiero con ingresos realmente cobrados (MRR, ARR, comisiones, costes, beneficio e impagos).
- [ ] Tiendas 360°: ficha por comerciante, actividad, plan, ventas, estado, historial técnico y de suscripción.
- [ ] Gestión avanzada de suscripciones Stripe: prorrateos, periodos de prueba, cobros fallidos, facturas, cambios de plan.
- [ ] Soporte a comerciantes: tickets, prioridades, SLA, chat, seguimiento, acceso temporal con consentimiento y auditoría.
- [ ] Seguridad: roles granulares, MFA, sesiones, cambios sensibles, auditoría y cumplimiento.
- [ ] Analítica real multitienda: ventas, conversión, retención y abandono.
- [ ] Stripe Control Center: cuentas conectadas, reembolsos, disputas y conciliación; separado de las suscripciones SaaS.
- [ ] Marketplace y módulos: permisos, límites, activación, precios y versiones por tienda y plan.
- [ ] IA centralizada: modelos, tokens, límites, costes y alertas por comercio.
- [ ] Monitor técnico: API, hosting, base de datos, checkout, colas, webhooks, dominios, SSL, copias, alertas.
- [ ] Automatizaciones comerciales: impagos, onboarding, reactivación, abandono, renovación.
- [ ] Crecimiento: referidos, afiliados, campañas, marketing y conversión.

## Centro de Frontends / plantillas

- [x] Estructura API Super Admin, migración y auditoría para bibliotecas de temas/versiones (PR #25).
- [x] Borradores y editor visual básico de secciones: agregar, quitar, duplicar, reordenar, mostrar/ocultar, editar textos/botones/imagen (PR #25).
- [x] Inspección de ZIP sin ejecutar código; soporte manifiesto nativo y HTML de referencia (PR #25).
- [x] Crear tiendas desde control propietario, asignando usuario ya registrado (PR #25).
- [x] Ver enlaces de tiendas y sus plantillas/versiones instaladas (PR #25).
- [x] Historial inmutable de versiones, simulación previa, despliegue explícito y merge que respeta personalizaciones (PR #25).
- [ ] Integrar y validar en producción todas las operaciones anteriores tras migraciones, CI y pruebas funcionales.
- [x] Vista previa con escaparate real (productos de tienda seleccionada) y tema temporal enviado desde Super Admin, con tamaños móvil/tablet/desktop (Centro de Frontends, octubre de 2026).\n- [ ] Previsualización fideligna por dispositivo de frontend existente **y del borrador** sin publicar, mediante ruta aislada.
- [x] Importación confirmada de imágenes ZIP locales en almacenamiento propio, con asociación segura a la plantilla y selector visual (PR #26).
- [ ] Biblioteca de recursos multimedia compartidos con permisos/licencias y reutilización por plantillas.
- [x] Ordenación arrastrando secciones, tipografías, logo, enlaces del menú y controles de posición/zoom de imágenes (Centro de Frontends, octubre de 2026).\n- [ ] Drag-and-drop completo, edición en el lienzo, cuadrícula, tipografías, navegación y componentes reutilizables.
- [ ] Edición de funcionalidades de botones con acciones permitidas, sin ejecutar JavaScript arbitrario.
- [x] Actualización manual de hasta 25 tiendas por lote con prevalidación y resultado individual, sin borrar borradores (PR #27).
- [ ] Actualizaciones masivas por tipo de plantilla o conjunto de tiendas, con lotes, estado y compensaciones/reintentos.
- [ ] Política de adopción automática opt-in, exclusiones por tienda y mantenimiento de overrides por campo (más fino que por sección).
- [ ] Diferenciar actualizaciones de diseño de cambios de código/funcionalidades, con tests y release independiente.
- [x] Restauración de una versión publicada al borrador central con revisión optimista; no modifica tiendas instaladas (Centro de Frontends, octubre de 2026).\n- [ ] Revertir una actualización de forma fiable con vista previa por tienda y registro.
- [ ] Importación/exportación de plantillas BravoShop y procedencia/historial.
- [ ] Importación guiada desde GitHub y ZIP de React/Vite/HTML: mapa de componentes, imágenes, páginas y conexiones con catálogo, checkout y pagos; sandbox sin ejecución privilegiada.
- [ ] Duplicación segura de tienda sin copiar credenciales, pedidos, datos personales ni cuentas Stripe.
- [ ] Capturas y etiquetas por sector: moda, belleza, hogar, plantas, servicios, alimentación, tecnología y otros.
- [ ] Integrar límites de plan, permisos del comerciante y distribución de módulos comprados.
- [ ] Pruebas E2E de alta, importación, cambios en tienda, promoción, reversión y aislamiento tenant.

## Reglas no negociables

1. El Super Admin y el Merchant Admin deben estar segregados; ningún usuario normal podrá invocar endpoints de control.
2. No ejecutar código arbitrario procedente de ZIP/GitHub en el mismo origen ni en el backend.
3. Los datos y los secretos de Herencia Market no pasan a BravoShop al importar un diseño.
4. Una nueva versión no sobrescribe sin confirmación cambios personales de comerciantes.
5. Probar antes de fusionar; migrar datos antes de exponer endpoints nuevos. No comunicar “listo en producción” sin comprobarlo.
6. Monitorizar errores reales y evitar estados simulados. Registrar cada cambio de gran impacto.
7. Revisar esta lista durante el trabajo activo. No se ejecuta ningún proceso continuo de 5 minutos fuera de una sesión; las automatizaciones no pueden tener una frecuencia inferior a una hora.
