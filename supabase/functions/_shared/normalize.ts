export function normalizePhoneE164Like(input: string | null | undefined) {
  if (!input) return null;

  const raw = String(input).trim();
  if (!raw) return null;

  // Z-API sometimes emits LID identifiers (e.g. "1864...@lid"). These are NOT phone numbers.
  // Returning null prevents creating customers/cases with bogus long numbers.
  if (raw.toLowerCase().includes("@lid")) return null;

  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // Best-effort: if already includes country (55), keep it; otherwise assume BR.
  if (digits.startsWith("55")) return `+${digits}`;

  // If it's not a plausible BR local phone length, treat as unknown (avoid +55 + random long ids).
  if (digits.length !== 10 && digits.length !== 11) return null;

  return `+55${digits}`;
}

export function nowIso() {
  return new Date().toISOString();
}