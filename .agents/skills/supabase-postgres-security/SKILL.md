---
name: supabase-postgres-security
description: Inspects and designs Supabase Auth, PostgreSQL schemas, foreign keys, triggers, SECURITY DEFINER functions, grants, RLS policies, Storage access, and safe database migrations. Use for SQL, authentication, account ownership, admin permissions, and data-security work.
---

# Supabase and PostgreSQL Security Skill

## Mandatory inspection before changes
Collect and inspect the live facts relevant to the change:
- Table/column definitions, data types, nullability, defaults, primary/foreign/check/unique constraints.
- Existing row counts and orphaned/duplicate records, using privacy-preserving aggregate queries where possible.
- RLS enabled/forced state and every policy's command, roles, USING, and WITH CHECK expressions.
- Table grants and relevant function execute grants.
- Trigger definitions, trigger functions, function owner, SECURITY DEFINER/INVOKER behavior, pinned search_path, and function grants.
- Existing storage buckets, object policies, and application access patterns when storage is involved.
- Current server/browser Supabase client construction and every API that reads or writes affected data.

Never infer the schema from TypeScript types or an old handover alone. Re-query the live database.

## RLS design
- Start with least privilege. Add only the operations the feature requires.
- For every policy, reason about SELECT, INSERT, UPDATE, and DELETE separately.
- For UPDATE, evaluate both USING (which rows may be targeted) and WITH CHECK (what the resulting row may contain).
- Restrict row ownership to `auth.uid()` and trusted admin checks. Do not trust client-supplied user IDs or roles.
- Prevent privilege escalation: customer profile updates must not permit changing `role`; registration must not allow setting admin metadata/role.
- Avoid policy recursion. Understand how helper functions execute and which privileges they need.
- Test anonymous, authenticated customer, owner, non-owner, and administrator behavior, including direct API calls rather than only UI behavior.

## SECURITY DEFINER functions and triggers
- Verify the function owner, execute grants, and whether SECURITY DEFINER is necessary.
- Pin a safe `search_path`; schema-qualify referenced relations/functions.
- Validate values copied from auth metadata. Treat metadata as user-controlled input.
- Ensure trigger failure behavior is intentional and does not silently corrupt or orphan records.
- Preserve existing administrator accounts and existing trigger behavior unless a verified defect requires a carefully reviewed change.

## Migrations and data safety
- Prepare SQL as a reviewable migration. Explain what each statement changes and why.
- Prefer additive, backward-compatible changes. Preserve guest rows and nullable relationships.
- Before adding a foreign key, check all existing values for orphans and ensure the intended delete behavior is safe.
- Before tightening nullability or uniqueness, measure existing rows and resolve conflicts through an explicitly approved plan.
- Never drop policies/functions/triggers or replace admin access without understanding dependencies and obtaining approval.
- Do not run production DDL/DML, destructive queries, or bulk data updates without explicit approval.
- Do not present a migration as executed unless it has actually been run and verified.

## Supabase Auth and customer account rules
- Supabase Auth owns password storage and authentication. Never build custom password storage.
- Use the verified auth session for identity. Do not accept a customer ID as proof of identity.
- Treat email/name metadata as untrusted and validate/normalize it.
- Ensure self-registration always results in `customer`; admin assignment must be a separate trusted process.
- Customer profile, address, and order queries must enforce owner-only access.
- Guest checkout and nullable `orders.customer_id` must remain compatible unless the product owner explicitly changes the requirement.
- Do not use a service-role client as a shortcut around RLS. If privileged server access is necessary, verify authorization explicitly in server code.
