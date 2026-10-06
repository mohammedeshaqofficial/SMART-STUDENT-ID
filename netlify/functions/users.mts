import type { Config } from "@netlify/functions";
import { asc, eq, max } from "drizzle-orm";
import { db } from "../../db/index.js";
import { accessLogs, cards, users } from "../../db/schema.js";
import { ApiError, handle, isUniqueViolation, json, readBody, validUrl } from "../lib/http.js";

async function nextUserId() {
  const rows = await db.select({ userId: users.userId }).from(users);
  const maxId = rows.reduce((m, r) => Math.max(m, parseInt(r.userId.slice(3), 10) || 0), 0);
  return "USR" + String(maxId + 1).padStart(3, "0");
}

function validatePatch(b: Record<string, unknown>) {
  const t = (k: string) => String(b[k] == null ? "" : b[k]).trim();
  const d: Record<string, string> = {};
  for (const k of ["student_name","student_id","department","room_number","email","linkedin","instagram"]) {
    if (k in b) d[k] = t(k);
  }
  if ("student_name" in d && (d.student_name.length < 2 || d.student_name.length > 80)) throw new ApiError(400, "Student name must be 2-80 characters");
  if ("student_id" in d && !/^[A-Za-z0-9\-_/]{3,20}$/.test(d.student_id)) throw new ApiError(400, "Student ID must be 3-20 letters/numbers");
  if ("department" in d && (d.department.length < 2 || d.department.length > 80)) throw new ApiError(400, "Department is required");
  if ("room_number" in d && !/^[A-Za-z0-9\-/ ]{1,10}$/.test(d.room_number)) throw new ApiError(400, "Room number is invalid");
  if ("email" in d && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) || d.email.length > 120)) throw new ApiError(400, "Email is invalid");
  if ("linkedin" in d && d.linkedin && !validUrl(d.linkedin)) throw new ApiError(400, "LinkedIn must be a valid http(s) URL");
  if ("instagram" in d && d.instagram && !validUrl(d.instagram)) throw new ApiError(400, "Instagram must be a valid http(s) URL");
  return d;
}

export default handle(["GET", "PATCH"], async (req, params) => {
  if (req.method === "PATCH") {
    const userId = String(params.userId || "").trim().toUpperCase();
    if (!/^USR\d{3,}$/.test(userId)) throw new ApiError(400, "Invalid User ID");
    const body = await readBody(req);
    const d = validatePatch(body);
    if (!Object.keys(d).length) throw new ApiError(400, "No student fields supplied");

    try {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if ("student_name" in d) set.studentName = d.student_name;
      if ("student_id" in d) set.studentId = d.student_id;
      if ("department" in d) set.department = d.department;
      if ("room_number" in d) set.roomNumber = d.room_number;
      if ("email" in d) set.email = d.email;
      if ("linkedin" in d) set.linkedin = d.linkedin;
      if ("instagram" in d) set.instagram = d.instagram;

      const updated = await db.update(users).set(set).where(eq(users.userId, userId)).returning();
      if (!updated.length) throw new ApiError(404, "Student not found");
      return json({ success: true, message: "Student details updated", data: updated[0] });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ApiError(409, "That Student ID is already registered");
      throw err;
    }
  }

  const [allUsers, allCards, lastSeen] = await Promise.all([
    db.select().from(users).orderBy(asc(users.id)),
    db.select().from(cards).orderBy(asc(cards.id)),
    db.select({ userId: accessLogs.userId, last: max(accessLogs.timestamp) }).from(accessLogs).groupBy(accessLogs.userId),
  ]);
  const latestCard = new Map(allCards.map((c) => [c.userId, c]));
  const lastMap = new Map(lastSeen.map((l) => [l.userId, l.last]));
  const data = allUsers.map((u) => {
    const c = latestCard.get(u.userId);
    return {
      user_id: u.userId, student_name: u.studentName, student_id: u.studentId, department: u.department,
      room_number: u.roomNumber, email: u.email, linkedin: u.linkedin, instagram: u.instagram,
      card_uid: c?.cardUid ?? null, card_status: c?.status ?? null,
      last_access: lastMap.get(u.userId) ?? null, updated_at: u.updatedAt,
    };
  });
  return json({ success: true, data });
});

export const config: Config = { path: ["/api/users", "/api/users/:userId"] };
