# Cross-Project Sync Log — Mobile (bookloop_mobile)

> **How this works**: When making changes in this project that affect the shared Supabase backend,
> add a [PENDING] entry below. When switching from the webapp project, tell Claude:
> **"Check SYNC_LOG.md and apply pending changes"** — Claude will read it, apply the changes, and mark them [DONE].
>
> **Rule**: If the change could be deployed without touching Supabase at all → skip this file.

---

## What belongs here
- New tables, columns, or indexes
- RLS policy additions or changes
- New or modified Supabase RPC functions
- Changes to `database.types.ts` / generated types
- New Supabase Storage buckets or policies
- Auth flow changes (new fields, triggers, etc.)

## What does NOT belong here
- UI changes, new pages, new components
- New hooks that only read from existing tables/columns
- Styling, layout, navigation changes
- Mobile-only or webapp-only features

---

<!-- Add new entries at the TOP, below this line -->

## [PENDING] 2026-02-24 — Add push_token to profiles table
**Origin**: bookloop_mobile
**Type**: Database Migration

### What was done in the origin project:
- Added `push_token TEXT` column to the `profiles` table
- Mobile app stores the user's Expo push notification token here
- Supabase Edge Function `notify-message` reads this column to send push notifications
- Setting `push_token = NULL` disables push notifications for that user (used by Settings toggle)
- Created Edge Function at `supabase/functions/notify-message/index.ts`
- A DB Webhook must be created in Supabase dashboard: INSERT on `messages` → calls this function

### What the other project needs to do:
- [ ] Run migration SQL below in Supabase SQL editor
- [ ] Update `src/lib/database.types.ts` — add `push_token: string | null` to profiles `Row`, `Insert`, and `Update` types

### Migration SQL (apply via Supabase dashboard → SQL Editor):
```sql
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS push_token TEXT;
```

## Entry Template (copy this when adding a new entry)

<!--
## [PENDING] YYYY-MM-DD — Short description
**Origin**: bookloop_mobile | Project_BookLink
**Type**: Database Migration | RLS Policy | RPC Function | Types Update | Storage | Auth

### What was done in the origin project:
- ...

### What the other project needs to do:
- [ ] ...

### Migration SQL (if applicable — already applied to Supabase):
```sql

```
-->
