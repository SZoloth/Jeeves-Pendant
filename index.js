import fetch from "node-fetch";
import fs from "node:fs/promises";

/* ---------- constants ---------- */
const CURSOR_FILE = "cursor.json";
const LIMITLESS   = process.env.LIMITLESS_API_KEY;
const ROAM_TOKEN  = process.env.ROAM_API_TOKEN;
const GRAPH       = process.env.GRAPH_NAME;

/* ---------- helpers ---------- */
const readCursor = async () => {
  try { return JSON.parse(await fs.readFile(CURSOR_FILE, "utf8")); }
  catch { return { lastId: "", lastEnd: "1970-01-01T00:00:00Z" }; }
};
const saveCursor = (c) => fs.writeFile(CURSOR_FILE, JSON.stringify(c));

const getJSON = async (res, label) => {
  if (!res.ok) throw new Error(`${label} → HTTP ${res.status}`);
  const t = await res.text();
  try { return JSON.parse(t); }
  catch { throw new Error(`${label} → non-JSON: ${t.slice(0,150)}…`); }
};

/* ---------- main ---------- */
const cursor = await readCursor();

/* 1. newest lifelog */
const api = `https://api.limitless.ai/v1/lifelogs`
          + `?start=${encodeURIComponent(cursor.lastEnd)}`
          + `&limit=1&direction=asc&includeMarkdown=true`;

const lifelog = await getJSON(
  await fetch(api, { headers: { "X-API-Key": LIMITLESS } }),
  "Limitless"
);

const log = lifelog?.data?.lifelogs?.[0];
if (!log)                       { console.log("No new lifelog"); process.exit(0); }
if (log.id === cursor.lastId)   { console.log("Duplicate");       process.exit(0); }

/* 2. find shard once & cache (cheap HEAD) */
const root = `https://api.roamresearch.com/api/graph/${GRAPH}/write`;
const shard = (await fetch(root, { method: "POST", redirect: "manual" }))
                .headers.get("location");
if (!shard) throw new Error("Roam redirect missing Location header");

/* 3. append block under today’s DN page */
const payload = {
  action: "create-block",
  location: { "parent-uid": "today", order: "last" },
  block:    { string: `**${log.title}**\n\n${log.markdown}` }
};

const roamRes = await fetch(shard, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${ROAM_TOKEN}` },
  body: JSON.stringify(payload)
});
if (!roamRes.ok)
  throw new Error(`Roam write → HTTP ${roamRes.status}: ${await roamRes.text()}`);

console.log("Uploaded lifelog", log.id);

/* 4. update cursor */
await saveCursor({ lastId: log.id, lastEnd: log.endTime });
