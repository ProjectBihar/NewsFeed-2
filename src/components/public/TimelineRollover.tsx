"use client";

import { useEffect } from "react";
import { timelineBounds } from "@/lib/public/timeline";

/** Expire an open timeline at midnight, including tabs suspended overnight. */
export default function TimelineRollover({ asOf }: { asOf: string }) {
  useEffect(() => {
    const end = Date.parse(timelineBounds(new Date(asOf)).end);
    const refresh = () => {
      if (Date.now() >= end) window.location.reload();
    };
    const timer = window.setTimeout(refresh, Math.max(0, end - Date.now()) + 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [asOf]);
  return null;
}
