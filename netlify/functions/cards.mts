import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { cards, users } from "../../db/schema.js";
import { ApiError, handle, json, normalizeUid, readBody, validUid } from "../lib/http.js";

export default handle(["POST", "PATCH"], async (req, params) => {
  // PATCH /api/cards/:cardUid/block | /activate
  if (req.method === "PATCH") {
    const action = String(params.action || "").toLowerCase();
    if (action !== "block" && action !== "activate") throw new ApiError(404, "Route not found");
    const status = action === "block" ? "BLOCKED" : "ACTIVE";
    const uid = normalizeUid(params.cardUid);
    if (!validUid(uid)) throw new ApiError(400, "Invalid card UID");
    const updated = await db.update(cards).set({ status, updatedAt: new Date() }).where(eq(cards.cardUid, uid)).returning({ id: cards.id });
    if (!updated.length) throw new ApiError(404, "Card not found");
    return json({ success: true, message: `Card ${uid} is now ${status}`, card_uid: uid, status });
  }

  // POST /api/cards — assign a replacement card (blocks the user's older cards).
  if (params.cardUid) throw new ApiError(404, "Route not found");
  const b = await readBody(req);
  const userId = String(b.user_id || "").trim().toUpperCase();
  const uid = normalizeUid(b.card_uid);
  if (!validUid(uid)) throw new ApiError(400, "Invalid card UID");
  if (!(await db.select({ id: users.id }).from(users).where(eq(users.userId, userId)).limit(1)).length) {
    throw new ApiError(404, "User not found");
  }
  if ((await db.select({ id: cards.id }).from(cards).where(eq(cards.cardUid, uid)).limit(1)).length) {
    throw new ApiError(409, "This NFC card UID is already registered");
  }
  await db.insert(cards).values({ userId, cardUid: uid, status: "ACTIVE" });
  const old = await db.select({ id: cards.id, cardUid: cards.cardUid }).from(cards).where(eq(cards.userId, userId));
  for (const c of old) {
    if (c.cardUid !== uid) await db.update(cards).set({ status: "BLOCKED", updatedAt: new Date() }).where(eq(cards.id, c.id));
  }
  return json({ success: true, message: "Replacement card assigned; older cards blocked", user_id: userId, card_uid: uid }, 201);
});

export const config: Config = { path: ["/api/cards", "/api/cards/:cardUid/:action"] };
