function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${escapeRe(name)}=([^;]*)`),
  );
  if (!match) return null;
  const raw = match[1].trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function setCookie(name: string, value: string, days = 365) {
  document.cookie = `${name}=${encodeURIComponent(value)};max-age=${days * 86400};path=/;SameSite=Lax`;
}
