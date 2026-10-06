import type { Config } from "@netlify/functions";
import { count, max } from "drizzle-orm";
import { db } from "../../db/index.js";
import { cards, users } from "../../db/schema.js";
import { handle, json } from "../lib/http.js";

// Cheap change stamp for student data. Every write bumps updated_at or a row count,
// so pages poll this and only refetch full data when the version differs.
export default handle(["GET"], async () => {
  const [[u], [c]] = await Promise.all([
    db.select({ n: count(), last: max(users.updatedAt) }).from(users),
    db.select({ n: count(), last: max(cards.updatedAt) }).from(cards),
  ]);
  const stamp = (r?: { n: number; last: Date | string | null }) =>
    `${Number(r?.n ?? 0)}@${r?.last ? new Date(r.last).getTime() : 0}`;
  return json({ success: true, version: `u${stamp(u)}-c${stamp(c)}` });
});

export const config: Config = { path: "/api/changes" };
