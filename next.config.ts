import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones on the same Wi-Fi use the dev server (private network addresses only).
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*"],
  // The admin's Squads tab is now Teams: old links and bookmarks still arrive.
  async redirects() {
    return [
      { source: "/admin/squads", destination: "/admin/teams", permanent: true },
      { source: "/admin/squads/:code", destination: "/admin/teams/:code", permanent: true },
    ];
  },
};

export default nextConfig;
