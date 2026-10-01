import type { FeedCounts, FeedMode } from "@/lib/public/feed-modes";

/**
 * V1 FeedTabSwitcher port (Phase 29), migrated from
 * PBNews/src/app/page.tsx — the plan's two feed modes with live counts and
 * default Curated. V1's language filter pills are not carried over: the plan
 * lists only Curated / All Bihar News here, and language coverage is shown on
 * the story card itself.
 */
export default function FeedSwitcher({
  mode,
  onChange,
  counts,
}: {
  mode: FeedMode;
  onChange: (mode: FeedMode) => void;
  counts: FeedCounts;
}) {
  const tabs: Array<{ key: FeedMode; label: string; count: number }> = [
    { key: "curated", label: "Curated", count: counts.curated },
    { key: "all", label: "All Bihar News", count: counts.all },
  ];

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      {tabs.map((tab) => {
        const isActive = mode === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            aria-pressed={isActive}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${
              isActive ? "bg-[var(--accent)] text-white shadow-sm" : "glass-pill hover:opacity-80"
            }`}
            style={!isActive ? { color: "var(--ink-secondary)" } : undefined}
          >
            {tab.label}
            <span className="ml-1.5 text-[11px] opacity-70">({tab.count})</span>
          </button>
        );
      })}
    </div>
  );
}
