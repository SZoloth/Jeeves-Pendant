import fetch from "node-fetch";
import fs from "node:fs/promises";

/* secrets ------------------------------------------------- */
const LIMITLESS = process.env.LIMITLESS_API_KEY;   // pendant
const ROAM_TOKEN = process.env.ROAM_API_TOKEN;     // graph API token
const GRAPH = process.env.GRAPH_NAME;              // e.g. "jeeves-pendant"

/* misc ---------------------------------------------------- */
const CURSOR = "cursor.json";
const TZ = "America/Denver";

const todayTitle = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // 2025-04-30

const readCursor = async () => {
  try { return JSON.parse(await fs.readFile(CURSOR, "utf8")); }
  catch { return { lastId: "", lastEnd: "1970-01-01T00:00:00Z" }; }
};
const saveCursor = (c) => fs.writeFile(CURSOR, JSON.stringify(c, null, 0));

const getJSON = async (res, tag) => {
  const txt = await res.text();
  if (!res.ok) throw new Error(`${tag} → HTTP ${res.status}: ${txt.slice(0,200)}`);
  return txt ? JSON.parse(txt) : null;
};

/* 1 ─ pull newest lifelog --------------------------------- */
const cur = await readCursor();

const llURL = `https://api.limitless.ai/v1/lifelogs?start=${encodeURIComponent(
  cur.lastEnd
)}&limit=1&direction=asc&includeMarkdown=true`;

const ll = await getJSON(
  await fetch(llURL, { headers: { "X-API-Key": LIMITLESS } }),
  "Limitless"
);

const log = ll?.data?.lifelogs?.[0];
if (!log)                  { console.log("No new lifelog"); process.exit(0); }
if (log.id === cur.lastId) { console.log("Duplicate lifelog"); process.exit(0); }

/* 2 ─ ensure today’s page exists (POST /page) -------------- */
const pageRes = await getJSON(
  await fetch(`https://api.roamresearch.com/api/graph/${GRAPH}/page`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ROAM_TOKEN}`
    },
    body: JSON.stringify({ page: { title: todayTitle() } })
  }),
  "create page"
);
/* pageRes.uid is the same as the title (for daily pages), but keep anyway */
const pageUid = pageRes.uid ?? todayTitle();

/* 3 ─ discover shard for /write ---------------------------- */
const root = `https://api.roamresearch.com/api/graph/${GRAPH}/write`;
const shardURL = (await fetch(root, { method: "POST", redirect: "manual" }))
                   .headers.get("location");
if (!shardURL) throw new Error("Missing shard redirect");

const auth = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${ROAM_TOKEN}`
};

/* 4 ─ append block (array payload) ------------------------- */
const ops = [
  {
    "create-block": {
      "location": { "parent-uid": pageUid, "order": "last" },
      "string": `**${log.title}**\n\n${log.markdown}`
    }
  }
];

await getJSON(
  await fetch(shardURL, { method: "POST", headers: auth, body: JSON.stringify(ops) }),
  "write"
);

console.log("Uploaded lifelog", log.id);

/* 5 ─ update cursor --------------------------------------- */
await saveCursor({ lastId: log.id, lastEnd: log.endTime });
