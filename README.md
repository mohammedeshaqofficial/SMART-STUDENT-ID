# Smart NFC Hostel Access + Digital Identity Card

**One Card. One Identity. Secure Access.**

An NFC card is read by an RC522 + ESP32 at the hostel door, which asks the backend whether the card's UID is authorized. The same UID maps to a User ID and a shareable digital student profile with a QR code. **The card stores only its UID, never personal data.**

```
NFC CARD -> RC522 -> ESP32 -> Wi-Fi (HTTPS) -> NETLIFY FUNCTIONS -> NETLIFY DATABASE -> ACCESS DECISION -> SERVO / LED / BUZZER
CARD UID -> DATABASE -> USER ID -> DIGITAL STUDENT PROFILE
```

## Pages

| Page | Path | What it does |
|---|---|---|
| Home | `/` | Product overview with live resident / card / tap counts |
| Scanner | `/scanner.html` | Front-desk terminal: **NFC tap** (Web NFC, Chrome on Android), **QR code** (camera reads profile QR codes), **Enter UID** (any device, incl. USB keyboard-wedge readers). Live feed of recent taps |
| Register | `/register.html` | Register a resident + card (auto User ID `USR001`...). Phones with NFC can read the UID directly |
| Profile | `/profile/USR001` | Digital identity card with QR code |
| Dashboard | `/admin.html` | Today's stats, resident table, block/activate cards, issue replacement cards |
| Access Logs | `/access-logs.html` | Searchable, filterable audit trail with CSV export |

## Tech

- Static HTML/CSS/vanilla JS in `public/`
- Netlify Functions (TypeScript) in `netlify/functions/` serving `/api/*`
- Netlify Database (managed Postgres) via Drizzle ORM; schema in `db/schema.ts`, migrations in `netlify/database/migrations/` (applied automatically on deploy, including demo data)
- ESP32 firmware in `esp32/smart_nfc_hostel.ino`

## API

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/register` | Register student + card, returns generated `user_id` |
| POST | `/api/verify-card` | Access decision (logged). Body `{ card_uid, source? }` |
| GET | `/api/profile/:userId` | Digital profile |
| GET | `/api/users` | Residents with card status and last access |
| GET | `/api/access-logs?status=DENIED&q=text&limit=50` | Access history (max 500) |
| PATCH | `/api/cards/:cardUid/block` | Block a lost card |
| PATCH | `/api/cards/:cardUid/activate` | Re-activate a card |
| POST | `/api/cards` | Replacement card `{ user_id, card_uid }` (blocks older cards) |
| GET | `/api/dashboard/stats?since=<ISO>` | Dashboard numbers since a given time (default last 24h) |

## Demo cards (seeded)

| UID | Result |
|---|---|
| `04A7B29183` | Granted (Sai Sahithi, USR001, room 204) |
| `04E58C21A7` | Granted (Meher Iyengar, USR003, room 318) |
| `04B1C2D3E4` | Denied: card blocked (USR002) |
| `DEADBEEF99` | Denied: unknown card |

## Running locally

```bash
npm install
netlify dev
```

Then open the URL printed by the CLI. `netlify dev` emulates Functions and the database locally.

## ESP32 setup

Install the Arduino libraries MFRC522, ESP32Servo, ArduinoJson, Adafruit SSD1306 and Adafruit GFX. In `esp32/smart_nfc_hostel.ino` set `WIFI_SSID`, `WIFI_PASS` and `BACKEND_URL` (your Netlify site URL, e.g. `https://aquamarine-pudding-b9fc21.netlify.app`). Board: "ESP32 Dev Module", Serial Monitor at 115200. Set `USE_OLED 0` if you have no OLED.

RC522 wiring (3.3V only): SDA/SS 5, SCK 18, MOSI 23, MISO 19, RST 22. Green LED 26, red LED 27, buzzer 13, servo 4 (servo on 5V, common GND), OLED SDA 21 / SCL 25.

## Security notes

Server-side validation, parameterized queries, no stack traces sent to clients, no personal data on cards, safe CSV export. **Prototype limits:** dashboard and card-control endpoints have no login yet, the ESP32 uses TLS without certificate pinning, and plain UIDs can be cloned.

## Roadmap

1. Warden login (Netlify Identity) protecting the dashboard, logs and card-control endpoints
2. Per-device API key for the ESP32 reader
3. Room-based permissions and curfew time windows
4. Photo upload for profiles, notifications on denied attempts
5. Secure cards (MIFARE DESFire) instead of UID-only checks
