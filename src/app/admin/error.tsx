"use client";

export default function AdminError({ error }: { error: Error & { digest?: string } }) {
  return <p className="admin-error">Supabase is not configured or unreachable: {error.message}</p>;
}
