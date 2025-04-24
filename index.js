import fetch from "node-fetch";
import fs from "node:fs/promises";

/* ---------- helper: Daily-Notes UID in Denver ---------- */
function todayUid() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Denver",
  }).replace(/-/g, "");                // "2025-04-24" → "20250424"
}

/* ---------- cursor ---------- */
const CURSOR = "cursor.json";
const blank = { lastId: "", lastEnd: "1970-01-01T00:00:00Z" };
let store = blank;
try { store = JSON.parse(await fs.readFile(CURSOR, "utf8")); } catch {}

/* ---------- pull newest lifelog ---------- */
const res = await fetch(
  `https://api.limitless.ai/v1/lifelogs?start=${encodeURIComponent(
    store.lastEnd
  )}&limit=1&direction=asc&includeMarkdown=true`,
  { headers: { "X-API-Key": process.env.LIMITLESS_API_KEY } }
).then(r => r.json());

const log = res?.data?.lifelogs?.[0];
if (!log) { console.log("No new lifelog"); process.exit(0); }
if (log.id === store.lastId) { console.log("Duplicate lifelog"); process.exit(0); }

/* ---------- get shard URL (HEADless redirect) ---------- */
const root = `https://api.roamresearch.com/api/graph/${process.env.GRAPH_NAME}/write`;
const redirect = await fetch(root, { method: "POST", redirect: "manual" });
const shardUrl = redirect.headers.get("location");
if (!shardUrl) { console.error("No shard URL"); process.exit(1); }

/* ---------- write block ---------- */
const payload = {
  action: "create-block",
  location: { "parent-uid": todayUid(), order: "last" },
  block: { string: `**${log.title}**\n\n${log.markdown}` },
};

const resp = await fetch(shardUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.ROAM_API_TOKEN}`,
  },
  body: JSON.stringify(payload),
});

if (!resp.ok) {
  console.error("Roam write failed:", await resp.text());
  process.exit(1);
}

/* ---------- save cursor ---------- */
await fs.writeFile(CURSOR, JSON.stringify({ lastId: log.id, lastEnd: log.endTime }));
console.log("Uploaded lifelog", log.id);
