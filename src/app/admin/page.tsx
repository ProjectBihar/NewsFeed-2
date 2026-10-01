import {
  countByState,
  latestHealthPerSource,
  timeAgo,
  type HealthRow,
} from "@/lib/admin/summarize";
import { getRecentHealth, getRecentRuns, getSources } from "@/lib/admin/queries";
import { ConfigNote, dbClient } from "./db";

function asHealthRows(rows: unknown): HealthRow[] {
  return (rows ?? []) as HealthRow[];
}

export default async function AdminOverview() {
  const client = dbClient();
  if (!client) return <ConfigNote />;
  const [sources, health, runs] = await Promise.all([
    getSources(client),
    getRecentHealth(client),
    getRecentRuns(1, client),
  ]);
  const latest = latestHealthPerSource(asHealthRows(health));
  const counts = countByState(
    latest,
    (sources ?? []).map((s) => (s as { id: number }).id)
  );
  const run = (runs?.[0] ?? null) as null | {
    started_at: string;
    completed_at: string | null;
    status: string;
    sources_attempted: number;
    sources_succeeded: number;
    urls_discovered: number;
    urls_fetched: number;
    articles_extracted: number;
    articles_relevant: number;
    stories_created: number;
  };
  const alerts = (health ?? [])
    .map(
      (h) =>
        h as {
          diagnostics?: { alerts?: Array<{ code: string; severity: string }> } | null;
          source_id: number;
          checked_at: string;
        }
    )
    .flatMap((h) =>
      (h.diagnostics?.alerts ?? []).map((a) => ({
        ...a,
        source_id: h.source_id,
        checked_at: h.checked_at,
      }))
    )
    .slice(0, 20);
  return (
    <div>
      <h2>System status</h2>
      <div className="admin-cards">
        {(Object.entries(counts) as Array<[string, number]>).map(([state, n]) => (
          <div className="admin-card" key={state}>
            <strong>{n}</strong>
            {state}
          </div>
        ))}
      </div>
      <h2>Last crawl</h2>
      {run ? (
        <table className="admin-table">
          <tbody>
            <tr>
              <th>Started</th>
              <td>{timeAgo(run.started_at)}</td>
            </tr>
            <tr>
              <th>Status</th>
              <td>{run.status}</td>
            </tr>
            <tr>
              <th>Sources</th>
              <td>
                {run.sources_succeeded}/{run.sources_attempted} succeeded
              </td>
            </tr>
            <tr>
              <th>Discovered</th>
              <td>{run.urls_discovered}</td>
            </tr>
            <tr>
              <th>Fetched</th>
              <td>{run.urls_fetched}</td>
            </tr>
            <tr>
              <th>Extracted</th>
              <td>{run.articles_extracted}</td>
            </tr>
            <tr>
              <th>Relevant</th>
              <td>{run.articles_relevant}</td>
            </tr>
            <tr>
              <th>Stories</th>
              <td>{run.stories_created}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="admin-note">No crawl runs recorded yet.</p>
      )}
      <h2>Recent alerts</h2>
      {alerts.length === 0 ? (
        <p className="admin-note">No drift alerts recorded.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Alert</th>
              <th>Severity</th>
              <th>Source</th>
              <th>Checked</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a, i) => (
              <tr key={i}>
                <td>{a.code}</td>
                <td>{a.severity}</td>
                <td>{a.source_id}</td>
                <td>{timeAgo(a.checked_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
