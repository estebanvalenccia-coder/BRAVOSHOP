# BravoShop media providers

BravoShop does not couple product media to one storage vendor.

Current provider:
- The dedicated `bravoshop-media` Railway service.
- Binary files live on its persistent Railway volume.
- `MEDIA_SIGNER_URL` and `MEDIA_SIGNER_TOKEN` connect the API to that service.
- Upload URLs are short-lived and include the store-scoped object path.

Optional future provider:
- Cloudflare R2, S3-compatible storage, or another backend can implement the same signer contract.

The browser never receives long-lived storage credentials. Neon keeps provider-neutral rows in `media_assets`, so storage can be migrated without changing product/catalog ownership rules.
