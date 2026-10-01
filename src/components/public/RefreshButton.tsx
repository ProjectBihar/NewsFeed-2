"use client";

import { useState } from "react";

/**
 * V1 refresh button (Phase 28) with the auth/session refetch removed: the
 * public feed is server-rendered, so a plain reload re-reads it.
 */
export default function RefreshButton({
  className,
  ariaLabel = "Refresh stories",
}: {
  className?: string;
  ariaLabel?: string;
}) {
  const [refreshing, setRefreshing] = useState(false);

  return (
    <button
      onClick={() => {
        setRefreshing(true);
        window.location.reload();
      }}
      disabled={refreshing}
      className={className}
      style={{ color: "var(--ink-secondary)" }}
      aria-label={ariaLabel}
    >
      {refreshing ? "..." : "Refresh"}
    </button>
  );
}
