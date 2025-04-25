import fetch from "node-fetch";
import fs from "node:fs/promises";

/* ---------- constants ---------- */
const LIMITLESS = process.env.LIMITLESS_API_KEY;
const ROAM_TOKEN = process.env.ROAM_API_TOKEN;
const GRAPH = process.env.GRAPH_NAME;
const CURSOR_FILE = "cursor.json";
const TZ = "America/Denver";

/* ---------- helpers ---------- */
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: TZ });    // 2025-04-24

const readCursor = async () => {
  try { return JSON.parse(await fs.readFile(CURSOR_FILE, "utf8")); }
  catch { return { lastId: "", lastEnd: "1970-01-01T00:00:00Z" }; }
};
const saveCursor = (obj) => fs.writeFile(CURSOR_FILE, JSON.stringify(obj));

const ensureOkJson = async (res, label) => {
  const txt = await res.text();
  if (!res.ok) throw new Error(`${label} → HTTP ${res.status}: ${txt.slice(0,120)}`);
  try { return JSON.parse(txt || "null"); }
  catch { throw new Error(`${label} → non-JSON: ${txt.slice(0,120)}`); }
};

/* ---------- main ---------- */
const cursor = await readCursor();

/* 1️⃣  pull newest lifelog */
const llURL = `https://api.limitless.ai/v1/lifelogs?start=${encodeURIComponent(
  cursor.lastEnd
)}&limit=1&direction=asc&includeMarkdown=true`;

const ll = await ensureOkJson(
  await fetch(llURL, { headers: { "X-API-Key": LIMITLESS } }),
  "Limitless"
);

const log = ll?.data?.lifelogs?.[0];
if (!log)                     { console.log("No new lifelog"); process.exit(0); }
if (log.id === cursor.lastId) { console.log("Duplicate lifelog"); process.exit(0); }

/* 2️⃣  discover shard URL */
const root = `https://api.roamresearch.com/api/graph/${GRAPH}/write`;
const redirect = await fetch(root, { method: "POST", redirect: "manual" });
const shard = redirect.headers.get("location");
if (!shard) throw new Error("Roam redirect missing Location header");

const auth = { "Content-Type": "application/json", Authorization: `Bearer ${ROAM_TOKEN}` };

/* 3️⃣  idempotently create today's page */
await fetch(shard, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ action: "create-page", page: { title: today() } })
}); // ignore response intentionally—exists OK, not exists created

/* 4️⃣  append block */
await ensureOkJson(
  await fetch(shard, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      action: "create-block",
      location: { "parent-uid": today(), order: "last" },
      block:    { string: `**${log.title}**\n\n${log.markdown}` }
    })
  }),
  "Roam write"
);

console.log("Uploaded lifelog", log.id);

/* 5️⃣  update cursor */
await saveCursor({ lastId: log.id, lastEnd: log.endTime });
