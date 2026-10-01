import { getSupabaseClient } from "@/lib/supabase";

/** Explicit unconfigured-DB state: rendered instead of throwing, so the
 * observatory degrades to an explanatory note with or without React
 * error boundaries engaging. */
export function ConfigNote() {
  return (
    <p className="admin-error">
      Supabase is not configured (see .env.example). Connect a database to use the observatory.
    </p>
  );
}

export function dbClient() {
  return getSupabaseClient();
}
