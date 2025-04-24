import fetch from "node-fetch";
import fs from "node:fs/promises";

/* ---------- config ---------- */
const TZ = "America/Denver";                 // your time-zone
const CURSOR_FILE = "cursor.json";

/* ---------- helpers ---------- */
const todayUid = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: TZ }).replace(/-/g, "");

const readCursor = async () => {
  try { return JSON.parse(await fs.readFile(CURSOR_FILE, "utf8")); }
  catch { return { lastId: "", lastEnd: "1970-01-01T00:00:00Z" }; }
};

const writeCursor = (obj) =>
  fs.writeFile(CURSOR_FILE, JSON.stringify(obj));

const mustJson = async (res, label) => {
  if (!res.ok) throw new Error(`${label} → HTTP ${res.status}`);
  const txt = await res.text();
  try { return JSON.parse(txt); }
  catch { throw new Error(`${label} → non-JSON response:\n${txt.slice(0,200)}`); }
};

/* ---------- main ---------- */
const cursor = await readCursor();

/* 1️⃣  Limitless: fetch newest lifelog */
const url =
  `https://api.limitless.ai/v1/lifelogs` +
  `?start=${encodeURIComponent(cursor.lastEnd)}` +
  `&limit=1&direction=asc&includeMarkdown=true`;

const pendantRes = await fetch(url, {
  headers: { "X-API-Key": process.env.LIMITLESS_API_KEY }
});
const pendant = await mustJson(pendantRes, "Limitless");

const log = pendant?.data?.lifelogs?.[0];
if (!log)      { console.log("No new lifelog");       process.exit(0); }
if (log.id === cursor.lastId) {
  console.log("Duplicate lifelog"); process.exit(0);
}

/* 2️⃣  Roam: discover shard */
const root = `https://api.roamresearch.com/api/graph/${process.env.GRAPH_NAME}/write`;
const redirect = await fetch(root, { method: "POST", redirect: "manual" });
const shardURL = redirect.headers.get("location");
if (!shardURL) throw new Error("Roam redirect missing Location header");

/* 3️⃣  Roam: create block under today’s page */
const payload = {
  action: "create-block",
  location: { "parent-uid": todayUid(), order: "last" },
  block: { string: `**${log.title}**\n\n${log.markdown}` }
};

const roamRes = await fetch(shardURL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.ROAM_API_TOKEN}`
  },
  body: JSON.stringify(payload)
});
if (!roamRes.ok)
  throw new Error(`Roam write → HTTP ${roamRes.status}: ${await roamRes.text()}`);

console.log("Uploaded lifelog", log.id);

/* 4️⃣  persist cursor */
await writeCursor({ lastId: log.id, lastEnd: log.endTime });
