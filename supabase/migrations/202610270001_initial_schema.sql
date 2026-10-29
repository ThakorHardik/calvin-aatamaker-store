-- Calvin Aatamaker e-commerce foundation
-- Apply this migration in Supabase SQL Editor only after creating a new project.
-- Product pricing, shipping, tax, and live payment credentials must be confirmed by the client.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Customer profile. A new auth user is always created as a customer;
-- only an existing administrator may promote another user.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role text not null default 'customer' check (role in ('customer', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin', 'staff')
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Home',
  recipient_name text not null,
  phone text not null,
  address_line_1 text not null,
  address_line_2 text,
  landmark text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'India',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  image_path text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  sku text unique,
  short_description text,
  description text,
  price numeric(12,2) not null default 0 check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  dimensions jsonb not null default '{"height_cm":88,"width_cm":48,"depth_cm":34}'::jsonb,
  weight_kg numeric(8,3) check (weight_kg is null or weight_kg >= 0),
  is_active boolean not null default false,
  is_featured boolean not null default false,
  allow_customization boolean not null default false,
  badge text,
  meta_title text,
  meta_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  alt_text text not null default '',
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text unique,
  name text not null,
  attributes jsonb not null default '{}'::jsonb,
  price_override numeric(12,2) check (price_override is null or price_override >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Product-specific design/editor configuration. print_area is normalized 0..1 coordinates
-- over the product mockup; actual dimensions must be confirmed against the manufacturer's panel.
create table if not exists public.product_customization_settings (
  product_id uuid primary key references public.products(id) on delete cascade,
  enabled boolean not null default false,
  editor_mode text not null default '2d' check (editor_mode in ('2d', '3d', '2d_3d')),
  mockup_path text,
  model_3d_path text,
  print_area jsonb not null default '{"x":0.25,"y":0.25,"width":0.5,"height":0.5}'::jsonb,
  allowed_upload_types text[] not null default array['image/jpeg','image/png','image/webp'],
  max_upload_mb integer not null default 8 check (max_upload_mb between 1 and 20),
  allow_text boolean not null default true,
  allow_templates boolean not null default true,
  allow_fonts boolean not null default true,
  allow_colour_options boolean not null default true,
  allow_rotation boolean not null default true,
  allow_scaling boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.design_templates (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  title text not null,
  preview_path text,
  design_data jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete set null,
  quantity integer not null default 1 check (quantity between 1 and 99),
  customization_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  minimum_order_amount numeric(12,2) not null default 0 check (minimum_order_amount >= 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid references public.profiles(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  shipping_address jsonb not null,
  billing_address jsonb,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  shipping_amount numeric(12,2) not null default 0 check (shipping_amount >= 0),
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  currency text not null default 'INR',
  order_status text not null default 'pending' check (order_status in ('pending','confirmed','processing','shipped','delivered','cancelled','refunded')),
  payment_status text not null default 'pending' check (payment_status in ('pending','authorized','paid','failed','refunded','partially_refunded')),
  payment_provider text,
  payment_provider_order_id text,
  payment_provider_payment_id text,
  coupon_code text,
  customer_note text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  sku text,
  variant_snapshot jsonb not null default '{}'::jsonb,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  customization_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  title text,
  body text,
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (product_id, user_id)
);

-- Values are JSON so supported appearance/content settings can be changed in the admin UI.
create table if not exists public.store_settings (
  setting_key text primary key,
  setting_value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

-- Indexes for common catalogue, customer, and order queries.
create index if not exists idx_products_category_active on public.products(category_id, is_active);
create index if not exists idx_products_featured on public.products(is_featured) where is_active = true;
create index if not exists idx_product_images_product_sort on public.product_images(product_id, sort_order);
create index if not exists idx_variants_product_active on public.product_variants(product_id, is_active);
create index if not exists idx_addresses_user on public.addresses(user_id);
create index if not exists idx_cart_items_user on public.cart_items(user_id, updated_at desc);
create index if not exists idx_orders_user_created on public.orders(user_id, created_at desc);
create index if not exists idx_orders_status_created on public.orders(order_status, created_at desc);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_reviews_product_approved on public.product_reviews(product_id, is_approved);

-- updated_at triggers
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['profiles','addresses','categories','products','product_variants','cart_items','coupons','orders','product_customization_settings','design_templates']
  LOOP
    EXECUTE format('drop trigger if exists set_%I_updated_at on public.%I', tbl, tbl);
    EXECUTE format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', tbl, tbl);
  END LOOP;
END;
$$;

-- Row-level security. Customer writes never control payment status or pricing totals;
-- trusted server routes using the service role must create/confirm orders and payments.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_customization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Profile access
DROP POLICY IF EXISTS "profile select own or staff" ON public.profiles;
CREATE POLICY "profile select own or staff" ON public.profiles FOR SELECT TO authenticated
USING (id = (select auth.uid()) OR public.is_admin());
DROP POLICY IF EXISTS "profile update own customer fields" ON public.profiles;
CREATE POLICY "profile update own customer fields" ON public.profiles FOR UPDATE TO authenticated
USING (id = (select auth.uid())) WITH CHECK (id = (select auth.uid()) AND role = 'customer');
DROP POLICY IF EXISTS "staff manage profiles" ON public.profiles;
CREATE POLICY "staff manage profiles" ON public.profiles FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Addresses are private to each customer and staff.
DROP POLICY IF EXISTS "address owner access" ON public.addresses;
CREATE POLICY "address owner access" ON public.addresses FOR ALL TO authenticated
USING (user_id = (select auth.uid()) OR public.is_admin())
WITH CHECK (user_id = (select auth.uid()) OR public.is_admin());

-- Catalogue visibility
DROP POLICY IF EXISTS "published categories readable" ON public.categories;
CREATE POLICY "published categories readable" ON public.categories FOR SELECT TO anon, authenticated
USING (is_active OR public.is_admin());
DROP POLICY IF EXISTS "staff manage categories" ON public.categories;
CREATE POLICY "staff manage categories" ON public.categories FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "published products readable" ON public.products;
CREATE POLICY "published products readable" ON public.products FOR SELECT TO anon, authenticated
USING (is_active OR public.is_admin());
DROP POLICY IF EXISTS "staff manage products" ON public.products;
CREATE POLICY "staff manage products" ON public.products FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "published product images readable" ON public.product_images;
CREATE POLICY "published product images readable" ON public.product_images FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active) OR public.is_admin());
DROP POLICY IF EXISTS "staff manage product images" ON public.product_images;
CREATE POLICY "staff manage product images" ON public.product_images FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "active variants readable" ON public.product_variants;
CREATE POLICY "active variants readable" ON public.product_variants FOR SELECT TO anon, authenticated
USING (is_active AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active) OR public.is_admin());
DROP POLICY IF EXISTS "staff manage variants" ON public.product_variants;
CREATE POLICY "staff manage variants" ON public.product_variants FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "published customisation settings readable" ON public.product_customization_settings;
CREATE POLICY "published customisation settings readable" ON public.product_customization_settings FOR SELECT TO anon, authenticated
USING (enabled AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active) OR public.is_admin());
DROP POLICY IF EXISTS "staff manage customisation settings" ON public.product_customization_settings;
CREATE POLICY "staff manage customisation settings" ON public.product_customization_settings FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "active design templates readable" ON public.design_templates;
CREATE POLICY "active design templates readable" ON public.design_templates FOR SELECT TO anon, authenticated
USING (is_active AND (product_id IS NULL OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active)) OR public.is_admin());
DROP POLICY IF EXISTS "staff manage design templates" ON public.design_templates;
CREATE POLICY "staff manage design templates" ON public.design_templates FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Customers can manage only their own cart. Prices are recalculated server-side at checkout.
DROP POLICY IF EXISTS "cart owner access" ON public.cart_items;
CREATE POLICY "cart owner access" ON public.cart_items FOR ALL TO authenticated
USING (user_id = (select auth.uid()) OR public.is_admin())
WITH CHECK (user_id = (select auth.uid()) OR public.is_admin());

-- Coupon lookup is read-only for shoppers. Redemption updates belong in trusted server routes.
DROP POLICY IF EXISTS "active coupons readable" ON public.coupons;
CREATE POLICY "active coupons readable" ON public.coupons FOR SELECT TO anon, authenticated
USING (is_active AND (starts_at IS NULL OR starts_at <= now()) AND (expires_at IS NULL OR expires_at > now()) OR public.is_admin());
DROP POLICY IF EXISTS "staff manage coupons" ON public.coupons;
CREATE POLICY "staff manage coupons" ON public.coupons FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Customers can read their own orders and order items. Inserts/payment mutations are server-only.
DROP POLICY IF EXISTS "customer read own orders" ON public.orders;
CREATE POLICY "customer read own orders" ON public.orders FOR SELECT TO authenticated
USING (user_id = (select auth.uid()) OR public.is_admin());
DROP POLICY IF EXISTS "staff manage orders" ON public.orders;
CREATE POLICY "staff manage orders" ON public.orders FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "customer read own order items" ON public.order_items;
CREATE POLICY "customer read own order items" ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = (select auth.uid()) OR public.is_admin())));
DROP POLICY IF EXISTS "staff manage order items" ON public.order_items;
CREATE POLICY "staff manage order items" ON public.order_items FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Reviews are public only after moderation; a customer can submit and read their own review.
DROP POLICY IF EXISTS "approved reviews readable" ON public.product_reviews;
CREATE POLICY "approved reviews readable" ON public.product_reviews FOR SELECT TO anon, authenticated
USING (is_approved OR user_id = (select auth.uid()) OR public.is_admin());
DROP POLICY IF EXISTS "customer submit own review" ON public.product_reviews;
CREATE POLICY "customer submit own review" ON public.product_reviews FOR INSERT TO authenticated
WITH CHECK (user_id = (select auth.uid()) AND is_approved = false);
DROP POLICY IF EXISTS "staff moderate reviews" ON public.product_reviews;
CREATE POLICY "staff moderate reviews" ON public.product_reviews FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "public store settings readable" ON public.store_settings;
CREATE POLICY "public store settings readable" ON public.store_settings FOR SELECT TO anon, authenticated
USING (is_public OR public.is_admin());
DROP POLICY IF EXISTS "staff manage store settings" ON public.store_settings;
CREATE POLICY "staff manage store settings" ON public.store_settings FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Explicit table grants; row-level security remains the access-control boundary.
grant usage on schema public to anon, authenticated;
grant select on public.categories, public.products, public.product_images, public.product_variants, public.product_customization_settings, public.design_templates, public.coupons, public.product_reviews, public.store_settings to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.addresses, public.cart_items to authenticated;
grant select, insert, update, delete on public.categories, public.products, public.product_images, public.product_variants, public.product_customization_settings, public.design_templates, public.coupons, public.orders, public.order_items, public.product_reviews, public.store_settings to authenticated;
grant select on public.orders, public.order_items to authenticated;

-- Storage buckets: product images are public; customer designs are private.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('customer-designs', 'customer-designs', false, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "public can read product images" ON storage.objects;
CREATE POLICY "public can read product images" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'product-images');
DROP POLICY IF EXISTS "staff can add product images" ON storage.objects;
CREATE POLICY "staff can add product images" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images' AND public.is_admin());
DROP POLICY IF EXISTS "staff can update product images" ON storage.objects;
CREATE POLICY "staff can update product images" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-images' AND public.is_admin())
WITH CHECK (bucket_id = 'product-images' AND public.is_admin());
DROP POLICY IF EXISTS "staff can delete product images" ON storage.objects;
CREATE POLICY "staff can delete product images" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-images' AND public.is_admin());

DROP POLICY IF EXISTS "customers add their own designs" ON storage.objects;
CREATE POLICY "customers add their own designs" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'customer-designs' AND (storage.foldername(name))[1] = (select auth.uid())::text);
DROP POLICY IF EXISTS "customers read their own designs" ON storage.objects;
CREATE POLICY "customers read their own designs" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'customer-designs' AND ((storage.foldername(name))[1] = (select auth.uid())::text OR public.is_admin()));
DROP POLICY IF EXISTS "customers update their own designs" ON storage.objects;
CREATE POLICY "customers update their own designs" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'customer-designs' AND ((storage.foldername(name))[1] = (select auth.uid())::text OR public.is_admin()))
WITH CHECK (bucket_id = 'customer-designs' AND ((storage.foldername(name))[1] = (select auth.uid())::text OR public.is_admin()));
DROP POLICY IF EXISTS "customers delete their own designs" ON storage.objects;
CREATE POLICY "customers delete their own designs" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'customer-designs' AND ((storage.foldername(name))[1] = (select auth.uid())::text OR public.is_admin()));

-- Safe initial public settings. Actual company/contact/policy values must be supplied by the client.
INSERT INTO public.store_settings (setting_key, setting_value, is_public)
VALUES
  ('brand', '{"name":"Calvin Aatamaker","primary_color":"#bd2031","accent_color":"#e8a43a"}'::jsonb, true),
  ('commerce', '{"currency":"INR","tax_mode":"manual","shipping_mode":"manual"}'::jsonb, true)
ON CONFLICT (setting_key) DO NOTHING;

-- Seed category only. No published demo product or invented customer price is inserted.
INSERT INTO public.categories (name, slug, description, sort_order, is_active)
VALUES ('Compact range', 'compact-range', 'Compact domestic aatamakers for everyday home use.', 1, true)
ON CONFLICT (slug) DO NOTHING;
