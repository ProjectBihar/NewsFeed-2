import { timeAgo } from "@/lib/admin/summarize";
import { getStories } from "@/lib/admin/queries";
import { ConfigNote, dbClient } from "../db";

export default async function AdminStories() {
  const client = dbClient();
  if (!client) return <ConfigNote />;
  const stories = (await getStories(client)) as Array<{
    id: number;
    canonical_title: string;
    primary_category: string | null;
    event_type: string | null;
    article_count: number;
    source_count: number;
    last_seen_at: string;
    status: string;
    members: Array<{ article_id: number; cluster_score: number | null; headline: string | null }>;
  }>;
  if (!stories || stories.length === 0) {
    return <p className="admin-note">No stories clustered yet.</p>;
  }
  return (
    <div>
      <h2>Story clusters</h2>
      {stories.map((story) => (
        <section key={story.id}>
          <h3>
            <a href={`/admin/stories/${story.id}`}>
              #{story.id} {story.canonical_title}
            </a>
          </h3>
          <p className="admin-note">
            {story.primary_category ?? "—"} · {story.event_type ?? "—"} · {story.article_count}{" "}
            articles · {story.source_count} sources · {story.status} · updated{" "}
            {timeAgo(story.last_seen_at)}
          </p>
          <table className="admin-table">
            <tbody>
              {story.members.map((m) => (
                <tr key={m.article_id}>
                  <td>{m.headline ?? `article ${m.article_id}`}</td>
                  <td>{m.cluster_score ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
