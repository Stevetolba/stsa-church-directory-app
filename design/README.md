# Handoff: Staff Church Directory — Member List Screen

## Overview
A staff-only web app for church office staff to look up members, regular attendees, and visitors. This handoff covers the first screen: the Member List (directory home), with sidebar navigation, search, status/campus filtering, and a card grid of member records.

## About the Design Files
The file in this bundle (`Member Directory.dc.html`) is a **design reference built in HTML** — a prototype showing intended look, layout, and interaction, not production code to copy directly. The task is to **recreate this design in the target codebase's existing environment** (React, Vue, native, etc.) using its established component patterns, state management, and data layer — or, if no environment exists yet, choose the most appropriate framework and implement it there.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and component structure below are final and should be recreated pixel-accurately. Sample member data is placeholder — wire to the real member data source.

## Screens / Views

### Screen: Member List
**Purpose:** Staff browse, search, and filter the church membership directory.

**Layout:**
- Full-height two-column layout: fixed-width sidebar (248px) + fluid main content area.
- Sidebar: navy background (#1A3A5C), 28px top/bottom padding, 20px side padding, flex column.
- Main content: off-white background (#FAF7F1), 36px top padding, 44px horizontal padding, 60px bottom padding.

**Components:**

1. **Sidebar brand mark** (top of sidebar)
   - 36×36 circle, gold fill (#C8973A), with a small navy ring icon centered inside (14px circle, 2px navy border)
   - Church name "Grace Chapel" — Lora, 600 weight, 16px, off-white (#FAF7F1)
   - Subtitle "Staff Directory" — Public Sans, 11px, uppercase, letter-spacing 0.04em, color #B9C4CF
   - 10px gap between mark and text; 36px margin below

2. **Sidebar nav section**
   - Section label "Directory" — 11px, 600 weight, uppercase, letter-spacing 0.08em, color #7C8FA0
   - Nav items: "Members" (active), "Families & Households" (inactive)
   - Each item: 18×18 icon (square w/ 4px radius when active = filled indicator, circle when inactive), label 14.5px
   - Active item: background rgba(200,151,58,0.16), text color #FAF7F1, icon color gold (#C8973A), font-weight 700
   - Inactive item: transparent background, text color #B7C3CF, icon color #7C8FA0, font-weight 500
   - Row padding 10px/12px, border-radius 9px, 2px bottom margin

3. **Sidebar footer / account row** (pinned to bottom via margin-top:auto, top border rgba(255,255,255,0.12))
   - 28×28 circle avatar, background #2E4E6E, initials "RM" in gold (#EFD9AE), 11px bold
   - Name "Rachel Moore" — 13px, 600 weight, off-white
   - Role "Office Admin" — 11.5px, color #8FA1B2

4. **Page header** (main content top)
   - Title "Members" — Lora, 600 weight, 30px, navy (#1A3A5C)
   - Subtitle: dynamic count, e.g. "9 of 9 members" — 14.5px, color #5B7185
   - Right-aligned pill badge "Staff only" — background #EFEAE0, border 1px #E1D8C6, color #8A7A57, 12px bold, 34×34 circle

5. **Search + filter row** (flex row, wraps on narrow widths, 28px bottom margin, 14px gap)
   - Search input: white background, border 1px #E5DCC8, radius 10px, padding 11px/16px, 260–440px width, subtle shadow. Placeholder: "Search by name, email, or phone." Includes a small circular magnifier icon (16px, #97A9B8 stroke).
   - Status filter chips: "All / Member / Regular Attendee / Visitor" — pill buttons, 13px 600 weight, 8px/14px padding, border-radius 999px. Active chip: navy background (#1A3A5C), off-white text, navy border. Inactive: white background, border #E5DCC8, text #5B7185.
   - Campus filter: native `<select>` styled as a pill — "All Campuses / Arlington / Leesburg" — same visual treatment as inactive chips (white bg, border #E5DCC8, text #5B7185, 13px 600 weight, radius 999px, 9px/14px padding).
   - "Add Member" button: navy background (#1A3A5C), off-white text, 14px 600 weight, 11px/20px padding, radius 10px, plus-icon (gold cross mark) at left, pushed to far right of the row via margin-left:auto.

6. **Member card grid**
   - CSS grid, `repeat(auto-fill, minmax(320px, 1fr))`, 18px gap.
   - Each card: white background, border 1px #EAE2D0, radius 14px, padding 20px, subtle shadow (0 1px 3px rgba(26,58,92,0.05)).
   - Card header row: 46×46 circular avatar with initials (Lora 600, 16px) on a tinted background (rotates through 4 palette pairs — gold/navy/purple/green tints, see Design Tokens), name (Lora 600, 17px, navy, truncates with ellipsis), household + campus line ("Whitfield Family · Arlington", 12.5px, color #8A94A0), and a status badge pill top-right.
   - Divider: 1px line, color #F0EBDF, full width, 14px vertical rhythm.
   - Contact rows: email (small rectangle "envelope" icon, 1.5px border #97A9B8) and phone (small rounded rectangle "phone" icon, same border) each at 13.5px, color #3E5670, 9px icon-to-text gap.

7. **Empty state**
   - Centered text, 14.5px, color #8A94A0: `No members match "{search term}".` — shown only when the filtered list is empty.

## Interactions & Behavior
- **Search**: live text filter across name, email, and phone (case-insensitive substring match). Debouncing not required at this data scale but recommended for a real dataset.
- **Status filter chips**: single-select; clicking a chip sets the active status filter (All / Member / Regular Attendee / Visitor) and highlights it navy.
- **Campus filter**: single-select dropdown (All Campuses / Arlington / Leesburg).
- **Filters combine with AND logic** with the search text (status + campus + search all narrow the same list).
- **Nav items**: "Members" is the current screen (active state shown). "Families & Households" is a placeholder destination — not yet built.
- **Add Member button**: no destination defined yet — wire to a member-creation flow/modal.
- No hover/loading/error states were designed beyond the above; add standard hover elevation on cards and buttons per your design system if desired.

## State Management
- `searchText: string` — current search input value.
- `statusFilter: 'All' | 'Member' | 'Regular Attendee' | 'Visitor'`
- `campusFilter: 'All Campuses' | 'Arlington' | 'Leesburg'`
- `members: Member[]` — the full roster, fetched from the real data source.
- Derived: `visibleMembers` = members filtered by the three criteria above.

### Member record shape
```
{
  name: string,
  household: string,   // e.g. "Whitfield Family"
  campus: 'Arlington' | 'Leesburg',
  email: string,
  phone: string,
  status: 'Member' | 'Regular Attendee' | 'Visitor'
}
```

## Design Tokens

**Colors**
- Navy (primary): `#1A3A5C`
- Gold (accent): `#C8973A`
- Off-white background: `#FAF7F1`
- Card border: `#EAE2D0`
- Divider: `#F0EBDF`
- Muted body text: `#5B7185` / `#3E5670` / `#8A94A0`
- Sidebar inactive text: `#B7C3CF`
- Sidebar muted text: `#7C8FA0` / `#8FA1B2`

**Status badge colors**
- Member: background `#EAF1E9`, text `#3F6B45`
- Regular Attendee: background `#FDF1DC`, text `#8A6A24`
- Visitor: background `#EEF2F6`, text `#4C6178`

**Avatar tint palette** (cycles per card index)
1. bg `#EFE2C8`, text `#8A6A24`
2. bg `#DCE6EE`, text `#2E4E6E`
3. bg `#E9E2F0`, text `#5B4A80`
4. bg `#E6EEE1`, text `#3F6B45`

**Typography**
- Headings: Lora (Google Font), weights 500/600/700, italic 500 available
- Body/UI: Public Sans (Google Font), weights 400/500/600/700
- Scale used: 30px (page title), 17px (card name), 16px (brand name), 14.5px (body/inputs), 13.5px (contact rows), 13px (chips/select), 12.5px (household line), 12px (badges), 11.5–11px (labels/captions)

**Radii & shadows**
- Cards: 14px radius, `0 1px 3px rgba(26,58,92,0.05)`
- Inputs/buttons: 10px radius
- Pills/chips/badges: 999px (full)
- Search bar shadow: `0 1px 2px rgba(26,58,92,0.04)`

## Assets
No photographic assets — avatars are initials on tinted circles (no icon library used; small UI icons like search/mail/phone/plus are drawn with basic CSS shapes, not SVGs or an icon font). If real member photos become available, swap the initials avatar for an `<img>` with the same circular mask and fall back to initials when no photo exists.

## Files
- `Member Directory.dc.html` — full working prototype (open directly in a browser). Contains inline styles only (no external CSS files) and sample data for 9 members across 2 campuses and 3 statuses.
