# BookLoop Mobile — Claude Instructions

## Cross-Project Sync Protocol

This project has a sibling project: **Project_BookLink** (webapp) at `C:\Users\idanl\OneDrive\Desktop\Project_BookLink`.
Both projects share the **same Supabase database**.

### When to update SYNC_LOG.md
After making ANY of these changes, add a [PENDING] entry to `SYNC_LOG.md`:
- New table, column, index, or constraint
- RLS policy addition or change
- New or modified Supabase RPC function
- Changes to `database.types.ts` / generated types
- New Supabase Storage bucket or policy
- Auth flow changes (new fields, triggers, etc.)

**Do NOT add an entry for**: UI changes, new pages/components, new hooks that only read existing tables, styling, navigation.

**Rule of thumb**: "If I could deploy this without touching Supabase → don't add to sync log."

### When switching from the webapp project
If the user says "check the sync log" or mentions switching from webapp:
1. Read `SYNC_LOG.md` in this project
2. Find all `[PENDING]` entries
3. Apply the required changes to this project
4. Mark resolved entries as `[DONE]` with today's date

### SYNC_LOG.md entry format
```
## [PENDING] YYYY-MM-DD — Short description
**Origin**: bookloop_mobile | Project_BookLink
**Type**: Database Migration | RLS Policy | RPC Function | Types Update | Storage | Auth

### What was done in the origin project:
- bullet points of what changed

### What the other project needs to do:
- [ ] checkbox item

### Migration SQL (if applicable — already applied to Supabase):
(SQL here)
```

---

## Supabase MCP

This project has a Supabase MCP configured in `.mcp.json` (project ref: `zivyfdflfiaiojpoqhlb`).
Use it to run SQL, inspect tables, and manage the database directly — no need to copy-paste into the dashboard.

---

# BookLoop Mobile — Design System

## Color Palette
```ts
const C = {
  bg:           '#fafaf9',  // app background (warm off-white)
  white:        '#ffffff',
  border:       '#e7e5e4',  // subtle warm gray border
  text:         '#1c1917',  // primary text
  sub:          '#78716c',  // secondary text
  muted:        '#a8a29e',  // placeholder / icon / meta text
  primary:      '#2563eb',  // blue — CTAs, active states
  primaryLight: '#eff6ff',  // blue tint — active chip backgrounds
  emerald:      '#059669',  // free listings
  emeraldLight: '#d1fae5',
  amber:        '#d97706',  // trade listings
  amberLight:   '#fef3c7',
};
```

## UI Rules (apply to every screen)

### Search bar
- `backgroundColor: C.white` — never use gray fill
- `borderWidth: 1, borderColor: C.border`
- `borderRadius: 12`

### Cards (book grid)
- White background, `borderRadius: 14–16`, `borderWidth: 1, borderColor: C.border`
- Card title: `fontSize: 13, fontWeight: '600', color: C.text`
- Author: `fontSize: 11, color: C.sub`
- City: `fontSize: 11, color: C.muted` with `location-outline` icon
- Price text: `fontSize: 13, fontWeight: '600'` — colored by type (primary/emerald/amber), NOT bold (`700`)

### Genre / tag pills
- `backgroundColor: '#f5f5f4'` (warm neutral), NOT blue (`primaryLight`)
- `color: C.sub`, `fontWeight: '500'`
- `borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2`

### Active filter chips (applied filters row)
- `backgroundColor: C.primaryLight, borderColor: C.primary + '40'`
- `color: C.primary, fontWeight: '600'`

### Buttons
- Primary CTA: `backgroundColor: C.primary, borderRadius: 12`
- Text: `color: C.white, fontSize: 15, fontWeight: '600'`
- Outline button (inactive): `borderWidth: 1, borderColor: C.border` — NOT primary blue border
- Icon in inactive button: `color: C.sub` — NOT primary blue

### Filter / icon buttons (inactive)
- `borderWidth: 1, borderColor: C.border` (subtle gray)
- Icon: `color: C.sub`
- When active: `backgroundColor: C.primary`, icon: `color: C.white`

### Headers
- `backgroundColor: C.white`, `borderBottomWidth: 1, borderBottomColor: C.border`
- `paddingTop: insets.top + 12` (always use `useSafeAreaInsets`)
- Logo: `width: 150, height: 34` — no title text next to it on catalog-style headers

### Typography weights
- Screen titles / headings: `fontWeight: '700'`
- Card titles, button labels: `fontWeight: '600'`
- Tags, secondary labels: `fontWeight: '500'`
- Prices: `fontWeight: '600'` (NOT `'700'`)
- Meta / muted text: no explicit fontWeight (system default)

### No emojis
- Never use emojis in filter chips, badges, or labels — text only

### Icons
- Use `Ionicons` throughout
- Tabs (active/inactive): `home`/`home-outline`, `search`/`search-outline`, `chatbubble-ellipses`/`chatbubble-ellipses-outline`, `person`/`person-outline`
- No emojis as icons anywhere

### Listing type colors
- Sale: `C.primary` (#2563eb)
- Free: `C.emerald` (#059669)
- Trade: `C.amber` (#d97706)

### Safe area
- Always `import { useSafeAreaInsets } from 'react-native-safe-area-context'`
- Apply `paddingTop: insets.top + 12` to header containers
- `SafeAreaProvider` wraps the whole app in `App.tsx`

### Skeleton loaders
- Use skeleton components from `src/components/Skeleton.tsx` instead of `ActivityIndicator` for full-page loading states
