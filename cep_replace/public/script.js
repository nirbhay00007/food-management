/**
 * script.js - client logic (replace your existing public/script.js)
 * - improved error handling: prints server JSON error to console
 * - uses image paths returned by server without assuming extension
 * - handles set and change calls and shows detailed failures
 */

/* small helpers */
async function api(url, method='GET', body=null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== null) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const ct = res.headers.get('content-type') || '';
  let data;
  try {
    if (ct.includes('application/json')) data = await res.json();
    else data = await res.text();
  } catch (e) {
    data = await res.text().catch(()=>null);
  }
  if (!res.ok) {
    // Return object with status and server data for debugging
    const errObj = { status: res.status, body: data };
    throw errObj;
  }
  return data;
}

function tomorrowDefault() {
  const d = new Date();
  d.setDate(d.getDate()+1);
  return d.toISOString().split('T')[0];
}
function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString();
}

/* ---------- LOGIN ---------- */
if (location.pathname.endsWith('/login.html')) {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnLogin').addEventListener('click', async () => {
      const role = document.getElementById('loginRole').value;
      const username = document.getElementById('loginUser').value.trim();
      const password = document.getElementById('loginPass').value;
      if (!role || !username || !password) return alert('Fill all fields');
      try {
        const r = await api('/login','POST',{ role, username, password });
        if (r && r.success) location.href = '/select.html';
        else { alert('Login failed'); console.log('login response:', r); }
      } catch (err) {
        console.error('Login error', err); alert('Login failed — check console');
      }
    });
  });
}

/* ---------- REGISTER ---------- */
if (location.pathname.endsWith('/register.html')) {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnRegister').addEventListener('click', async () => {
      const role = document.getElementById('regRole').value;
      const username = document.getElementById('regUser').value.trim();
      const password = document.getElementById('regPass').value;
      if (!role || !username || !password) return alert('Fill all fields');
      try {
        const r = await api('/register','POST',{ role, username, password });
        if (r && r.success) { alert('Registered. Please login.'); location.href='/login.html'; }
        else { alert(r.msg || 'Registration failed'); console.log('register:', r); }
      } catch (err) {
        console.error('Register error', err); alert('Registration failed — check console');
      }
    });
  });
}

/* ---------- SELECT PAGE ---------- */
if (location.pathname.endsWith('/select.html')) {
  document.addEventListener('DOMContentLoaded', async () => {
    const selDate = document.getElementById('selDate');
    const btnLoadMenu = document.getElementById('btnLoadMenu');
    const menuArea = document.getElementById('menuArea');
    const mySelectionsList = document.getElementById('mySelectionsList');
    const userLine = document.getElementById('userLine');
    const btnLogout = document.getElementById('btnLogout');

    selDate.value = tomorrowDefault();

    // get current user
    try {
      const me = await api('/api/me');
      if (!me || !me.user) return location.href = '/login.html';
      userLine.textContent = `${me.user.username} • ${me.user.role}`;
    } catch (err) {
      console.error('api/me failed', err); location.href='/login.html'; return;
    }

    async function loadMenu(dateIso) {
      menuArea.innerHTML = '<p>Loading menu…</p>';
      try {
        const menuRes = await api('/api/menu');
        const mySelRes = await api(`/api/my-selections?date=${dateIso}`);
        const myMap = {};
        if (mySelRes && mySelRes.selections) mySelRes.selections.forEach(s => myMap[s.menu_item_id] = s.quantity);

        menuArea.innerHTML = '';
        const meals = ['breakfast','lunch','dinner'];
        meals.forEach(meal => {
          const items = (menuRes.menu && menuRes.menu[meal]) || [];
          if (!items.length) return;
          const block = document.createElement('div');
          block.className = 'menu-block card';
          const title = document.createElement('div');
          title.className = 'meal-title';
          title.textContent = meal.toUpperCase();
          block.appendChild(title);

          const grid = document.createElement('div');
          grid.className = 'menu-grid';

          items.forEach(it => {
            const card = document.createElement('div'); card.className = 'food-card';
            const img = document.createElement('img'); img.src = it.img || '/images/cart.png'; img.alt = it.name;
            img.onerror = function(){ this.src = '/images/cart.png'; };
            const p = document.createElement('p'); p.textContent = it.name;

            const controls = document.createElement('div'); controls.className = 'controls';
            const dec = document.createElement('button'); dec.textContent = '-'; dec.className = 'dec';
            const input = document.createElement('input'); input.type='number'; input.min='0'; input.value = myMap[it.id] || 0; input.dataset.menuId = it.id;
            const inc = document.createElement('button'); inc.textContent = '+'; inc.className = 'inc';
            const setBtn = document.createElement('button'); setBtn.textContent = 'Set'; setBtn.className = 'btn'; setBtn.style.marginLeft='8px';

            controls.appendChild(dec); controls.appendChild(input); controls.appendChild(inc); controls.appendChild(setBtn);
            card.appendChild(img); card.appendChild(p); card.appendChild(controls);
            grid.appendChild(card);

            // handlers
            dec.addEventListener('click', async () => {
              let v = parseInt(input.value||0,10); if (isNaN(v)) v = 0; v = Math.max(0, v-1);
              try {
                const res = await api('/api/change','POST',{ menu_item_id: it.id, date: dateIso, delta: -1 });
                input.value = res.quantity || 0;
                await refreshMySel(dateIso);
              } catch (err) {
                console.error('change failed', err); alert('Failed to change quantity — check server console');
              }
            });

            inc.addEventListener('click', async () => {
              let v = parseInt(input.value||0,10); if (isNaN(v)) v = 0; v = v + 1;
              try {
                const res = await api('/api/change','POST',{ menu_item_id: it.id, date: dateIso, delta: 1 });
                input.value = res.quantity || 0;
                await refreshMySel(dateIso);
              } catch (err) {
                console.error('change failed', err); alert('Failed to change quantity — check server console');
              }
            });

            setBtn.addEventListener('click', async () => {
              let q = parseInt(input.value||0,10);
              if (isNaN(q) || q < 0) return alert('Enter valid number');
              try {
                const res = await api('/api/select','POST',{ menu_item_id: it.id, date: dateIso, quantity: q });
                // server returns {ok:true,quantity:...} or error
                if (res && res.ok !== undefined) {
                  await refreshMySel(dateIso);
                } else {
                  console.error('set returned', res);
                  alert('Failed to set quantity — check server console');
                }
              } catch (err) {
                console.error('set failed', err); alert('Failed to set quantity — check server console');
              }
            });

          });

          block.appendChild(grid);
          menuArea.appendChild(block);
        });

        await refreshMySel(dateIso);

      } catch (err) {
        console.error('loadMenu failed', err);
        menuArea.innerHTML = '<p>Failed to load menu — check server console</p>';
      }
    }

    async function refreshMySel(dateIso) {
      try {
        const r = await api(`/api/my-selections?date=${dateIso}`);
        mySelectionsList.innerHTML = '';
        if (!r || !r.selections || r.selections.length === 0) {
          mySelectionsList.innerHTML = '<p>No selections for this date.</p>'; return;
        }
        const grouped = r.selections.reduce((a,s)=>{ a[s.meal]=a[s.meal]||[]; a[s.meal].push(s); return a; }, {});
        Object.keys(grouped).forEach(meal=>{
          const h = document.createElement('h4'); h.textContent = meal.toUpperCase(); mySelectionsList.appendChild(h);
          const ul = document.createElement('ul');
          grouped[meal].forEach(item=>{
            const li = document.createElement('li');
            li.innerHTML = `${item.name} — <strong>x${item.quantity}</strong>
               <button class="btn ghost remove-btn" data-mid="${item.menu_item_id}" data-date="${dateIso}" style="margin-left:8px">Remove</button>`;
            ul.appendChild(li);
          });
          mySelectionsList.appendChild(ul);
        });

        mySelectionsList.querySelectorAll('.remove-btn').forEach(btn=>{
          btn.addEventListener('click', async (ev)=>{
            const mid = parseInt(ev.target.dataset.mid,10); const date = ev.target.dataset.date;
            if (!confirm('Remove this selection?')) return;
            try {
              const rr = await api('/api/select','POST',{ menu_item_id: mid, date, quantity: 0 });
              await loadMenu(selDate.value);
            } catch (err) {
              console.error('remove failed', err); alert('Failed to remove — check server console');
            }
          });
        });
      } catch (err) {
        console.error('refreshMySel failed', err);
        mySelectionsList.innerHTML = '<p>Failed to load selections — check console</p>';
      }
    }

    // initial load
    await loadMenu(selDate.value);

    btnLoadMenu.addEventListener('click', async () => {
      const iso = selDate.value;
      if (!iso) return alert('Pick a date');
      await loadMenu(iso);
    });

    btnLogout.addEventListener('click', async () => {
      try { await api('/logout','POST'); location.href = '/login.html'; } catch (err) { console.error('logout failed', err); location.href='/login.html'; }
    });
  });
}

/* ---------- STUDENT / ADMIN pages behavior remains same as before ---------- */
/* The rest of script.js for student.html & admin.html (if present) can remain unchanged,
   since those pages call /api/admin/* and /api/my-selections which are unchanged. */
