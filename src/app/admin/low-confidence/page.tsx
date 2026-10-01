import { getLowClassification, getLowExtraction } from "@/lib/admin/queries";
import { ConfigNote, dbClient } from "../db";

function ClassificationView({
  rows,
}: {
  rows: Array<{
    id: number;
    article_id: number;
    category: string | null;
    article_type: string | null;
    event_type: string | null;
    confidence: number | null;
    classifier_version: string;
  }>;
}) {
  return (
    <div>
      <h2>Low-confidence classification</h2>
      <Nav />
      {!rows || rows.length === 0 ? (
        <p className="admin-note">No low-confidence classifications.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Article</th>
              <th>Category</th>
              <th>Type</th>
              <th>Event</th>
              <th>Confidence</th>
              <th>Version</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.article_id}</td>
                <td>{row.category ?? "—"}</td>
                <td>{row.article_type ?? "—"}</td>
                <td>{row.event_type ?? "—"}</td>
                <td>{row.confidence ?? "—"}</td>
                <td>{row.classifier_version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ExtractionView({
  rows,
}: {
  rows: Array<{
    id: number;
    headline: string | null;
    url: string;
    extraction_confidence: string | null;
  }>;
}) {
  return (
    <div>
      <h2>Low-confidence extraction</h2>
      <Nav />
      {!rows || rows.length === 0 ? (
        <p className="admin-note">No low-confidence extractions.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Headline</th>
              <th>URL</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.headline ?? "—"}</td>
                <td>
                  <a href={row.url}>{row.url}</a>
                </td>
                <td>{row.extraction_confidence ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Nav() {
  return (
    <nav className="admin-nav">
      <a href="/admin/low-confidence">extraction</a>
      <a href="/admin/low-confidence?view=classification">classification</a>
    </nav>
  );
}

export default async function AdminLowConfidence({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const client = dbClient();
  if (!client) return <ConfigNote />;
  if (params.view === "classification") {
    const rows = (await getLowClassification(client)) as Array<{
      id: number;
      article_id: number;
      category: string | null;
      article_type: string | null;
      event_type: string | null;
      confidence: number | null;
      classifier_version: string;
    }>;
    return <ClassificationView rows={rows ?? []} />;
  }
  const rows = (await getLowExtraction(client)) as Array<{
    id: number;
    headline: string | null;
    url: string;
    extraction_confidence: string | null;
  }>;
  return <ExtractionView rows={rows ?? []} />;
}
