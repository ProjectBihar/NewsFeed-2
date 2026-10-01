/**
 * Public data-state notices (Phase 28). The reader-facing counterpart to the
 * admin ConfigNote: the site stays honest about where its stories come from.
 */
export function DemoNotice() {
  return (
    <div
      className="glass-card px-4 py-3 text-[12.5px]"
      style={{ color: "var(--ink-secondary)" }}
      role="status"
    >
      Demo stories — fixture data from the reviewed Phase 16 clustering benchmark, not the live
      feed.
    </div>
  );
}

export function NotConfiguredNotice() {
  return (
    <div
      className="glass-card px-4 py-3 text-[12.5px]"
      style={{ color: "var(--ink-secondary)" }}
      role="status"
    >
      Supabase is not configured (see .env.example) — no live stories yet.
    </div>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div
      className="glass-card px-4 py-3 text-[12.5px]"
      style={{ color: "var(--ink-secondary)" }}
      role="alert"
    >
      Could not load stories: {message}
    </div>
  );
}
