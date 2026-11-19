// WhatsApp numbers are stored as digits with the country code and no "+",
// which is the format wa.me links need (e.g. 919876543210).
// Indian numbers are the default: "98765 43210", "098765 43210",
// "+91 98765 43210" and "919876543210" all become "919876543210".
// Other countries must be typed with a leading "+" or "00".

export function normalizeWhatsapp(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") || trimmed.startsWith("00")) {
    const full = trimmed.startsWith("00") ? digits.slice(2) : digits;
    if (full.startsWith("91")) return indian(full.slice(2));
    return /^[1-9]\d{7,14}$/.test(full) ? full : null;
  }
  let local = digits;
  if (local.length === 12 && local.startsWith("91")) local = local.slice(2);
  else if (local.length === 11 && local.startsWith("0")) local = local.slice(1);
  return indian(local);
}

function indian(local: string): string | null {
  return /^[6-9]\d{9}$/.test(local) ? `91${local}` : null;
}

/** "919876543210" -> "+91 98765 43210" */
export function formatWhatsapp(digits: string): string {
  if (/^91\d{10}$/.test(digits)) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}

export function whatsappLink(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
