import fetch from "node-fetch";
import fs from "node:fs/promises";

/* config */
const LIMITLESS = process.env.LIMITLESS_API_KEY;
const ROAM_TOKEN = process.env.ROAM_API_TOKEN;
const GRAPH = process.env.GRAPH_NAME;
const CURSOR = "cursor.json";
const TZ = "America/Denver";

/* helpers */
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

const readCur = async () => {
  try { return JSON.parse(await fs.readFile(CURSOR, "utf8")); }
  catch { return { lastId: "", lastEnd: "1970-01-01T00:00:00Z" }; }
};
const saveCur = (c) => fs.writeFile(CURSOR, JSON.stringify(c));

const asJson = async (res, lbl) => {
  const txt = await res.text();
  if (!res.ok) throw new Error(`${lbl} → HTTP ${res.status}: ${txt.slice(0,200)}`);
  return txt ? JSON.parse(txt) : null;
};

/* 1 ─ newest lifelog */
const cur = await readCur();

const ll = await asJson(
  await fetch(
    `https://api.limitless.ai/v1/lifelogs?start=${encodeURIComponent(cur.lastEnd)}&limit=1&direction=asc&includeMarkdown=true`,
    { headers: { "X-API-Key": LIMITLESS } }
  ),
  "Limitless"
);

const log = ll?.data?.lifelogs?.[0];
if (!log)                  { console.log("No new lifelog");   process.exit(0); }
if (log.id === cur.lastId) { console.log("Duplicate lifelog"); process.exit(0); }

/* 2 ─ shard URL */
const root  = `https://api.roamresearch.com/api/graph/${GRAPH}/write`;
const shard = (await fetch(root, { method: "POST", redirect: "manual" }))
                .headers.get("location");
if (!shard) throw new Error("Roam redirect missing Location");

const hdr = { "Content-Type": "application/json",
              Authorization: `Bearer ${ROAM_TOKEN}` };

/* 3 ─ correct operations array */
const ops = [
  { "create-page": { "title": today() } },
  { "create-block": {
      "location": { "parent-uid": today(), "order": "last" },
      "string": `**${log.title}**\n\n${log.markdown}`
  } }
];

await asJson(
  await fetch(shard, { method: "POST", headers: hdr, body: JSON.stringify(ops) }),
  "Roam write"
);

console.log("Uploaded lifelog", log.id);

/* 4 ─ update cursor */
await saveCur({ lastId: log.id, lastEnd: log.endTime });
