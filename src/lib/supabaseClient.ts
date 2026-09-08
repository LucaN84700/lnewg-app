import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définis dans .env.local",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// supabase-js only exposes a generic "non-2xx status code" message for Edge Function
// errors; the actual reason is in the response body, so we pull it out here.
export async function functionErrorMessage(invokeError: unknown): Promise<string> {
  const context = (invokeError as { context?: Response })?.context;
  if (context) {
    try {
      const body = await context.clone().json();
      if (body?.error) return body.error as string;
    } catch {
      // response body wasn't JSON, fall through to the generic message
    }
  }
  return invokeError instanceof Error ? invokeError.message : String(invokeError);
}
