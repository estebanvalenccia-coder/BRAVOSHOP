# BravoShop media providers

BravoShop does not couple product media to one storage vendor.

Current provider:
- Supabase Storage

Planned provider:
- Cloudflare R2 through a server-side signed-upload endpoint.

The browser must never receive R2 secret credentials. The future R2 provider will request short-lived signed upload URLs from the BravoShop backend.

Database rows in media_assets remain provider-neutral so stores can be migrated without changing product/catalog code.
