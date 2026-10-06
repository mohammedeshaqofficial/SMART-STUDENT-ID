import type { Config } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { cards, users } from "../../db/schema.js";
import { ApiError, handle, json } from "../lib/http.js";

export default handle(["GET"], async (_req, params) => {
  const id = String(params.userId || "").toUpperCase();
  if (!/^USR\d{3,}$/.test(id)) throw new ApiError(400, "Invalid User ID format (expected e.g. USR001)");
  const [u] = await db.select().from(users).where(eq(users.userId, id)).limit(1);
  if (!u) throw new ApiError(404, "Profile not found");
  const [c] = await db.select().from(cards).where(eq(cards.userId, id)).orderBy(desc(cards.id)).limit(1);
  return json({
    success: true,
    data: {
      user_id: u.userId, student_name: u.studentName, student_id: u.studentId, department: u.department,
      room_number: u.roomNumber, email: u.email, linkedin: u.linkedin, instagram: u.instagram,
      created_at: u.createdAt, card_uid: c?.cardUid ?? null, card_status: c?.status ?? null,
    },
  });
});

export const config: Config = { path: "/api/profile/:userId" };
