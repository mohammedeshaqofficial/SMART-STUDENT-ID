import type { Config } from "@netlify/functions";

export default async () => Response.json({ success: false, message: "Route not found" }, { status: 404 });

export const config: Config = {
  path: "/api/*",
  excludedPath: ["/api/register", "/api/profile/*", "/api/users", "/api/users/*", "/api/changes", "/api/verify-card", "/api/access-logs", "/api/cards", "/api/cards/*", "/api/dashboard/stats", "/api/qr-token", "/api/verify-qr"],
};
