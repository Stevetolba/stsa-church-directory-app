// Matching a signed-in person (Google name + email) to a Subsplash profile.
// Children often have their parent's email on their own profile, so an email
// alone can point at several people; the name has to match too.

// Titles/honorifics that appear in a Subsplash profile's first name ("Fr.
// Anthony") but usually not in a Google account name ("Anthony Messeh").
const HONORIFICS = new Set([
  "fr", "father", "abouna", "abona", "dr", "mr", "mrs", "ms", "miss", "rev", "reverend",
  "deacon", "hegumen", "sr", "sister", "br", "brother", "pastor", "mother", "jr", "sr", "ii", "iii",
]);

export function nameTokens(value: string | null | undefined): string[] {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/['-]/g, "")
    .split(/\s+/)
    .filter((t) => t && !HONORIFICS.has(t));
}

// True when `googleName` refers to the profile's person: every last-name token
// and at least one first-name token appear in the Google name. Middle names
// and honorifics on either side don't matter ("Steve Wagih Tolba" matches
// Steve Tolba; "Anthony Messeh" matches "Fr. Anthony Messeh").
//
// `googleName === undefined` means "no name to check" (legacy callers) and
// matches. A blank/unknown name (null or empty) does NOT match — fail closed.
export function profileMatchesName(
  profile: { first_name?: string | null; last_name?: string | null },
  googleName: string | null | undefined
): boolean {
  if (googleName === undefined) return true;
  const given = new Set(nameTokens(googleName));
  if (given.size === 0) return false;
  const first = nameTokens(profile.first_name);
  const last = nameTokens(profile.last_name);
  if (first.length === 0 || last.length === 0) return false;
  return last.every((t) => given.has(t)) && first.some((t) => given.has(t));
}
