/**
 * Full app.js — robust error logging + image-extension handling
 *
 * Replace the existing app.js with this file.
 *
 * Notes:
 * - This keeps all routes used previously:
 *   /register, /login, /logout, /api/me, /api/menu,
 *   /api/select (set exact quantity), /api/change (delta),
 *   /api/my-selections, /api/admin/* (login/totals/userwise/export)
 * - Adds filesystem checks for images (.jpeg / .jpg) and falls back to /images/cart.png
 * - Prints detailed console.error messages when DB operations fail to help debugging
 */

const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 3000;
const COOKIE_SECRET = process.env.COOKIE_SECRET || "cep_secret_key";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser(COOKIE_SECRET));
app.use(express.static(path.join(__dirname, "public")));

const DB_FILE = path.join(__dirname, "food.db");
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error("Failed to open DB:", err);
    process.exit(1);
  } else {
    console.log("Opened DB:", DB_FILE);
  }
});

/* ---------- helpers ---------- */
function isoDateFrom(d) {
  if (!d) d = new Date();
  if (typeof d === "string") {
    const p = new Date(d);
    if (!isNaN(p)) d = p;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoDateFrom(d);
}
function chooseExistingImage(imgPath) {
  // imgPath expected like "/images/poha.jpeg" or "/images/poha.jpg"
  if (!imgPath) return "/images/cart.png";
  const rel = imgPath.replace(/^\//, ""); // images/poha.jpeg
  const abs = path.join(__dirname, "public", rel);
  if (fs.existsSync(abs)) return "/" + rel;

  // try switching extension .jpeg <-> .jpg
  const parsed = path.parse(rel); // {dir: 'images', name:'poha', ext:'.jpeg'}
  const otherExt = parsed.ext.toLowerCase() === ".jpeg" ? ".jpg" : ".jpeg";
  const altRel = path.join(parsed.dir, parsed.name + otherExt);
  const altAbs = path.join(__dirname, "public", altRel);
  if (fs.existsSync(altAbs)) return "/" + altRel;

  // try without ext (rare) or direct fallback
  const jpgRel = path.join(parsed.dir, parsed.name + ".jpg");
  if (fs.existsSync(path.join(__dirname, "public", jpgRel))) return "/" + jpgRel;

  const jpegRel = path.join(parsed.dir, parsed.name + ".jpeg");
  if (fs.existsSync(path.join(__dirname, "public", jpegRel))) return "/" + jpegRel;

  // final fallback
  return "/images/cart.png";
}

/* ---------- DB initialization & seeding ---------- */
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    meal TEXT,
    img TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS selections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    menu_item_id INTEGER,
    selected_for_date TEXT,
    quantity INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, menu_item_id, selected_for_date)
  )`);

  // seed users
  db.get("SELECT COUNT(*) AS c FROM users", (err, row) => {
    if (err) {
      console.error("users count error:", err);
      return;
    }
    if (!row || row.c === 0) {
      const defaults = [
        ["admin", "admin123", "admin"],
        ["student1", "stud1123", "student"],
        ["student2", "stud2123", "student"],
        ["staff1", "staff1123", "staff"],
        ["staff2", "staff2123", "staff"]
      ];
      const ins = db.prepare("INSERT INTO users (username,password,role) VALUES (?,?,?)");
      defaults.forEach(u => ins.run(u[0], u[1], u[2]));
      ins.finalize(() => console.log("Seeded default users"));
    }
  });

  // seed menu items if empty
  db.get("SELECT COUNT(*) AS c FROM menu_items", (err, row) => {
    if (err) { console.error("menu count error:", err); return; }
    if (!row || row.c === 0) {
      const items = [
        // breakfast
        ["Poha","breakfast","/images/poha.jpeg"],
        ["Samosa","breakfast","/images/samosa.jpeg"],
        ["Coffee","breakfast","/images/coffee.jpeg"],
        ["Upma","breakfast","/images/upma.jpeg"],
        ["Idli","breakfast","/images/idli.jpeg"],
        ["Dosa","breakfast","/images/dosa.jpeg"],
        ["Tea","breakfast","/images/tea.jpeg"],
        ["Sandwich","breakfast","/images/sandwich.jpeg"],
        ["Paratha","breakfast","/images/paratha.jpeg"],
        ["Fruit Salad","breakfast","/images/salad.jpeg"],
        // lunch
        ["Thali (Lunch)","lunch","/images/thali.jpeg"],
        ["Roti","lunch","/images/roti.jpeg"],
        ["Paneer Curry","lunch","/images/paneer.jpeg"],
        ["Rice","lunch","/images/rice.jpeg"],
        ["Dal","lunch","/images/dal.jpeg"],
        ["Salad","lunch","/images/salad.jpeg"],
        ["Chapati","lunch","/images/chapati.jpeg"],
        ["Curry","lunch","/images/curry.jpeg"],
        ["Khichdi","lunch","/images/khichdi.jpeg"],
        ["Gulab Jamun","lunch","/images/gulabjamun.jpeg"],
        // dinner
        ["Roti (Dinner)","dinner","/images/roti2.jpeg"],
        ["Sabji","dinner","/images/sabji.jpeg"],
        ["Rice (Dinner)","dinner","/images/rice2.jpeg"],
        ["Dal (Dinner)","dinner","/images/dal2.jpeg"],
        ["Paneer (Dinner)","dinner","/images/paneer.jpeg"],
        ["Chapati (Dinner)","dinner","/images/chapati.jpeg"],
        ["Curry (Dinner)","dinner","/images/curry.jpeg"],
        ["Salad (Dinner)","dinner","/images/salad.jpeg"],
        ["Sweet","dinner","/images/gulabjamun.jpeg"],
        ["Khichdi (Dinner)","dinner","/images/khichdi.jpeg"]
      ];
      const ins = db.prepare("INSERT INTO menu_items (name,meal,img) VALUES (?,?,?)");
      items.forEach(i => ins.run(i[0], i[1], i[2]));
      ins.finalize(() => console.log("Seeded menu items"));
    }
  });
});

/* ---------- auth helpers ---------- */
function requireLogin(req, res, next) {
  try { if (req.signedCookies && req.signedCookies.user_id) return next(); } catch(e) {}
  return res.status(401).json({ error: "login required" });
}
function requireAdmin(req, res, next) {
  try { if (req.signedCookies && req.signedCookies.is_admin === "1") return next(); } catch(e) {}
  return res.status(401).json({ error: "admin required" });
}

/* ---------- routes (auth) ---------- */
app.post("/register", (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) return res.json({ success: false, msg: "missing fields" });
    if (!["student","staff"].includes(role)) return res.json({ success:false, msg:"invalid role" });
    db.run("INSERT INTO users (username,password,role) VALUES (?,?,?)", [username, password, role], function(err){
      if (err) {
        console.error("register error:", err.message);
        return res.json({ success:false, msg: "user exists or db error" });
      }
      return res.json({ success:true });
    });
  } catch (e) {
    console.error("register throw:", e);
    return res.json({ success:false, msg:"server error" });
  }
});

app.post("/login", (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) return res.json({ success:false });
    db.get("SELECT id,username,role FROM users WHERE username=? AND password=? AND role=?", [username,password,role], (err,row)=>{
      if (err) { console.error("login db error:", err); return res.json({ success:false }); }
      if (!row) return res.json({ success:false });
      res.cookie("user_id", String(row.id), { signed:true, httpOnly:true });
      res.cookie("role", row.role, { signed:true, httpOnly:true });
      return res.json({ success:true, user:row });
    });
  } catch (e) {
    console.error("login throw:", e);
    return res.json({ success:false });
  }
});

app.post("/logout", (req,res) => {
  res.clearCookie("user_id"); res.clearCookie("role"); res.clearCookie("is_admin");
  res.json({ ok:true });
});

app.get("/api/me", (req,res) => {
  try {
    const id = req.signedCookies.user_id;
    if (!id) return res.json({ user:null });
    db.get("SELECT id,username,role FROM users WHERE id=?", [id], (err,row)=>{
      if (err) { console.error("api/me err:", err); return res.json({ user:null }); }
      res.json({ user: row || null });
    });
  } catch (e) { console.error("api/me throw:", e); res.json({ user:null }); }
});

/* ---------- menu API (with image verification) ---------- */
app.get("/api/menu", (req,res) => {
  db.all("SELECT id,name,meal,img FROM menu_items ORDER BY meal, name", (err, rows) => {
    if (err) { console.error("api/menu err:", err); return res.status(500).json({ error:"db" }); }
    try {
      // verify each image exists (jpeg/jpg) and correct path before sending
      const fixed = rows.map(r => {
        const finalImg = chooseExistingImage(r.img);
        return { id: r.id, name: r.name, meal: r.meal, img: finalImg };
      });
      const grouped = fixed.reduce((acc, r) => { acc[r.meal] = acc[r.meal] || []; acc[r.meal].push(r); return acc; }, {});
      res.json({ menu: grouped });
    } catch (e) {
      console.error("api/menu mapping error:", e);
      res.status(500).json({ error:"server" });
    }
  });
});

/* ---------- selection APIs ---------- */
/**
 * POST /api/select { menu_item_id, date(optional), quantity }
 * sets exact quantity for this user/menu item/date (insert/update/delete)
 */
app.post("/api/select", requireLogin, (req,res) => {
  try {
    const user_id = req.signedCookies.user_id;
    const { menu_item_id } = req.body;
    let { date, quantity } = req.body;
    if (!menu_item_id) return res.status(400).json({ error:"menu_item_id required" });

    date = date ? isoDateFrom(date) : tomorrowISO();
    quantity = parseInt(quantity || 0, 10);
    if (isNaN(quantity)) quantity = 0;

    db.get("SELECT id FROM selections WHERE user_id=? AND menu_item_id=? AND selected_for_date=?", [user_id, menu_item_id, date], (err,row) => {
      if (err) { console.error("select-get err:", err); return res.status(500).json({ error:"db" }); }
      if (row) {
        if (quantity <= 0) {
          db.run("DELETE FROM selections WHERE id=?", [row.id], function(dErr){
            if (dErr) { console.error("select-delete err:", dErr); return res.status(500).json({ error:"db_delete" }); }
            return res.json({ ok:true, quantity:0 });
          });
        } else {
          db.run("UPDATE selections SET quantity=? WHERE id=?", [quantity, row.id], function(uErr){
            if (uErr) { console.error("select-update err:", uErr); return res.status(500).json({ error:"db_update" }); }
            return res.json({ ok:true, quantity });
          });
        }
      } else {
        if (quantity <= 0) return res.json({ ok:true, quantity:0 });
        db.run("INSERT INTO selections (user_id,menu_item_id,selected_for_date,quantity) VALUES (?,?,?,?)", [user_id, menu_item_id, date, quantity], function(iErr){
          if (iErr) { console.error("select-insert err:", iErr); return res.status(500).json({ error:"db_insert" }); }
          return res.json({ ok:true, quantity });
        });
      }
    });
  } catch (e) {
    console.error("select throw:", e);
    return res.status(500).json({ error:"server" });
  }
});

/**
 * POST /api/change { menu_item_id, date(optional), delta }
 * increments/decrements quantity atomically
 */
app.post("/api/change", requireLogin, (req,res) => {
  try {
    const user_id = req.signedCookies.user_id;
    const { menu_item_id } = req.body;
    let { date, delta } = req.body;
    if (!menu_item_id) return res.status(400).json({ error:"menu_item_id required" });

    date = date ? isoDateFrom(date) : tomorrowISO();
    delta = parseInt(delta || 0, 10);
    if (isNaN(delta)) delta = 0;

    db.get("SELECT id,quantity FROM selections WHERE user_id=? AND menu_item_id=? AND selected_for_date=?", [user_id, menu_item_id, date], (err,row) => {
      if (err) { console.error("change-get err:", err); return res.status(500).json({ error:"db" }); }
      if (row) {
        const newQty = (row.quantity || 0) + delta;
        if (newQty <= 0) {
          db.run("DELETE FROM selections WHERE id=?", [row.id], function(dErr){
            if (dErr) { console.error("change-delete err:", dErr); return res.status(500).json({ error:"db_delete" }); }
            return res.json({ ok:true, quantity:0 });
          });
        } else {
          db.run("UPDATE selections SET quantity=? WHERE id=?", [newQty, row.id], function(uErr){
            if (uErr) { console.error("change-update err:", uErr); return res.status(500).json({ error:"db_update" }); }
            return res.json({ ok:true, quantity: newQty });
          });
        }
      } else {
        if (delta <= 0) return res.json({ ok:true, quantity:0 });
        db.run("INSERT INTO selections (user_id,menu_item_id,selected_for_date,quantity) VALUES (?,?,?,?)", [user_id, menu_item_id, date, delta], function(iErr){
          if (iErr) { console.error("change-insert err:", iErr); return res.status(500).json({ error:"db_insert" }); }
          return res.json({ ok:true, quantity: delta });
        });
      }
    });
  } catch (e) {
    console.error("change throw:", e);
    return res.status(500).json({ error:"server" });
  }
});

// GET my selections
app.get("/api/my-selections", requireLogin, (req,res) => {
  const user_id = req.signedCookies.user_id;
  const date = req.query.date ? isoDateFrom(req.query.date) : tomorrowISO();
  db.all(`SELECT s.id, s.menu_item_id, s.quantity, m.name, m.meal, m.img
          FROM selections s JOIN menu_items m ON m.id = s.menu_item_id
          WHERE s.user_id = ? AND s.selected_for_date = ?`, [user_id, date], (err, rows) => {
    if (err) { console.error("my-selections err:", err); return res.status(500).json({ selections: [] }); }
    // ensure image path exists
    const fixed = (rows || []).map(r => ({ ...r, img: chooseExistingImage(r.img) }));
    return res.json({ selections: fixed });
  });
});

/* ---------- admin ---------- */
app.post("/api/admin/login", (req,res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ ok:false });
  res.cookie("is_admin","1",{ signed:true, httpOnly:true });
  res.json({ ok:true });
});

app.get("/api/admin/totals", requireAdmin, (req,res) => {
  const date = req.query.date ? isoDateFrom(req.query.date) : tomorrowISO();
  db.all(`SELECT m.id AS menu_item_id, m.name, m.meal, m.img, IFNULL(SUM(s.quantity),0) AS total
          FROM menu_items m
          LEFT JOIN selections s ON s.menu_item_id = m.id AND s.selected_for_date = ?
          GROUP BY m.id ORDER BY m.meal, m.name`, [date], (err, rows) => {
    if (err) { console.error("admin/totals err:", err); return res.status(500).json({ error:"db" }); }
    const fixed = rows.map(r => ({ ...r, img: chooseExistingImage(r.img) }));
    res.json({ date, totals: fixed });
  });
});

app.get("/api/admin/userwise", requireAdmin, (req,res) => {
  const date = req.query.date ? isoDateFrom(req.query.date) : tomorrowISO();
  db.all(`SELECT u.username, u.role, m.name AS item, m.meal, s.quantity, s.created_at
          FROM selections s
          JOIN users u ON u.id = s.user_id
          JOIN menu_items m ON m.id = s.menu_item_id
          WHERE s.selected_for_date = ?
          ORDER BY u.username, m.meal, m.name`, [date], (err, rows) => {
    if (err) { console.error("admin/userwise err:", err); return res.status(500).json({ error:"db" }); }
    res.json({ date, rows });
  });
});

app.get("/api/admin/export-totals", requireAdmin, (req,res) => {
  const date = req.query.date ? isoDateFrom(req.query.date) : tomorrowISO();
  db.all(`SELECT m.name, m.meal, IFNULL(SUM(s.quantity),0) AS total
          FROM menu_items m
          LEFT JOIN selections s ON s.menu_item_id = m.id AND s.selected_for_date = ?
          GROUP BY m.id`, [date], (err, rows) => {
    if (err) { console.error("export err:", err); return res.status(500).send("err"); }
    let csv = "item,meal,total\n";
    rows.forEach(r => csv += `${r.name},${r.meal},${r.total}\n`);
    res.setHeader("Content-Disposition", `attachment; filename="totals_${date}.csv"`);
    res.setHeader("Content-Type", "text/csv");
    res.send(csv);
  });
});

// fallback for SPA
app.get("*", (req,res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
