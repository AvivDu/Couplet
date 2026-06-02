# Handoff: Group Page (Coupon Sharing) — Redesign

## Overview
This is a redesigned **group page** for a coupon-sharing app. A group is a space where members share coupons with each other (think of a WhatsApp group, but for coupons). The page shows the group identity, a slim members strip, a prominent "Share a Coupon" action, and a feed of shared coupons — each coupon attributed to the member who shared it.

This redesign replaces the previous layout where:
- Members were a large block of initial "bubbles" → now a **slim horizontal strip with first names**.
- The share action lived elsewhere → now a **big primary button** on the main page, between members and the coupon list.
- Coupons had no sender attribution → now **each coupon shows who shared it** (avatar + colored name + timestamp), like a chat message, but laid out as **cards in a list/grid**, not chat bubbles.
- The "Shared Coupons" title now has a **filter icon** on the right of the same line.

## Screenshots
Reference renders of the final design (390px wide, the prototype's canvas) in `screenshots/`:

| File | Shows |
|---|---|
| `01-list-top.png` | List layout — header, members strip, Share button, Shared Coupons header with filter icon, first coupon card. |
| `02-list-bottom.png` | List layout — lower coupon cards, including a "You"/Revoke card and others' "Use coupon" cards, showing per-sender colored names. |
| `grid.png` | Grid layout variant (2 columns), denser cards with the same sender attribution. |

## About the Design Files
The files in this bundle are **design references created in HTML/React (browser, via Babel)** — prototypes showing the intended look and behavior. They are **not production code to copy directly**.

Your task is to **recreate these designs in the existing React Native + TypeScript codebase**, using its established patterns: your own navigation, component library, styling approach (StyleSheet / styled-components / Tamagui / NativeWind — whatever the app already uses), state management, and data layer. Use the HTML as the visual + structural source of truth, and the spec below for exact values.

> The prototype uses inline web styles, web SVGs, and a browser iOS frame wrapper. None of that ships — translate to RN primitives (`View`, `Text`, `Pressable`, `FlatList`, `react-native-svg`, etc.).

## Fidelity
**High-fidelity.** Colors, typography, spacing, and layout are intentional and final. Recreate the UI to match — pixel-accurate where your design system allows. Where a value here conflicts with an existing token in your codebase, prefer your codebase's token if it's clearly the same intent (e.g. your standard card radius), otherwise use the value specified here.

---

## Screens / Views

### Group Page (single scrollable screen)
**Purpose:** Member views the group, sees who's in it, shares a coupon, and browses/filters coupons others have shared.

**Layout (top to bottom), inside a vertically scrolling container:**
1. **Header** (sticky-able)
2. **Members section label** row
3. **Members strip** (horizontal scroll)
4. **Share a Coupon** button
5. **Shared Coupons** header row (title + filter icon)
6. **Coupon list or grid**

Screen background: `#F4ECDC` (warm cream). The whole screen uses the system font (RN default / SF Pro on iOS).

---

### Component specs

#### 1. Header
- Horizontal row, vertically centered, `paddingTop: 56` (status bar area — use safe-area inset in RN instead of a hardcoded 56), `paddingBottom: 14`, `paddingLeft: 14`, `paddingRight: 18`.
- Bottom border: `1px` hairline, color `rgba(20,33,51,0.08)`.
- Contents (left → right, `gap: 12`):
  - **Back chevron** icon button (24×24), stroke `#142133`, strokeWidth 2.4.
  - **Group avatar**: 44×44 circle, background `#E76F51`, white initials ("MY"), bold, fontSize ~16.
  - **Title block** (flex: 1): group name `#142133`, fontSize 19, fontWeight 700, lineHeight 1.15; subtitle "Tap photo to edit" `#B0A085`, fontSize 13, marginTop 2.
  - **Settings gear** icon button (24×24), stroke `#142133`.

#### 2. Members section label
- Row, space-between, `padding: 14px 16px 10px`.
- Left: `MEMBERS · {count}` — fontSize 13, fontWeight 600, color `#B0A085`, uppercase, letterSpacing 0.8.
- Right: "View all ›" link — color `#E76F51`, fontSize 13, fontWeight 600, with a small chevron.

#### 3. Members strip (horizontal scroll)
- Horizontal scroll row, `gap: 14`, `padding: 0 16px 14px`. Hidden scrollbar.
- Each item is a fixed `width: 56` column, centered, `gap: 6`:
  - **Avatar**: 40×40 circle. "You" avatar uses `#E76F51` with a ring (`0 0 0 2px #fff, 0 0 0 3.5px rgba(231,111,81,0.25)`); others use `#E07A5F`. White bold initials.
  - **Name**: fontSize 11, fontWeight 600, color `#142133`, single line, ellipsized. Your own shows "You", others show first name.
- First item is an **"Add" chip**: 40×40 circle, background `#FCE5DC`, dashed border `1.5px #E76F51`, a `+` glyph in `#E76F51`; label "Add" in `#E76F51`, fontSize 11, fontWeight 600.

#### 4. Share a Coupon button
- Container padding `6px 16px 14px`.
- Full-width button, `height: 60`, `borderRadius: 18`, background `#E76F51`, white content.
- Centered row, `gap: 12`: a tag/share icon (white, ~22) + label "Share a Coupon" (fontSize 17, fontWeight 700, letterSpacing 0.2).
- Shadow: `0 8px 20px rgba(231,111,81,0.28), 0 2px 4px rgba(231,111,81,0.18)` (use RN elevation / shadow props).

#### 5. Shared Coupons header row
- Row, space-between, `padding: 10px 18px 12px`.
- Left: `SHARED COUPONS ({count})` — fontSize 13, fontWeight 700, color `#B0A085`, uppercase, letterSpacing 1.2.
- Right: **Filter icon button**: 36×36, borderRadius 12, background `#FFFFFF`, border `1px rgba(20,33,51,0.08)`, subtle shadow. Icon is three decreasing horizontal lines (filter glyph) in `#E76F51`. When a filter is active, invert: background `#E76F51`, icon white.

#### 6. Coupon card (list item — primary layout)
A white card per coupon. Container: background `#FFFFFF`, `borderRadius: 16`, border `1px rgba(20,33,51,0.08)`, shadow `0 2px 6px rgba(20,33,51,0.05)`, `padding: 14`, vertical `gap: 12`.

- **Sender attribution row** (top): horizontal, `gap: 8`, centered.
  - Avatar 24×24 (sender's color: `#E76F51` if you, else `#E07A5F`).
  - Sender name: fontSize 13, fontWeight 700. Color is the sender's **accent color** (see palette) — or `#D85A3C` for "You". Shows "You" for own coupons, else first name.
  - Timestamp pushed to the right (`marginLeft: auto`): fontSize 12, color `#B0A085`.
- **Coupon body**: horizontal, `gap: 12`, centered.
  - Tag icon tile: 46×46, borderRadius 12, background `rgba(214,167,122,0.18)`, centered tag icon (`#D6A77A`, ~26).
  - Text block (flex: 1): brand name fontSize 17, fontWeight 700, color `#142133`; category fontSize 13, color `#B0A085`, marginTop 2; "Expires {date}" fontSize 12, color `#B0A085`, marginTop 4.
- **Action button**: full-width, `padding: 9px 0`, borderRadius 10, centered text fontSize 14, fontWeight 700, color `#D85A3C`.
  - For others' coupons: label "Use coupon", background `#FCE5DC`.
  - For your own coupons: label "Revoke", background `rgba(216,90,60,0.10)`.

#### 6b. Coupon card (grid variant — optional, 2 columns)
Same card, denser: `padding: 12`, `gap: 10`. Brand name fontSize 15 (single line, ellipsized), tag tile 40×40. Expiry shown as a compact "Exp {date}" line (fontSize 11.5, `#B0A085`) below the body instead of inline. Two columns with `gap: 12`. In RN this is a `FlatList` with `numColumns={2}` or a flex-wrap row.

---

## Interactions & Behavior
- **Back chevron** → navigate back to groups list.
- **Group avatar / "Tap photo to edit"** → open group photo editor (only for admins, per your rules).
- **Gear** → open group settings screen.
- **"View all" / members strip** → open members list / member settings screen.
- **Add chip** → open invite/add member flow.
- **Share a Coupon** → open the share-coupon flow (existing screen).
- **Filter icon** → open a filter sheet (by member, category, expiry, etc.). Toggle its active (inverted) state when any filter is applied.
- **Use coupon** → redeem/reveal coupon code. **Revoke** (own coupons only) → confirm + remove the coupon from the group.
- List scrolls vertically; members strip scrolls horizontally. Use `FlatList`/`SectionList` for the coupon feed for perf.

## State Management
- `members: Member[]` — `{ id, name, initials, isYou, isAdmin }`.
- `coupons: Coupon[]` — `{ id, senderId, brand, category, expires, sharedAt }`.
- `filter` — active filter object; drives the filtered coupon list and the filter icon's active state.
- `layout: 'list' | 'grid'` — only if you want to expose the grid variant (the prototype has it behind a toggle; ship "list" unless product wants both).
- Derived: sender lookup by `senderId`; accent color assigned per member by index (stable).

## Design Tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| `bg` | `#F4ECDC` | screen background (cream) |
| `cardWhite` | `#FFFFFF` | coupon cards, filter button |
| `coral` | `#E76F51` | primary accent, buttons, your avatar |
| `coralDeep` | `#D85A3C` | action text, "You" name |
| `coralPale` | `#FCE5DC` | "Use" button bg, add-chip bg |
| `ink` | `#142133` | primary text |
| `inkSoft` | `#3A4759` | secondary text (rare) |
| `muted` | `#B0A085` | tan small-caps labels, secondary text |
| `divider` | `rgba(20,33,51,0.08)` | hairline borders |
| `tag` | `#D6A77A` | coupon tag glyph |
| `tagTile` | `rgba(214,167,122,0.18)` | tag icon tile background |
| member avatar (others) | `#E07A5F` | |

**Sender accent colors** (assigned per member by index, cycling): `#1F7A8C`, `#7A4FB7`, `#2E8B57`, `#C77B30`, `#B83A5E`. "You" overrides to `#D85A3C`.

### Spacing
Screen horizontal padding: 16. Card padding: 14 (list) / 12 (grid). Common gaps: 6, 8, 10, 12, 14. Section vertical rhythm uses the paddings noted per component above.

### Typography (system font)
| Role | Size | Weight |
|---|---|---|
| Group title | 19 | 700 |
| Brand name (list) | 17 | 700 |
| Share button label | 17 | 700 |
| Brand name (grid) | 15 | 700 |
| Action button | 14 | 700 |
| Sender name | 13 | 700 |
| Section labels | 13 | 600–700 (uppercase) |
| Category / subtitle | 13 | 400 |
| Timestamp / expiry | 12 | 400 |
| Member name / "Add" | 11 | 600 |

### Border radius
Cards 16 · tag tile 12 · filter button 12 · action button 10 · share button 18 · avatars full circle.

### Shadows (translate to RN elevation/shadow)
- Share button: `0 8px 20px rgba(231,111,81,0.28), 0 2px 4px rgba(231,111,81,0.18)`
- Card: `0 2px 6px rgba(20,33,51,0.05)`
- Filter button: `0 1px 2px rgba(0,0,0,0.04)`

## Assets / Icons
All icons in the prototype are **inline SVGs** (no image files): back chevron, gear, filter (3 lines), tag, plus, share (tag), small chevron, double-check. Recreate them with **`react-native-svg`** using the same stroke widths/colors noted above, or swap for your app's existing icon set if it has equivalents. Avatars are initials on a colored circle — no image assets required (use member photos if your data has them).

## Files in this bundle
- `Group Page.html` — the runnable prototype (open in a browser). Includes a Tweaks panel to toggle list/grid and single/multiple coupons.
- `group-page.jsx` — the actual screen + component implementations (Header, MembersRow, MembersStrip, ShareCouponButton, SharedCouponsHeader, CouponCard, Avatar, icons, `COLORS`, mock data). **This is the best code reference** — read it alongside this README.
- `ios-frame.jsx`, `tweaks-panel.jsx` — prototype-only scaffolding (device bezel + tweak controls). **Do not port these.**

## Notes for implementation
- Replace the hardcoded `paddingTop: 56` in the header with safe-area insets (`react-native-safe-area-context`).
- The coupon feed should be a `FlatList`/`SectionList`; the members strip a horizontal `FlatList` or `ScrollView`.
- Mock data in `group-page.jsx` (`MEMBERS`, `COUPONS_SEED`) illustrates the data shape — wire to your real API/store.
- Keep admin-gated affordances (photo edit, revoke, member management) behind your existing permission checks.
