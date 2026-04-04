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

## [PENDING] 2026-03-31 — Add signup_platform to profiles + impression tracking
**Origin**: bookloop_mobile
**Type**: Database Migration + RPC Function + Auth

### What was done in the origin project:
- Added `signup_platform text` column to `profiles` table (values: 'android', 'ios', 'web', null for existing users)
- Updated `handle_new_user` trigger to read `signup_platform` from `raw_user_meta_data`
- Mobile app passes `signup_platform: Platform.OS` in both email signup (AuthScreen) and Google OAuth (googleAuth.ts)
- Created `book_impressions` table for feed impression tracking
- Updated `get_personalized_catalog` RPC: now tracks impressions server-side and penalizes books shown but not clicked (-3 per impression, capped at -15)

### What the other project needs to do:
- [ ] Update `src/lib/database.types.ts` — add `signup_platform: string | null` to profiles `Row`, `Insert`, `Update` types
- [ ] Pass `signup_platform: 'web'` in auth metadata on signup: `options: { data: { ..., signup_platform: 'web' } }`
- [ ] Update `get_personalized_catalog` in database.types.ts if using the RPC (return type unchanged, no new params)

### Migration SQL (already applied to Supabase):
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_platform text DEFAULT NULL;

CREATE TABLE public.book_impressions (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  seen_count int NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);
CREATE INDEX idx_book_impressions_user ON book_impressions(user_id);
ALTER TABLE book_impressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own impressions" ON book_impressions FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

## [PENDING] 2026-03-20 — Add last_active_at to profiles table
**Origin**: bookloop_mobile
**Type**: Database Migration + Types Update

### What was done in the origin project:
- Added `last_active_at timestamptz DEFAULT now()` to `profiles` table
- Mobile app bumps this value once per session (if >1 hour stale) in AuthProvider
- Displayed on BookDetailScreen (seller info) and SellerProfileScreen as "Active today" / "Active 3 days ago" etc.
- Green dot for active within 1 hour, muted dot otherwise

### What the other project needs to do:
- [ ] Update `src/lib/database.types.ts` — add `last_active_at: string | null` to profiles `Row`, `Insert`, `Update` types
- [ ] Optionally display last active on book detail / seller profile pages
- [ ] Optionally bump `last_active_at` on page load (same throttle: if >1 hour stale)

### Migration SQL (already applied to Supabase):
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz DEFAULT now();
```

## [DONE] 2026-03-20 — Personalized catalog + auth fix
**Origin**: bookloop_mobile
**Type**: RPC Function + Types Update

### What was done in the origin project:

**1. Personalized catalog RPC (`get_personalized_catalog`)**
- Supabase RPC that scores ALL active books for the logged-in user and returns them sorted by score, paginated
- Scoring formula (0–100): genre(0–35) + location(0–20) + recency(0–20) + quality(0–10) + popularity(0–5) + jitter(0–5) + view_penalty(0 to -20)
- View penalty: books the user already viewed get demoted — viewed <1d ago: -20, <3d: -15, <7d: -10, <14d: -5, older: 0. Uses LEFT JOIN on `book_views` table (indexed on user_id+book_id)
- Genre score: uses `profiles.genre_affinities` (learned from views) with `profiles.favorite_genres` as a 0.5 floor
- Location score: same city as user = 20, book has shipping = 8, else = 0
- Recency: <1d=20, <3d=16, <1w=11, <2w=6, <1m=2, older=0
- Quality: condition new/like_new = +5, has images = +5
- Popularity: `view_count / max(view_count)` × 5
- Jitter: `setseed(p_seed)` + `random() * 5` — deterministic per session, pass a float 0–1

**Parameters:**
```
p_limit int (default 20)
p_offset int (default 0)
p_search text (nullable — ILIKE on title/author)
p_listing_type text (nullable — 'free'/'sale'/'trade')
p_genres text[] (nullable — overlaps with books.genres)
p_conditions text[] (nullable — IN filter on condition)
p_city text (nullable — exact match)
p_shipping boolean (default false — filter shipping_type = 'shipping')
p_min_price int (nullable)
p_max_price int (nullable)
p_blocked_ids uuid[] (default '{}')
p_seed float (default 0.5 — for deterministic jitter across pages)
```

**Returns:** `id, title, author, city, images, listing_type, price, condition, genres, created_at, location_lat, location_lng, user_id, score, total_count`

**2. Genre affinities infrastructure (already existed)**
- `profiles.genre_affinities` jsonb — learned weights per genre, updated on book view via `update_genre_affinities` RPC
- `profiles.favorite_genres` text[] — explicit picks from setup
- Both are read by `get_personalized_catalog` automatically

**3. CatalogScreen changes**
- Added "For You" as default sort option (sparkles icon)
- When sort = 'for_you' and user is logged in → calls RPC
- Other sorts (newest, price) still use direct query
- `p_seed` generated once per mount via `useRef(Math.random())`, regenerated on pull-to-refresh

**4. Auth fix (AuthProvider.tsx)**
- `clearStoredSession()` now clears AsyncStorage `sb-*` keys on native (was only clearing web localStorage)
- `onAuthStateChange` calls `clearStoredSession()` when session is null (invalid refresh token)

### What the other project needs to do:
- [ ] Update `src/lib/database.types.ts` — add `get_personalized_catalog` to Functions types with all params above
- [ ] Add "For You" sort option to webapp catalog page — call `supabase.rpc('get_personalized_catalog', {...})` with filter params + a stable `p_seed` per page session
- [ ] Generate `p_seed` once (e.g. `useState(() => Math.random())`), regenerate on manual refresh
- [ ] Fallback to normal query if user is not logged in

### Migration SQL (already applied to Supabase):
```sql
-- RPC already exists in Supabase. No tables/columns to add.
-- To inspect: SELECT prosrc FROM pg_proc WHERE proname = 'get_personalized_catalog';
```

## [DONE] 2026-03-18 — Book view tracking (view_count + book_views table + RPC)
**Origin**: bookloop_mobile
**Type**: Database Migration + RPC Function + Types Update

### What was done in the origin project:
- Added `view_count integer NOT NULL DEFAULT 0` to `books` table
- Created `book_views` table: `(id, user_id, book_id, viewed_at)` with `UNIQUE(user_id, book_id)`
- Created RPC `record_book_view(p_book_id uuid)` — inserts into book_views + increments view_count atomically. Skips own books and duplicate views.
- Called in `BookDetailScreen.tsx` on mount (fire and forget)

### What the other project needs to do:
- [ ] Update `src/lib/database.types.ts` — add `view_count: number` to books `Row`, `Insert`, `Update` types
- [ ] `src/pages/BookDetail.tsx` — the RPC call is ALREADY added locally (useEffect + supabase.rpc). Just commit and push to Vercel:
  ```
  git add src/pages/BookDetail.tsx
  git commit -m "Add record_book_view RPC call on book detail page"
  git push
  ```
- [ ] After deploying, test with the user: open a book on the webapp while logged in → verify view_count increments in Supabase. Use this SQL to check:
  ```sql
  SELECT b.title, b.view_count, bv.user_id, bv.viewed_at
  FROM books b LEFT JOIN book_views bv ON bv.book_id = b.id
  WHERE b.id = '26597b31-4ce4-4174-ab16-aad4e9131a67'
  ORDER BY bv.viewed_at DESC;
  ```
- [ ] Optionally display `view_count` on the book detail page ("X people viewed this")

### Migration SQL (already applied to Supabase):
```sql
ALTER TABLE books ADD COLUMN view_count integer NOT NULL DEFAULT 0;

CREATE TABLE book_views (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  book_id uuid REFERENCES books(id) ON DELETE CASCADE NOT NULL,
  viewed_at timestamptz DEFAULT now(),
  UNIQUE(user_id, book_id)
);

CREATE OR REPLACE FUNCTION record_book_view(p_book_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_book_owner uuid;
  v_rows int;
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  SELECT user_id INTO v_book_owner FROM books WHERE id = p_book_id;
  IF v_book_owner = v_user_id THEN RETURN; END IF;
  INSERT INTO book_views (user_id, book_id) VALUES (v_user_id, p_book_id)
  ON CONFLICT (user_id, book_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    UPDATE books SET view_count = view_count + 1 WHERE id = p_book_id;
  END IF;
END;
$$;
```

## [DONE] 2026-03-16 — Add shipping_type + shipping_details to books table
**Origin**: bookloop_mobile
**Type**: Database Migration

### What was done in the origin project:
- Added `shipping_type TEXT NOT NULL DEFAULT 'pickup'` (check: 'pickup' | 'shipping') to `books` table
- Added `shipping_details TEXT` (nullable) to `books` table
- PublishScreen + EditBookScreen: 2-chip selector (איסוף עצמי / משלוח) + free-text details field
- BookDetailScreen: shipping row in details box
- CatalogScreen + FiltersModal: "משלוח" filter

### What the other project needs to do:
- [x] Update `src/lib/database.types.ts` — add `shipping_type: string` and `shipping_details: string | null` to books `Row`, `Insert`, and `Update` types
- [x] Show shipping info on book detail page (webapp)
- [ ] Add shipping filter to catalog/search (optional)

### Migration SQL (already applied to Supabase):
```sql
ALTER TABLE books
  ADD COLUMN shipping_type text NOT NULL DEFAULT 'pickup' CHECK (shipping_type IN ('pickup', 'shipping')),
  ADD COLUMN shipping_details text;
```

## [DONE] 2026-03-16 — Add push_token to profiles table
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
- [x] Run migration SQL below in Supabase SQL editor
- [x] Update `src/lib/database.types.ts` — add `push_token: string | null` to profiles `Row`, `Insert`, and `Update` types

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
