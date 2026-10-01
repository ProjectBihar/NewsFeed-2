import type { Metadata, Viewport } from "next";
import "./public.css";

// V1 page chrome, migrated in Phase 28 (public pages only; admin metadata
// stays in its own layout).
export const metadata: Metadata = {
  title: "PrōjectBihar Newsfeed",
  description: "Curated Bihar development news — zero-trust pipeline.",
};

export const viewport: Viewport = {
  themeColor: "#2563EB",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <main className="flex-1">{children}</main>;
}
