export function digitsTail(s: string | null | undefined, tail = 11) {
  const d = String(s ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length > tail ? d.slice(-tail) : d;
}

// Loose match: compare last 11 digits (Brazil friendly) and require at least 10 digits.
export function samePhoneLoose(a: string | null | undefined, b: string | null | undefined) {
  const da = digitsTail(a);
  const db = digitsTail(b);
  if (!da || !db) return false;
  if (Math.min(da.length, db.length) < 10) return false;
  return da === db;
}
