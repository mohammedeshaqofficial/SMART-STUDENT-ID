import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { cards, users } from "../../db/schema.js";
import { ApiError, handle, isUniqueViolation, json, normalizeUid, readBody, validUid, validUrl } from "../lib/http.js";

async function nextUserId() {
  const rows = await db.select({ userId: users.userId }).from(users);
  const max = rows.reduce((m, r) => Math.max(m, parseInt(r.userId.slice(3), 10) || 0), 0);
  return "USR" + String(max + 1).padStart(3, "0");
}

export default handle(["POST"], async (req) => {
  const b = await readBody(req);
  const t = (k: string) => String(b[k] == null ? "" : b[k]).trim();
  const d = {
    studentName: t("student_name"), studentId: t("student_id"), department: t("department"),
    roomNumber: t("room_number"), email: t("email"), linkedin: t("linkedin"), instagram: t("instagram"),
  };
  const uid = normalizeUid(b.card_uid);

  const errs: string[] = [];
  if (d.studentName.length < 2 || d.studentName.length > 80) errs.push("Student name must be 2-80 characters");
  if (!/^[A-Za-z0-9\-_/]{3,20}$/.test(d.studentId)) errs.push("Student ID must be 3-20 letters/numbers");
  if (d.department.length < 2 || d.department.length > 80) errs.push("Department is required");
  if (!/^[A-Za-z0-9\-/ ]{1,10}$/.test(d.roomNumber)) errs.push("Room number is invalid");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) || d.email.length > 120) errs.push("Email is invalid");
  if (d.linkedin && !validUrl(d.linkedin)) errs.push("LinkedIn must be a valid http(s) URL");
  if (d.instagram && !validUrl(d.instagram)) errs.push("Instagram must be a valid http(s) URL");
  if (!validUid(uid)) errs.push("NFC UID must be 8-20 hexadecimal characters (e.g. 04A7B29183 or 04:a7:b2:91:83)");
  if (errs.length) throw new ApiError(400, errs.join(". "));

  if ((await db.select({ id: cards.id }).from(cards).where(eq(cards.cardUid, uid)).limit(1)).length) {
    throw new ApiError(409, "This NFC card UID is already registered");
  }
  if ((await db.select({ id: users.id }).from(users).where(eq(users.studentId, d.studentId)).limit(1)).length) {
    throw new ApiError(409, "This Student ID is already registered");
  }

  // Retry if two registrations race for the same generated User ID.
  let userId = "";
  for (let attempt = 0; attempt < 3 && !userId; attempt++) {
    const candidate = await nextUserId();
    try {
      await db.insert(users).values({ userId: candidate, ...d });
      userId = candidate;
    } catch (err) {
      if (!isUniqueViolation(err) || attempt === 2) throw err;
    }
  }

  try {
    await db.insert(cards).values({ userId, cardUid: uid, status: "ACTIVE" });
  } catch (err) {
    await db.delete(users).where(eq(users.userId, userId));
    throw err;
  }

  return json({ success: true, message: "Registration successful!", user_id: userId, card_uid: uid, profile: "/profile/" + userId }, 201);
});

export const config: Config = { path: "/api/register" };
