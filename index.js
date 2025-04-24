import fetch from "node-fetch";
import fs from "node:fs/promises";

const CURSOR = "cursor.json";
const blank = { lastId: "", lastEnd: "1970-01-01T00:00:00Z" };
let store = blank;
try { store = JSON.parse(await fs.readFile(CURSOR, "utf8")); } catch {}

const res = await fetch(
  `https://api.limitless.ai/v1/lifelogs?start=${encodeURIComponent(
    store.lastEnd
  )}&limit=1&direction=asc&includeMarkdown=true`,
  { headers: { "X-API-Key": process.env.LIMITLESS_API_KEY } }
).then(r => r.json());

const log = res?.data?.lifelogs?.[0];
if (!log) {
  console.log("No new lifelogs"); process.exit(0);
}
if (log.id === store.lastId) {
  console.log("Duplicate lifelog"); process.exit(0);
}

await fetch("https://quickcapture.roamjs.com/quick-capture", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    token: process.env.ROAM_QC_TOKEN,
    uid: "today",
    text: `**${log.title}**\n\n${log.markdown}`
  })
});

await fs.writeFile(CURSOR, JSON.stringify({ lastId: log.id, lastEnd: log.endTime }));
console.log("Uploaded lifelog", log.id);
