# BravoShop media providers

BravoShop does not couple product media to one storage vendor.

Current provider:
- A server-side signed-upload microservice (`MEDIA_SIGNER_URL`), decoupled from this repo.

Planned provider:
- Cloudflare R2 through that same signed-upload endpoint.

The browser must never receive R2 secret credentials. The future R2 provider will request short-lived signed upload URLs from the BravoShop backend.

Database rows in media_assets remain provider-neutral so stores can be migrated without changing product/catalog code.
