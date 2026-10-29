# Calvin Aatamaker Store

A Next.js + React + TypeScript storefront starter using the client's logo and the supplied compact atta chakki reference image. The current storefront and admin workspace are **UI previews backed by demo data**; they are not yet a production e-commerce system. Supabase schema groundwork is included for the next implementation stage.

## Stack

- Next.js 15 / React 19 / TypeScript
- Tailwind-compatible custom CSS (the current design uses `app/globals.css`)
- Supabase Postgres, Auth and Storage (free tier for development)
- `lucide-react` icons
- Planned next: persistent catalogue/admin CRUD, cart/order APIs, Razorpay server-side verification, then Konva/Fabric 2D customiser and Three.js 3D viewer

## Client-supplied reference

- Brand: **Calvin Aatamaker**
- Supplied sample dimensions: **88 cm height × 48 cm width × 34 cm depth**
- Price shown in the demo is a placeholder and must be replaced with the client's approved price before publishing.
- The supplied product artwork is an illustrative promotional image. Obtain clean product images and confirm manufacturer-approved printable-panel dimensions before using it as the final customisation mockup.

## Local setup

Requirements: Node.js 20.9 or later and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open `http://localhost:3000`. On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp` if preferred.

## Supabase setup

1. Create a Supabase project using the Free plan.
2. In Project Settings → API, copy the project URL and publishable/anon key into `.env.local`:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
   ```

3. In Supabase SQL Editor, run `supabase/migrations/202610270001_initial_schema.sql`.
4. Create a first account through Supabase Auth.
5. Promote only the trusted owner account to admin by running this SQL in the dashboard SQL Editor, replacing the email with the client's actual admin email:

   ```sql
   update public.profiles p
   set role = 'admin'
   from auth.users u
   where p.id = u.id
     and u.email = 'OWNER-EMAIL-REPLACE-ME';
   ```

   Do not expose a Supabase service-role key in any `NEXT_PUBLIC_*` variable or browser-side code.
6. Configure email confirmation / redirect URLs for the local site. The migration sets up `product-images` (public product images) and `customer-designs` (private customer artwork) storage buckets.

## Current implementation status

- [x] Client logo and sample image copied into `public/images/`
- [x] Responsive storefront UI preview
- [x] In-browser demo cart (not persistent)
- [x] Admin UI preview (not protected and not persistent yet)
- [x] Initial Supabase schema and basic RLS policies
- [ ] Supabase client integration and database-backed catalogue
- [ ] Admin authentication / protected routes
- [ ] Persistent product/category/variant management and image upload
- [ ] Cart, checkout, server-side pricing and order APIs
- [ ] Razorpay order creation, signature verification and webhooks
- [ ] 2D personalisation editor and print file generation
- [ ] 3D model preparation and viewer
- [ ] End-to-end tests, backups and deployment validation

## Important production notes

- Do not deploy the preview admin as a public admin tool until Supabase authentication and server-side role checks protect it.
- Order totals, stock changes, coupon redemption and payment status must be calculated/verified server-side, not trusted from browser state.
- Free-tier limits are finite. Keep uploads bounded and monitor storage/database limits; never promise unlimited storage or zero operating costs.
- Use a private bucket for customer artwork. The print-ready output requires the real panel geometry and the manufacturer's print specifications.
