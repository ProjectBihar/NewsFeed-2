import type { Metadata, Viewport } from "next";
import PwaControls from "@/components/public/PwaControls";
import "./public.css";

// V1 page chrome, migrated in Phase 28 (public pages only; admin metadata
// stays in its own layout).
export const metadata: Metadata = {
  title: "PrōjectBihar Newsfeed",
  description:
    "Bihar’s public life, newsrooms and official announcements — a PrōjectBihar public-interest newsfeed.",
  applicationName: "PrōjectBihar Newsfeed",
  appleWebApp: { capable: true, title: "Bihar News", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0f" },
  ],
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
        <div className="footer-actions">
          <a href="https://projectbihar.org/">Explore the initiative ↗</a>
          <PwaControls />
        </div>
      </footer>
    </>
  );
}
