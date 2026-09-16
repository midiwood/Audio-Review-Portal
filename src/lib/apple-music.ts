export function isAppleMusicUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "music.apple.com" || parsed.hostname === "embed.music.apple.com";
  } catch {
    return false;
  }
}

function titleFromSlug(slug: string) {
  return decodeURIComponent(slug)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseAppleMusicSong(url: string): { embedUrl: string; openUrl: string; title: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "music.apple.com" && parsed.hostname !== "embed.music.apple.com") {
      return null;
    }

    const songMatch = parsed.pathname.match(/\/song\/([^/]+)\/(\d+)/);
    if (songMatch) {
      parsed.hostname = "embed.music.apple.com";
      parsed.search = "";
      parsed.hash = "";
      const open = new URL(parsed.toString());
      open.hostname = "music.apple.com";
      return {
        embedUrl: parsed.toString(),
        openUrl: open.toString(),
        title: titleFromSlug(songMatch[1]),
      };
    }

    const albumMatch = parsed.pathname.match(/\/album\/([^/]+)\/(\d+)/);
    const songId = parsed.searchParams.get("i");
    if (albumMatch && songId) {
      parsed.hostname = "embed.music.apple.com";
      parsed.search = `?i=${encodeURIComponent(songId)}`;
      parsed.hash = "";
      const open = new URL(parsed.toString());
      open.hostname = "music.apple.com";
      return {
        embedUrl: parsed.toString(),
        openUrl: open.toString(),
        title: titleFromSlug(albumMatch[1]),
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function toAppleMusicEmbed(url: string): string | null {
  return parseAppleMusicSong(url)?.embedUrl ?? null;
}

export function appleMusicTitleFromUrl(url: string, fallback = "Apple Music") {
  return parseAppleMusicSong(url)?.title || fallback;
}
