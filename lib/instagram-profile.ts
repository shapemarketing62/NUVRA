export interface InstagramProfileReference { handle: string; url: string }

export function parseInstagramProfile(value?: string | null): InstagramProfileReference | null {
  const input = value?.trim();
  if (!input) return null;
  let handle = input.replace(/^@/, "");
  if (/instagram\.com/i.test(input)) {
    try {
      const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 1 || /^(p|reel|stories|explore)$/i.test(parts[0])) return null;
      handle = parts[0];
    } catch { return null; }
  }
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle)) return null;
  return { handle: handle.toLowerCase(), url: `https://www.instagram.com/${handle.toLowerCase()}/` };
}
