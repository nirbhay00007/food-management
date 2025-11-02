/**
 * public/script.js
 * Client logic for login/register/select/admin
 */

/* ---------- helper: call API ---------- */
async function api(url, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== null) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) return r.json();
  return r.text();
}

function defaultTomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}
function displayDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString();
}

/* ---------- Login ---------- */
if (location.pathname.endsWith("/login.html")) {
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btnLogin").addEventListener("click", async () => {
      const role = document.getElementById("loginRole").value.trim();
      const username = document.getElementById("loginUser").value.trim();
      const password = document.getElementById("loginPass").value.trim();
      if (!role || !username || !password) return alert("Fill all fields");
      const res = await api("/login", "POST", { role, username, password });
      if (res && res.success) {
        // go to selection
        location.href = "/select.html";
      } else {
        alert("Login failed — check credentials and role");
      }
    });
  });
}

/* ---------- Register ---------- */
if (location.pathname.endsWith("/register.html")) {
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btnRegister").addEventListener("click", async () => {
      const role = document.getElementById("regRole").value;
      const username = document.getElementById("regUser").value.trim();
      const password = document.getElementById("regPass").value.trim();
      if (!role || !username || !password) return alert("Fill all fields");
      const res = await api("/register", "POST", { role, username, password });
      if (res && res.success) {
        alert("Registered. Please login.");
        location.href = "/login.html";
      } else {
        alert(res.msg || "Registration failed");
      }
    });
  });
}

/* ---------- Select page ---------- */
if (location.pathname.endsWith("/select.html")) {
  document.addEventListener("DOMContentLoaded", () => {
    const dateInput = document.getElementById("selDate");
    const chosenDateText = document.getElementById("chosenDateText");
    const menuArea = document.getElementById("menuArea");
    const mySelectionsDiv = document.getElementById("mySelections");
    const userLine = document.getElementById("userLine");
    const btnLogout = document.getElementById("btnLogout");
    const btnLoad = document.getElementById("btnLoad");

    dateInput.value = defaultTomorrowISO();
    chosenDateText.innerText = displayDate(dateInput.value);

    (async function init() {
      const me = await api("/api/me");
      if (!me || !me.user) return location.href = "/login.html";
      userLine.innerText = `${me.user.username} • ${me.user.role}`;
      await loadForDate(dateInput.value);
    })();

    async function loadForDate(isoDate) {
      chosenDateText.innerText = displayDate(isoDate);
      menuArea.innerHTML = "<p>Loading menu…</p>";

      const menuRes = await api("/api/menu");
      const mySelRes = await api(`/api/my-selections?date=${isoDate}`);
      const mySelections = (mySelRes && mySelRes.selections) || [];
      const qtyMap = {};
      mySelections.forEach(s => qtyMap[s.menu_item_id] = s.quantity);

      menuArea.innerHTML = "";
      const mealOrder = ["breakfast", "lunch", "dinner"];
      for (const meal of mealOrder) {
        const items = (menuRes.menu && menuRes.menu[meal]) || [];
        if (!items.length) continue;

        const block = document.createElement("div");
        block.className = "meal-block";
        const header = document.createElement("h3");
        header.innerText = meal.charAt(0).toUpperCase() + meal.slice(1);
        block.appendChild(header);

        const row = document.createElement("div");
        row.className = "meal-row";

        for (const it of items) {
          const card = document.createElement("div");
          card.className = "meal-card";

          const img = document.createElement("img");
          img.src = it.img || "/images/cart.png";
          img.alt = it.name;
          img.onerror = function() { this.src = "/images/cart.png"; };

          const title = document.createElement("p");
          title.innerText = it.name;

          const controls = document.createElement("div");
          controls.className = "controls";

          const minus = document.createElement("button");
          minus.className = "small";
          minus.innerText = "-";

          const qty = document.createElement("input");
          qty.className = "qty";
          qty.type = "number";
          qty.min = "0";
          qty.value = qtyMap[it.id] || 0;

          const plus = document.createElement("button");
          plus.className = "small";
          plus.innerText = "+";

          const setBtn = document.createElement("button");
          setBtn.className = "btn";
          setBtn.innerText = "Set";

          // minus handler
          minus.addEventListener("click", async () => {
            try {
              const r = await api("/api/change", "POST", { menu_item_id: it.id, date: isoDate, delta: -1 });
              if (r && r.ok !== undefined) {
                qty.value = r.quantity || 0;
                await refreshMySelections(isoDate);
              } else {
                alert("Failed to decrement — check server logs");
              }
            } catch (e) { console.error("minus err", e); alert("Error decrementing"); }
          });

          // plus handler
          plus.addEventListener("click", async () => {
            try {
              const r = await api("/api/change", "POST", { menu_item_id: it.id, date: isoDate, delta: 1 });
              if (r && r.ok !== undefined) {
                qty.value = r.quantity || 0;
                await refreshMySelections(isoDate);
              } else {
                alert("Failed to increment — check server logs");
              }
            } catch (e) { console.error("plus err", e); alert("Error incrementing"); }
          });

          // set handler
          setBtn.addEventListener("click", async () => {
            const q = parseInt(qty.value || 0, 10);
            if (isNaN(q)) return alert("Enter a valid number");
            try {
              const r = await api("/api/select", "POST", { menu_item_id: it.id, date: isoDate, quantity: q });
              if (r && r.ok !== undefined) {
                qty.value = r.quantity || 0;
                await refreshMySelections(isoDate);
              } else {
                alert("Failed to set quantity — check server logs");
                console.error("set response:", r);
              }
            } catch (e) {
              console.error("set err", e);
              alert("Error setting quantity");
            }
          });

          controls.appendChild(minus);
          controls.appendChild(qty);
          controls.appendChild(plus);
          controls.appendChild(setBtn);

          card.appendChild(img);
          card.appendChild(title);
          card.appendChild(controls);

          row.appendChild(card);
        } // items

        block.appendChild(row);
        menuArea.appendChild(block);
        const hr = document.createElement("hr");
        hr.style.margin = "12px 0";
        menuArea.appendChild(hr);
      } // mealOrder

      await refreshMySelections(isoDate);
    } // loadForDate

    async function refreshMySelections(isoDate) {
      const r = await api(`/api/my-selections?date=${isoDate}`);
      const selections = (r && r.selections) || [];
      mySelectionsDiv.innerHTML = "";
      if (!selections.length) {
        mySelectionsDiv.innerHTML = "<p>No selections for this date.</p>";
        return;
      }
      const grouped = selections.reduce((acc, s) => {
        acc[s.meal] = acc[s.meal] || [];
        acc[s.meal].push(s);
        return acc;
      }, {});
      for (const meal of Object.keys(grouped)) {
        const h = document.createElement("h4");
        h.innerText = meal.toUpperCase();
        mySelectionsDiv.appendChild(h);
        const ul = document.createElement("ul");
        grouped[meal].forEach(item => {
          const li = document.createElement("li");
          li.innerHTML = `${item.name} — <strong>x${item.quantity}</strong>
            <button class="btn ghost remove-btn" data-mid="${item.menu_item_id}" data-date="${isoDate}" style="margin-left:8px">Remove</button>`;
          ul.appendChild(li);
        });
        mySelectionsDiv.appendChild(ul);
      }

      // attach remove handlers
      mySelectionsDiv.querySelectorAll("button.remove-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const mid = parseInt(btn.dataset.mid);
          const date = btn.dataset.date;
          if (!confirm("Remove this selection?")) return;
          try {
            const r = await api("/api/select", "POST", { menu_item_id: mid, date, quantity: 0 });
            if (r && r.ok !== undefined) {
              await refreshMySelections(date);
              await loadForDate(date);
            } else {
              alert("Failed to remove — check server logs");
            }
          } catch (e) {
            console.error("remove err", e);
            alert("Error removing");
          }
        });
      });
    } // refreshMySelections

    // initial load
    loadForDate(dateInput.value);

    btnLoad.addEventListener("click", async () => {
      const iso = dateInput.value;
      if (!iso) return alert("Pick a date");
      await loadForDate(iso);
    });

    btnLogout.addEventListener("click", async () => {
      await api("/logout", "POST");
      location.href = "/login.html";
    });
  }); // DOMContentLoaded
}

/* ---------- Student summary page ---------- */
if (location.pathname.endsWith("/student.html")) {
  document.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(location.search);
    const date = params.get("date") || defaultTomorrowISO();
    document.getElementById("day").innerText = displayDate(date);
    const res = await api(`/api/my-selections?date=${date}`);
    const container = document.getElementById("mySelection");
    container.innerHTML = "";
    if (!res || !res.selections || res.selections.length === 0) {
      container.innerHTML = "<p>No selections for this date.</p>";
      return;
    }
    const ul = document.createElement("ul");
    res.selections.forEach(s => {
      const li = document.createElement("li");
      li.innerText = `${s.meal.toUpperCase()}: ${s.name} (x${s.quantity})`;
      ul.appendChild(li);
    });
    container.appendChild(ul);

    const lb = document.getElementById("logoutBtn");
    if (lb) lb.addEventListener("click", async () => { await api("/logout", "POST"); location.href = "/login.html"; });
  });
}

/* ---------- Admin page ---------- */
if (location.pathname.endsWith("/admin.html")) {
  document.addEventListener("DOMContentLoaded", () => {
    const adminDate = document.getElementById("adminDate");
    const btnAdminLogin = document.getElementById("btnAdminLogin");
    const csvLink = document.getElementById("csvLink");
    const showUserwise = document.getElementById("showUserwise");
    const showTotals = document.getElementById("showTotals");
    const userTable = document.getElementById("userwiseTable");
    const totalsTable = document.getElementById("totalsTable");

    adminDate.value = defaultTomorrowISO();

    async function loadUserwise() {
      const date = adminDate.value || defaultTomorrowISO();
      const res = await api(`/api/admin/userwise?date=${date}`);
      const rows = (res && res.rows) || [];
      userTable.style.display = "table";
      totalsTable.style.display = "none";
      userTable.innerHTML = "<tr><th>User</th><th>Role</th><th>Item</th><th>Meal</th><th>Qty</th><th>Time</th></tr>";
      rows.forEach(r => {
        userTable.innerHTML += `<tr><td>${r.username}</td><td>${r.role}</td><td>${r.item}</td><td>${r.meal}</td><td>${r.quantity}</td><td>${r.created_at}</td></tr>`;
      });
    }

    async function loadTotals() {
      const date = adminDate.value || defaultTomorrowISO();
      const res = await api(`/api/admin/totals?date=${date}`);
      const rows = (res && res.totals) || [];
      totalsTable.style.display = "table";
      userTable.style.display = "none";
      totalsTable.innerHTML = "<tr><th>Item</th><th>Meal</th><th>Total Qty</th></tr>";
      rows.forEach(r => {
        totalsTable.innerHTML += `<tr><td>${r.name}</td><td>${r.meal}</td><td>${r.total}</td></tr>`;
      });
    }

    csvLink.addEventListener("click", (e) => {
      const date = adminDate.value || defaultTomorrowISO();
      e.target.href = `/api/admin/export-totals?date=${date}`;
    });

    btnAdminLogin.addEventListener("click", async () => {
      const pass = document.getElementById("adminPass").value;
      if (!pass) return alert("Enter admin password");
      const r = await api("/api/admin/login", "POST", { password: pass });
      if (!r || !r.ok) return alert("Wrong password");
      alert("Admin unlocked");
      await loadUserwise();
    });

    showUserwise.addEventListener("click", loadUserwise);
    showTotals.addEventListener("click", loadTotals);
  });
}
