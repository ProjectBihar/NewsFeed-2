/** Bihar calendar days, rather than crawler activity or a rolling 168 hours. */
export const FEED_PAGE_SIZE = 90;
const DAY = 86_400_000;
const IST = 19_800_000;

export function timelineBounds(now: Date) {
  const midnight = Math.floor((now.getTime() + IST) / DAY) * DAY - IST;
  return {
    start: new Date(midnight - 6 * DAY).toISOString(),
    today: new Date(midnight).toISOString(),
    end: new Date(midnight + DAY).toISOString(),
  };
}

export function parseTimelineParams(
  params: Record<string, string | string[] | undefined>,
  now = new Date()
) {
  const raw = params.page;
  const page =
    typeof raw === "string" && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw))
      ? Math.max(1, Math.min(Number(raw), 2_147_483_647))
      : 1;
  const requested = typeof params.asof === "string" ? Date.parse(params.asof) : NaN;
  const bounds = timelineBounds(now);
  // Previous-day snapshots expire at midnight so old cards cannot stay in the timeline.
  const asOf =
    Number.isFinite(requested) &&
    requested >= Date.parse(bounds.today) &&
    requested <= now.getTime()
      ? new Date(requested).toISOString()
      : now.toISOString();
  return { page, asOf, demo: params.demo === "1" };
}

export function timelineHref(page: number, asOf: string, demo = false) {
  const query = new URLSearchParams({ page: String(page), asof: asOf });
  if (demo) query.set("demo", "1");
  return `/?${query}`;
}
