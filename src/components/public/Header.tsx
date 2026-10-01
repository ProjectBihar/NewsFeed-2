import RefreshButton from "./RefreshButton";
import ThemeToggle from "./ThemeToggle";

/**
 * V1 sticky glass header (Phase 28) with login, logout, session checks, and
 * the user avatar removed — title, story count, refresh, and dark mode only.
 * Desktop row + stacked mobile row, exactly as in V1. The count pill renders
 * only when a total is given (the story page has no feed total to show).
 */
export default function Header({ totalStories }: { totalStories?: number }) {
  return (
    <header className="glass-header sticky top-0 z-50">
      <div className="max-w-[1200px] mx-auto px-3 sm:px-6 lg:px-[105px]">
        {/* Desktop (sm+): single balanced row */}
        <div className="hidden sm:flex items-center justify-between py-3">
          {/* Left: Title */}
          <h1
            className="text-[19px] font-bold tracking-tight flex-shrink-0"
            style={{ color: "var(--ink)", fontWeight: 700 }}
          >
            PrōjectBihar Newsfeed
          </h1>

          {/* Right: Grouped controls */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {totalStories !== undefined && (
              <div className="flex items-center gap-2">
                <div className="glass-pill flex items-center gap-1 rounded-lg px-2.5 py-1">
                  <span
                    className="text-[13px] font-bold leading-none"
                    style={{ color: "var(--ink)" }}
                  >
                    {totalStories}
                  </span>
                  <span
                    className="text-[9px] font-medium uppercase tracking-wider"
                    style={{ color: "var(--muted)" }}
                  >
                    total
                  </span>
                </div>

                <div className="w-px h-5" style={{ backgroundColor: "var(--border)" }} />
              </div>
            )}

            <div className="flex items-center gap-2">
              <RefreshButton className="glass-pill px-3 py-1.5 text-[12px] font-medium rounded-lg disabled:opacity-50" />
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Mobile (< sm): two-row stacked layout */}
        <div className="flex sm:hidden flex-col py-2.5 gap-2">
          {/* Row 1: Title + Dark mode */}
          <div className="flex items-center justify-between">
            <h1
              className="text-[16px] font-bold tracking-tight truncate"
              style={{ color: "var(--ink)", fontWeight: 700 }}
            >
              PrōjectBihar Newsfeed
            </h1>
            <ThemeToggle size="sm" />
          </div>

          {/* Row 2: Stats + Refresh */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {totalStories !== undefined && (
              <div className="glass-pill flex items-center gap-1 rounded-lg px-2 py-0.5">
                <span
                  className="text-[12px] font-bold leading-none"
                  style={{ color: "var(--ink)" }}
                >
                  {totalStories}
                </span>
                <span
                  className="text-[8px] font-medium uppercase"
                  style={{ color: "var(--muted)" }}
                >
                  total
                </span>
              </div>
            )}

            <div className="ml-auto">
              <RefreshButton
                className="glass-pill px-2.5 py-1 text-[11px] font-medium rounded-lg disabled:opacity-50"
                ariaLabel="Refresh stories"
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
