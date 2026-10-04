import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const TITLE = "CST Silver Jubilee Football — live scores";
const DESCRIPTION = "Live scores, group tables and knockouts";

// Absolute base for share-image URLs: NEXT_PUBLIC_SITE_URL if set, else the Vercel
// production domain, else localhost (local runs only).
function siteUrl(): URL {
  if (process.env.NEXT_PUBLIC_SITE_URL) return new URL(process.env.NEXT_PUBLIC_SITE_URL);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return new URL("http://localhost:3000");
}

// Share images, favicon and app icons come from the files in src/app
// (opengraph-image.jpg, twitter-image.jpg, favicon.ico, icon.png, apple-icon.png).
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "CST Silver Jubilee Football",
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "CST Silver Jubilee Football",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#7a1f2b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable} antialiased`}>
      <body className="min-h-dvh bg-bg font-sans text-text">{children}</body>
    </html>
  );
}
