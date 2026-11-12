"use strict";
/* Serveur RESTAURANT LACOUR : fichiers de l'application + base de données partagée.
   Aucune dépendance : il suffit de Node.js 18 ou plus. */
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const PORT = Number(process.env.PORT) || 3000;
const DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PUB = path.join(__dirname, "public");
fs.mkdirSync(DIR, { recursive: true });
const CF = path.join(DIR, "config.json"), DBF = path.join(DIR, "db.json");

/* ---------- Codes d'accès ---------- */
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CF, "utf8")); } catch (e) {}
if (process.env.RESTO_KEY) cfg.key = process.env.RESTO_KEY;
if (process.env.ADMIN_KEY) cfg.admin = process.env.ADMIN_KEY;
const rnd = () => crypto.randomBytes(5).toString("hex");
let fresh = false;
if (!cfg.key) { cfg.key = rnd(); fresh = true; }
if (!cfg.admin) { cfg.admin = rnd(); fresh = true; }
if (fresh) { fs.writeFileSync(CF, JSON.stringify(cfg, null, 2)); }
console.log("\n=== RESTAURANT LACOUR ===");
console.log("Code du restaurant (employés)  :", cfg.key);
console.log("Code administrateur (propriétaire):", cfg.admin);
console.log("Ces codes sont aussi dans", CF, "\n");
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const level = k => !k ? 0 : same(k, cfg.admin) ? 2 : same(k, cfg.key) ? 1 : 0;

/* ---------- Base de données (mémoire + fichier JSON) ---------- */
const db = new Map(); // collection -> Map(id -> données)
try {
  const raw = JSON.parse(fs.readFileSync(DBF, "utf8"));
  for (const c of Object.keys(raw)) db.set(c, new Map(Object.entries(raw[c])));
} catch (e) {}
const col = c => { let m = db.get(c); if (!m) { m = new Map(); db.set(c, m); } return m; };
let timer = null;
function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const out = {};
    for (const [c, m] of db) out[c] = Object.fromEntries(m);
    const tmp = DBF + ".tmp";
    fs.writeFile(tmp, JSON.stringify(out), err => { if (!err) fs.rename(tmp, DBF, () => {}); });
  }, 300);
}
const SEG = /^[A-Za-z0-9_.:@+~-]{1,200}$/;
const okSeg = s => SEG.test(s) && s !== "." && s !== "..";
const needAdmin = c => c === "hr";
const leases = new Map();

/* ---------- Diffusion en temps réel (SSE) ---------- */
const streams = new Set();
function broadcast(c, id, data) {
  const msg = "event: ch\ndata: " + JSON.stringify({ col: c, id, data }) + "\n\n";
  for (const s of streams) if (s.cols.has(c) && (!needAdmin(c) || s.level >= 2)) s.res.write(msg);
}
function write(c, id, data) {
  if (data === null) col(c).delete(id); else col(c).set(id, data);
  persist(); broadcast(c, id, data);
}

/* ---------- Outils HTTP ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".css": "text/css" };
function send(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}
function body(req, max) {
  return new Promise((ok, ko) => {
    let n = 0; const ch = [];
    req.on("data", d => { n += d.length; if (n > max) { ko(new Error("trop gros")); req.destroy(); } else ch.push(d); });
    req.on("end", () => { try { ok(ch.length ? JSON.parse(Buffer.concat(ch).toString("utf8")) : {}); } catch (e) { ko(new Error("json")); } });
    req.on("error", ko);
  });
}
const isObj = o => o && typeof o === "object" && !Array.isArray(o);

/* ---------- Commande en ligne des clients (sans compte) ---------- */
const hits = new Map();
function limited(ip) {
  const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 600000);
  if (a.length >= 8) { hits.set(ip, a); return true; }
  a.push(now); hits.set(ip, a); return false;
}
const digits = s => String(s || "").replace(/\D/g, "");
function publicInfo() {
  const set = col("meta").get("set") || {};
  return {
    name: set.name || cfg.name || "RESTAURANT LACOUR", cur: set.cur || "FCFA", wa: digits(set.wa), logo: typeof set.logo === "string" && set.logo.startsWith("data:image/") ? set.logo : "",
    groups: [...col("groups").values()].filter(g => g && g.name).sort((a, b) => (a.ord || 0) - (b.ord || 0)).map(g => ({ id: g.id, name: g.name })),
    menu: [...col("menu").values()].filter(m => m && m.name && m.price >= 0).map(m => ({ id: m.id, name: m.name, price: m.price, gid: m.gid || "" })).sort((a, b) => a.name.localeCompare(b.name, "fr"))
  };
}
function publicOrder(d) {
  if (d.site) return { ok: true, id: "OK" }; // piège à robots
  const set = col("meta").get("set") || {}, menu = col("menu");
  const name = String(d.n || "").trim().slice(0, 80), phone = String(d.p || "").trim().slice(0, 40);
  const liv = d.m !== "ret", addr = liv ? String(d.a || "").trim().slice(0, 200) : "Retrait au restaurant";
  if (!name) return { err: "Indiquez votre nom." };
  if (digits(phone).length < 8) return { err: "Indiquez un numéro de téléphone valide." };
  if (liv && !addr) return { err: "Indiquez l’adresse de livraison." };
  const items = [];
  for (const a of (Array.isArray(d.i) ? d.i : []).slice(0, 40)) {
    const m = menu.get(String(a && a[0])), q = Math.floor(Number(a && a[1]));
    if (m && q > 0 && q < 100) items.push({ mid: m.id, name: m.name, price: m.price, sid: m.sid || "", use: m.use || 0, cost: m.cost || 0, qty: q });
  }
  if (!items.length) return { err: "Votre panier est vide ou le menu a changé. Actualisez la page." };
  const sub = items.reduce((a, i) => a + i.price * i.qty, 0), tva = Number(set.tva) || 0;
  // client : retrouvé par son numéro, sinon créé
  let cid = ""; const ph = digits(phone);
  for (const c of col("clients").values()) if (c && digits(c.phone) && digits(c.phone).slice(-8) === ph.slice(-8)) { cid = c.id; break; }
  if (!cid) { cid = "w" + crypto.randomBytes(5).toString("hex"); write("clients", cid, { id: cid, name, phone, ifu: "", note: "Via commande en ligne" }); }
  const id = "C" + Date.now().toString(36).slice(-4).toUpperCase() + crypto.randomBytes(1).toString("hex").toUpperCase();
  write("orders", id, { id, kind: "liv", table: null, by: "web", byn: "Commande en ligne", src: "Internet", kit: "À préparer", cid, client: name, phone, ifu: "", addr, note: String(d.x || "").slice(0, 200), items, sub, total: sub * (1 + tva / 100), status: "En préparation", at: Date.now(), paid: false });
  return { ok: true, id };
}

/* ---------- Récupération du PIN par e-mail ---------- */
const rec = new Map();
const nameOf = () => (col("meta").get("set") || {}).name || cfg.name || "RESTAURANT LACOUR";
const codeHash = (id, code) => crypto.createHash("sha256").update(cfg.admin + ":" + id + ":" + code).digest("hex");
const mask = e => { const [a, b] = String(e).split("@"); return (a ? a[0] : "") + "***@" + (b || ""); };
async function sendMail(to, subject, text) {
  const from = process.env.MAIL_FROM;
  if (process.env.BREVO_API_KEY && from) {
    const r = await fetch(process.env.BREVO_URL || "https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ sender: { email: from, name: nameOf() }, to: [{ email: to }], subject, textContent: text }) });
    if (!r.ok) throw new Error("mail " + r.status); return;
  }
  if (process.env.RESEND_API_KEY && from) {
    const r = await fetch(process.env.RESEND_URL || "https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + process.env.RESEND_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ from: nameOf() + " <" + from + ">", to: [to], subject, text }) });
    if (!r.ok) throw new Error("mail " + r.status); return;
  }
  throw Object.assign(new Error("non configuré"), { code: "nomail" });
}
async function recoverRequest(d, ip) {
  const id = String(d.id || "");
  if (!okSeg(id)) return [400, { err: "Profil invalide." }];
  if (limited(ip + ":rec")) return [429, { err: "Trop de demandes. Réessayez dans quelques minutes." }];
  const team = col("team").get(id), hr = col("hr").get(id);
  if (!team) return [404, { err: "Profil introuvable." }];
  const email = hr && String(hr.email || "").trim();
  if (!email) return [404, { err: "Aucune adresse e-mail n’est enregistrée pour ce profil. Demandez à l’administrateur de réinitialiser votre PIN." }];
  const now = Date.now(), r = rec.get(id) || { sent: [] };
  r.sent = r.sent.filter(t => now - t < 900000);
  if (r.sent.length >= 3) return [429, { err: "Trop de demandes pour ce profil. Réessayez dans 15 minutes." }];
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  try {
    await sendMail(email, "Code de récupération du PIN · " + nameOf(), "Bonjour " + (team.prenoms || "") + ",\n\nVotre code de récupération du PIN est : " + code + "\nIl est valable 15 minutes.\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.\n\n" + nameOf() + "\n");
  } catch (e) {
    return e.code === "nomail" ? [501, { err: "L’envoi d’e-mails n’est pas configuré sur le serveur. Demandez à l’administrateur de réinitialiser votre PIN." }] : [502, { err: "L’e-mail n’a pas pu être envoyé. Réessayez plus tard." }];
  }
  r.sent.push(now); r.h = codeHash(id, code); r.exp = now + 900000; r.tries = 0; rec.set(id, r);
  return [200, { ok: true, hint: mask(email) }];
}
function recoverConfirm(d) {
  const id = String(d.id || ""), r = rec.get(id);
  if (!r || !r.h || r.exp < Date.now()) return [400, { err: "Code expiré. Demandez un nouveau code." }];
  if (++r.tries > 5) { rec.delete(id); return [429, { err: "Trop d’essais. Demandez un nouveau code." }]; }
  if (!same(codeHash(id, String(d.code || "").trim()), r.h)) return [400, { err: "Code incorrect." }];
  if (!/^[0-9a-f]{64}$/.test(String(d.pinh || ""))) return [400, { err: "Votre navigateur ne permet pas de changer le PIN en sécurité." }];
  const team = col("team").get(id);
  if (!team) return [404, { err: "Profil introuvable." }];
  const nt = Object.assign({}, team, { pinh: d.pinh }); delete nt.pin;
  write("team", id, nt); rec.delete(id);
  return [200, { ok: true }];
}

/* ---------- Routage ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), p = url.pathname;
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "same-origin");
  try {
    if (p === "/api/public" && req.method === "GET") return send(res, 200, publicInfo());
    if (p === "/api/public/order" && req.method === "POST") {
      const ip = req.headers["x-forwarded-for"] ? String(req.headers["x-forwarded-for"]).split(",")[0].trim() : req.socket.remoteAddress;
      if (limited(ip)) return send(res, 429, { err: "Trop de commandes. Réessayez dans quelques minutes." });
      const r = publicOrder(await body(req, 8192));
      return send(res, r.err ? 400 : 200, r);
    }
    if (p.startsWith("/api/")) {
      const lv = level(req.headers["x-key"]);
      if (!lv) return send(res, 401, { err: "code" });
      if (p === "/api/ping") return send(res, 200, { ok: true, level: lv });
      if (p === "/api/recover/request" && req.method === "POST") {
        const ip = req.headers["x-forwarded-for"] ? String(req.headers["x-forwarded-for"]).split(",")[0].trim() : req.socket.remoteAddress;
        const [c, o] = await recoverRequest(await body(req, 1024), ip); return send(res, c, o);
      }
      if (p === "/api/recover/confirm" && req.method === "POST") { const [c, o] = recoverConfirm(await body(req, 1024)); return send(res, c, o); }
      if (p === "/api/stream" && req.method === "GET") {
        const cols = new Set(String(url.searchParams.get("cols") || "").split(",").filter(okSeg));
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
        const s = { res, cols, level: lv }; streams.add(s);
        for (const c of cols) {
          const docs = (needAdmin(c) && lv < 2) ? [] : [...col(c)];
          res.write("event: snap\ndata: " + JSON.stringify({ col: c, docs }) + "\n\n");
        }
        const ping = setInterval(() => res.write(": ping\n\n"), 20000);
        req.on("close", () => { clearInterval(ping); streams.delete(s); });
        return;
      }
      const m = p.match(/^\/api\/(doc|lease)\/([^/]+)\/([^/]+)$/);
      if (!m) return send(res, 404, { err: "inconnu" });
      const c = decodeURIComponent(m[2]), id = decodeURIComponent(m[3]);
      if (!okSeg(c) || !okSeg(id)) return send(res, 400, { err: "chemin" });
      if (needAdmin(c) && lv < 2) return send(res, 403, { err: "droits" });
      if (c === "roles" && req.method !== "GET" && lv < 2) return send(res, 403, { err: "droits" });
      if (m[1] === "lease" && req.method === "POST") {
        const o = await body(req, 1024), k = c + "/" + id, now = Date.now(), l = leases.get(k);
        if (l && l.exp > now && l.h !== String(o.holder)) return send(res, 200, { acquired: false });
        leases.set(k, { h: String(o.holder), exp: now + Math.min(Math.max(Number(o.ttlMs) || 2000, 1000), 30000) });
        return send(res, 200, { acquired: true });
      }
      if (req.method === "GET") { const d = col(c).get(id); return send(res, 200, d === undefined ? { exists: false } : { exists: true, data: d }); }
      if (req.method === "DELETE") { if (col(c).has(id)) write(c, id, null); return send(res, 200, { ok: true }); }
      if (req.method === "PUT" || req.method === "PATCH") {
        const d = await body(req, 524288);
        if (!isObj(d)) return send(res, 400, { err: "objet attendu" });
        if (req.method === "PATCH") {
          const old = col(c).get(id); if (old === undefined) return send(res, 404, { err: "absent" });
          write(c, id, Object.assign({}, old, d));
        } else write(c, id, d);
        return send(res, 200, { ok: true });
      }
      return send(res, 405, { err: "méthode" });
    }
    // fichiers statiques
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    let f = path.normalize(path.join(PUB, decodeURIComponent(p === "/" ? "/index.html" : p)));
    if (!f.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (err, buf) => {
      if (err) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end("Page introuvable"); }
      const ext = path.extname(f);
      res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": [".html", ".js", ".webmanifest"].includes(ext) ? "no-cache" : "public, max-age=86400" });
      res.end(req.method === "HEAD" ? undefined : buf);
    });
  } catch (e) {
    if (!res.headersSent) send(res, 400, { err: String(e.message || e) });
  }
});
server.listen(PORT, () => console.log("Serveur prêt : http://localhost:" + PORT));
function flushSync() { try { const out = {}; for (const [c, m] of db) out[c] = Object.fromEntries(m); fs.writeFileSync(DBF, JSON.stringify(out)); } catch (e) {} }
for (const sg of ["SIGTERM", "SIGINT"]) process.on(sg, () => { flushSync(); process.exit(0); });
