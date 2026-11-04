-- ==============================================================================
-- CALVIN AATAMAKER — Customer Order RLS Migration
-- Migration: 202611020001_customer_order_rls.sql
-- Target Tables: public.orders, public.order_items
-- ==============================================================================
--
-- PURPOSE:
-- Establishes additive, least-privilege Row-Level Security (RLS) policies allowing
-- authenticated customers to view their own purchase history while preserving
-- administrator visibility through public.is_admin().
--
-- SECURITY MODEL:
-- 1. Read-Only Access: Only SELECT policies are defined for 'authenticated'.
-- 2. No Client Mutations: No INSERT, UPDATE, or DELETE policies are granted to
--    customers. Order creation, checkout totals, payment processing, and fulfillment
--    status updates remain strictly handled by trusted server routes via the service role.
-- 3. Anonymous Protection: Role 'anon' receives no table grants and no policies.
-- 4. Administrator Access: Staff/admins verified via public.is_admin() retain full
--    read visibility across all customer records.
-- 5. Open Redirect & Ownership: Tied cryptographically to auth.uid().
--
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. AFFIRM ROW-LEVEL SECURITY ENFORCEMENT
-- ------------------------------------------------------------------------------
-- Ensure RLS is active on both order tables (idempotent).
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. TABLE-LEVEL PERMISSIONS (GRANTS)
-- ------------------------------------------------------------------------------
-- In PostgreSQL, table-level GRANT is required before RLS policies can filter rows.
-- Grant SELECT only to 'authenticated'. Strictly omit INSERT, UPDATE, and DELETE.
REVOKE ALL ON public.orders FROM anon;
REVOKE ALL ON public.order_items FROM anon;

GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.order_items TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. POLICY A: ORDERS SELECT ACCESS
-- ------------------------------------------------------------------------------
-- Authenticated customers can view only orders linked to their auth UID.
-- Administrators can view all orders through public.is_admin().
-- Note: (SELECT auth.uid()) evaluates once per query statement for high performance.
DROP POLICY IF EXISTS "customer_and_admin_read_orders" ON public.orders;

CREATE POLICY "customer_and_admin_read_orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  customer_id = (SELECT auth.uid())
  OR public.is_admin()
);

COMMENT ON POLICY "customer_and_admin_read_orders" ON public.orders IS
'Allows authenticated customers to read their own orders and administrators to read all orders.';

-- ------------------------------------------------------------------------------
-- 4. POLICY B: ORDER ITEMS SELECT ACCESS
-- ------------------------------------------------------------------------------
-- Authenticated customers can view line items belonging to their own orders.
-- Uses an EXISTS subquery against public.orders, which utilizes the foreign key index.
-- Administrators can view all line items through public.is_admin().
DROP POLICY IF EXISTS "customer_and_admin_read_order_items" ON public.order_items;

CREATE POLICY "customer_and_admin_read_order_items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders
    WHERE public.orders.id = public.order_items.order_id
      AND (
        public.orders.customer_id = (SELECT auth.uid())
        OR public.is_admin()
      )
  )
);

COMMENT ON POLICY "customer_and_admin_read_order_items" ON public.order_items IS
'Allows authenticated customers to read line items of their own orders and administrators to read all order items.';

