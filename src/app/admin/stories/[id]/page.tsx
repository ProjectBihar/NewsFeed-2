import {
  correctArticleAction,
  mergeStoriesAction,
  moveArticleAction,
  renameStoryAction,
  splitStoryAction,
} from "@/lib/admin/actions";
import { ARTICLE_TYPES, CATEGORIES, DISTRICTS, EVENT_TYPES } from "@/lib/admin/options";
import { getStory, getStoryOptions } from "@/lib/admin/queries";
import { ConfigNote, dbClient } from "../../db";

function Reason({ name = "reason" }: { name?: string }) {
  return (
    <input
      name={name}
      placeholder="reason (optional)"
      maxLength={200}
      style={{ minWidth: "12rem" }}
    />
  );
}

export default async function AdminStoryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const storyId = Number(id);
  if (!Number.isInteger(storyId)) {
    return <p className="admin-error">Bad story id.</p>;
  }
  const client = dbClient();
  if (!client) return <ConfigNote />;
  const [story, options] = await Promise.all([getStory(client, storyId), getStoryOptions(client)]);
  if (!story) {
    return <p className="admin-note">Story not found.</p>;
  }
  const targets = (
    (options ?? []) as Array<{ id: number; canonical_title: string; status: string }>
  ).filter((s) => s.id !== story.id && s.status === "active");

  return (
    <div>
      <h2>
        #{story.id} {story.canonical_title}
      </h2>
      <p className="admin-note">
        {story.primary_category ?? "—"} · {story.event_type ?? "—"} · {story.status} ·{" "}
        {story.article_count} articles · {story.source_count} sources
      </p>

      <h3>Rename</h3>
      <form action={renameStoryAction}>
        <input type="hidden" name="storyId" value={story.id} />
        <input
          name="title"
          defaultValue={story.canonical_title}
          maxLength={300}
          required
          style={{ minWidth: "24rem" }}
        />{" "}
        <Reason /> <button type="submit">Rename</button>
      </form>

      <h3>Merge into another story</h3>
      <form action={mergeStoriesAction}>
        <input type="hidden" name="sourceId" value={story.id} />
        <select name="targetId" required defaultValue="">
          <option value="" disabled>
            target story…
          </option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              #{t.id} {t.canonical_title}
            </option>
          ))}
        </select>{" "}
        <Reason /> <button type="submit">Merge (moves all members)</button>
      </form>

      <h3>Members</h3>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Article</th>
            <th>Type</th>
            <th>Category</th>
            <th>Event</th>
            <th>Move</th>
            <th>Correct fields</th>
          </tr>
        </thead>
        <tbody>
          {story.members.map((m) => (
            <tr key={m.article_id}>
              <td>
                {m.headline ?? `article ${m.article_id}`}
                <br />
                <span className="admin-note">
                  <a href={m.url}>{m.url}</a>
                  {m.entity_names.length > 0 ? ` · ${m.entity_names.join(", ")}` : ""}
                </span>
              </td>
              <td>{m.article_type ?? "—"}</td>
              <td>{m.primary_category ?? "—"}</td>
              <td>{m.event_type ?? "—"}</td>
              <td>
                <form action={moveArticleAction}>
                  <input type="hidden" name="articleId" value={m.article_id} />
                  <select name="target" required defaultValue="">
                    <option value="" disabled>
                      target…
                    </option>
                    <option value="__new__">new story (title below)</option>
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        #{t.id} {t.canonical_title}
                      </option>
                    ))}
                  </select>{" "}
                  <input name="newTitle" placeholder="new title if new" maxLength={300} />{" "}
                  <button type="submit">Move</button>
                </form>
              </td>
              <td>
                <form action={correctArticleAction}>
                  <input type="hidden" name="articleId" value={m.article_id} />
                  <select name="article_type" defaultValue={m.article_type ?? ""}>
                    <option value="">type…</option>
                    {ARTICLE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>{" "}
                  <select name="primary_category" defaultValue={m.primary_category ?? ""}>
                    <option value="">category…</option>
                    {CATEGORIES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>{" "}
                  <select name="event_type" defaultValue={m.event_type ?? ""}>
                    <option value="">event…</option>
                    {EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>{" "}
                  <select name="district_id" defaultValue={m.district_id ?? ""}>
                    <option value="">district…</option>
                    {DISTRICTS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.canonical_name}
                      </option>
                    ))}
                  </select>{" "}
                  <select name="bihar_relevant" defaultValue="">
                    <option value="">relevance…</option>
                    <option value="true">relevant</option>
                    <option value="false">not relevant</option>
                  </select>
                  <br />
                  <input
                    name="entities"
                    defaultValue={m.entity_names.join(", ")}
                    placeholder="entities, comma separated"
                    style={{ minWidth: "16rem" }}
                  />{" "}
                  <Reason /> <button type="submit">Save corrections</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Split checked members into a new story</h3>
      <form action={splitStoryAction}>
        <input type="hidden" name="storyId" value={story.id} />
        <input
          name="newTitle"
          placeholder="new story title"
          maxLength={300}
          required
          style={{ minWidth: "20rem" }}
        />{" "}
        <Reason /> <button type="submit">Split checked members</button>
        <ul>
          {story.members.map((m) => (
            <li key={m.article_id}>
              <label>
                <input type="checkbox" name="articleIds" value={m.article_id} />{" "}
                {m.headline ?? `article ${m.article_id}`}
              </label>
            </li>
          ))}
        </ul>
      </form>
    </div>
  );
}
