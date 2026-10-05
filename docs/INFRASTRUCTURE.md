# BravoShop infrastructure

BravoShop is independent from Herencia Market.

## Data
Neon PostgreSQL is the source of truth for users, organizations, stores, catalog, inventory, customers, orders, subscriptions, feature flags, audit records and media metadata.

The browser never receives DATABASE_URL. All data access goes through the BravoShop API and every merchant request is checked against store_members before tenant data is read or changed.

## Media
Cloudflare R2 stores binary media. Neon stores media metadata. Upload credentials never reach the browser permanently. BravoShop requests short-lived upload intents from a dedicated media signer after validating the authenticated user and store.

## Application surfaces
- bravoshop.online: public marketing and storefront routing.
- app.bravoshop.online: merchant administration.
- admin.bravoshop.online: platform control plane.
- api.bravoshop.online: authenticated API.

## Separation
No BravoShop environment variable, database, storage bucket or deployment should reuse a Herencia Market resource.
