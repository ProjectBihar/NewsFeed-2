import { getAdminClient } from "@/lib/admin/client";

/** Explicit unconfigured-DB state: rendered instead of throwing, so the
 * observatory degrades to an explanatory note with or without React
 * error boundaries engaging. */
export function ConfigNote() {
  return (
    <p className="admin-error">
      Admin Supabase access is not configured (see .env.example). Configure the server-only
      service-role key to use the observatory.
    </p>
  );
}

export function dbClient() {
  return getAdminClient();
}
