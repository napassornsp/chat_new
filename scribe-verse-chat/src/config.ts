export type BackendProvider = "supabase" | "flask";
export const BACKEND_PROVIDER: BackendProvider = "flask";
export const APP_CONFIG = {
  BACKEND_PROVIDER,
  SUPABASE_URL: "http://localhost",      // ignored by offline shim
  SUPABASE_ANON_KEY: "offline",          // ignored by offline shim
} as const;