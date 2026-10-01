import { timeAgo } from "@/lib/admin/summarize";
import { getRecentRuns } from "@/lib/admin/queries";
import { ConfigNote, dbClient } from "../db";

export default async function AdminRuns() {
  const client = dbClient();
  if (!client) return <ConfigNote />;
  const runs = await getRecentRuns(50, client);
  if (!runs || runs.length === 0) {
    return <p className="admin-note">No crawl runs recorded yet.</p>;
  }
  return (
    <div>
      <h2>Crawl runs</h2>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Run</th>
            <th>Started</th>
            <th>Status</th>
            <th>Sources</th>
            <th>Discovered</th>
            <th>Fetched</th>
            <th>Extracted</th>
            <th>Relevant</th>
            <th>Stories</th>
            <th>Errors</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const run = r as {
              id: number;
              started_at: string;
              status: string;
              sources_attempted: number;
              sources_succeeded: number;
              urls_discovered: number;
              urls_fetched: number;
              articles_extracted: number;
              articles_relevant: number;
              stories_created: number;
              errors: number;
            };
            return (
              <tr key={run.id}>
                <td>#{run.id}</td>
                <td>{timeAgo(run.started_at)}</td>
                <td>{run.status}</td>
                <td>
                  {run.sources_succeeded}/{run.sources_attempted}
                </td>
                <td>{run.urls_discovered}</td>
                <td>{run.urls_fetched}</td>
                <td>{run.articles_extracted}</td>
                <td>{run.articles_relevant}</td>
                <td>{run.stories_created}</td>
                <td>{run.errors}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
