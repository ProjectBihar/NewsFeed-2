import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ProjectBihar Newsfeed V2",
  description: "Bihar news-intelligence system — under development.",
};

// The Tailwind utility classes on <html>/<body> are styled only on public
// routes, where the (public) route group loads Tailwind v4 together with the
// V1 design system. Admin routes never load that stylesheet, so these classes
// are inert there and the observatory keeps its original appearance.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
