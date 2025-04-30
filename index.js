import fetch from "node-fetch";
import fs from "node:fs/promises";

/* ENV: LIMITLESS_API_KEY, ROAM_API_TOKEN, GRAPH_NAME */
const CURSOR = "cursor.json";
const TZ     = "America/Denver";

/* helpers */
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // 2025-04-30

const readCur = async () => {
  try { return JSON.parse(await fs.readFile(CURSOR,"utf8")); }
  catch { return { lastId:"", lastEnd:"1970-01-01T00:00:00Z" }; }
};
const saveCur = (c)=>fs.writeFile(CURSOR,JSON.stringify(c));

const j = async (r,tag)=>{
  const t=await r.text();
  if(!r.ok) throw new Error(`${tag} → ${r.status}: ${t.slice(0,200)}`);
  return t?JSON.parse(t):null;
};

/* 1 ─ newest lifelog */
const cur = await readCur();
const ll  = await j(
  await fetch(
    `https://api.limitless.ai/v1/lifelogs?start=${encodeURIComponent(cur.lastEnd)}&limit=1&direction=asc&includeMarkdown=true`,
    { headers:{ "X-API-Key": process.env.LIMITLESS_API_KEY } }
  ),
  "Limitless"
);

const log = ll?.data?.lifelogs?.[0];
if(!log)                   { console.log("No new lifelog"); process.exit(0); }
if(log.id===cur.lastId)    { console.log("Duplicate");       process.exit(0); }

/* 2 ─ shard URL */
const root  = `https://api.roamresearch.com/api/graph/${process.env.GRAPH_NAME}/write`;
const shard = (await fetch(root,{method:"POST",redirect:"manual"}))
                .headers.get("location");
if(!shard) throw new Error("Roam redirect missing Location");

const hdr={ "Content-Type":"application/json",
            Authorization:`Bearer ${process.env.ROAM_API_TOKEN}` };

/* 3 ─ operations wrapped in vectors */
const body={
  operations:[
    [ { "create-page":  { "title": today() } } ],
    [ { "create-block": {
          "location":{ "parent-uid": today(), "order":"last" },
          "string":`**${log.title}**\n\n${log.markdown}`
        } } ]
  ]
};

await j(
  await fetch(shard,{method:"POST",headers:hdr,body:JSON.stringify(body)}),
  "Roam write"
);

console.log("Uploaded",log.id);

/* 4 ─ cursor */
await saveCur({ lastId: log.id, lastEnd: log.endTime });
