import { timeAgo } from "@/lib/admin/summarize";
import { getCorrections } from "@/lib/admin/queries";
import { ConfigNote, dbClient } from "../db";

export default async function AdminCorrections() {
  const client = dbClient();
  if (!client) return <ConfigNote />;
  const rows = (await getCorrections(client)) as Array<{
    id: number;
    article_id: number | null;
    story_id: number | null;
    field_name: string;
    old_value: string | null;
    new_value: string | null;
    reason: string | null;
    created_at: string;
  }>;
  if (!rows || rows.length === 0) {
    return (
      <p className="admin-note">No corrections recorded yet. Corrections UI arrives in Phase 22.</p>
    );
  }
  return (
    <div>
      <h2>Corrections audit trail</h2>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Article</th>
            <th>Story</th>
            <th>Old</th>
            <th>New</th>
            <th>Reason</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.field_name}</td>
              <td>{row.article_id ?? "—"}</td>
              <td>{row.story_id ?? "—"}</td>
              <td>{row.old_value ?? "—"}</td>
              <td>{row.new_value ?? "—"}</td>
              <td>{row.reason ?? "—"}</td>
              <td>{timeAgo(row.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
