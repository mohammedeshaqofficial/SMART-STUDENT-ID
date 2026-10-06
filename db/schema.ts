import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial().primaryKey(),
  userId: text("user_id").notNull().unique(),
  studentName: text("student_name").notNull(),
  studentId: text("student_id").notNull().unique(),
  department: text().notNull(),
  roomNumber: text("room_number").notNull(),
  email: text().notNull(),
  linkedin: text().notNull().default(""),
  instagram: text().notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// status: ACTIVE | BLOCKED
export const cards = pgTable(
  "cards",
  {
    id: serial().primaryKey(),
    userId: text("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    cardUid: text("card_uid").notNull().unique(),
    status: text().notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_cards_user").on(t.userId)],
);

// status: GRANTED | DENIED; source: READER (ESP32) | WEB_NFC (phone) | MANUAL (front desk) | QR (dynamic profile QR)
export const accessLogs = pgTable(
  "access_logs",
  {
    id: serial().primaryKey(),
    userId: text("user_id"),
    cardUid: text("card_uid"),
    roomNumber: text("room_number"),
    status: text().notNull(),
    reason: text(),
    source: text().notNull().default("READER"),
    timestamp: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_logs_time").on(t.timestamp)],
);

// Short-lived tokens behind the rotating profile QR code. A screenshot stops working once the token expires.
export const qrTokens = pgTable(
  "qr_tokens",
  {
    id: serial().primaryKey(),
    token: text().notNull().unique(),
    userId: text("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_qr_tokens_expires").on(t.expiresAt)],
);
