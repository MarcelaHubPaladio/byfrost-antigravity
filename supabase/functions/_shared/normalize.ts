export function normalizePhoneE164Like(input: string | null | undefined) {
  if (!input) return null;

  const raw = String(input).trim();
  if (!raw) return null;

  // Preserve WhatsApp Group and Broadcast IDs
  const lower = raw.toLowerCase();
  if (lower.includes("@g.us") || lower.includes("@broadcast") || lower.includes("-") || (lower.startsWith("1203") && lower.length > 15)) {
    return raw;
  }

  // Extract digits (ignoring @lid or other artifacts)
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // Some providers prefix with 00 (international dialing). Strip it.
  digits = digits.replace(/^00+/, "");

  // Trunk code removal for BR specifically (starts with 0 + 11 or 12 digits, meaning 011999999999)
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

  // BR validation (starts with 55)
  if (digits.startsWith("55")) {
    if (digits.length !== 12 && digits.length !== 13) return null;
    return `+${digits}`;
  }

  // Other country codes support
  // If the number doesn't start with 55, it might already include a valid country code. 
  // Global numbers generally have between 10 and 15 digits.
  if (digits.length >= 10 && digits.length <= 15) {
    // If it looks like a BR number without 55 (10-11 digits), prepend 55.
    if (digits.length === 10 || digits.length === 11) {
      return `+55${digits}`;
    }
    // Otherwise, assume it's an international number that already includes its country code.
    return `+${digits}`;
  }

  return null;
}

export function nowIso() {
  return new Date().toISOString();
}