import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: "Observatory — ProjectBihar Admin",
  robots: "noindex, nofollow",
};

// Never prerendered: diagnostics always read live state.
export const dynamic = "force-dynamic";

const LINKS = [
  ["Overview", "/admin"],
  ["Sources", "/admin/sources"],
  ["Runs", "/admin/runs"],
  ["Queue", "/admin/queue"],
  ["Low confidence", "/admin/low-confidence"],
  ["Stories", "/admin/stories"],
  ["Corrections", "/admin/corrections"],
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="admin">
      <header className="admin-head">
        <h1>
          Observatory <span className="admin-badge">internal</span>
        </h1>
        <nav className="admin-nav">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
      </header>
      <div className="admin-body">{children}</div>
    </section>
  );
}
