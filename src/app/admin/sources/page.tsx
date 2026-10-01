import { latestHealthPerSource, timeAgo, type HealthRow } from "@/lib/admin/summarize";
import { getEndpoints, getRecentHealth, getSources } from "@/lib/admin/queries";
import { ConfigNote, dbClient } from "../db";

export default async function AdminSources() {
  const client = dbClient();
  if (!client) return <ConfigNote />;
  const [sources, endpoints, health] = await Promise.all([
    getSources(client),
    getEndpoints(client),
    getRecentHealth(client),
  ]);
  const latest = latestHealthPerSource((health ?? []) as HealthRow[]);
  const endpointCount = new Map<number, number>();
  const lastSuccess = new Map<number, string>();
  for (const e of (endpoints ?? []) as Array<{
    source_id: number;
    last_success_at: string | null;
  }>) {
    endpointCount.set(e.source_id, (endpointCount.get(e.source_id) ?? 0) + 1);
    const at = e.last_success_at;
    if (at && (!lastSuccess.get(e.source_id) || at > (lastSuccess.get(e.source_id) as string))) {
      lastSuccess.set(e.source_id, at);
    }
  }
  return (
    <div>
      <h2>Sources</h2>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Scope</th>
            <th>Type</th>
            <th>Priority</th>
            <th>Active</th>
            <th>Endpoints</th>
            <th>Health</th>
            <th>Last success</th>
          </tr>
        </thead>
        <tbody>
          {(sources ?? []).map((s) => {
            const source = s as {
              id: number;
              name: string;
              domain: string;
              scope: string;
              source_type: string;
              priority: string;
              active: boolean;
            };
            return (
              <tr key={source.id}>
                <td>
                  {source.name}
                  <br />
                  <span className="admin-note">{source.domain}</span>
                </td>
                <td>{source.scope}</td>
                <td>{source.source_type}</td>
                <td>{source.priority}</td>
                <td>{source.active ? "yes" : "no"}</td>
                <td>{endpointCount.get(source.id) ?? 0}</td>
                <td>{latest.get(source.id)?.health_state ?? "UNKNOWN"}</td>
                <td>{timeAgo(lastSuccess.get(source.id) ?? null)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
