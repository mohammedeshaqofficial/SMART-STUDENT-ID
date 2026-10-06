import type { Config } from "@netlify/functions";
import { asc, max } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accessLogs, cards, users } from "../../db/schema.js";
import { handle, json } from "../lib/http.js";

export default handle(["GET"], async () => {
  const [allUsers, allCards, lastSeen] = await Promise.all([
    db.select().from(users).orderBy(asc(users.id)),
    db.select().from(cards).orderBy(asc(cards.id)),
    db.select({ userId: accessLogs.userId, last: max(accessLogs.timestamp) }).from(accessLogs).groupBy(accessLogs.userId),
  ]);
  // Latest card wins (replacement cards have higher ids).
  const latestCard = new Map(allCards.map((c) => [c.userId, c]));
  const lastMap = new Map(lastSeen.map((l) => [l.userId, l.last]));
  const data = allUsers.map((u) => {
    const c = latestCard.get(u.userId);
    return {
      user_id: u.userId, student_name: u.studentName, student_id: u.studentId, department: u.department,
      room_number: u.roomNumber, card_uid: c?.cardUid ?? null, card_status: c?.status ?? null,
      last_access: lastMap.get(u.userId) ?? null,
    };
  });
  return json({ success: true, data });
});

export const config: Config = { path: "/api/users" };
