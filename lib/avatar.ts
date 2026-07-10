// Shared avatar tint palette — design/README.md §Design Tokens "Avatar
// tint palette". Cards cycle by list index; single-record views (e.g. the
// member detail page) derive a stable tint from the record's id instead.

export const AVATAR_TINTS = [
  { bg: "#D8EFFB", text: "#1B6E93" },
  { bg: "#DCE6EE", text: "#2E4E6E" },
  { bg: "#E9E2F0", text: "#5B4A80" },
  { bg: "#E6EEE1", text: "#3F6B45" },
];

export function initialsOf(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export function avatarTintForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}
