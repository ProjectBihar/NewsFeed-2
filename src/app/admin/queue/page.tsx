import { timeAgo } from "@/lib/admin/summarize";
import { getQueue, type QueueFilter } from "@/lib/admin/queries";
import { ConfigNote, dbClient } from "../db";

const FILTERS: QueueFilter[] = ["failed", "blocked", "retry", "rejected"];

export default async function AdminQueue({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status: QueueFilter = FILTERS.includes(params.status as QueueFilter)
    ? (params.status as QueueFilter)
    : "failed";
  const client = dbClient();
  if (!client) return <ConfigNote />;
  const rows = await getQueue(client, status);
  return (
    <div>
      <h2>Queue: {status}</h2>
      <nav className="admin-nav">
        {FILTERS.map((f) => (
          <a key={f} href={`/admin/queue?status=${f}`}>
            {f}
          </a>
        ))}
      </nav>
      {!rows || rows.length === 0 ? (
        <p className="admin-note">No {status} rows.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>URL</th>
              <th>Attempts</th>
              <th>Last error</th>
              <th>Last attempt</th>
              <th>Retry at</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const row = r as {
                id: number;
                url: string;
                attempts: number;
                last_error: string | null;
                last_attempt_at: string | null;
                next_retry_at: string | null;
              };
              return (
                <tr key={row.id}>
                  <td>
                    <a href={row.url}>{row.url}</a>
                  </td>
                  <td>{row.attempts}</td>
                  <td>{row.last_error ?? "—"}</td>
                  <td>{timeAgo(row.last_attempt_at)}</td>
                  <td>{row.next_retry_at ? timeAgo(row.next_retry_at) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
