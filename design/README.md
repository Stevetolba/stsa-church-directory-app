# Handoff: STSA Church Staff Directory — Member List & Households

## Overview
A staff-only web app for STSA Church office staff to look up members, regular attendees, and visitors, and to view household/family groupings. This handoff covers two views in one screen shell: **Members** (default) and **Families & Households**, toggled via sidebar nav.

## About the Design Files
The file in this bundle (`Member Directory.dc.html`) is a **design reference built in HTML** — a prototype showing intended look, layout, and interaction, not production code to copy directly. The task is to **recreate this design in the target codebase's existing environment** (React, Vue, native, etc.) using its established component patterns, state management, and data layer — or, if no environment exists yet, choose the most appropriate framework and implement it there.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and component structure below are final and should be recreated pixel-accurately. Sample member/household data is placeholder — wire to the real data source.

## Screens / Views

Both views share the same shell: fixed-width sidebar (248px, navy `#1A3A5C`) + fluid main content area (off-white `#FAF7F1`, 36px top / 44px horizontal / 60px bottom padding).

### Shared: Sidebar
1. **Brand mark** — 36×36 circle, white fill, containing the STSA Church logo image (`assets/stsa-logo.png`), `object-fit: cover`. Church name "STSA Church" — Lora, 600 weight, 16px, off-white. Subtitle "Staff Directory" — Public Sans, 11px, uppercase, letter-spacing 0.04em, color `#B9C4CF`. 10px gap between mark and text; 36px margin below.
2. **Nav section** — label "Directory" (11px, 600 weight, uppercase, letter-spacing 0.08em, color `#7C8FA0`). Two items: "Members" and "Families & Households". Each row: 18×18 icon (filled square, 4px radius, when active; outlined circle when inactive), label 14.5px. Active: background `rgba(41,182,246,0.18)`, text `#FAF7F1`, icon `#29B6F6` (brand blue), weight 700. Inactive: transparent background, text `#B7C3CF`, icon `#7C8FA0`, weight 500. Row padding 10px/12px, radius 9px.
3. **Account footer** (pinned bottom via `margin-top:auto`, top border `rgba(255,255,255,0.12)`) — 28×28 circle avatar, background `#2E4E6E`, initials "RM" in light blue `#8FD9FA`, 11px bold. Name "Rachel Moore" (13px, 600, off-white). Role "Office Admin" (11.5px, `#8FA1B2`).

### Screen: Members (default view)
**Purpose:** Staff browse, search, and filter the membership directory.

**Header:** Title "Members" (Lora 600, 30px, navy). Subtitle: dynamic count e.g. "14 of 14 members" (14.5px, `#5B7185`). Right-aligned circular badge "Staff only" — background `#E4F4FC`, border `#C7E9F7`, text `#1B6E93`, 12px bold, 34×34.

**Search + filter row** (flex, wraps, 28px bottom margin, 14px gap):
- Search input: white bg, border `#E5DCC8`, radius 10px, padding 11px/16px, 260–440px wide, subtle shadow. Placeholder "Search by name, email, or phone." Small circular magnifier icon (16px, `#97A9B8` stroke).
- Status filter chips: All / Member / Regular Attendee / Visitor — pills, 13px 600 weight, 8px/14px padding, radius 999px. Active: navy bg `#1A3A5C`, off-white text. Inactive: white bg, border `#E5DCC8`, text `#5B7185`.
- Campus filter: native `<select>` styled as a pill (All Campuses / Arlington / Leesburg) — same visual treatment as inactive chips.
- "Add Member" button: navy bg, off-white text, 14px 600, 11px/20px padding, radius 10px, plus-icon in brand blue `#29B6F6` at left, pushed right via `margin-left:auto`.

**Member card grid:** CSS grid `repeat(auto-fill, minmax(320px, 1fr))`, 18px gap. Each card: white bg, border `#EAE2D0`, radius 14px, padding 20px, shadow `0 1px 3px rgba(26,58,92,0.05)`.
- Header row: 46×46 circular avatar with initials (Lora 600, 16px) on a tinted background (cycles through 4 palette pairs — see Design Tokens), name (Lora 600, 17px, navy, ellipsis-truncates), "Household · Campus" line (12.5px, `#8A94A0`), status badge pill top-right.
- Divider: 1px line `#F0EBDF`.
- Contact rows: email (small rect "envelope" icon, 1.5px border `#97A9B8`) and phone (small rounded-rect "phone" icon) at 13.5px, color `#3E5670`, 9px icon-to-text gap.
- Empty state: centered text (14.5px, `#8A94A0`) `No members match "{search term}".`

### Screen: Families & Households
**Purpose:** Staff browse households/families as units and drill into every member of a household.

**Header:** Title "Families & Households" (same style as Members). Subtitle: dynamic count e.g. "9 of 9 households". Search placeholder changes to "Search by household name or address." Status chips are hidden on this view (not applicable); campus filter remains. "Add Member" button becomes "Add Household" (same style).

**Household card grid:** same grid/card shell as member cards, but each card is clickable (`cursor:pointer`) and shows:
- 46×46 rounded-square icon tile (radius 12px, background `#E4F4FC`, a simple "house" glyph in `#1B6E93`) instead of an avatar.
- Household name (Lora 600, 17px, navy), "Campus · N members" line (12.5px, `#8A94A0`).
- Campus badge pill top-right (background `#EEF2F6`, text `#4C6178`).
- Divider, then the household's street address (13.5px, `#3E5670`).
- A row of up to 4 overlapping circular avatar chips (28px, 2px white border, -8px overlap) previewing household members.
- Empty state: `No households match "{search term}".`

**Household detail modal** (opens on card click):
- Full-screen overlay, `rgba(26,58,92,0.45)` backdrop, click-outside-to-close.
- Panel: off-white bg, radius 18px, max-width 560px, max-height 82vh (scrolls), shadow `0 20px 60px rgba(26,58,92,0.3)`.
- Header band: navy bg, radius 18px on top corners only, padding 26px/28px. Household name (Lora 600, 22px, off-white), "Campus · Address" line (13.5px, `#B9C4CF`). Circular close (×) button top-right, `rgba(255,255,255,0.12)` bg, off-white glyph.
- Body: section label "N members" (11px, 600, uppercase, letter-spacing 0.06em, `#8A94A0`), then one row per member — white card, border `#EAE2D0`, radius 12px, padding 16px, flex row: 42px avatar, name + status badge, email, phone (all same styles as the member card fields).

## Interactions & Behavior
- **View toggle**: clicking "Members" or "Families & Households" in the sidebar switches the main content and resets search/status/campus filters.
- **Search**: live text filter — on Members, matches name/email/phone; on Households, matches household name/address. Case-insensitive substring match.
- **Status filter chips** (Members only): single-select, combines with AND logic alongside search and campus.
- **Campus filter**: single-select dropdown, present on both views, combines with AND logic.
- **Household card click**: opens the household detail modal listing all members of that household with full contact info and status.
- **Modal close**: via the × button or clicking the backdrop outside the panel.
- **Add Member / Add Household buttons**: no destination defined yet — wire to creation flows/modals.
- No hover/loading/error states designed beyond the above; add standard hover elevation on cards/buttons per your design system.

## State Management
- `view: 'members' | 'households'`
- `searchText: string`
- `statusFilter: 'All' | 'Member' | 'Regular Attendee' | 'Visitor'` (Members view only)
- `campusFilter: 'All Campuses' | 'Arlington' | 'Leesburg'`
- `selectedHouseholdId: string | null` — drives the detail modal
- `members: Member[]`, `households: Household[]` — fetched from the real data source
- Derived: `visibleMembers` / `visibleHouseholds` = filtered by the criteria above; `selectedHousehold` = household matching `selectedHouseholdId` with its member list attached

### Data shapes
```
Household {
  id: string,
  name: string,          // e.g. "Whitfield Family"
  campus: 'Arlington' | 'Leesburg',
  address: string,
  members: Member[]       // derived: all members with this householdId
}

Member {
  name: string,
  householdId: string,    // FK to Household.id
  email: string,
  phone: string,
  status: 'Member' | 'Regular Attendee' | 'Visitor'
}
```
Households can contain multiple members (e.g. spouses); a household with one member is valid too.

## Design Tokens

**Brand colors (from STSA Church logo)**
- Navy (primary): `#1A3A5C` (logo navy is closer to `#0E2C4C` — UI uses the softer `#1A3A5C` for larger surfaces; use the exact logo navy for the mark itself)
- Sky blue (accent): `#29B6F6`
- Off-white background: `#FAF7F1`

**Supporting colors**
- Card border: `#EAE2D0`
- Divider: `#F0EBDF`
- Muted body text: `#5B7185` / `#3E5670` / `#8A94A0`
- Sidebar inactive text: `#B7C3CF`
- Sidebar muted text: `#7C8FA0` / `#8FA1B2`

**Status badge colors**
- Member: background `#EAF1E9`, text `#3F6B45`
- Regular Attendee: background `#FDF1DC`, text `#8A6A24`
- Visitor: background `#EEF2F6`, text `#4C6178`

**Avatar tint palette** (cycles per member index)
1. bg `#D8EFFB`, text `#1B6E93` (brand blue tint)
2. bg `#DCE6EE`, text `#2E4E6E`
3. bg `#E9E2F0`, text `#5B4A80`
4. bg `#E6EEE1`, text `#3F6B45`

**Typography**
- Headings: Lora (Google Font), weights 500/600/700, italic 500 available
- Body/UI: Public Sans (Google Font), weights 400/500/600/700
- Scale used: 30px (page title), 22px (modal header name), 17px (card name), 16px (brand name), 15.5px (modal member name), 14.5px (body/inputs), 13.5px (contact rows/address), 13px (chips/select/modal contact), 12.5px (household/campus line), 12px (badges), 11.5–11px (labels/captions)

**Radii & shadows**
- Cards: 14px radius, `0 1px 3px rgba(26,58,92,0.05)`
- Modal panel: 18px radius, `0 20px 60px rgba(26,58,92,0.3)`
- Inputs/buttons: 10px radius
- Pills/chips/badges: 999px (full)
- Search bar shadow: `0 1px 2px rgba(26,58,92,0.04)`

## Assets
- `assets/stsa-logo.png` — STSA Church logo (navy/sky-blue cross mark), used as the sidebar brand mark. Source file included in this bundle.
- No member photos — avatars are initials on tinted circles. Small UI icons (search/mail/phone/plus/house/close) are drawn with basic CSS shapes, not SVGs or an icon font. If real member photos become available, swap the initials avatar for an `<img>` with the same circular mask and fall back to initials when no photo exists.

## Files
- `Member Directory.dc.html` — full working prototype (open directly in a browser). Contains inline styles only (no external CSS files) and sample data: 14 members across 9 households, 2 campuses, and 3 statuses.
- `assets/stsa-logo.png` — logo asset referenced by the prototype.
