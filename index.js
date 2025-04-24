import fetch from "node-fetch";
import fs from "node:fs/promises";

/* ---------- helper ---------- */
const todayUid = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });

/* ---------- cursor ---------- */
const CURSOR = "cursor.json";
const blank = { lastId: "", lastEnd: "1970-01-01T00:00:00Z" };
let store = blank;
try { store = JSON.parse(await fs.readFile(CURSOR, "utf8")); } catch {}

/* ---------- newest lifelog ---------- */
const pendant = await fetch(
  `https://api.limitless.ai/v1/lifelogs?start=${encodeURIComponent(
    store.lastEnd
  )}&limit=1&direction=asc&includeMarkdown=true`,
  { headers: { "X-API-Key": process.env.LIMITLESS_API_KEY } }
).then(r => r.json());

const log = pendant?.data?.lifelogs?.[0];
if (!log)               { console.log("No new lifelog");           process.exit(0); }
if (log.id === store.lastId) { console.log("Duplicate lifelog");        process.exit(0); }

/* ---------- get shard URL (one HEAD request, no auth) ---------- */
const writeRoot = `https://api.roamresearch.com/api/graph/${process.env.GRAPH_NAME}/write`;
const redirectResp = await fetch(writeRoot, { method: "POST", redirect: "manual" });
const shardUrl = redirectResp.headers.get("location");
if (!shardUrl) { console.error("Failed to get shard URL"); process.exit(1); }

/* ---------- send authenticated write ---------- */
const payload = {
  action: "create-block",
  location: { "parent-uid": todayUid(), order: "last" },
  block: { string: `**${log.title}**\n\n${log.markdown}` },
};

const roam = await fetch(shardUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.ROAM_API_TOKEN}`,
  },
  body: JSON.stringify(payload),
});

if (!roam.ok) {
  console.error("Roam write failed:", await roam.text());
  process.exit(1);
}

/* ---------- persist cursor ---------- */
await fs.writeFile(CURSOR, JSON.stringify({ lastId: log.id, lastEnd: log.endTime }));
console.log("Uploaded lifelog", log.id);
