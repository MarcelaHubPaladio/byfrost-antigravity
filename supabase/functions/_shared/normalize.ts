export function normalizePhoneE164Like(input: string | null | undefined) {
  if (!input) return null;

  const raw = String(input).trim();
  if (!raw) return null;

  // Preserve WhatsApp Group and Broadcast IDs
  if (raw.toLowerCase().includes("@g.us") || raw.toLowerCase().includes("@broadcast")) {
    return raw;
  }

  // Z-API sometimes emits LID identifiers (e.g. "1864...@lid"). These are NOT phone numbers.
  // Returning null prevents creating customers/cases with bogus long numbers.
  if (raw.toLowerCase().includes("@lid")) return null;

  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // Some providers prefix with 00 (international dialing). Strip it.
  digits = digits.replace(/^00+/, "");

  // Some providers include a leading trunk '0' (e.g. 0 + DDD + number). Strip a single leading 0.
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

  // If it includes country code (55), ensure it's a plausible BR phone length.
  if (digits.startsWith("55")) {
    // 55 + 10 (landline) = 12, 55 + 11 (mobile) = 13
    if (digits.length !== 12 && digits.length !== 13) return null;
    return `+${digits}`;
  }

  // If it's not a plausible BR local phone length, treat as unknown (avoid +55 + random long ids).
  if (digits.length !== 10 && digits.length !== 11) return null;

  return `+55${digits}`;
}

export function nowIso() {
  return new Date().toISOString();
}