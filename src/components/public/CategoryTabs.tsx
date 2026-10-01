import { CATEGORIES } from "@/lib/public/categories";

/**
 * V1 category pill strip (Phase 28), migrated from
 * PBNews/src/components/CategoryTabs.tsx. Presentational only — no router;
 * the active pill uses the accent background, exactly as in V1.
 */
export default function CategoryTabs({
  active,
  onChange,
}: {
  active: string;
  onChange: (slug: string) => void;
}) {
  const tabs = [{ slug: "all", label: "All" }, ...CATEGORIES];

  return (
    <div id="topics" className="relative mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 scroll-mt-24">
      <div className="flex items-center gap-2 py-2 overflow-x-auto scrollbar-hide whitespace-nowrap">
        {tabs.map((tab) => {
          const isActive = active === tab.slug;
          return (
            <button
              key={tab.slug}
              onClick={() => onChange(tab.slug)}
              className={`inline-flex items-center text-[13px] font-medium transition-all gpu-accel flex-shrink-0 ${
                isActive
                  ? "bg-[var(--accent)] text-white px-3.5 py-1.5 rounded-full shadow-sm"
                  : "px-3 py-1.5 rounded-full hover:bg-[var(--border)]"
              }`}
              style={!isActive ? { color: "var(--ink-secondary)" } : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
