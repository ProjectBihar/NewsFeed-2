// V1 relative-time formatter, migrated verbatim from
// PBNews/src/components/NewsCard.tsx (Phase 28).
// A future-dated timestamp yields "just now"; malformed input yields "—".
export function timeAgo(timestamp: number | string): string {
  const time = typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp;
  if (!Number.isFinite(time)) return "—";

  const diff = Date.now() - time;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

/**
 * Absolute stamp for the story page (`28 Sep, 10:00`), always rendered in
 * Bihar time regardless of the server/browser zone — live rows arrive as
 * UTC (`+00:00`), fixture rows as `+05:30`. Unparsable input yields null so
 * the caller can say "time unknown" honestly.
 */
export function formatStamp(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = pick("day");
  const month = pick("month").slice(0, 3); // en-GB yields "Sept"; keep "Sep"
  const hour = pick("hour");
  const minute = pick("minute");
  if (!day || !month || !hour || !minute) return null;
  return `${day} ${month}, ${hour}:${minute}`;
}
