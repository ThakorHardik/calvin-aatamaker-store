# CALVIN AATAMAKER — Project Engineering Context and Guardrails

This file adds project-specific constraints to the global engineering standards. Follow both. This repository is an existing application: extend it carefully; do not rebuild it from scratch.

## Product objective
Build a genuinely usable, premium Indian e-commerce platform for CALVIN AATAMAKER, a domestic flour mill / atta chakki brand. The target audience is in India and the store currency is INR (₹).

The end state includes:
- Customer-facing storefront and product discovery.
- Supabase Auth customer registration, login, recovery, and account management.
- Products, categories, variants, inventory, cart, checkout, orders, and customer order history.
- A secure, professional admin dashboard that lets a non-technical owner manage products, orders, customers, homepage content, banners, navigation, theme, pages, marketing, shipping, tax, store settings, and SEO.
- A product-specific personalization studio with real persisted customization data and a future-ready architecture for up to five 3D product models.
- Razorpay integration only later, after the client supplies credentials and explicitly authorizes integration/testing.

## Confirmed technology and environment
- Next.js 15.5.28, React, TypeScript, Tailwind CSS.
- Supabase JavaScript client, Supabase PostgreSQL, Supabase Storage, and Supabase Auth.
- Windows development environment.
- Project folder previously provided: `D:\new_apps\aatamaker-store-starter\aatamaker-store`.
- Dev command: `npm run dev`; local URL: `http://localhost:3000`.
- `.env.local` is used. Never read secrets into chat or reveal their values. Keep Supabase secret/service-role credentials on the server only.
- Prefer free-tier and low-cost services. Do not introduce paid services unless there is a clear need and the user approves.

Before relying on any of these details, verify the current checkout, package versions, files, routes, and scripts. Paths and implementation may have changed since this context was written.

## Confirmed existing features — do not rebuild without evidence
- Homepage at `app/page.tsx` with dynamic banner carousel and other homepage sections; some product sections may still use mock data.
- Hero component: `components/homepage-hero.tsx`; stylesheet: `components/homepage-hero.module.css`.
- Product listing route: `/products`.
- Product detail route: `/products/[slug]`, including product images/gallery, description, specifications, stock, quantity, cart action, and variant-related data.
- Cart route: `/cart`; localStorage key previously used: `calvin-aatamaker-cart`. Verify the current cart implementation and image persistence before changing it.
- Checkout route: `/checkout`; API: `app/api/checkout/route.ts`.
- Admin routes: `/admin`, `/admin/banners`, `/admin/products`, `/admin/orders`.
- Admin product management, multiple images, primary-image selection, image ordering/removal, banner management, and order listing/details/status updates have been developed.
- Admin authentication previously had a “Checking administrator access…” issue that was fixed. Protect that working behavior.

Existing routes and files must be inspected before edits; do not assume this list is exhaustive or that every feature is currently bug-free.

## Confirmed database schema (verify live schema before migrations)
Tables include:
- `categories`: id, name, slug, description, image_path, sort_order, is_active, created_at, updated_at.
- `products`: id, category_id, name, slug, sku, short_description, description, price, compare_at_price, stock_quantity, dimensions_cm, weight_kg, is_customisable, is_featured, is_active, sort_order, created_by, created_at, updated_at.
- `product_images`: id, product_id, storage_path, alt_text, sort_order, is_primary, created_at.
- `product_variants`: id, product_id, name, sku, price, stock_quantity, options, is_active, sort_order, created_at, updated_at.
- `profiles`: id, email, full_name, role, created_at.
- `orders`: id, order_number, customer_id, customer_name, email, phone, shipping_address_line1, shipping_address_line2, city, state, postal_code, country, subtotal, shipping_amount, tax_amount, discount_amount, total_amount, currency, order_status, payment_status, payment_provider, payment_reference, customer_notes, created_at, updated_at.
- `order_items`: id, order_id, product_id, variant_id, product_name, sku, variant_name, unit_price, quantity, line_total, customisation_details, created_at.
- `banners`: id, title, subtitle, media_type, media_path, alt_text, button_label, button_href, sort_order, display_seconds, is_active, starts_at, ends_at, created_by, created_at, updated_at.

Storage buckets previously confirmed: `banner-media` and `product-media`.

## Confirmed Supabase security inspection results (2026-10-31)
These are inspection results, not permission to modify anything:
- RLS is enabled on `profiles`, `orders`, and `order_items`; `FORCE ROW LEVEL SECURITY` is false for all three.
- `profiles.id` is a primary key and has a foreign key to `auth.users(id) ON DELETE CASCADE`.
- `profiles.role` is `NOT NULL`, default `'customer'`, and has a CHECK constraint allowing only `'customer'` or `'admin'`.
- There is an `AFTER INSERT` trigger on `auth.users` named `on_auth_user_created`, which invokes `public.handle_new_user()`.
- `public.handle_new_user()` inserts `id`, `email`, and a name from `raw_user_meta_data.full_name` or `raw_user_meta_data.name` into `public.profiles`. It relies on the database default for `role`; it does not explicitly set a role. It uses `ON CONFLICT (id) DO UPDATE SET email = excluded.email`.
- `public.is_admin()` exists, returns boolean, is `SECURITY DEFINER`, pins `search_path` to `public`, and checks whether `profiles.id = auth.uid()` with `role = 'admin'`.
- The only policy returned by the inspection on `profiles`, `orders`, and `order_items` was `profiles` SELECT policy `Read own profile or admin` for `authenticated`, with condition `(id = auth.uid()) OR is_admin()`.
- No policies were returned for `orders` or `order_items` in that inspection. Re-check live policies before making any change.
- The `orders.customer_id` column exists as nullable UUID with no default. No foreign key for it was returned in the earlier FK inspection. Verify again before migrations.
- The `order_items` table has foreign keys to `orders(id)`, `products(id)`, and `product_variants(id)`.
- Aggregate counts at the time of inspection: 1 profile, 1 Auth user, 0 profiles without an Auth user, 0 Auth users without a profile. The profile role count showed 1 admin and no customers.
- There is one existing admin account. Never demote, delete, lock out, or otherwise disrupt it.

## Critical project guardrails
- Preserve existing admin access and existing order, product, category, banner, and customer data.
- A development test order `CA-7891F04B40` was identified with note `DEVELOPMENT TEST ONLY — DO NOT FULFIL`. Do not delete it or mark it paid. Verify whether it still exists before relying on it.
- Guest checkout must remain possible unless the user explicitly changes that requirement. `orders.customer_id` is nullable and checkout previously created orders with `customer_id = null`.
- Never trust role, price, discount, inventory, order total, payment status, or ownership supplied by the browser.
- Never permit a customer to assign or update their own `role`. Customer self-registration must always produce a customer role. Preserve admin role management through the existing trusted admin process only.
- Customer order history and address operations must be restricted server-side and through correctly designed RLS to the authenticated owner. Never expose another customer's orders or profile.
- Before changing RLS, inspect all existing policies, grants, function ownership, function execute permissions, triggers, and relevant API access patterns. Test customer, guest/anonymous, and administrator cases.
- Before adding `orders.customer_id` foreign key or changing order ownership, inspect all existing values, orphan rows, guest orders, and the actual Auth/profile relationship. Keep guest rows nullable.
- Before creating an address table, inspect naming conventions and current schema; use ownership foreign keys and RLS policies that enforce owner-only CRUD and safe default-address behavior.
- Do not duplicate the existing `auth.users` profile-creation trigger without first proving it is missing or defective. Review the trigger's failure behavior and metadata validation before changing it.
- Preserve current admin product, banner, and order routes/components. Extend them incrementally.
- Payments remain development-only for now. Keep payment status pending; do not add real payment processing, mark orders paid, or request/payment-test with secrets. Razorpay comes later with explicit approval.
- No deployment, push, merge, production configuration edits, production database changes, real purchases, refunds, or customer communications without explicit approval for that action.

## Current planned development order
1. Finish inspecting customer/order authorization, API/server Supabase clients, role checks, grants, and current checkout behavior.
2. Implement and test customer registration, login, logout, email verification/recovery, and session handling with Supabase Auth.
3. Build `/account`, `/account/profile`, `/account/addresses`, `/account/orders`, and `/account/orders/[id]` with owner-only access.
4. Link authenticated checkout orders to the signed-in customer while retaining guest checkout and existing order history.
5. Verify cart selected-image persistence and connect homepage products/cart UI to the live catalogue.
6. Complete variant and inventory handling and order/stock consistency.
7. Build the wider admin customization system, using structured content/settings stored in Supabase and safe, constrained theme tokens.
8. Implement real product personalization persistence and preview behavior; plan 3D models separately.
9. Complete security, RLS, responsive, reliability, and production-readiness audits. Integrate Razorpay only after approval.

## Working style for this project
- Work one manageable step at a time.
- Give exact Windows paths and PowerShell commands.
- Inspect the current file before replacing it. Provide a complete updated file when a full-file replacement is appropriate.
- Never assume a table, column, policy, package, or route exists; inspect first.
- Explain changes in simple English. Wait for the user's test output before dependent work.
- Do not paste `.env.local` values or secrets into responses. Ask the user to redact sensitive output before sharing.
