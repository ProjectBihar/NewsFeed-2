import type { Metadata, Viewport } from "next";
import "./public.css";

// V1 page chrome, migrated in Phase 28 (public pages only; admin metadata
// stays in its own layout).
export const metadata: Metadata = {
  title: "PrōjectBihar Newsfeed",
  description:
    "Bihar’s public life, newsrooms and official announcements — a PrōjectBihar public-interest newsfeed.",
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="public-site flex-1">{children}</main>
      <footer className="public-footer">
        <div>
          <a href="https://projectbihar.org/" className="footer-brand">
            PrōjectBihar
          </a>
          <p>An independent public-interest initiative for Bihar</p>
        </div>
        <a href="https://projectbihar.org/">Explore the initiative ↗</a>
      </footer>
    </>
  );
}
