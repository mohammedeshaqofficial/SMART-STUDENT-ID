/*
  Smart NFC Hostel Access - ESP32 + RC522 + Servo + LEDs + Buzzer (+ optional SSD1306 OLED)
  Libraries (Library Manager): MFRC522, ESP32Servo, ArduinoJson, Adafruit SSD1306, Adafruit GFX
  RC522 uses 3.3V ONLY. Wiring: SDA/SS=5, SCK=18, MOSI=23, MISO=19, RST=22.
  >>> Edit the CONFIG block. Do NOT commit your real Wi-Fi password to GitHub. <<<
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---------------- CONFIG ----------------
const char* WIFI_SSID   = "YOUR_WIFI_NAME";
const char* WIFI_PASS   = "YOUR_WIFI_PASSWORD";
const char* BACKEND_URL = "https://aquamarine-pudding-b9fc21.netlify.app";  // your Netlify site URL (no trailing slash)
#define USE_OLED 1                                     // set 0 if no OLED
// ----------------------------------------

#define SS_PIN 5
#define RST_PIN 22
#define GREEN_LED 26
#define RED_LED 27
#define BUZZER 13
#define SERVO_PIN 4
#define OLED_SDA 21
#define OLED_SCL 25   // not 22: GPIO22 is RC522 RST
#define LOCKED_ANGLE 0
#define UNLOCKED_ANGLE 90

MFRC522 rfid(SS_PIN, RST_PIN);
Servo lockServo;
#if USE_OLED
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
#endif

void show(const String& a, const String& b = "", const String& c = "") {
  Serial.println(a + " | " + b + " | " + c);
#if USE_OLED
  oled.clearDisplay(); oled.setTextColor(WHITE);
  oled.setTextSize(2); oled.setCursor(0, 0); oled.println(a);
  oled.setTextSize(1); oled.setCursor(0, 36); oled.println(b); oled.setCursor(0, 50); oled.println(c);
  oled.display();
#endif
}

void beep(int ms, int times) {
  for (int i = 0; i < times; i++) { digitalWrite(BUZZER, HIGH); delay(ms); digitalWrite(BUZZER, LOW); delay(80); }
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  show("WIFI", "Connecting...");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 15000) delay(300);
  if (WiFi.status() == WL_CONNECTED) show("READY", "Tap your card", WiFi.localIP().toString());
  else show("NO WIFI", "Retrying...");
}

String uidToString() {
  String s = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) s += "0";
    s += String(rfid.uid.uidByte[i], HEX);
  }
  s.toUpperCase();
  return s;
}

void denied(const String& reason) {
  show("DENIED", "ACCESS DENIED", reason);
  digitalWrite(RED_LED, HIGH);
  beep(400, 2);
  delay(1500);
  digitalWrite(RED_LED, LOW);
  lockServo.write(LOCKED_ANGLE);
  show("READY", "Tap your card");
}

void granted(const String& name, const String& room) {
  String first = name;
  int sp = first.indexOf(' ');
  if (sp > 0) first = first.substring(0, sp);
  show("GRANTED", "ACCESS GRANTED - Welcome " + first, "Room " + room);
  digitalWrite(GREEN_LED, HIGH);
  beep(120, 1);
  lockServo.write(UNLOCKED_ANGLE);
  delay(4000);
  lockServo.write(LOCKED_ANGLE);
  digitalWrite(GREEN_LED, LOW);
  show("READY", "Tap your card");
}

void verify(const String& uid) {
  if (WiFi.status() != WL_CONNECTED) { denied("NO WIFI"); connectWiFi(); return; }
  HTTPClient http;
  WiFiClientSecure tls;
  WiFiClient plain;
  String url = String(BACKEND_URL) + "/api/verify-card";
  // Prototype: TLS without certificate pinning. Pin the site's root CA with tls.setCACert() for production.
  tls.setInsecure();
  bool ok = url.startsWith("https://") ? http.begin(tls, url) : http.begin(plain, url);
  if (!ok) { denied("BAD URL"); return; }
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);
  int code = http.POST("{\"card_uid\":\"" + uid + "\",\"source\":\"READER\"}");
  if (code <= 0) { http.end(); denied("SERVER DOWN"); return; }
  String body = http.getString();
  http.end();
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, body)) { denied("BAD RESPONSE"); return; }
  if (doc["authorized"] | false) granted(String((const char*)(doc["name"] | "Student")), String((const char*)(doc["room"] | "-")));
  else denied(String((const char*)(doc["reason"] | "UNKNOWN CARD")));
}

void setup() {
  Serial.begin(115200);
  pinMode(GREEN_LED, OUTPUT); pinMode(RED_LED, OUTPUT); pinMode(BUZZER, OUTPUT);
  lockServo.attach(SERVO_PIN); lockServo.write(LOCKED_ANGLE);
#if USE_OLED
  Wire.begin(OLED_SDA, OLED_SCL);
  oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
#endif
  SPI.begin(18, 19, 23, SS_PIN);
  rfid.PCD_Init();
  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) { delay(50); return; }
  String uid = uidToString();
  Serial.println("Card UID: " + uid);
  show("CHECKING", uid);
  verify(uid);
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(500);
}
