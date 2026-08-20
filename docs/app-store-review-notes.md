# App Store review notes

Draft text for App Store Connect's "App Review Information → Notes" field
(and the Play Console equivalent, adapted) when submitting the native build
(ADR-0019). Copy the **Notes for Reviewer** section below in as-is; fill in
the two placeholders first (demo account, print-flow video) — Apple's
Guideline 4.2 reviewers cannot get past sign-in or exercise hardware without
them, and an incomplete submission on either point is a near-guaranteed
rejection or delay.

## Before submitting, fill in

1. **A reviewer demo account.** Every real sign-in path (church Google
   Workspace SSO, or a personal Google account flagged for volunteer access
   in Subsplash — ADR-0001/ADR-0010) is tied to a real person's identity.
   Reviewers need something they can actually use:
   - **Recommended:** create a dedicated Google account for this purpose,
     then flag it in Subsplash with the `DirectoryAccess` custom field set
     to grant it read-only volunteer sign-in — the same mechanism a real
     volunteer uses, so the reviewer sees a realistic, populated app (mock
     names, not a blank shell). Put that account's email/password in the
     "Sign-In Required" section of App Store Connect, not in the notes text
     below.
   - The kiosk check-in flow (`/kiosk`) doesn't need an account at all —
     mention this explicitly in the notes (see below) in case the reviewer
     tries that path first and is confused there's no login screen.
2. **A short demo video of the print flow.** A reviewer's simulator/device
   has no Brother QL-820NWB to pair with, so the direct-printer-SDK
   integration — the single strongest 4.2 mitigation this app has — is
   otherwise invisible to them. Record a real check-in → label print on a
   physical device, host it somewhere reachable (unlisted YouTube link is
   fine), and drop the URL into the placeholder below.

## Notes for Reviewer (copy below this line)

---

**What this app is.** [Church name]'s private member directory and
children's-ministry check-in system, used by church staff and approved
volunteers. It is not a public or consumer-facing app — access is
restricted to people the church has explicitly authorized (staff Google
Workspace accounts, or individual volunteers granted access by a church
admin).

**Sign-in.** Use the demo account provided in the Sign-In Required section
above. Note: the "Set up or open kiosk mode" option on the sign-in screen
does **not** require an account — it's a separate, always-on check-in
station flow for a church-owned iPad, authenticated by a one-time device
setup code instead of a personal login. Both paths are real and worth
reviewing.

**Why this is a native app, not a wrapped website (Guideline 4.2):**

1. **Direct hardware integration.** The headline feature is silent label
   printing straight to a Brother QL-820NWB printer over its own SDK
   connection — no OS print dialog, no PDF hand-off. This is something a
   website fundamentally cannot do; every earlier attempt at this from
   Safari (native `window.print()`, captured images, a hidden-iframe PDF,
   the OS share sheet) hit a real platform ceiling before this app went
   native. **See the demo video: [PLACEHOLDER — add print-flow video URL]**
   — check a child in on the Events page or at a kiosk, and a label prints
   automatically with no dialog of any kind.
2. **Native sign-in.** Google Sign-In runs through Google's own native SDK,
   not a WebView-hosted OAuth redirect (which Google itself blocks as an
   untrusted embedded browser, and which doesn't survive the round trip
   back into a Capacitor WebView regardless). The resulting identity token
   is verified server-side against this app's own OAuth client before a
   session is issued.
3. **A second, hardware-based authentication path.** The kiosk mode
   described above authenticates a physical, church-owned device via a
   locally-generated setup code, independent of any individual's Google
   account — a workflow that only makes sense for a persistently-installed
   app on a dedicated device, not a browser tab.
4. **Native, touch-first navigation.** The app uses a bottom tab bar for
   primary navigation and native safe-area handling, not a responsive
   website layout scaled down for a phone.
5. **Secure on-device storage.** Printer pairing state persists via the
   platform's native secure storage (Capacitor Preferences), not
   browser-managed `localStorage`.

**On architecture:** the app's screens are served from our own backend
(the same production service the church's staff already use on the web),
because the underlying data is real member PII behind role-based access
control that has to be enforced server-side regardless of client — this is
standard practice for apps backed by a private, authenticated API (banking,
healthcare, and internal business apps all work this way) and is
orthogonal to Guideline 4.2, which is about genuine native capability, not
about whether a server renders a screen's content.

---

## Notes for this project specifically

- Update "[Church name]" and reviewer-facing specifics above before pasting
  into App Store Connect — this file is a template, not literal ready-to-send
  text.
- If Android/Play submission happens separately, the same five numbered
  points apply; Play's review process is materially more lenient about
  webview-style apps than Apple's 4.2, so this level of justification is
  usually unnecessary there, but doesn't hurt.
- Keep this file in sync if the native feature set changes materially
  (e.g. push notifications ship — add a sixth point) so the next submission
  isn't drafted from scratch.
