import { randomBytes, randomInt } from "node:crypto";

// No 0/O, 1/I/L: these are read out and typed from WhatsApp messages.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const PASSWORD_UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const PASSWORD_LOWER = "abcdefghijkmnpqrstuvwxyz";
const PASSWORD_DIGITS = "23456789";

export function randomString(alphabet: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** Request reference shown to customers, e.g. AMF-7K3Q */
export function requestCode(): string {
  return `AMF-${randomString(CODE_ALPHABET, 4)}`;
}

/** Public share-link slug, e.g. /v/k7m2qp9xta */
export function shareSlug(): string {
  return randomString(SLUG_ALPHABET, 10);
}

export function flipbookId(): string {
  return `c${randomString(ID_ALPHABET, 24)}`;
}

/** URL-safe random token (one-time links, file names, visitor ids). */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** Random file name that is safe on every file system. */
export function randomFileName(ext: string): string {
  return `${randomString(ID_ALPHABET, 16)}.${ext}`;
}

/**
 * Strong but easy to type from a phone: 3 groups of 4, e.g. "Kx7m-Qp3t-Zr9w"
 * (about 70 bits of randomness).
 */
export function generatePassword(): string {
  const all = PASSWORD_UPPER + PASSWORD_LOWER + PASSWORD_DIGITS;
  for (;;) {
    const password = [0, 1, 2].map(() => randomString(all, 4)).join("-");
    if (/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)) {
      return password;
    }
  }
}

/** "Ravi Kumar" -> "ravi" (a number is added by the caller). */
export function usernameBase(name: string): string {
  const first = name
    .normalize("NFKD")
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z]/g, ""))
    .find((part) => part.length >= 2);
  return (first ?? "user").slice(0, 10);
}

export function usernameCandidate(name: string): string {
  return `${usernameBase(name)}${randomInt(1000, 10000)}`;
}
