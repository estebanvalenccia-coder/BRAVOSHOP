# BravoShop infrastructure

BravoShop is independent from Herencia Market.

## Data
Neon PostgreSQL is the source of truth for users, organizations, stores, catalog, inventory, customers, orders, subscriptions, feature flags, audit records and media metadata.

The browser never receives DATABASE_URL. All data access goes through the BravoShop API and every merchant request is checked against store_members before tenant data is read or changed.

## Media
Binary media is currently stored by the dedicated `bravoshop-media` Railway service on its persistent volume. Neon stores media metadata. Upload credentials never reach the browser permanently: BravoShop requests short-lived, store-scoped upload intents from the media service after validating the authenticated user and store. The storage interface remains provider-neutral so an object-storage provider such as Cloudflare R2 can replace the current backing store later without changing catalog code.

## Application surfaces
- bravoshop.online: public marketing and storefront routing.
- app.bravoshop.online: merchant administration.
- admin.bravoshop.online: platform control plane.
- api.bravoshop.online: authenticated API.

## Separation
No BravoShop environment variable, database, storage bucket or deployment should reuse a Herencia Market resource.
