// Extracts the bare 11-char video id from anything an admin might paste
// into the lesson editor — a full watch/embed/share URL, a youtu.be short
// link, or the id itself. Returns undefined if nothing recognizable is
// found, so the caller can show a validation error rather than saving a
// bad id.
export function extractYoutubeVideoId(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  // Bare id already (YouTube ids are exactly 11 chars of [A-Za-z0-9_-]).
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.slice(1);
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : undefined;
    }
    if (url.hostname.endsWith("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const match = url.pathname.match(/\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
      if (match) return match[1];
    }
  } catch {
    // Not a URL — fall through to "not found".
  }
  return undefined;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
