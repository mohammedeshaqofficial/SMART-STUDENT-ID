import type { Config } from "@netlify/functions";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accessLogs, users } from "../../db/schema.js";
import { handle, json } from "../lib/http.js";

export default handle(["GET"], async (req) => {
  const url = new URL(req.url);
  const s = String(url.searchParams.get("status") || "").toUpperCase();
  const q = String(url.searchParams.get("q") || "").trim().slice(0, 50);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "500", 10) || 500, 1), 500);

  const conds: SQL[] = [];
  if (s === "GRANTED" || s === "DENIED") conds.push(eq(accessLogs.status, s));
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(or(ilike(accessLogs.userId, like), ilike(accessLogs.cardUid, like), ilike(users.studentName, like))!);
  }

  const rows = await db
    .select({
      id: accessLogs.id, user_id: accessLogs.userId, card_uid: accessLogs.cardUid, room_number: accessLogs.roomNumber,
      status: accessLogs.status, reason: accessLogs.reason, source: accessLogs.source, timestamp: accessLogs.timestamp,
      student_name: users.studentName,
    })
    .from(accessLogs)
    .leftJoin(users, eq(users.userId, accessLogs.userId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(accessLogs.id))
    .limit(limit);

  return json({ success: true, data: rows });
});

export const config: Config = { path: "/api/access-logs" };
