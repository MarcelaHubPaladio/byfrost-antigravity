export function titleizeFallback(s: string) {
  return (s ?? "")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function getStateLabel(
  journey: { default_state_machine_json?: any } | null | undefined,
  stateKey: string
) {
  const labels =
    (journey as any)?.default_state_machine_json?.labels ??
    (journey as any)?.default_state_machine_json?.state_labels ??
    null;

  const v = labels && typeof labels === "object" ? (labels as any)[stateKey] : null;
  if (typeof v === "string" && v.trim()) return v.trim();

  return titleizeFallback(stateKey);
}
