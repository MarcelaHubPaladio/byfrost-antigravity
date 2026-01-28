export function normalizePhoneE164Like(input: string | null | undefined) {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, "");
  if (!digits) return null;

  // Best-effort: if already includes country (55), keep it; otherwise assume BR.
  if (digits.startsWith("55")) return `+${digits}`;
  return `+55${digits}`;
}

export function nowIso() {
  return new Date().toISOString();
}
