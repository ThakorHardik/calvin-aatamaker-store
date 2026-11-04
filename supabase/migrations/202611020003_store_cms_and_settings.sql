-- ==============================================================================
-- CALVIN AATAMAKER — Store CMS & Settings Schema Migration (Additive & Backward-Compatible)
-- Migration: 202611020003_store_cms_and_settings.sql
-- Target Tables: public.store_settings, public.homepage_sections, public.cms_pages,
--                public.products, public.product_variants
-- Storage Buckets: product-media, banner-media
-- ==============================================================================
--
-- PURPOSE:
-- Establishes additive, highly secure, modular schema tables and columns for complete
-- non-technical store customization:
-- 1. public.store_settings: Harmonizes existing setting_value and new value columns,
--    storing business profile, theme tokens, navigation menus, and announcement bar.
-- 2. public.homepage_sections: Reorderable storefront section layout and structured copy.
-- 3. public.cms_pages: Standard and legal policy pages (About, Contact, Shipping,
--    Privacy, Terms, Returns) with SEO metadata.
-- 4. public.products: Additive meta_title and meta_description columns.
-- 5. public.product_variants: Additive price, options, and sort_order columns with backfill.
-- 6. Storage Buckets: Ensures 'product-media' and 'banner-media' exist with admin policies.
--
-- SECURITY ARCHITECTURE:
-- 1. Row-Level Security (RLS) is strictly enabled across all tables.
-- 2. Public Storefront Access: Anonymous & authenticated users have SELECT access
--    restricted to published content (is_public = true, is_enabled = true, is_published = true).
-- 3. Administrator Authority: Full CRUD access is governed by public.is_admin() and service_role.
-- 4. No Unprivileged Client Mutations: anon has 0 mutation grants; authenticated customers
--    are blocked by RLS policies checking public.is_admin().
-- 5. Idempotent & Non-destructive: Re-execution will never overwrite modified store settings.
--
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TABLE: public.store_settings (Additive Column Harmonization)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_settings (
  setting_key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS value jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS setting_value jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure both value and setting_value are in sync for existing rows
UPDATE public.store_settings
SET value = setting_value
WHERE (value IS NULL OR value = '{}'::jsonb) AND setting_value IS NOT NULL AND setting_value <> '{}'::jsonb;

UPDATE public.store_settings
SET setting_value = value
WHERE (setting_value IS NULL OR setting_value = '{}'::jsonb) AND value IS NOT NULL AND value <> '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_store_settings_category ON public.store_settings(category);
CREATE INDEX IF NOT EXISTS idx_store_settings_public ON public.store_settings(is_public);

-- ------------------------------------------------------------------------------
-- 2. TABLE: public.homepage_sections
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.homepage_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homepage_sections_sort ON public.homepage_sections(sort_order);
CREATE INDEX IF NOT EXISTS idx_homepage_sections_enabled ON public.homepage_sections(is_enabled);

-- ------------------------------------------------------------------------------
-- 3. TABLE: public.cms_pages
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cms_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  page_type text NOT NULL DEFAULT 'standard' CHECK (page_type IN ('policy', 'standard', 'contact', 'about')),
  is_published boolean NOT NULL DEFAULT true,
  meta_title text,
  meta_description text,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cms_pages_slug ON public.cms_pages(slug);
CREATE INDEX IF NOT EXISTS idx_cms_pages_type ON public.cms_pages(page_type);
CREATE INDEX IF NOT EXISTS idx_cms_pages_published ON public.cms_pages(is_published);

-- ------------------------------------------------------------------------------
-- 4. ADDITIVE COLUMNS: public.products & public.product_variants
-- ------------------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS meta_title text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS meta_description text;

ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS price numeric(12,2) CHECK (price >= 0);
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS options jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Safe backfill for variants from price_override if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'price_override'
  ) THEN
    UPDATE public.product_variants
    SET price = price_override
    WHERE price IS NULL AND price_override IS NOT NULL;
  END IF;
END $$;

-- Safe backfill for variants from parent product price if still null
UPDATE public.product_variants pv
SET price = p.price
FROM public.products p
WHERE pv.product_id = p.id AND pv.price IS NULL;

-- ------------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY (RLS) ENFORCEMENT & PERMISSIONS
-- ------------------------------------------------------------------------------
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;

-- Revoke dangerous mutation defaults from public / anon
REVOKE ALL ON public.store_settings FROM anon, authenticated, public;
REVOKE ALL ON public.homepage_sections FROM anon, authenticated, public;
REVOKE ALL ON public.cms_pages FROM anon, authenticated, public;

-- Grant SELECT only to anonymous users
GRANT SELECT ON public.store_settings TO anon;
GRANT SELECT ON public.homepage_sections TO anon;
GRANT SELECT ON public.cms_pages TO anon;

-- Grant CRUD to authenticated role (RLS policies below strictly enforce public.is_admin())
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homepage_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_pages TO authenticated;

-- Grant ALL to service_role (bypasses RLS)
GRANT ALL ON public.store_settings TO service_role;
GRANT ALL ON public.homepage_sections TO service_role;
GRANT ALL ON public.cms_pages TO service_role;

-- ------------------------------------------------------------------------------
-- 6. POLICIES: public.store_settings
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "store_settings_public_read" ON public.store_settings;
DROP POLICY IF EXISTS "public store settings readable" ON public.store_settings;
CREATE POLICY "store_settings_public_read"
  ON public.store_settings
  FOR SELECT
  TO anon, authenticated
  USING (
    is_public = true
    OR ((select auth.jwt() ->> 'role') = 'service_role')
    OR (public.is_admin())
  );

DROP POLICY IF EXISTS "store_settings_admin_mutation" ON public.store_settings;
DROP POLICY IF EXISTS "staff manage store settings" ON public.store_settings;
CREATE POLICY "store_settings_admin_mutation"
  ON public.store_settings
  FOR ALL
  TO authenticated
  USING (
    ((select auth.jwt() ->> 'role') = 'service_role')
    OR (public.is_admin())
  )
  WITH CHECK (
    ((select auth.jwt() ->> 'role') = 'service_role')
    OR (public.is_admin())
  );

-- ------------------------------------------------------------------------------
-- 7. POLICIES: public.homepage_sections
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "homepage_sections_public_read" ON public.homepage_sections;
CREATE POLICY "homepage_sections_public_read"
  ON public.homepage_sections
  FOR SELECT
  TO anon, authenticated
  USING (
    is_enabled = true
    OR ((select auth.jwt() ->> 'role') = 'service_role')
    OR (public.is_admin())
  );

DROP POLICY IF EXISTS "homepage_sections_admin_mutation" ON public.homepage_sections;
CREATE POLICY "homepage_sections_admin_mutation"
  ON public.homepage_sections
  FOR ALL
  TO authenticated
  USING (
    ((select auth.jwt() ->> 'role') = 'service_role')
    OR (public.is_admin())
  )
  WITH CHECK (
    ((select auth.jwt() ->> 'role') = 'service_role')
    OR (public.is_admin())
  );

-- ------------------------------------------------------------------------------
-- 8. POLICIES: public.cms_pages
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "cms_pages_public_read" ON public.cms_pages;
CREATE POLICY "cms_pages_public_read"
  ON public.cms_pages
  FOR SELECT
  TO anon, authenticated
  USING (
    is_published = true
    OR ((select auth.jwt() ->> 'role') = 'service_role')
    OR (public.is_admin())
  );

DROP POLICY IF EXISTS "cms_pages_admin_mutation" ON public.cms_pages;
CREATE POLICY "cms_pages_admin_mutation"
  ON public.cms_pages
  FOR ALL
  TO authenticated
  USING (
    ((select auth.jwt() ->> 'role') = 'service_role')
    OR (public.is_admin())
  )
  WITH CHECK (
    ((select auth.jwt() ->> 'role') = 'service_role')
    OR (public.is_admin())
  );

-- ------------------------------------------------------------------------------
-- 9. STORAGE BUCKETS & RLS POLICIES (product-media & banner-media)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-media', 'product-media', true, 15728640, ARRAY['image/jpeg','image/png','image/webp','image/avif']),
  ('banner-media', 'banner-media', true, 31457280, ARRAY['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm'])
ON CONFLICT (id) DO UPDATE SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Product Media Read / Admin Mutation
DROP POLICY IF EXISTS "public read product media" ON storage.objects;
CREATE POLICY "public read product media" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'product-media');

DROP POLICY IF EXISTS "staff manage product media" ON storage.objects;
CREATE POLICY "staff manage product media" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'product-media' AND (((select auth.jwt() ->> 'role') = 'service_role') OR public.is_admin()))
WITH CHECK (bucket_id = 'product-media' AND (((select auth.jwt() ->> 'role') = 'service_role') OR public.is_admin()));

-- Banner Media Read / Admin Mutation
DROP POLICY IF EXISTS "public read banner media" ON storage.objects;
CREATE POLICY "public read banner media" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'banner-media');

DROP POLICY IF EXISTS "staff manage banner media" ON storage.objects;
CREATE POLICY "staff manage banner media" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'banner-media' AND (((select auth.jwt() ->> 'role') = 'service_role') OR public.is_admin()))
WITH CHECK (bucket_id = 'banner-media' AND (((select auth.jwt() ->> 'role') = 'service_role') OR public.is_admin()));

-- ------------------------------------------------------------------------------
-- 10. SEED DATA (Safe Idempotent: ON CONFLICT DO NOTHING)
-- ------------------------------------------------------------------------------

-- Default Store Settings (Never overwrites existing settings on re-execution)
INSERT INTO public.store_settings (setting_key, category, description, is_public, value, setting_value)
VALUES
  (
    'general_store_settings',
    'general',
    'Core business information, contact channels, and announcement bar',
    true,
    '{
      "storeName": "CALVIN AATAMAKER",
      "tagline": "India''s Premier Domestic Flour Mills",
      "logoUrl": "",
      "faviconUrl": "",
      "contactEmail": "care@calvinaatamaker.com",
      "contactPhone": "+91 98765 43210",
      "whatsappLink": "https://wa.me/919876543210",
      "address": "Plot 42, GIDC Engineering Zone, Ahmedabad, Gujarat 382445, India",
      "gstin": "24AAAAA0000A1Z5",
      "currency": "INR (₹)",
      "isAcceptingOrders": true,
      "maintenanceMessage": "Storefront is briefly undergoing scheduled maintenance. We will be back online shortly.",
      "announcementEnabled": true,
      "announcementText": "Free Doorstep Delivery Across India · 5-Year Domestic Motor Warranty",
      "announcementLink": "/products",
      "freeShippingThreshold": 0
    }'::jsonb,
    '{
      "storeName": "CALVIN AATAMAKER",
      "tagline": "India''s Premier Domestic Flour Mills",
      "logoUrl": "",
      "faviconUrl": "",
      "contactEmail": "care@calvinaatamaker.com",
      "contactPhone": "+91 98765 43210",
      "whatsappLink": "https://wa.me/919876543210",
      "address": "Plot 42, GIDC Engineering Zone, Ahmedabad, Gujarat 382445, India",
      "gstin": "24AAAAA0000A1Z5",
      "currency": "INR (₹)",
      "isAcceptingOrders": true,
      "maintenanceMessage": "Storefront is briefly undergoing scheduled maintenance. We will be back online shortly.",
      "announcementEnabled": true,
      "announcementText": "Free Doorstep Delivery Across India · 5-Year Domestic Motor Warranty",
      "announcementLink": "/products",
      "freeShippingThreshold": 0
    }'::jsonb
  ),
  (
    'store_theme_tokens',
    'theme',
    'Branded theme tokens, color palette, typography and component border radii',
    true,
    '{
      "primaryColor": "#bf1e2e",
      "secondaryColor": "#8b1522",
      "backgroundColor": "#fafaf9",
      "surfaceColor": "#ffffff",
      "textColor": "#1c1917",
      "fontFamily": "Plus Jakarta Sans",
      "buttonRadius": "rounded-xl",
      "cardRadius": "rounded-2xl"
    }'::jsonb,
    '{
      "primaryColor": "#bf1e2e",
      "secondaryColor": "#8b1522",
      "backgroundColor": "#fafaf9",
      "surfaceColor": "#ffffff",
      "textColor": "#1c1917",
      "fontFamily": "Plus Jakarta Sans",
      "buttonRadius": "rounded-xl",
      "cardRadius": "rounded-2xl"
    }'::jsonb
  ),
  (
    'store_navigation_menus',
    'navigation',
    'Header navigation links, 3-column footer links, and social channel URLs',
    true,
    '{
      "headerLinks": [
        { "id": "nav-1", "label": "Catalogue", "href": "/products", "isExternal": false },
        { "id": "nav-2", "label": "Why Calvin", "href": "/#why-calvin", "isExternal": false },
        { "id": "nav-3", "label": "Studio", "href": "/studio", "isExternal": false },
        { "id": "nav-4", "label": "Customer Care", "href": "/pages/contact", "isExternal": false }
      ],
      "footerShopLinks": [
        { "id": "f-s-1", "label": "All Flour Mills", "href": "/products", "isExternal": false },
        { "id": "f-s-2", "label": "Personalisation Studio", "href": "/studio", "isExternal": false },
        { "id": "f-s-3", "label": "Accessories & Sieves", "href": "/products", "isExternal": false }
      ],
      "footerCompanyLinks": [
        { "id": "f-c-1", "label": "About Calvin", "href": "/pages/about", "isExternal": false },
        { "id": "f-c-2", "label": "Manufacturing & Heritage", "href": "/pages/about", "isExternal": false },
        { "id": "f-c-3", "label": "Contact & Support", "href": "/pages/contact", "isExternal": false }
      ],
      "footerLegalLinks": [
        { "id": "f-l-1", "label": "Privacy Policy", "href": "/pages/privacy", "isExternal": false },
        { "id": "f-l-2", "label": "Terms of Service", "href": "/pages/terms", "isExternal": false },
        { "id": "f-l-3", "label": "Shipping Policy", "href": "/pages/shipping", "isExternal": false },
        { "id": "f-l-4", "label": "Return & Refund Policy", "href": "/pages/returns", "isExternal": false }
      ],
      "socialLinks": {
        "instagram": "https://instagram.com/calvinaatamaker",
        "youtube": "https://youtube.com/@calvinaatamaker",
        "facebook": "https://facebook.com/calvinaatamaker",
        "whatsapp": "https://wa.me/919876543210"
      }
    }'::jsonb,
    '{
      "headerLinks": [
        { "id": "nav-1", "label": "Catalogue", "href": "/products", "isExternal": false },
        { "id": "nav-2", "label": "Why Calvin", "href": "/#why-calvin", "isExternal": false },
        { "id": "nav-3", "label": "Studio", "href": "/studio", "isExternal": false },
        { "id": "nav-4", "label": "Customer Care", "href": "/pages/contact", "isExternal": false }
      ],
      "footerShopLinks": [
        { "id": "f-s-1", "label": "All Flour Mills", "href": "/products", "isExternal": false },
        { "id": "f-s-2", "label": "Personalisation Studio", "href": "/studio", "isExternal": false },
        { "id": "f-s-3", "label": "Accessories & Sieves", "href": "/products", "isExternal": false }
      ],
      "footerCompanyLinks": [
        { "id": "f-c-1", "label": "About Calvin", "href": "/pages/about", "isExternal": false },
        { "id": "f-c-2", "label": "Manufacturing & Heritage", "href": "/pages/about", "isExternal": false },
        { "id": "f-c-3", "label": "Contact & Support", "href": "/pages/contact", "isExternal": false }
      ],
      "footerLegalLinks": [
        { "id": "f-l-1", "label": "Privacy Policy", "href": "/pages/privacy", "isExternal": false },
        { "id": "f-l-2", "label": "Terms of Service", "href": "/pages/terms", "isExternal": false },
        { "id": "f-l-3", "label": "Shipping Policy", "href": "/pages/shipping", "isExternal": false },
        { "id": "f-l-4", "label": "Return & Refund Policy", "href": "/pages/returns", "isExternal": false }
      ],
      "socialLinks": {
        "instagram": "https://instagram.com/calvinaatamaker",
        "youtube": "https://youtube.com/@calvinaatamaker",
        "facebook": "https://facebook.com/calvinaatamaker",
        "whatsapp": "https://wa.me/919876543210"
      }
    }'::jsonb
  )
ON CONFLICT (setting_key) DO NOTHING;

-- Default Homepage Sections
INSERT INTO public.homepage_sections (section_key, title, description, is_enabled, sort_order, content)
VALUES
  (
    'hero_carousel',
    'Hero Banner Carousel',
    'Primary visual showcase with high-impact video/image slides and CTAs',
    true,
    1,
    '{ "autoplaySeconds": 5, "note": "Banner slides are managed in the Hero Banners module." }'::jsonb
  ),
  (
    'trust_strip',
    'Trust & Assurance Strip',
    'Key value proposition badges displayed below the hero carousel',
    true,
    2,
    '{
      "items": [
        { "icon": "ShieldCheck", "title": "5-Year Motor Warranty", "desc": "100% heavy-duty copper-wound motor" },
        { "icon": "Truck", "title": "Free Nationwide Shipping", "desc": "Safely delivered to your doorstep" },
        { "icon": "Sparkles", "title": "Zero Adulteration", "desc": "Fresh, wholesome ghar ka atta daily" },
        { "icon": "Wrench", "title": "Doorstep Service", "desc": "Pan-India support and genuine spares" }
      ]
    }'::jsonb
  ),
  (
    'featured_products',
    'Featured Products Showcase',
    'Grid of flagship atta chakkis with direct cart action and model details',
    true,
    3,
    '{
      "headline": "Engineered for Purity, Designed for Indian Homes",
      "subtitle": "Discover our top-rated domestic flour mills crafted with heavy-duty stone grinding technology.",
      "productLimit": 4,
      "ctaText": "View All Models",
      "ctaLink": "/products"
    }'::jsonb
  ),
  (
    'category_showcase',
    'Category Discovery',
    'Browse machines by size, motor power, and kitchen footprint',
    true,
    4,
    '{
      "headline": "Explore by Collection",
      "subtitle": "Choose the perfect machine for your family size and grinding needs."
    }'::jsonb
  ),
  (
    'why_calvin',
    'Why Choose Calvin Story',
    'Brand heritage, emery stone technology, and traditional nutrition retention',
    true,
    5,
    '{
      "headline": "Why Choose Calvin Aatamaker?",
      "subtitle": "Packaged flours often lose essential germ and bran oils during industrial high-heat grinding. Calvin preserves the complete grain nutrition.",
      "points": [
        "Natural Emery Stones ensure cool grinding, locking in natural vitamins and aroma.",
        "Fully automated smart sensors stop the machine when grain hopper is empty.",
        "Child-safety door interlocking mechanism prevents accidental access while running.",
        "Heavy-duty stainless steel chamber and sieves designed for 15+ years of daily use."
      ]
    }'::jsonb
  ),
  (
    'how_it_works',
    'How It Works Step-by-Step',
    '3-step guide for fresh flour at home in 5 minutes',
    true,
    6,
    '{
      "headline": "Fresh Atta in 3 Easy Steps",
      "subtitle": "Grind wheat, bajra, jowar, rice, dal, and spices in under 5 minutes.",
      "steps": [
        { "step": "1", "title": "Pour Grain", "desc": "Fill hopper with your preferred grain or pulse." },
        { "step": "2", "title": "Choose Fineness", "desc": "Select from 6 included stainless-steel sieves." },
        { "step": "3", "title": "Press Start", "desc": "Collect stone-ground unadulterated flour in minutes." }
      ]
    }'::jsonb
  ),
  (
    'faq',
    'Frequently Asked Questions',
    'Answers to common buyer questions regarding motor capacity, power, and cleaning',
    true,
    7,
    '{
      "headline": "Frequently Asked Questions",
      "subtitle": "Everything you need to know about Calvin domestic flour mills.",
      "items": [
        {
          "q": "Can I grind grains other than wheat?",
          "a": "Yes! Calvin chakkis grind Wheat, Bajra, Jowar, Maize, Rice, Chana Dal, Besan, and even dry spices using dedicated sieves."
        },
        {
          "q": "How much electricity does a 1 HP mill consume?",
          "a": "Approximately 0.75 units of electricity per hour of operation, costing less than ₹6 for grinding 10 kg of wheat."
        },
        {
          "q": "Is any regular stone sharpening or maintenance required?",
          "a": "No stone dressing is required. Our emery stones are precision-balanced for thousands of kilograms of lifelong grinding."
        }
      ]
    }'::jsonb
  ),
  (
    'newsletter',
    'Newsletter & Grain Club',
    'Email capture banner for grain recipes, healthy baking tips, and discounts',
    true,
    8,
    '{
      "headline": "Join the Pure Flour Revolution",
      "subtitle": "Receive traditional grain guides, recipe ideas, and exclusive product updates."
    }'::jsonb
  )
ON CONFLICT (section_key) DO NOTHING;

-- Default CMS Pages
INSERT INTO public.cms_pages (slug, title, page_type, is_published, meta_title, meta_description, content)
VALUES
  (
    'about',
    'About Calvin Aatamaker',
    'about',
    true,
    'About Us — Calvin Aatamaker Domestic Flour Mills',
    'Learn about Calvin Aatamaker''s mission to bring unadulterated whole-grain nutrition to Indian households.',
    'Calvin Aatamaker is dedicated to preserving traditional stone-ground nutrition through precision German-engineered domestic flour mills. Manufactured in Gujarat, our mills empower Indian families to enjoy fresh, unadulterated atta with 100% natural bran and germ retention.'
  ),
  (
    'contact',
    'Contact & Customer Care',
    'contact',
    true,
    'Customer Care & Support — Calvin Aatamaker',
    'Get in touch with Calvin Aatamaker customer service for inquiries, delivery status, and warranty assistance.',
    'Need assistance or service? Our Ahmedabad customer care team is available Monday to Saturday, 9:30 AM to 6:30 PM IST.\n\nEmail: care@calvinaatamaker.com\nPhone: +91 98765 43210\nWhatsApp: +91 98765 43210\nFactory Address: Plot 42, GIDC Engineering Zone, Ahmedabad, Gujarat 382445, India'
  ),
  (
    'shipping',
    'Shipping & Delivery Policy',
    'policy',
    true,
    'Shipping Policy — Free Delivery Across India | Calvin Aatamaker',
    'Read our shipping turnaround times, insured domestic freight, and doorstep delivery terms.',
    'We provide free insured doorstep delivery across India for all domestic flour mills. Orders are dispatched within 24 to 48 business hours from our manufacturing hub in Gujarat. Transit times typically range between 3 to 7 business days depending on destination PIN code. Every shipment includes heavy-duty wooden-crate or multi-wall foam packaging to guarantee zero transit damage.'
  ),
  (
    'returns',
    'Cancellation, Returns & Warranty',
    'policy',
    true,
    'Returns & Warranty Policy — Calvin Aatamaker',
    'Learn about our 7-day transit replacement policy and 5-year domestic motor warranty.',
    'Calvin domestic flour mills include a comprehensive 5-Year Domestic Motor Warranty and 1-Year Comprehensive Machine Warranty. In the rare event of transit damage or manufacturing defect, report within 7 days of delivery with unboxing proof for a prompt free replacement or technician dispatch.'
  ),
  (
    'privacy',
    'Privacy Policy',
    'policy',
    true,
    'Privacy Policy — Calvin Aatamaker',
    'Our commitment to safeguarding your customer data and personal privacy.',
    'Calvin Aatamaker values your personal privacy. We collect only information required to process and deliver your order, coordinate warranty support, and send order status notifications. We never sell, rent, or trade customer contact details with third-party marketing companies.'
  ),
  (
    'terms',
    'Terms of Service',
    'policy',
    true,
    'Terms of Service — Calvin Aatamaker',
    'Store terms, product usage conditions, warranty parameters, and legal jurisdiction.',
    'By accessing the Calvin Aatamaker website or purchasing products, you agree to these Terms of Service. All domestic flour mills are intended strictly for household domestic grinding. Commercial misuse voids the domestic warranty. All disputes are subject to the exclusive jurisdiction of the competent courts in Ahmedabad, Gujarat, India.'
  )
ON CONFLICT (slug) DO NOTHING;

COMMIT;
