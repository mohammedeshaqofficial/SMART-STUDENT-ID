import type { Config } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accessLogs, cards, qrTokens, users } from "../../db/schema.js";
import { handle, json, readBody } from "../lib/http.js";

// Called by the web scanner when it reads a dynamic profile QR code. Returns the full profile and logs the check.
export default handle(["POST"], async (req) => {
  const b = await readBody(req);
  const token = String(b.token || "");
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return json({ success: false, valid: false, message: "Not a valid profile QR code", reason: "INVALID QR" }, 400);
  }

  const [t] = await db.select().from(qrTokens).where(eq(qrTokens.token, token)).limit(1);
  if (!t) return json({ success: true, valid: false, reason: "INVALID QR", message: "This QR code was not issued by this hostel." });

  const [u] = await db.select().from(users).where(eq(users.userId, t.userId)).limit(1);
  if (!u) return json({ success: true, valid: false, reason: "INVALID QR", message: "This resident no longer exists." });
  const [c] = await db.select().from(cards).where(eq(cards.userId, u.userId)).orderBy(desc(cards.id)).limit(1);

  const profile = {
    user_id: u.userId, student_name: u.studentName, student_id: u.studentId, department: u.department,
    room_number: u.roomNumber, email: u.email, linkedin: u.linkedin, instagram: u.instagram,
    created_at: u.createdAt, card_uid: c?.cardUid ?? null, card_status: c?.status ?? null,
  };
  const base = { userId: u.userId, cardUid: c?.cardUid ?? null, roomNumber: u.roomNumber, source: "QR" };

  if (t.expiresAt.getTime() < Date.now()) {
    await db.insert(accessLogs).values({ ...base, status: "DENIED", reason: "QR EXPIRED" });
    return json({ success: true, valid: false, reason: "QR EXPIRED", message: "This QR code has expired. Ask the resident to show the live code on their profile.", data: profile });
  }
  if (c?.status !== "ACTIVE") {
    const reason = c ? "CARD BLOCKED" : "NO CARD";
    await db.insert(accessLogs).values({ ...base, status: "DENIED", reason });
    return json({ success: true, valid: true, authorized: false, reason, data: profile });
  }
  await db.insert(accessLogs).values({ ...base, status: "GRANTED" });
  return json({ success: true, valid: true, authorized: true, data: profile });
});

export const config: Config = { path: "/api/verify-qr" };
