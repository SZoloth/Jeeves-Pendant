import fetch from "node-fetch";
import fs from "node:fs/promises";

/* helper: uid for Denver daily-note (YYYY-MM-DD) */
function todayUid() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
}

/* load / init cursor */
const CURSOR = "cursor.json";
const blank = { lastId: "", lastEnd: "1970-01-01T00:00:00Z" };
let store = blank;
try { store = JSON.parse(await fs.readFile(CURSOR, "utf8")); } catch {}

/* fetch latest lifelog */
const res = await fetch(
  `https://api.limitless.ai/v1/lifelogs?start=${encodeURIComponent(
    store.lastEnd
  )}&limit=1&direction=asc&includeMarkdown=true`,
  { headers: { "X-API-Key": process.env.LIMITLESS_API_KEY } }
).then(r => r.json());

const log = res?.data?.lifelogs?.[0];
if (!log)  { console.log("No new lifelog");   process.exit(0); }
if (log.id === store.lastId) { console.log("Duplicate lifelog"); process.exit(0); }

/* send to Roam */
const body = {
  operations: [
    {
      "create-block": {
        location: { "parent-uid": todayUid(), order: "last" },
        block: { string: log.markdown.replace(/\n/g, " ⏎ ") }  // single-line
      }
    }
  ]
};

const r = await fetch(
  `https://api.roamresearch.com/api/graph/${process.env.GRAPH_NAME}/write`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ROAM_API_TOKEN}`
    },
    body: JSON.stringify(body)
  }
);

if (!r.ok) {
  console.error("Roam write failed:", await r.text());
  process.exit(1);
}

await fs.writeFile(CURSOR, JSON.stringify({ lastId: log.id, lastEnd: log.endTime }));
console.log("Uploaded", log.id);
