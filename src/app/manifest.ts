import type { MetadataRoute } from "next";

// "Add to Home screen" icon and colours.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CST Silver Jubilee Football",
    short_name: "CST Football",
    description: "Live scores, group tables and knockouts",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f7",
    theme_color: "#135463",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
