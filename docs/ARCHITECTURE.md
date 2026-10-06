# BravoShop architecture

## Surfaces
- bravoshop.online — marketing and onboarding.
- app.bravoshop.online — Merchant Admin.
- admin.bravoshop.online — BravoShop Super Admin.
- *.bravoshop.online — tenant storefronts.

## Security rule
Every tenant-owned record carries store_id. Authorization is enforced server/database-side; hiding UI is never authorization.

## Layers
Platform: auth, organizations, stores, permissions, billing and entitlements.
Commerce: products, categories, inventory, customers, orders and checkout.
Builder: themes, pages, sections and navigation.
AI: tenant-aware sales and operational assistants.
Operations: feature flags, releases, health, kill switches, audit and cost control.

## Herencia migration policy
Reuse proven concepts/components deliberately. Do not clone branding, production secrets, hardcoded business assumptions or the patch-style runtime startup chain.

## Release flow
Development -> Staging -> Beta stores -> staged production rollout -> 100%. Risky releases require rollback capability.
