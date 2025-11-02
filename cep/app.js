/**
 * app.js
 * Full server - Express + sqlite3
 *
 * - Uses sqlite3 (no compilation needed)
 * - Seeds users + menu items (10 per meal)
 * - Supports registration, login, selections with quantity
 * - Admin endpoints for totals and user-wise details
 *
 * IMPORTANT:
 * - If you want the seed to run again, delete food.db and restart
 * - Place images in public/images with names listed in the README below
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

// DB file path
const DB_FILE = path.join(__dirname, "food.db");

// open DB (creates file if missing)
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) console.error("Failed to open DB:", err);
  else console.log("Opened DB:", DB_FILE);
});

// Utility: format date to YYYY-MM-DD
function toISODate(d) {
  if (!d) d = new Date();
  if (typeof d === "string") {
    const parsed = new Date(d);
    if (!isNaN(parsed)) d = parsed;
    else return null;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toISODate(d);
}

// Initialize schema & seed if required
db.serialize(() => {
  // users
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT
  )`);

  // menu_items
  db.run(`CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    meal TEXT,
    img TEXT
  )`);

  // selections: unique per user+menu_item+date
  db.run(`CREATE TABLE IF NOT EXISTS selections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    menu_item_id INTEGER,
    selected_for_date TEXT,
    quantity INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, menu_item_id, selected_for_date)
  )`);

  // seed users if none exist
  db.get("SELECT COUNT(*) AS c FROM users", (err, row) => {
    if (err) {
      console.error("count users err", err);
      return;
    }
    if (!row || row.c === 0) {
      const users = [
        ["admin", "admin123", "admin"],
        ["student1", "stud1123", "student"],
        ["student2", "stud2123", "student"],
        ["staff1", "staff1123", "staff"],
        ["staff2", "staff2123", "staff"]
      ];
      const stmt = db.prepare("INSERT INTO users (username,password,role) VALUES (?,?,?)");
      users.forEach(u => stmt.run(u[0], u[1], u[2]));
      stmt.finalize(() => console.log("✅ Seeded default users"));
    }
  });

  // seed menu items (10 per breakfast/lunch/dinner) if table empty
  db.get("SELECT COUNT(*) AS c FROM menu_items", (err, row) => {
    if (err) {
      console.error("count menu err", err);
      return;
    }
    if (!row || row.c === 0) {
      // 10 breakfast, 10 lunch, 10 dinner
      const items = [
        // Breakfast (10)
        ["Poha", "breakfast", "/images/poha.jpg"],
        ["Idli Sambhar", "breakfast", "/images/idli.jpg"],
        ["Upma", "breakfast", "/images/upma.jpg"],
        ["Dosa", "breakfast", "/images/dosa.jpg"],
        ["Aloo Paratha", "breakfast", "/images/paratha.jpg"],
        ["Samosa", "breakfast", "/images/samosa.jpg"],
        ["Tea", "breakfast", "/images/tea.jpg"],
        ["Coffee", "breakfast", "/images/coffee.jpg"],
        ["Bread Toast", "breakfast", "/images/sandwich.jpg"],
        ["Fruit Bowl", "breakfast", "/images/salad.jpg"],

        // Lunch (10)
        ["Rice", "lunch", "/images/rice.jpg"],
        ["Dal", "lunch", "/images/dal.jpg"],
        ["Chapati", "lunch", "/images/chapati.jpg"],
        ["Paneer Curry", "lunch", "/images/paneer.jpg"],
        ["Mixed Veg", "lunch", "/images/sabji.jpg"],
        ["Fried Rice", "lunch", "/images/pulao.jpg"],
        ["Biryani", "lunch", "/images/biryani.jpg"],
        ["Egg Curry", "lunch", "/images/egg_curry.jpg"],
        ["Salad", "lunch", "/images/salad.jpg"],
        ["Jeera Rice", "lunch", "/images/jeerarice.jpg"],

        // Dinner (10)
        ["Rice (Dinner)", "dinner", "/images/rice2.jpg"],
        ["Roti (Dinner)", "dinner", "/images/chapati2.jpg"],
        ["Sabji", "dinner", "/images/sabji.jpg"],
        ["Egg Curry (Dinner)", "dinner", "/images/egg_curry.jpg"],
        ["Paneer (Dinner)", "dinner", "/images/paneer.jpg"],
        ["Dal (Dinner)", "dinner", "/images/dal.jpg"],
        ["Pulao (Dinner)", "dinner", "/images/pulao.jpg"],
        ["Biryani (Dinner)", "dinner", "/images/biryani.jpg"],
        ["Salad (Dinner)", "dinner", "/images/salad.jpg"],
        ["Sweet Dish", "dinner", "/images/gulabjamun.jpg"]
      ];
      const t = db.prepare("INSERT INTO menu_items (name, meal, img) VALUES (?,?,?)");
      items.forEach(i => t.run(i[0], i[1], i[2]));
      t.finalize(() => console.log("✅ Menu seeded (10 items per meal)"));
    }
  });
}); // end db.serialize

// ----------------- Helpers & middlewares -----------------
function requireLogin(req, res, next) {
  try {
    if (req.signedCookies && req.signedCookies.user_id) return next();
  } catch (e) {}
  return res.status(401).json({ error: "login required" });
}
function requireAdmin(req, res, next) {
  try {
    if (req.signedCookies && req.signedCookies.is_admin === "1") return next();
  } catch (e) {}
  return res.status(401).json({ error: "admin required" });
}

// ----------------- Routes -----------------

// POST /register { username, password, role }
app.post("/register", (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.json({ success: false, msg: "Missing fields" });
  if (!["student", "staff"].includes(role)) return res.json({ success: false, msg: "Invalid role" });
  db.run("INSERT INTO users (username,password,role) VALUES (?,?,?)", [username, password, role], function (err) {
    if (err) {
      console.error("register err", err.message);
      return res.json({ success: false, msg: "User exists or DB error" });
    }
    return res.json({ success: true });
  });
});

// POST /login { username, password, role }
app.post("/login", (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.json({ success: false });
  db.get("SELECT id,username,role FROM users WHERE username=? AND password=? AND role=?", [username, password, role], (err, row) => {
    if (err) {
      console.error("login err", err);
      return res.json({ success: false });
    }
    if (!row) return res.json({ success: false });
    res.cookie("user_id", String(row.id), { signed: true, httpOnly: true });
    res.cookie("role", row.role, { signed: true, httpOnly: true });
    return res.json({ success: true, user: row });
  });
});

// POST /logout
app.post("/logout", (req, res) => {
  res.clearCookie("user_id");
  res.clearCookie("role");
  res.clearCookie("is_admin");
  res.json({ ok: true });
});

// GET /api/me
app.get("/api/me", (req, res) => {
  try {
    const id = req.signedCookies.user_id;
    if (!id) return res.json({ user: null });
    db.get("SELECT id,username,role FROM users WHERE id=?", [id], (err, row) => {
      if (err) {
        console.error("api/me err", err);
        return res.json({ user: null });
      }
      res.json({ user: row || null });
    });
  } catch (e) { res.json({ user: null }); }
});

// GET /api/menu
app.get("/api/menu", (req, res) => {
  db.all("SELECT id,name,meal,img FROM menu_items ORDER BY meal, name", (err, rows) => {
    if (err) {
      console.error("api/menu err", err);
      return res.status(500).json({ error: "db" });
    }
    const grouped = rows.reduce((acc, r) => {
      acc[r.meal] = acc[r.meal] || [];
      acc[r.meal].push(r);
      return acc;
    }, {});
    res.json({ menu: grouped });
  });
});

/**
 * POST /api/select
 * body: { menu_item_id, date(optional YYYY-MM-DD), quantity (integer) }
 * behavior:
 *  - if exists -> set quantity to provided
 *  - if quantity <= 0 -> delete selection
 *  - if not exists & quantity>0 -> insert
 */
app.post("/api/select", requireLogin, (req, res) => {
  const user_id = req.signedCookies.user_id;
  const { menu_item_id } = req.body;
  let { date, quantity } = req.body;
  if (!menu_item_id) return res.status(400).json({ error: "menu_item_id required" });

  date = date ? toISODate(date) : tomorrowISO();
  if (!date) return res.status(400).json({ error: "invalid date" });

  quantity = parseInt(quantity || 0, 10);
  if (isNaN(quantity)) quantity = 0;

  db.get("SELECT id,quantity FROM selections WHERE user_id=? AND menu_item_id=? AND selected_for_date=?", [user_id, menu_item_id, date], (err, row) => {
    if (err) {
      console.error("select-get err", err);
      return res.status(500).json({ error: "db" });
    }
    if (row) {
      if (quantity <= 0) {
        db.run("DELETE FROM selections WHERE id=?", [row.id], function (dErr) {
          if (dErr) {
            console.error("select-delete err", dErr);
            return res.status(500).json({ error: "db_delete" });
          }
          return res.json({ ok: true, quantity: 0 });
        });
      } else {
        db.run("UPDATE selections SET quantity=? WHERE id=?", [quantity, row.id], function (uErr) {
          if (uErr) {
            console.error("select-update err", uErr);
            return res.status(500).json({ error: "db_update" });
          }
          return res.json({ ok: true, quantity });
        });
      }
    } else {
      if (quantity <= 0) return res.json({ ok: true, quantity: 0 });
      db.run("INSERT INTO selections (user_id,menu_item_id,selected_for_date,quantity) VALUES (?,?,?,?)", [user_id, menu_item_id, date, quantity], function (iErr) {
        if (iErr) {
          console.error("select-insert err", iErr);
          return res.status(500).json({ error: "db_insert" });
        }
        return res.json({ ok: true, quantity });
      });
    }
  });
});

/**
 * POST /api/change
 * body: { menu_item_id, date(optional), delta (integer) }
 * behavior:
 *  - increments existing by delta (can be negative)
 *  - if not exists & delta>0 -> insert delta
 *  - if result <=0 -> delete
 */
app.post("/api/change", requireLogin, (req, res) => {
  const user_id = req.signedCookies.user_id;
  const { menu_item_id } = req.body;
  let { date, delta } = req.body;
  if (!menu_item_id) return res.status(400).json({ error: "menu_item_id required" });

  date = date ? toISODate(date) : tomorrowISO();
  delta = parseInt(delta || 0, 10);
  if (isNaN(delta)) delta = 0;

  db.get("SELECT id,quantity FROM selections WHERE user_id=? AND menu_item_id=? AND selected_for_date=?", [user_id, menu_item_id, date], (err, row) => {
    if (err) {
      console.error("change-get err", err);
      return res.status(500).json({ error: "db" });
    }
    if (row) {
      const newQty = (row.quantity || 0) + delta;
      if (newQty <= 0) {
        db.run("DELETE FROM selections WHERE id=?", [row.id], function (dErr) {
          if (dErr) {
            console.error("change-delete err", dErr);
            return res.status(500).json({ error: "db_delete" });
          }
          return res.json({ ok: true, quantity: 0 });
        });
      } else {
        db.run("UPDATE selections SET quantity=? WHERE id=?", [newQty, row.id], function (uErr) {
          if (uErr) {
            console.error("change-update err", uErr);
            return res.status(500).json({ error: "db_update" });
          }
          return res.json({ ok: true, quantity: newQty });
        });
      }
    } else {
      if (delta <= 0) return res.json({ ok: true, quantity: 0 });
      db.run("INSERT INTO selections (user_id,menu_item_id,selected_for_date,quantity) VALUES (?,?,?,?)", [user_id, menu_item_id, date, delta], function (iErr) {
        if (iErr) {
          console.error("change-insert err", iErr);
          return res.status(500).json({ error: "db_insert" });
        }
        return res.json({ ok: true, quantity: delta });
      });
    }
  });
});

// GET /api/my-selections?date=YYYY-MM-DD
app.get("/api/my-selections", requireLogin, (req, res) => {
  const user_id = req.signedCookies.user_id;
  const date = req.query.date ? toISODate(req.query.date) : tomorrowISO();
  db.all(`SELECT s.id, s.menu_item_id, s.quantity, m.name, m.meal, m.img
          FROM selections s JOIN menu_items m ON m.id = s.menu_item_id
          WHERE s.user_id = ? AND s.selected_for_date = ?`, [user_id, date], (err, rows) => {
    if (err) {
      console.error("my-selections err", err);
      return res.json({ selections: [] });
    }
    res.json({ selections: rows || [] });
  });
});

// Admin unlock
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ ok: false });
  res.cookie("is_admin", "1", { signed: true, httpOnly: true });
  res.json({ ok: true });
});

// Admin user-wise
app.get("/api/admin/userwise", requireAdmin, (req, res) => {
  const date = req.query.date ? toISODate(req.query.date) : tomorrowISO();
  db.all(`SELECT u.username, u.role, m.name as item, m.meal, s.quantity, s.created_at
          FROM selections s
          JOIN users u ON u.id = s.user_id
          JOIN menu_items m ON m.id = s.menu_item_id
          WHERE s.selected_for_date = ?
          ORDER BY u.username, m.meal, m.name`, [date], (err, rows) => {
    if (err) {
      console.error("admin/userwise err", err);
      return res.status(500).json({ error: "db" });
    }
    res.json({ date, rows });
  });
});

// Admin totals
app.get("/api/admin/totals", requireAdmin, (req, res) => {
  const date = req.query.date ? toISODate(req.query.date) : tomorrowISO();
  db.all(`SELECT m.id as menu_item_id, m.name, m.meal, m.img, IFNULL(SUM(s.quantity),0) as total
          FROM menu_items m
          LEFT JOIN selections s ON s.menu_item_id = m.id AND s.selected_for_date = ?
          GROUP BY m.id ORDER BY m.meal, m.name`, [date], (err, rows) => {
    if (err) {
      console.error("admin/totals err", err);
      return res.status(500).json({ error: "db" });
    }
    res.json({ date, totals: rows });
  });
});

// Admin export CSV
app.get("/api/admin/export-totals", requireAdmin, (req, res) => {
  const date = req.query.date ? toISODate(req.query.date) : tomorrowISO();
  db.all(`SELECT m.name, m.meal, IFNULL(SUM(s.quantity),0) AS total
          FROM menu_items m
          LEFT JOIN selections s ON s.menu_item_id = m.id AND s.selected_for_date = ?
          GROUP BY m.id`, [date], (err, rows) => {
    if (err) {
      console.error("admin/export err", err);
      return res.status(500).send("err");
    }
    let csv = "item,meal,total\n";
    rows.forEach(r => csv += `${r.name},${r.meal},${r.total}\n`);
    res.setHeader("Content-Disposition", `attachment; filename="totals_${date}.csv"`);
    res.setHeader("Content-Type", "text/csv");
    res.send(csv);
  });
});

// Fallback - serve index
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
