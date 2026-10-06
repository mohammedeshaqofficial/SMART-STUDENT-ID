import type { Config } from "@netlify/functions";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accessLogs, cards, users } from "../../db/schema.js";
import { handle, json } from "../lib/http.js";

// `since` = the visitor's local midnight (ISO). Falls back to the last 24 hours.
export default handle(["GET"], async (req) => {
  const raw = new URL(req.url).searchParams.get("since");
  const parsed = raw ? new Date(raw) : null;
  const since = parsed && !isNaN(parsed.getTime()) ? parsed : new Date(Date.now() - 864e5);

  const n = (r: { n: number }[]) => Number(r[0]?.n ?? 0);
  const [u, c, scans, denied] = await Promise.all([
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(cards).where(eq(cards.status, "ACTIVE")),
    db.select({ n: count() }).from(accessLogs).where(gte(accessLogs.timestamp, since)),
    db.select({ n: count() }).from(accessLogs).where(and(eq(accessLogs.status, "DENIED"), gte(accessLogs.timestamp, since))),
  ]);
  return json({
    success: true,
    data: { total_users: n(u), authorized_cards: n(c), todays_scans: n(scans), denied_attempts: n(denied) },
  });
});

export const config: Config = { path: "/api/dashboard/stats" };
