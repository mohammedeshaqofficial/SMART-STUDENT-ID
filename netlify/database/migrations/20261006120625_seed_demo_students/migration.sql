-- Demo data so the dashboard, scanner and profiles have something to show.
-- Authorized card: 04A7B29183 (USR001). Blocked card: 04B1C2D3E4 (USR002). Unknown: DEADBEEF99.
INSERT INTO "users" ("user_id", "student_name", "student_id", "department", "room_number", "email", "linkedin", "instagram") VALUES
  ('USR001', 'Sai Sahithi', '26XXXX', 'ECE - VLSI', '204', 'example@gmail.com', 'https://www.linkedin.com/in/example', 'https://www.instagram.com/example'),
  ('USR002', 'Rohan Velankar', '26YYYY', 'CSE', '110', 'rohan.v@example.com', '', ''),
  ('USR003', 'Meher Iyengar', '26M417', 'Mechanical', '318', 'meher.i@example.com', 'https://www.linkedin.com/in/example', '')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "cards" ("user_id", "card_uid", "status") VALUES
  ('USR001', '04A7B29183', 'ACTIVE'),
  ('USR002', '04B1C2D3E4', 'BLOCKED'),
  ('USR003', '04E58C21A7', 'ACTIVE')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "access_logs" ("user_id", "card_uid", "room_number", "status", "reason", "source", "timestamp") VALUES
  ('USR001', '04A7B29183', '204', 'GRANTED', NULL, 'READER', now() - interval '3 hours 12 minutes'),
  ('USR003', '04E58C21A7', '318', 'GRANTED', NULL, 'READER', now() - interval '2 hours 41 minutes'),
  ('USR002', '04B1C2D3E4', '110', 'DENIED', 'CARD BLOCKED', 'READER', now() - interval '1 hour 7 minutes'),
  (NULL, 'DEADBEEF99', NULL, 'DENIED', 'UNKNOWN CARD', 'READER', now() - interval '38 minutes'),
  ('USR001', '04A7B29183', '204', 'GRANTED', NULL, 'READER', now() - interval '9 minutes');
