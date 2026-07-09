# Church Directory Web App — Technical Specification
> **For Claude Code:** Use this document to scaffold and build the full web app.
> Strategy: Plan with Opus, build with Sonnet. Web first — mobile later.

---

## 1. Project Overview

**App Name:** Church Directory (web)
**Type:** Staff-only internal web application
**Platform:** Web (desktop + mobile browser responsive)
**Purpose:** Allow church staff to browse, search, and manage member profiles and households — powered by the Subsplash API. Built as a web app first; mobile app (React Native) comes later using the same API layer.

**Future path:** Once this web app is stable, the API service layer and TypeScript types reuse directly in a React Native mobile app.

---

## 2. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR, API routes, file-based routing, Vercel-ready |
| Language | TypeScript | Type safety across the whole app |
| Styling | Tailwind CSS + shadcn/ui | Fast, consistent, accessible components |
| Auth | JWT via httpOnly cookie | Secure token storage — never exposed to JS |
| API Layer | Next.js Route Handlers (`/app/api/`) | Proxy Subsplash calls server-side, hide credentials |
| State | Zustand | Lightweight client state for user session + UI |
| Forms | React Hook Form + Zod | Validation for edit screens |
| Data Fetching | SWR | Client-side caching, revalidation, loading states |
| Icons | Lucide React | Clean, consistent icon set |
| Deploy | Vercel (free tier) | Zero-config Next.js deployment |

---

## 3. Why Server-Side API Proxy Matters

**Never call the Subsplash API directly from the browser.**
Your `client_secret` and `org_key` must stay on the server. The architecture works like this:

```
Browser (staff)
    ↓ fetch("/api/profiles")
Next.js Route Handler (server)        ← credentials stored here in .env
    ↓ fetch("https://core.subsplash.com/people/v1/profiles", { Bearer token })
Subsplash API
    ↓ returns data
Next.js Route Handler
    ↓ returns clean JSON
Browser (staff sees member list)
```

This means:
- API credentials never leave the server
- Staff browsers never touch Subsplash directly
- You control what data gets exposed to the frontend

---

## 4. Authentication Flow

**Method:** Subsplash client credentials (OAuth2 JWT Bearer token)

### Login Steps:
1. Staff visits `/login`
2. Enters email + password → browser POSTs to `/api/auth/login`
3. Next.js route handler calls `POST https://core.subsplash.com/tokens/v1/token`
4. On success → JWT stored in **httpOnly cookie** (name: `subsplash_token`)
5. JWT decoded server-side to extract role claims
6. Staff redirected to `/` (dashboard)
7. Every subsequent page/API request reads token from cookie server-side

### Session Check:
- Middleware (`middleware.ts`) runs on every protected route
- If no valid cookie → redirect to `/login`
- If cookie present but expired → clear cookie → redirect to `/login`

### Logout:
- Staff clicks "Sign Out" → POST `/api/auth/logout` → clears cookie → redirect to `/login`

### Role Detection:
- Decode JWT on login → extract role from claims
- Store role in Zustand client state after login
- `admin`: can view + edit profiles
- `staff`: view-only

---

## 5. Project Folder Structure

```
/church-directory-web
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx              # Login page
│   ├── (dashboard)/
│   │   ├── layout.tsx                # Sidebar + header shell
│   │   ├── page.tsx                  # Dashboard / home
│   │   ├── members/
│   │   │   ├── page.tsx              # Member list + search
│   │   │   └── [id]/
│   │   │       ├── page.tsx          # Member profile detail
│   │   │       └── edit/
│   │   │           └── page.tsx      # Edit profile (admin only)
│   │   └── households/
│   │       ├── page.tsx              # Household list
│   │       └── [id]/
│   │           └── page.tsx          # Household detail
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts        # POST → get Subsplash JWT
│   │   │   └── logout/route.ts       # POST → clear cookie
│   │   ├── profiles/
│   │   │   ├── route.ts              # GET list, query params passed through
│   │   │   └── [id]/route.ts         # GET one, PATCH (admin)
│   │   └── households/
│   │       ├── route.ts              # GET list
│   │       └── [id]/route.ts         # GET one
│   ├── layout.tsx                    # Root layout
│   └── globals.css                   # Tailwind base
├── components/
│   ├── ui/                           # shadcn/ui components (auto-generated)
│   ├── MemberCard.tsx                # Member list row/card
│   ├── HouseholdCard.tsx             # Household list row/card
│   ├── SearchBar.tsx                 # Debounced search input
│   ├── RoleBadge.tsx                 # Admin / Staff badge
│   ├── Sidebar.tsx                   # Nav sidebar
│   ├── Header.tsx                    # Top bar with user info + logout
│   └── EmptyState.tsx                # Empty list placeholder
├── lib/
│   ├── subsplash.ts                  # Subsplash API client (server-only)
│   ├── auth.ts                       # JWT decode, cookie helpers
│   └── utils.ts                      # cn(), formatters, etc.
├── hooks/
│   ├── useMembers.ts                 # SWR hook for member list
│   └── useHouseholds.ts              # SWR hook for households
├── stores/
│   └── authStore.ts                  # Zustand: role, user info
├── types/
│   ├── profile.ts                    # Profile TypeScript types
│   ├── household.ts                  # Household TypeScript types
│   └── auth.ts                       # Auth/session types
├── middleware.ts                     # Route protection
├── .env.local                        # Secrets (never commit)
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 6. Subsplash API Integration

### Server-Side Client (`lib/subsplash.ts`)
```typescript
// lib/subsplash.ts  — SERVER ONLY, never import in client components
const BASE_URL = 'https://core.subsplash.com';

async function getToken(): Promise<string> {
  // Read from cookie in request context (passed in from route handlers)
  // OR use client_credentials flow for service-level calls
}

export async function subsplashFetch(
  path: string,
  token: string,
  options?: RequestInit
) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`Subsplash API error: ${res.status}`);
  return res.json();
}
```

### API Endpoints Used

#### Auth
| Method | Subsplash Endpoint | Our Route |
|---|---|---|
| POST | `/tokens/v1/token` | `/api/auth/login` |

#### Profiles
| Method | Subsplash Endpoint | Our Route |
|---|---|---|
| GET | `/people/v1/profiles` | `/api/profiles` |
| GET | `/people/v1/profiles/{id}` | `/api/profiles/[id]` |
| PATCH | `/people/v1/profiles/{id}` | `/api/profiles/[id]` (admin only) |

**Key query params:**
- `filter[status]=active` — active members only
- `filter[first_name]=John` — search by name
- `page[size]=25&page[number]=1` — pagination
- `sort=last_name` — alphabetical sort

#### Households
| Method | Subsplash Endpoint | Our Route |
|---|---|---|
| GET | `/people/v1/households` | `/api/households` |
| GET | `/people/v1/households/{id}` | `/api/households/[id]` |

### Response Parsing
Subsplash follows JSON:API. Parse like this:
```typescript
const data = await subsplashFetch('/people/v1/profiles?filter[status]=active', token);
const profiles = data._embedded?.profiles ?? data.data ?? [];
const nextPage = data._links?.next ?? null;
```

---

## 7. Page Specifications

### `/login` — Login Page
- Church logo + "Staff Directory" heading
- Email input
- Password input
- "Sign In" button → POST `/api/auth/login`
- Error message on failed login ("Invalid credentials")
- Loading spinner during auth
- Redirect to `/` on success

### `/` — Dashboard
- "Welcome, [First Name]" heading
- Stats cards: Total Members, Total Households
- Quick search bar → navigates to `/members?search=...`
- Two action cards: "Browse Members" and "Browse Households"
- Recent activity (optional v2 feature)

### `/members` — Member List
- Page heading: "Members"
- Search bar (debounced 300ms → updates URL query param `?search=`)
- Filter by status (active/inactive toggle)
- Alphabetical list of members
- Each `MemberCard` shows: full name, email, phone, status badge
- Pagination controls (25 per page)
- Pull-to-refresh button
- Empty state if no results found

### `/members/[id]` — Member Profile
- Back button → `/members`
- Full name (large heading)
- Profile photo (if available)
- **Contact section:** email(s), phone(s) — click to copy
- **Personal section:** date of birth, gender, marital status, baptism date
- **Household section:** household name (link to `/households/[id]`)
- Status badge (active / inactive / pending)
- **Admin only:** "Edit Profile" button → `/members/[id]/edit`

### `/members/[id]/edit` — Edit Profile (Admin Only)
- Redirect non-admins back to profile page
- Pre-filled form with current values
- Editable: first_name, last_name, email, phone_number, status
- Zod validation schema
- "Save Changes" → PATCH `/api/profiles/[id]`
- "Cancel" → back to profile
- Success toast notification
- Error message on failure

### `/households` — Household List
- Page heading: "Households"
- Search bar (by household name)
- Each `HouseholdCard`: household name, primary email, primary phone, member count
- Pagination (25 per page)
- Empty state

### `/households/[id]` — Household Detail
- Household name (heading)
- Primary contact info
- Member list: all profiles in this household
- Each member tappable → `/members/[id]`

---

## 8. Middleware (Route Protection)

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('subsplash_token')?.value;
  const isAuthPage = request.nextUrl.pathname.startsWith('/login');

  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

---

## 9. Role-Based Access Control

```typescript
// In server components — read from cookie/session
import { getSessionRole } from '@/lib/auth';
const role = await getSessionRole();
const isAdmin = role === 'admin';

// In client components — read from Zustand
import { useAuthStore } from '@/stores/authStore';
const { role } = useAuthStore();
const isAdmin = role === 'admin';

// Guard edit page server-side
if (!isAdmin) redirect(`/members/${id}`);
```

---

## 10. TypeScript Types

```typescript
// types/profile.ts
export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  emails?: string[];
  phone_number?: string;
  phones?: string[];
  date_of_birth?: string;
  gender?: string;
  marital_status?: string;
  household_role?: string;
  status: 'active' | 'inactive' | 'pending';
  baptism_date?: string;
  custom_fields?: CustomField[];
  created_at: string;
  updated_at: string;
}

export interface CustomField {
  id: string;
  label: string;
  value: string;
}

// types/household.ts
export interface Household {
  id: string;
  name: string;
  primary_email?: string;
  primary_phone?: string;
  status?: string;
  members?: Profile[];
  created_at: string;
  updated_at: string;
}

// types/auth.ts
export interface Session {
  token: string;
  role: 'admin' | 'staff';
  staffId: string;
  firstName: string;
  lastName: string;
  expiresAt: number;
}
```

---

## 11. App Theme

**Visual direction:** Clean, trustworthy, and warm — fitting for a church internal tool.
Not corporate-cold, not overly decorative. Staff should feel at home using it.

```typescript
// tailwind.config.ts — extend colors
colors: {
  brand: {
    navy:   '#1A3A5C',   // Primary — trust, authority
    gold:   '#C8973A',   // Accent — warmth, community
    cream:  '#F7F6F2',   // Background — soft, welcoming
  },
  status: {
    active:   '#16A34A', // Green
    inactive: '#DC2626', // Red
    pending:  '#D97706', // Amber
  },
  role: {
    admin: '#7C3AED',    // Purple
    staff: '#2563EB',    // Blue
  }
}
```

**UI feel:** Sidebar navigation on desktop, bottom nav on mobile browser. Cards with subtle shadows. Clean table-style member list. Generous whitespace.

---

## 12. Environment Variables

```bash
# .env.local — NEVER commit this file
SUBSPLASH_BASE_URL=https://core.subsplash.com
SUBSPLASH_ORG_KEY=your_org_key_here
SUBSPLASH_CLIENT_ID=your_client_id_here
SUBSPLASH_CLIENT_SECRET=your_client_secret_here
JWT_COOKIE_SECRET=a_random_32_char_string_for_signing
NEXT_PUBLIC_APP_NAME=Church Directory
```

---

## 13. Build & Run Instructions (for Claude Code)

```bash
# 1. Create Next.js project
npx create-next-app@latest church-directory-web \
  --typescript --tailwind --eslint --app --src-dir=no --import-alias="@/*"
cd church-directory-web

# 2. Install dependencies
npm install zustand swr react-hook-form zod lucide-react
npm install @hookform/resolvers jose cookies-next

# 3. Install shadcn/ui
npx shadcn-ui@latest init
npx shadcn-ui@latest add button input card badge toast avatar separator

# 4. Set up environment
cp .env.example .env.local
# Fill in Subsplash credentials when available

# 5. Run dev server
npm run dev
# App available at http://localhost:3000

# 6. Deploy to Vercel
npx vercel
# Follow prompts — add env vars in Vercel dashboard
```

---

## 14. Claude Code Build Order

Build in this sequence — each step is testable before moving on:

1. **Project scaffold** — create-next-app, install deps, shadcn/ui init
2. **Types** — `types/profile.ts`, `types/household.ts`, `types/auth.ts`
3. **Subsplash client** — `lib/subsplash.ts` (mock responses until credentials arrive)
4. **Auth API routes** — `/api/auth/login`, `/api/auth/logout`
5. **Middleware** — route protection, cookie check
6. **Login page** — `/login` UI + form + error states
7. **Layout shell** — sidebar, header, navigation
8. **Dashboard** — `/` stats + quick actions
9. **Member list** — `/members` with search + pagination
10. **Member detail** — `/members/[id]` full profile view
11. **Edit profile** — `/members/[id]/edit` admin-only form
12. **Household list** — `/households`
13. **Household detail** — `/households/[id]` with member links
14. **Polish** — empty states, loading skeletons, error boundaries, toast notifications
15. **Deploy** — push to GitHub → connect to Vercel → add env vars

---

## 15. Known Considerations & Gotchas

- **Mock data first:** Build all UI with static mock data before connecting real API — faster iteration, no credential dependency
- **PATCH format:** Subsplash may require JSON:API format: `{ data: { type: 'profiles', id, attributes: {...} } }`
- **Pagination:** Use `_links.next` from responses for cursor-based pagination
- **Profile photos:** Check `_links` or `_embedded` in real API responses — not guaranteed in schema
- **Search debounce:** Add 300ms debounce on search input to avoid hammering the API
- **httpOnly cookies:** Can't read these in client JS — use a `/api/auth/me` endpoint to expose safe session info to client
- **Role in JWT:** If role isn't in JWT claims, fetch the staff member's own profile on login and derive role from their Subsplash permissions
- **Vercel env vars:** Add all `.env.local` variables in the Vercel dashboard under Project Settings → Environment Variables before deploying

---

## 16. Future: Mobile App Path

When ready to build mobile:
- Copy `types/` folder directly into React Native project (100% reusable)
- Copy API service logic — same Subsplash endpoints, same response parsing
- Replace Next.js routes with Expo Router file-based routes (very similar structure)
- Replace Tailwind/shadcn components with React Native Paper equivalents
- Replace httpOnly cookie auth with `expo-secure-store` JWT storage

Roughly **60–70% of the logic** carries over. The web app is not throwaway work — it's the foundation.
