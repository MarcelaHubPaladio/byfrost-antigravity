export function getEnv(name: string, fallback?: string) {
  const value = (import.meta as any).env?.[name] as string | undefined;
  if (value === undefined || value === "") return fallback;
  return value;
}

export const env = {
  SUPABASE_URL: getEnv("VITE_SUPABASE_URL"),
  SUPABASE_ANON_KEY: getEnv("VITE_SUPABASE_ANON_KEY"),
  APP_SUPER_ADMIN_EMAILS: (getEnv("VITE_APP_SUPER_ADMIN_EMAILS", "") || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
};
