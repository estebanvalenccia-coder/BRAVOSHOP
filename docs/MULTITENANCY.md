# BravoShop multi-tenancy

## Data and connection model

BravoShop uses a shared PostgreSQL database and schema hosted on Neon. The API connects
through `@neondatabase/serverless` and `DATABASE_URL`; there is no Supabase runtime or
Supabase migration path in the active backend. The browser never connects to Neon directly.
Tenant isolation is enforced by API authorization and scoped SQL, not by PostgreSQL RLS.

RLS is intentionally not enabled yet. The current Neon HTTP driver usage has not been
validated for transaction-local tenant settings on every request path. Do not add policies
until the connection/transaction behavior has been tested against the deployed Neon setup.

## Identity and tenant context

`app_users` identifies people. `store_members` connects a user to each store and stores
the tenant role. A user may therefore belong to multiple stores.

Merchant routes use this middleware order:

1. `requireAuth` verifies the signed session and reloads the active user from Neon.
2. `resolveTenant` reads only `req.params.storeId`, validates its UUID format, and resolves
   an active membership. Values from `req.body.store_id` and `req.query.store_id` are ignored.
3. The middleware sets `req.store`, `req.storeId`, `req.membership`, and `req.permissions`.
4. Sensitive routes call `requirePermission(...)` before running their handler.

Missing membership is returned as a generic 403 with the same message regardless of whether
the store exists. Resource IDs that are not owned by the resolved store return 404.
`SUPER_ADMIN` is platform authorization in `requireSuperAdmin`; it is not a store role and
does not bypass tenant membership checks.

Public storefront requests are intentionally different: public store selection is resolved
from a normalized hostname that must match a store subdomain or a verified custom domain.
The legacy `host` query/body selector remains for the existing preview/storefront client,
but it grants access only to data already public on that storefront. It must never be reused
for merchant-private endpoints.

## RBAC

Tenant permissions are defined centrally in `server/middleware/permissions.js`. Roles are
lowercase database values (`owner`, `admin`, `manager`, `staff`, `support`, `viewer`).
Routes should use permission middleware rather than comparing role strings. Platform
Super Admin checks remain separate.

Store owners and admins can manage team members through the merchant panel. This first
version adds existing active BravoShop accounts by email; it does not send email invitations
or create accounts on their behalf. Owners may assign the `admin` role, while admins cannot
create, edit, or remove another admin. No team-management route can transfer, demote, or
remove the owner. Removing a member marks the membership inactive, so the account itself and
its access to other stores remain unchanged.

## Query-scoping rule

Every tenant-owned query must use `req.storeId` from resolved server context. For child
resources, first scope the parent to the store or join through a parent already scoped to
that store. Never use a client-provided store ID as authority.

```js
const rows = await sql`
  select * from orders
  where id=${req.params.id}::uuid
    and store_id=${req.storeId}::uuid
`;
```

For variants, inventory, media attachments, shipping rates, refunds, or other indirect
resources, prove ownership through the parent/store relation before changing data.
Use 404 for cross-store resource IDs.

## Payments and webhooks

Connected account IDs are looked up from `store_payment_accounts` using the resolved
checkout/order store. Payment webhooks require a Connect `event.account` match with that
store's account; the checkout store in metadata is checked as a secondary consistency
signal, not as the authority. Refunds resolve their order and payment account through the
store-scoped order.

The checkout completion and refund reservation functions in PostgreSQL serialize critical
updates. Duplicate successful-payment events are also deduplicated by `event_id`. Continue
to make every webhook side effect idempotent; do not rely only on Stripe's delivery behavior.

## Domains and media

Store slugs are normalized to lowercase ASCII and reserved platform subdomains are rejected.
Custom domains are scoped to a store, globally unique case-insensitively, and remain pending
until a one-time TXT token is observed. Only verified custom domains resolve public
storefront data and receive a reflected, exact-origin CORS allowance over HTTPS. DNS routing
and TLS provisioning still require deployment infrastructure.

Media upload keys are generated server-side beneath the store-specific
`{store_id}/library/` prefix. Upload completion consumes a short-lived, store-scoped intent;
the public URL is taken from that intent rather than from the completion request. Media list,
delete, and product-attachment operations must remain scoped to the current store.

## Audit and request IDs

The API validates or generates a request ID and returns it in `X-Request-Id`. Sensitive
platform and tenant actions should write `audit_log` entries with actor, store, action,
resource, request ID, IP, and user agent where available. Do not log cookies, auth tokens,
passwords, payment secrets, or unnecessary customer data.

## Tests

Run `npm run test:unit` for SQL splitting, tenant-context source, role permissions, permission
middleware, and hostname normalization. The CI build runs this suite before building the
frontend.

`npm run test:smoke` exercises authenticated tenant routes, cross-store product and inventory
IDOR checks for a user who belongs to both stores, non-member denials, public storefront
resolution, and checkout creation. It creates users and store data, so run it only against a
dedicated non-production Neon database. The repository does not include a configured
isolated integration-test database. Cross-store order/refund checks, webhook replay tests,
inventory/refund concurrency tests, and migration execution still require dedicated
integration coverage before claiming full isolation or production readiness. Never point
destructive integration tests at production.

## Rules for new tenant endpoints

Every new tenant endpoint must:

1. Authenticate the user.
2. Resolve the tenant from a trusted route or verified public hostname.
3. Verify active membership for merchant routes.
4. Require an explicit permission.
5. Validate and allowlist request fields; never mass-assign tenant ownership or roles.
6. Scope all reads and writes by `req.storeId`, directly or through an ownership-checked join.
7. Audit sensitive changes with the request ID.
8. Add a cross-tenant denial test and, for financial or stock changes, a concurrency test.
