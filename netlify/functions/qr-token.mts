import type { Config } from "@netlify/functions";
import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "../../db/index.js";
import { qrTokens, users } from "../../db/schema.js";
import { ApiError, handle, json, readBody } from "../lib/http.js";

// The profile page rotates its QR every REFRESH_SECONDS; each token stays valid a little longer to cover scan latency.
const TTL_SECONDS = 30;
const REFRESH_SECONDS = 20;

export default handle(["POST"], async (req) => {
  const b = await readBody(req);
  const id = String(b.user_id || "").toUpperCase();
  if (!/^USR\d{3,}$/.test(id)) throw new ApiError(400, "Invalid User ID format (expected e.g. USR001)");
  const [u] = await db.select({ userId: users.userId }).from(users).where(eq(users.userId, id)).limit(1);
  if (!u) throw new ApiError(404, "Profile not found");

  // Housekeeping: drop tokens that expired over an hour ago.
  await db.delete(qrTokens).where(lt(qrTokens.expiresAt, new Date(Date.now() - 3600_000)));

  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
  await db.insert(qrTokens).values({ token, userId: id, expiresAt });
  return json({ success: true, token, user_id: id, expires_at: expiresAt.toISOString(), refresh_in: REFRESH_SECONDS });
});

export const config: Config = { path: "/api/qr-token" };
