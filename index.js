/* Stefans Todo-Manager — laeuft auf fishi.dev */
/* __TOKEN__ wird beim Deployment durch den echten Token ersetzt (siehe README). */
const express = require("express");
const Database = require("better-sqlite3");
const crypto = require("node:crypto");

const TOKEN = "__TOKEN__";
const COOKIE_NAME = "todo_auth";
const COOKIE_VALUE = crypto.createHash("sha256").update(TOKEN + "|ui").digest("hex");

const db = new Database(process.env.DATABASE_PATH);
db.exec("CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', priority TEXT NOT NULL DEFAULT 'medium', due TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const PRIO_RANK = "CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END";
const OPEN_ORDER = PRIO_RANK + ", CASE WHEN due = '' THEN 1 ELSE 0 END, due, id";

function apiAuth(req) {
  const h = req.get("authorization") || "";
  let t = "";
  if (h.startsWith("Bearer ")) t = h.slice(7);
  else if (req.get("x-api-token")) t = req.get("x-api-token");
  else if (typeof req.query.token === "string") t = req.query.token;
  return t.trim() === TOKEN;
}
function requireApi(req, res, next) {
  if (apiAuth(req)) return next();
  res.status(401).json({ error: "unauthorized", hint: "Send header 'Authorization: Bearer <token>'. Token und API-Guide: siehe /agents.txt dieser App." });
}
function uiAuthed(req) {
  return (req.get("cookie") || "").split(";").some(function (c) { return c.trim() === COOKIE_NAME + "=" + COOKIE_VALUE; });
}
function validPrio(p) { return p === "high" || p === "low" ? p : "medium"; }
function validStatus(s) { return s === "open" || s === "in_progress" || s === "done" ? s : null; }

/* ---------- API ---------- */

app.get("/api/health", function (req, res) { res.json({ ok: true }); });

app.get("/api/todos", requireApi, function (req, res) {
  const s = req.query.status;
  let rows;
  if (s === "open") rows = db.prepare("SELECT * FROM todos WHERE status != 'done' ORDER BY " + OPEN_ORDER).all();
  else if (s === "done") rows = db.prepare("SELECT * FROM todos WHERE status = 'done' ORDER BY updated_at DESC").all();
  else rows = db.prepare("SELECT * FROM todos ORDER BY " + OPEN_ORDER + ", updated_at DESC").all();
  res.json({ todos: rows });
});

app.get("/api/todos/:id", requireApi, function (req, res) {
  const row = db.prepare("SELECT * FROM todos WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

app.get("/api/next", requireApi, function (req, res) {
  const limit = Math.min(parseInt(req.query.limit, 10) || 3, 20);
  const rows = db.prepare("SELECT * FROM todos WHERE status != 'done' ORDER BY " + OPEN_ORDER + " LIMIT ?").all(limit);
  res.json({ next: rows });
});

app.post("/api/todos", requireApi, function (req, res) {
  const b = req.body || {};
  const title = String(b.title || "").trim();
  if (!title) return res.status(400).json({ error: "bad_request", hint: "title is required" });
  const info = db.prepare("INSERT INTO todos (title, notes, priority, due) VALUES (?, ?, ?, ?)")
    .run(title, String(b.notes || ""), validPrio(b.priority), String(b.due || "").slice(0, 10));
  res.status(201).json(db.prepare("SELECT * FROM todos WHERE id = ?").get(info.lastInsertRowid));
});

app.patch("/api/todos/:id", requireApi, function (req, res) {
  const row = db.prepare("SELECT * FROM todos WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  const b = req.body || {};
  const title = b.title !== undefined ? String(b.title).trim() : row.title;
  if (!title) return res.status(400).json({ error: "bad_request", hint: "title cannot be empty" });
  const notes = b.notes !== undefined ? String(b.notes) : row.notes;
  const status = validStatus(b.status) || row.status;
  const priority = b.priority !== undefined ? validPrio(b.priority) : row.priority;
  const due = b.due !== undefined ? String(b.due).slice(0, 10) : row.due;
  db.prepare("UPDATE todos SET title = ?, notes = ?, status = ?, priority = ?, due = ?, updated_at = datetime('now') WHERE id = ?")
    .run(title, notes, status, priority, due, row.id);
  res.json(db.prepare("SELECT * FROM todos WHERE id = ?").get(row.id));
});

app.post("/api/todos/:id/done", requireApi, function (req, res) {
  const info = db.prepare("UPDATE todos SET status = 'done', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "not found" });
  res.json(db.prepare("SELECT * FROM todos WHERE id = ?").get(req.params.id));
});

app.delete("/api/todos/:id", requireApi, function (req, res) {
  const info = db.prepare("DELETE FROM todos WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "not found" });
  res.json({ ok: true, deleted: Number(req.params.id) });
});

/* ---------- agents.txt ---------- */

const AGENTS_TXT =
"# Stefans Todo-Manager — Anleitung fuer KI-Agenten\n" +
"\n" +
"Diese App verwaltet Stefans Todo-Liste. Die API ist offen, Schreibzugriff\n" +
"schuetzt nur ein fixer Token. Auch die Weboberflaeche (/) nutzt denselben\n" +
"Token als Login.\n" +
"\n" +
"## Auth\n" +
"Alle /api/*-Routen erwarten den Token. Drei Moeglichkeiten:\n" +
"  1. Header:  Authorization: Bearer <TOKEN>\n" +
"  2. Header:  x-api-token: <TOKEN>\n" +
"  3. Query:   ?token=<TOKEN>\n" +
"Den Token erfaehrst du von Stefan persoenlich.\n" +
"Ohne Token: HTTP 401. Diese Datei hier ist die einzige oeffentliche Route.\n" +
"\n" +
"## Todo-Objekt\n" +
'{ "id": 1, "title": "...", "notes": "...", "status": "open" | "in_progress" | "done",\n' +
'  "priority": "high" | "medium" | "low", "due": "YYYY-MM-DD" oder "",\n' +
'  "created_at": "...", "updated_at": "..." }\n' +
"\n" +
"## Routen\n" +
"GET    /api/todos?status=open|done|all   (ohne status: alle; 'open' = alles Unerledigte)\n" +
"GET    /api/todos/:id\n" +
"GET    /api/next?limit=3                die wichtigsten offenen Todos: was Stefan als naechstes tun soll\n" +
"POST   /api/todos                        { title (Pflicht), notes?, priority?, due? }\n" +
"PATCH  /api/todos/:id                    { title?, notes?, status?, priority?, due? }\n" +
"POST   /api/todos/:id/done               Komfort-Route: als erledigt markieren\n" +
"DELETE /api/todos/:id\n" +
"GET    /agents.txt                       diese Anleitung (oeffentlich, ohne Token)\n" +
"\n" +
"## Sortierung\n" +
"/api/next und offene Todos sortieren nach: Prioritaet (high vor medium vor low),\n" +
"dann fruehestes due-Datum (ohne Datum zuletzt), dann aeltestes zuerst.\n" +
"\n" +
"## Verhalten fuer Agenten\n" +
"- Lies zuerst GET /api/next, um zu wissen, was ansteht.\n" +
"- Hake nur ab, was Stefan explizit als erledigt bestaetigt hat.\n" +
"- Neue Todos kurz und im Imperativ formulieren (z. B. 'Steuerunterlagen sortieren').\n" +
"- Nichts loeschen, ausser Stefan verlangt es ausdruecklich.\n" +
"- In 'notes' kurzen Kontext fuer spaetere Agenten hinterlegen.\n" +
"\n" +
"## Beispiele\n" +
'curl -s "$APP_URL/api/next" -H "Authorization: Bearer <TOKEN>"\n' +
'curl -s -X POST "$APP_URL/api/todos" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d \'{"title":"Milch kaufen","priority":"low"}\'\n' +
'curl -s -X POST "$APP_URL/api/todos/7/done" -H "Authorization: Bearer <TOKEN>"\n';

app.get("/agents.txt", function (req, res) {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send(AGENTS_TXT);
});

/* ---------- UI ---------- */

function loginPage(msg) {
  return "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Todos — Login</title><style>" +
    "*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center}" +
    ".box{background:#1e293b;padding:2rem;border-radius:12px;width:100%;max-width:360px}" +
    "h1{margin:0 0 .5rem;font-size:1.3rem}p.hint{margin:0 0 1rem;color:#94a3b8;font-size:.9rem}" +
    "input{width:100%;padding:.7rem;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:1rem}" +
    "button{margin-top:.8rem;width:100%;padding:.7rem;border:0;border-radius:8px;background:#3b82f6;color:#fff;font-size:1rem;cursor:pointer}" +
    ".err{color:#f87171;font-size:.85rem;margin:.5rem 0 0}" +
    "</style></head><body><div class=\"box\"><h1>Stefans Todos</h1><p class=\"hint\">Login mit deinem Token.</p>" +
    "<form method=\"post\" action=\"/login\"><input type=\"password\" name=\"password\" placeholder=\"Token\" autofocus>" +
    "<button type=\"submit\">Anmelden</button>" + (msg ? "<p class=\"err\">" + msg + "</p>" : "") + "</form></div></body></html>";
}

function appPage() {
  return "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Stefans Todos</title><style>" +
    "*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:#f1f5f9;color:#0f172a}" +
    "header{background:#0f172a;color:#fff;padding:1rem 1.25rem;display:flex;justify-content:space-between;align-items:center}" +
    "header h1{margin:0;font-size:1.15rem}header button{background:none;border:1px solid #475569;color:#cbd5e1;border-radius:8px;padding:.4rem .8rem;cursor:pointer}" +
    "main{max-width:720px;margin:0 auto;padding:1rem}.card{background:#fff;border-radius:12px;padding:1rem 1.25rem;margin-bottom:1rem;box-shadow:0 1px 4px rgba(0,0,0,.08)}" +
    "h2{margin:0 0 .75rem;font-size:1rem;color:#475569}ul{list-style:none;margin:0;padding:0}" +
    "li{display:flex;align-items:center;gap:.6rem;padding:.55rem 0;border-bottom:1px solid #f1f5f9}li:last-child{border-bottom:0}" +
    ".t{flex:1}.t.done-t{color:#94a3b8;text-decoration:line-through}.notes{color:#64748b;font-size:.85rem}" +
    ".badge{font-size:.7rem;padding:.15rem .5rem;border-radius:99px;font-weight:600}" +
    ".p-high{background:#fee2e2;color:#b91c1c}.p-medium{background:#fef3c7;color:#b45309}.p-low{background:#d1fae5;color:#047857}" +
    ".s-run{background:#dbeafe;color:#1d4ed8}.due{font-size:.75rem;color:#64748b}.due.over{color:#b91c1c;font-weight:600}" +
    "li button{border:0;background:#f1f5f9;border-radius:8px;cursor:pointer;padding:.3rem .55rem;font-size:.9rem}" +
    "li button:hover{background:#e2e8f0}.next-item{padding:.6rem 0;border-bottom:1px solid #f1f5f9}.next-item:last-child{border-bottom:0}" +
    ".next-title{font-weight:600}form#add{display:flex;gap:.5rem;flex-wrap:wrap}input,select{padding:.55rem;border:1px solid #cbd5e1;border-radius:8px;font-size:.95rem}" +
    "#title{flex:1;min-width:180px}#empty{color:#059669;margin:0}.muted{color:#94a3b8;font-size:.85rem}" +
    "</style></head><body><header><h1>Stefans Todos</h1><form method=\"post\" action=\"/logout\"><button type=\"submit\">Abmelden</button></form></header><main>" +
    "<section class=\"card\"><h2>Jetzt dran</h2><div id=\"nextList\"><p class=\"muted\">Lade …</p></div></section>" +
    "<section class=\"card\"><h2>Neues Todo</h2><form id=\"add\"><input id=\"title\" placeholder=\"Was ist zu tun?\" required>" +
    "<select id=\"prio\"><option value=\"high\">Hoch</option><option value=\"medium\" selected>Mittel</option><option value=\"low\">Niedrig</option></select>" +
    "<input type=\"date\" id=\"due\"><button type=\"submit\" style=\"padding:.55rem 1rem\">+</button></form></section>" +
    "<section class=\"card\"><h2>Anstehend <span id=\"openCount\" class=\"muted\"></span></h2><ul id=\"openList\"></ul><p id=\"empty\" hidden>Alles erledigt.</p></section>" +
    "<section class=\"card\"><h2>Erledigt <span id=\"doneCount\" class=\"muted\"></span></h2><ul id=\"doneList\" style=\"max-height:260px;overflow:auto\"></ul></section>" +
    "</main><script>" +
    "var esc=function(s){return String(s).replace(/[&<>\"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[m];});};" +
    "function api(p,method,body){var o={method:method||'GET'};if(body){o.headers={'Content-Type':'application/json'};o.body=JSON.stringify(body);}" +
    "return fetch(p,o).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});}" +
    "function dueBadge(t){if(!t.due)return '';var over=t.due<new Date().toISOString().slice(0,10);" +
    "return '<span class=\"due'+(over?' over':'')+'\">'+(over?'! ':'')+esc(t.due)+'</span>';}" +
    "function prioBadge(t){return '<span class=\"badge p-'+t.priority+'\">'+({high:'Hoch',medium:'Mittel',low:'Niedrig'})[t.priority]+'</span>';}" +
    "function itemHtml(t,done){var b=done?['&#8630;','wieder oeffnen']:['&#10003;','erledigt'];" +
    "return '<li><div class=\"t'+(done?' done-t':'')+'\">'+esc(t.title)+(t.notes?'<div class=\"notes\">'+esc(t.notes)+'</div>':'')+'</div>'+" +
    "(t.status==='in_progress'?'<span class=\"badge s-run\">laeuft</span>':'')+prioBadge(t)+dueBadge(t)+" +
    "'<button data-a=\"done\" data-id=\"'+t.id+'\" title=\"'+b[1]+'\">'+b[0]+'</button>'+" +
    "'<button data-a=\"del\" data-id=\"'+t.id+'\" title=\"loeschen\">&#10005;</button></li>';}" +
    "function render(data){var open=data.todos.filter(function(t){return t.status!=='done';});var done=data.todos.filter(function(t){return t.status==='done';});" +
    "var ol=document.getElementById('openList');ol.innerHTML=open.map(function(t){return itemHtml(t,false);}).join('');" +
    "var dl=document.getElementById('doneList');dl.innerHTML=done.map(function(t){return itemHtml(t,true);}).join('');" +
    "document.getElementById('openCount').textContent=open.length?('&middot; '+open.length):'';document.getElementById('doneCount').textContent=done.length?('&middot; '+done.length):'';" +
    "document.getElementById('empty').hidden=open.length>0;" +
    "api('/api/next?limit=3').then(function(r){var n=document.getElementById('nextList');" +
    "n.innerHTML=r.next.length?r.next.map(function(t){return '<div class=\"next-item\"><span class=\"next-title\">'+esc(t.title)+'</span> '+prioBadge(t)+' '+dueBadge(t)+'</div>';}).join(''):'<p class=\"muted\">Nichts offen.</p>';}).catch(function(){});}" +
    "function load(){api('/api/todos').then(render).catch(function(e){alert('Fehler: '+e.message);});}" +
    "document.getElementById('add').addEventListener('submit',function(ev){ev.preventDefault();" +
    "api('/api/todos','POST',{title:document.getElementById('title').value,notes:'',priority:document.getElementById('prio').value,due:document.getElementById('due').value||''})" +
    ".then(function(){document.getElementById('title').value='';document.getElementById('due').value='';load();});});" +
    "document.addEventListener('click',function(ev){var b=ev.target.closest('button');if(!b||!b.dataset.id)return;" +
    "var id=b.dataset.id;if(b.dataset.a==='done'){api('/api/todos/'+id+'/done','POST').then(load);}" +
    "else if(b.dataset.a==='del'){if(confirm('Wirklich loeschen?')){api('/api/todos/'+id,'DELETE').then(load);}}});" +
    "load();" +
    "</script></body></html>";
}

app.get("/", function (req, res) {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(uiAuthed(req) ? appPage() : loginPage(""));
});

app.post("/login", function (req, res) {
  const pw = (req.body && req.body.password) || "";
  if (pw !== TOKEN) { res.status(401); res.set("Content-Type", "text/html; charset=utf-8"); return res.send(loginPage("Falscher Token — nochmal versuchen.")); }
  res.setHeader("Set-Cookie", COOKIE_NAME + "=" + COOKIE_VALUE + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000");
  res.redirect("/");
});

app.post("/logout", function (req, res) {
  res.setHeader("Set-Cookie", COOKIE_NAME + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  res.redirect("/");
});

app.listen(process.env.PORT, "0.0.0.0", function () { console.log("todo-manager listening on " + process.env.PORT); });
