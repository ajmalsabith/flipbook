// Remembers this browser's request codes so customers can find them again.
const KEY = "amf_requests";

export function rememberRequest(code: string): void {
  try {
    const list = recentRequests().filter((c) => c !== code);
    localStorage.setItem(KEY, JSON.stringify([code, ...list].slice(0, 5)));
  } catch {
    // storage may be blocked
  }
}

export function recentRequests(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}
