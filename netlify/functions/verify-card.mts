import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accessLogs, cards, users } from "../../db/schema.js";
import { handle, json, normalizeUid, readBody, validUid } from "../lib/http.js";

const SOURCES = ["READER", "WEB_NFC", "MANUAL"];

// Called by the ESP32 reader and by the web scanner on every tap.
export default handle(["POST"], async (req) => {
  const b = await readBody(req);
  const uid = normalizeUid(b.card_uid);
  const source = SOURCES.includes(String(b.source || "").toUpperCase()) ? String(b.source).toUpperCase() : "READER";
  if (!validUid(uid)) {
    return json({ success: false, authorized: false, message: "ACCESS DENIED", reason: "INVALID UID" }, 400);
  }

  const [row] = await db
    .select({ status: cards.status, userId: users.userId, name: users.studentName, room: users.roomNumber, department: users.department })
    .from(cards)
    .innerJoin(users, eq(users.userId, cards.userId))
    .where(eq(cards.cardUid, uid))
    .limit(1);

  if (!row) {
    await db.insert(accessLogs).values({ cardUid: uid, status: "DENIED", reason: "UNKNOWN CARD", source });
    return json({ success: true, authorized: false, card_uid: uid, message: "ACCESS DENIED", reason: "UNKNOWN CARD" });
  }
  if (row.status !== "ACTIVE") {
    await db.insert(accessLogs).values({ userId: row.userId, cardUid: uid, roomNumber: row.room, status: "DENIED", reason: "CARD BLOCKED", source });
    return json({ success: true, authorized: false, card_uid: uid, user_id: row.userId, name: row.name, room: row.room, message: "ACCESS DENIED", reason: "CARD BLOCKED" });
  }
  await db.insert(accessLogs).values({ userId: row.userId, cardUid: uid, roomNumber: row.room, status: "GRANTED", source });
  return json({
    success: true, authorized: true, card_uid: uid, user_id: row.userId, name: row.name, room: row.room,
    department: row.department, message: "ACCESS GRANTED",
  });
});

export const config: Config = { path: "/api/verify-card" };
