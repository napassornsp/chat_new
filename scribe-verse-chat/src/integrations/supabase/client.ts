// src/integrations/supabase/client.ts
import { createClient as createOffline } from "@/lib/offline/supabaseShim";
// (Only if you still want to keep online mode as a fallback)
// import { createClient as createBrowserClient } from "@supabase/supabase-js";

const isOffline = import.meta.env.VITE_SUPABASE_MODE === "offline";

export const supabase = createOffline(); // force offline
// or: isOffline ? createOffline() : createBrowserClient(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_ANON_KEY!)
