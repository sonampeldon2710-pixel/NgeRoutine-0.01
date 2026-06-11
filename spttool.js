(function(global){
  'use strict';

  const instances = new Map();

  function Chart(canvas, config) {
    if (!(this instanceof Chart)) return new Chart(canvas, config);
    this.canvas = canvas;
    this.config = config;
    this._tooltip = null;
    const existing = instances.get(canvas);
    if (existing) existing.destroy();
    instances.set(canvas, this);
    this._resize();
    this._draw();
    this._bindEvents();
  }



  Chart.prototype._resize = function() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth || 300;
    const h = parent.clientHeight || 200;
    this.canvas.width  = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
    this._dpr = dpr;
    this._w = w;
    this._h = h;
  };

  Chart.prototype._bindEvents = function() {
    const self = this;

    // ── helpers to compute layout (mirrors _draw layout) ──
    function _layout() {
      const PAD_TOP = 16, PAD_RIGHT = 16, PAD_BOTTOM = 44, PAD_LEFT = 44;
      const W = self._w || self.canvas.width;
      const H = self._h || self.canvas.height;
      return { plotX: PAD_LEFT, plotY: PAD_TOP,
               plotW: W - PAD_LEFT - PAD_RIGHT,
               plotH: H - PAD_TOP - PAD_BOTTOM, W, H };
    }

    // Find the nearest dot across all datasets to a mouse position
    function _nearestDot(mx, my) {
      const { plotX, plotY, plotW, plotH } = _layout();
      const data = self.config.data || {};
      const datasets = (data.datasets || []).filter(ds => ds.data && ds.data.length);
      const labels = data.labels || [];
      if (!labels.length) return null;

      const allVals = [];
      datasets.forEach(ds => ds.data.forEach(v => { if (v !== null && v !== undefined) allVals.push(+v); }));
      const scaleOpts = ((self.config.options || {}).scales || {}).y || {};
      const yMin = scaleOpts.min !== undefined ? scaleOpts.min : Math.min(0, ...allVals);
      const yMax = scaleOpts.max !== undefined ? scaleOpts.max : (Math.max(...allVals) * 1.1 || 1);

      function toX(i) { return plotX + (i / Math.max(labels.length - 1, 1)) * plotW; }
      function toY(v) { return plotY + plotH - ((v - yMin) / (yMax - yMin)) * plotH; }

      let best = null, bestDist = 22; // px snap radius
      datasets.forEach(ds => {
        const pr = ds.pointRadius !== undefined ? ds.pointRadius : 4;
        const snapR = Math.max(pr + 8, 16);
        ds.data.forEach((v, i) => {
          if (v === null || v === undefined) return;
          const dx = mx - toX(i), dy = my - toY(+v);
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < snapR && dist < bestDist) {
            bestDist = dist;
            best = { ds, i, v: +v, label: labels[i], color: ds.borderColor || '#1D9E75' };
          }
        });
      });
      return best;
    }

    this._mouseMove = function(e) {
      const rect = self.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const dot = _nearestDot(mx, my);
      self._hoveredDot = dot;
      self.canvas.style.cursor = dot ? 'pointer' : 'default';
      self._draw();
    };
    this._mouseLeave = function() {
      self._hoveredDot = null;
      self.canvas.style.cursor = 'default';
      self._draw();
    };
    this._click = function(e) {
      const rect = self.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const dot = _nearestDot(mx, my);
      if (dot && self.config.options && self.config.options.onClick) {
        self.config.options.onClick(dot);
      }
    };
    this.canvas.addEventListener('mousemove', this._mouseMove);
    this.canvas.addEventListener('mouseleave', this._mouseLeave);
    this.canvas.addEventListener('click', this._click);

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObs = new ResizeObserver(function() {
        self._resize();
        self._draw();
      });
      if (this.canvas.parentElement) this._resizeObs.observe(this.canvas.parentElement);
    }
  };

  Chart.prototype.destroy = function() {
    if (this._resizeObs) this._resizeObs.disconnect();
    if (this._mouseMove)  this.canvas.removeEventListener('mousemove',  this._mouseMove);
    if (this._mouseLeave) this.canvas.removeEventListener('mouseleave', this._mouseLeave);
    if (this._click)      this.canvas.removeEventListener('click',      this._click);
    instances.delete(this.canvas);
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  };

  Chart.prototype._draw = function() {
    const canvas = this.canvas;
    const ctx = canvas.getContext('2d');
    const dpr = this._dpr || 1;
    const W = this._w || canvas.width;
    const H = this._h || canvas.height;
    const opts = this.config.options || {};
    const data = this.config.data || {};
    const datasets = (data.datasets || []).filter(ds => ds.data && ds.data.length);
    const labels = data.labels || [];

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    // Layout
    const PAD_TOP = 16, PAD_RIGHT = 16, PAD_BOTTOM = 44, PAD_LEFT = 44;
    const plotX = PAD_LEFT, plotY = PAD_TOP;
    const plotW = W - PAD_LEFT - PAD_RIGHT;
    const plotH = H - PAD_TOP - PAD_BOTTOM;

    if (!datasets.length || !labels.length) {
      ctx.fillStyle = '#a09c96';
      ctx.font = '13px Sora,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data yet', W / 2, H / 2);
      ctx.restore();
      return;
    }

    // Collect all numeric values
    const allVals = [];
    datasets.forEach(ds => ds.data.forEach(v => { if (v !== null && v !== undefined) allVals.push(+v); }));
    const scaleOpts = (opts.scales && opts.scales.y) || {};
    const rawMin = scaleOpts.min !== undefined ? scaleOpts.min : Math.min(0, ...allVals);
    const rawMax = scaleOpts.max !== undefined ? scaleOpts.max : Math.max(...allVals) * 1.1 || 1;
    const yMin = rawMin, yMax = rawMax;

    function toX(i) { return plotX + (i / Math.max(labels.length - 1, 1)) * plotW; }
    function toY(v) { return plotY + plotH - ((v - yMin) / (yMax - yMin)) * plotH; }

    // Grid lines
    const maxTicks = (scaleOpts.ticks && scaleOpts.ticks.maxTicksLimit) || 6;
    const tickStep = (scaleOpts.ticks && scaleOpts.ticks.stepSize) ? scaleOpts.ticks.stepSize : (yMax - yMin) / (maxTicks - 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.lineWidth = 1;
    for (let v = yMin; v <= yMax + 0.001; v += tickStep) {
      const y = toY(v);
      ctx.beginPath(); ctx.moveTo(plotX, y); ctx.lineTo(plotX + plotW, y); ctx.stroke();
      const tickCb = scaleOpts.ticks && scaleOpts.ticks.callback;
      const label = tickCb ? tickCb(+v.toFixed(2)) : +v.toFixed(1);
      ctx.fillStyle = '#a09c96';
      ctx.font = '10px Sora,sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(label, plotX - 4, y + 4);
    }

    // X axis labels
    const maxXLabels = Math.floor(plotW / 48);
    const xStep = Math.max(1, Math.ceil(labels.length / maxXLabels));
    ctx.fillStyle = '#a09c96';
    ctx.font = '10px Sora,sans-serif';
    ctx.textAlign = 'center';
    labels.forEach((lbl, i) => {
      if (i % xStep !== 0 && i !== labels.length - 1) return;
      ctx.fillText(lbl, toX(i), plotY + plotH + 16);
    });

    // Determine hovered dot for highlight
    const hovDot = this._hoveredDot;

    // Datasets
    datasets.forEach(ds => {
      const color = ds.borderColor || '#1D9E75';
      const pts = ds.data.map((v, i) => v !== null && v !== undefined ? { x: toX(i), y: toY(+v), v: +v, i } : null);

      // Fill
      if (ds.fill) {
        ctx.beginPath();
        let started = false;
        pts.forEach(p => {
          if (!p) return;
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else { ctx.lineTo(p.x, p.y); }
        });
        ctx.lineTo(toX(pts.length - 1), toY(yMin));
        ctx.lineTo(toX(0), toY(yMin));
        ctx.closePath();
        ctx.fillStyle = ds.backgroundColor || color + '22';
        ctx.fill();
      }

      // Line — spanGaps: skip nulls but keep line connected to next real point
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      const spanGaps = ds.spanGaps !== false; // default true
      let lineStarted = false;
      pts.forEach(p => {
        if (!p) {
          if (!spanGaps) lineStarted = false; // only break line if spanGaps disabled
          return;
        }
        if (!lineStarted) { ctx.moveTo(p.x, p.y); lineStarted = true; } else { ctx.lineTo(p.x, p.y); }
      });
      ctx.stroke();

      // Points — enlarge hovered dot
      const pr = ds.pointRadius !== undefined ? ds.pointRadius : 4;
      pts.forEach(p => {
        if (!p) return;
        const isHov = hovDot && hovDot.ds === ds && hovDot.i === p.i;
        const r = isHov ? pr + 3 : pr;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = ds.pointBackgroundColor || color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = isHov ? 2.5 : 1.5;
        ctx.stroke();
        // Outer ring on hovered dot
        if (isHov) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = color + '55';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    });

    // Dot-precise tooltip
    if (hovDot) {
      const { ds, i, v, label, color } = hovDot;
      const dotX = toX(i);
      const dotY = toY(v);

      // Cross-hair lines
      ctx.save();
      ctx.strokeStyle = color + '44';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(dotX, plotY); ctx.lineTo(dotX, plotY + plotH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(plotX, dotY); ctx.lineTo(plotX + plotW, dotY); ctx.stroke();
      ctx.restore();

      // Tooltip content
      const ttOpts = opts.plugins && opts.plugins.tooltip;
      let lbl = ` ${ds.label}: ${v}`;
      if (ttOpts && ttOpts.callbacks && ttOpts.callbacks.label) {
        const res = ttOpts.callbacks.label({ parsed: { y: v }, dataset: ds });
        if (res !== null && res !== undefined) lbl = res;
      }

      const padding = 10;
      const lineH = 19;
      const lines = [
        { text: label, color: '#6b6660', bold: true },
        { text: lbl, color: '#1a1816' }
      ];
      const boxW = Math.max(...lines.map(l => l.text.length * 7.2)) + padding * 2 + 14;
      const boxH = lines.length * lineH + padding * 2;

      let bx = dotX + 14;
      let by = dotY - boxH / 2;
      if (bx + boxW > W - 4) bx = dotX - boxW - 14;
      if (by < 2) by = 2;
      if (by + boxH > H - 4) by = H - boxH - 4;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.15)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 7);
      ctx.fill();
      // Color accent left bar
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(bx, by, 3, boxH, [7, 0, 0, 7]);
      ctx.fill();
      ctx.restore();

      lines.forEach((line, li) => {
        const ty = by + padding + li * lineH + lineH * 0.65;
        ctx.fillStyle = line.color;
        ctx.font = line.bold ? '600 11px Sora,sans-serif' : '12px Sora,sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(line.text, bx + padding + 6, ty);
      });
    }

    ctx.restore();
  };

  global.Chart = Chart;
}(window));

/* ═══════════════════════════════════════
   STATE  –  persisted via localStorage
═══════════════════════════════════════ */

// const API = 'https://abc123.ngrok-free.app/api';
// const API = 'https://contort-schematic-cameo.ngrok-free.dev/api';
// const API = 'https://ngeroutinetool-pcmphk0l.b4a.run/api';

// const API = 'https://ngeroutinetool-wvl7srve.b4a.run/api';

// const API = 'https://ngeroutinetool.onrender.com/api';

// const response = await fetch(`${API}/your-endpoint`, {
//   method: 'POST',
//   headers: {
//     'Content-Type': 'application/json',
//     'ngrok-skip-browser-warning': 'true'  // ← add this line
//   },
//   body: JSON.stringify(data)
// });

const API_BASE = 'https://ngeroutinetool-production.up.railway.app/api';

let currentUser = null;
let currentAlarmHabit = null;

/* ── Storage helpers ── */
function _loadUsers() {
  try { return JSON.parse(localStorage.getItem('qt_users') || '{}'); } catch(e) { return {}; }
}
function _saveUsers(u) {
  localStorage.setItem('qt_users', JSON.stringify(u));
}

/* getUserData: always returns the live in-memory object for the current user.
   On first call per session it hydrates from localStorage.
   saveUserData() writes it back — call it after every mutation. */
let _currentData = null;

function getUserData() {
  if (!currentUser) return null;
  if (!_currentData) {
    try {
      _currentData = JSON.parse(localStorage.getItem('qt_data_' + currentUser.username) || 'null');
    } catch(e) { _currentData = null; }
    if (!_currentData) {
      _currentData = { logs:[], alarms:{}, habitEnabled:{}, selectedSounds:{}, customSounds:{}, checkInHistory:[], quickAlarms:[] };
    }
    if (!_currentData.quickAlarms) _currentData.quickAlarms = [];
    normalizeLogDates(_currentData);
  }
  return _currentData;
}

function saveUserData() {
  if (!currentUser || !_currentData) return;
  localStorage.setItem('qt_data_' + currentUser.username, JSON.stringify(_currentData));
}

function normalizeDateValue(value) {
  if (!value) return '';
  if (typeof value !== 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed)) value = parsed.toISOString();
    else return '';
  }
  const datePart = value.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  const parsed = new Date(value);
  return !isNaN(parsed) ? parsed.toISOString().split('T')[0] : '';
}

function normalizeLogDates(ud) {
  if (!ud || !Array.isArray(ud.logs)) return;
  let changed = false;
  ud.logs.forEach(l => {
    if (l && l.date) {
      const normalized = normalizeDateValue(l.date);
      if (normalized && l.date !== normalized) {
        l.date = normalized;
        changed = true;
      }
    }
  });
  if (changed) saveUserData();
}

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
function switchTab(t) {
  document.getElementById('tab-login').style.display  = t === 'login' ? '' : 'none';
  document.getElementById('tab-signup').style.display = t === 'signup' ? '' : 'none';
  document.querySelectorAll('.auth-tab').forEach((el,i) => {
    el.classList.toggle('active', (i===0 && t==='login') || (i===1 && t==='signup'));
  });
  clearAuthMsgs();
}
function clearAuthMsgs() {
  ['li-msg','su-msg'].forEach(id => {
    const el = document.getElementById(id);
    el.className = 'auth-msg';
    el.textContent = '';
  });
}
function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'auth-msg ' + type;
}
function togglePw(id, btn) {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}
// 

// ── Replace these two functions in spttool.js ──


async function doSignup() {
  unlockAudio();
  const name = document.getElementById('su-name').value.trim();
  const user = document.getElementById('su-user').value.trim().toLowerCase();
  const pass = document.getElementById('su-pass').value;
  if (!name || !user || !pass) return showMsg('su-msg', 'Please fill in all fields.', 'err');

  try {
    const r = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      // headers: { 'Content-Type': 'application/json' },
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ username: user, password: pass, full_name: name })
    });
    const data = await r.json();
    if (!r.ok) return showMsg('su-msg', data.error || 'Signup failed.', 'err');
    
    // Save user data locally for password reset fallback
    const users = _loadUsers();
    users[user] = { name: name, pass: pass };
    _saveUsers(users);
    
    localStorage.setItem('qt_token', data.token);
    showMsg('su-msg', 'Account created! Signing you in…', 'ok');
    setTimeout(() => launchApp({ username: data.user.username, name: data.user.name }), 900)
  } catch {
    showMsg('su-msg', 'Network error. Please try again.', 'err');
  }
}

async function doLogin() {
  unlockAudio();
  const user = document.getElementById('li-user').value.trim().toLowerCase();
  const pass = document.getElementById('li-pass').value;
  if (!user || !pass) return showMsg('li-msg', 'Please enter your username and password.', 'err');

  try {
    const r = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      // headers: { 'Content-Type': 'application/json' },
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await r.json();
    if (!r.ok) return showMsg('li-msg', data.error || 'Login failed.', 'err');
    
    // Save user info locally for reference (no password for security)
    const users = _loadUsers();
    if (!users[user]) {
      users[user] = { name: data.user.name }; // Don't store password
      _saveUsers(users);
    }
    
    localStorage.setItem('qt_token', data.token);
    launchApp({ username: data.user.username, name: data.user.name });
  } catch {
    showMsg('li-msg', 'Network error. Please try again.', 'err');
  }
}

/* ── Cross-device sync: pull all logs & schedules from backend on login ── */
async function syncLogsFromBackend() {
  const token = localStorage.getItem('qt_token');
  if (!token) return;
  const ud = getUserData();
  if (!ud) return;

  // 1. Sync logs
  try {
    const res = await fetch(`${API_BASE}/logs`, {
      headers: { 'Authorization': 'Bearer ' + token, 'ngrok-skip-browser-warning': 'true' }
    });
    if (res.ok) {
      const dbLogs = await res.json();
      if (Array.isArray(dbLogs)) {
        let changed = false;
        dbLogs.forEach(l => {
          const exists = ud.logs.find(local => local.id === l.id);
          if (!exists) {
            ud.logs.push({
              id:        l.id,
              habitId:   l.habit_id,
              habitName: l.habit_name,
              habitIcon: l.habit_icon || '📋',
              date:      normalizeDateValue(l.date),
              duration:  l.duration,
              unit:      l.unit || 'hrs',
              startTime: l.start_time || '',
              endTime:   l.end_time   || '',
              note:      l.note       || ''
            });
            changed = true;
          }
        });
        if (changed) { normalizeLogDates(ud); saveUserData(); }
      }
    }
  } catch(e) { console.warn('Log sync failed:', e); }

  // 2. Sync schedules
  try {
    const res2 = await fetch(`${API_BASE}/schedules`, {
      headers: { 'Authorization': 'Bearer ' + token, 'ngrok-skip-browser-warning': 'true' }
    });
    if (res2.ok) {
      const dbSched = await res2.json();
      if (Array.isArray(dbSched) && dbSched.length) {
        if (!ud.schedules) ud.schedules = [];
        let changed2 = false;
        dbSched.forEach(s => {
          const exists = ud.schedules.find(local => local.id === s.id);
          if (!exists) {
            ud.schedules.push({
              id:           s.id,
              category:     s.category,
              date:         normalizeDateValue(s.date),
              fromTime:     s.from_time  || '08:00',
              toTime:       s.to_time    || '09:00',
              durationMins: s.duration_mins || 0,
              tasks:        s.tasks || [],
              createdAt:    s.created_at || new Date().toISOString()
            });
            changed2 = true;
          }
        });
        if (changed2) saveUserData();
      }
    }
  } catch(e) { console.warn('Schedule sync failed:', e); }
}

function launchApp(user) {
  currentUser = user;
  _currentData = null; // clear cache so getUserData() re-loads from storage fresh
  localStorage.setItem('qt_session', JSON.stringify({ username: user.username }));
  const firstName = user.name.split(' ')[0];
  document.getElementById('greeting-name').textContent = firstName;
  document.getElementById('hdr-avatar').textContent = user.username.charAt(0).toUpperCase();
  document.getElementById('hdr-name').textContent = '';
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');

  // Pull backend data first, then render everything
  syncLogsFromBackend().then(() => {
    buildHabitCards();
    renderCalendar();
    renderTrends();
    renderHistory();
    renderTrackerSchedules();
    renderTrackerTodayLogs();
  });

  startAlarmWatcher();
  setTimeout(_rearmQuickAlarms, 500);
  window.scrollTo(0, 0);
}
function doLogout() {
  stopAlarmWatcher();
  saveUserData();
  localStorage.removeItem('qt_session');
  currentUser = null;
  _currentData = null;
  restartForm();
  document.getElementById('settings-modal').style.display = 'none';
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('auth-screen').classList.add('active');
  clearAuthMsgs();
  document.getElementById('li-user').value = '';
  document.getElementById('li-pass').value = '';
  switchTab('login');
  window.scrollTo(0, 0);
}

/* ── Settings Modal ── */
function openSettings() {
  if (!currentUser) return;
  const users = _loadUsers();
  const u = users[currentUser.username] || {};
  document.getElementById('st-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('st-display-name').textContent = 'Account';
  document.getElementById('st-display-user').textContent = '#' + currentUser.username;
  document.getElementById('st-name').value = currentUser.name;
  document.getElementById('st-userid').value = currentUser.username;
  document.getElementById('st-cur-pass').value = u.pass || '';
  const msg = document.getElementById('st-msg');
  msg.className = 'auth-msg';
  msg.textContent = '';
  document.getElementById('settings-modal').style.display = 'flex';
}
function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}
function settingsOverlayClick(e) {
  if (e.target === document.getElementById('settings-modal')) closeSettings();
}
function stCopyPassword() {
  const val = document.getElementById('st-cur-pass').value;
  if (!val) return;
  navigator.clipboard.writeText(val).then(() => {
    const btn = document.querySelector('.st-copy-btn');
    if (btn) { btn.textContent = '✓'; setTimeout(() => { btn.textContent = '📋'; }, 1500); }
  }).catch(() => {});
}
function saveSettings() {
  const newName = document.getElementById('st-name').value.trim();
  const msg     = document.getElementById('st-msg');

  if (!newName) { 
    msg.textContent = 'Name cannot be empty.'; 
    msg.className = 'auth-msg err'; 
    return; 
  }

  const token = localStorage.getItem('qt_token');
  fetch(`${API_BASE}/auth/update`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ full_name: newName })
  })
  .then(r => r.json())
  .then(data => {
    if (data.error) {
      msg.textContent = data.error; 
      msg.className = 'auth-msg err';
      return;
    }
    currentUser.name = newName;
    const firstName = newName.split(' ')[0];
    document.getElementById('greeting-name').textContent = firstName;
    document.getElementById('st-avatar').textContent = newName.charAt(0).toUpperCase();
    document.getElementById('hdr-avatar').textContent = currentUser.username.charAt(0).toUpperCase();
    const users = _loadUsers();
    if (users[currentUser.username]) {
      users[currentUser.username].name = newName;
      _saveUsers(users);
    }
    msg.textContent = '✓ Name updated!';
    msg.className = 'auth-msg ok';
    setTimeout(() => { msg.className = 'auth-msg'; msg.textContent = ''; }, 3000);
  })
  .catch(() => {
    msg.textContent = 'Network error. Please try again.';
    msg.className = 'auth-msg err';
  });
}

/* ── Forgot Password ── */
function toggleForgotPanel() {
  const panel = document.getElementById('forgot-panel');
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    // Pre-fill User ID from the sign-in field if already typed
    const uid = document.getElementById('li-user').value.trim();
    if (uid) document.getElementById('fp-user').value = uid;
    document.getElementById('fp-new-pass').value = '';
    document.getElementById('fp-confirm-pass').value = '';
    const fpMsg = document.getElementById('fp-msg');
    fpMsg.className = 'auth-msg'; fpMsg.textContent = '';
  }
}
async function doResetPassword() {
  const userId  = document.getElementById('fp-user').value.trim().toLowerCase();
  const newPass = document.getElementById('fp-new-pass').value;
  const confirm = document.getElementById('fp-confirm-pass').value;
  const msg     = document.getElementById('fp-msg');

  if (!userId)  { msg.textContent = 'Please enter your User ID.'; msg.className = 'auth-msg err'; return; }
  if (!newPass) { msg.textContent = 'Please enter a new password.'; msg.className = 'auth-msg err'; return; }
  if (newPass.length < 6) { msg.textContent = 'Password must be at least 6 characters.'; msg.className = 'auth-msg err'; return; }
  if (newPass !== confirm) { msg.textContent = 'Passwords do not match.'; msg.className = 'auth-msg err'; return; }

  // Try API first, fall back to local storage if API fails
  let apiFailed = false;
  try {
    const r = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ username: userId, new_password: newPass })
    });
    const data = await r.json();
    if (r.ok) {
      msg.textContent = '✓ Password reset! You can now sign in.';
      msg.className   = 'auth-msg ok';
      // Pre-fill sign-in and close panel after short delay
      setTimeout(() => {
        document.getElementById('li-user').value = userId;
        document.getElementById('li-pass').value = '';
        document.getElementById('forgot-panel').style.display = 'none';
        const fpMsg = document.getElementById('fp-msg');
        fpMsg.className = 'auth-msg'; fpMsg.textContent = '';
      }, 1800);
      return;
    }
    // If API returns user not found, don't fall back to local
    if (data.error && data.error.toLowerCase().includes('not found')) {
      msg.textContent = 'No account found with that User ID.';
      msg.className = 'auth-msg err';
      return;
    }
    // Other API errors, fall back to local storage
    apiFailed = true;
  } catch {
    // Network error, fall back to local storage
    apiFailed = true;
  }

  if (apiFailed) {
    // Fallback: local storage method
    const users = _loadUsers();
    if (!users[userId]) { 
      msg.textContent = 'No account found with that User ID. Please check your User ID or contact support.';
      msg.className = 'auth-msg err'; 
      return; 
    }

    users[userId].pass = newPass;
    _saveUsers(users);

    msg.textContent = '✓ Password reset! You can now sign in.';
    msg.className   = 'auth-msg ok';
    // Pre-fill sign-in and close panel after short delay
    setTimeout(() => {
      document.getElementById('li-user').value = userId;
      document.getElementById('li-pass').value = '';
      document.getElementById('forgot-panel').style.display = 'none';
      const fpMsg = document.getElementById('fp-msg');
      fpMsg.className = 'auth-msg'; fpMsg.textContent = '';
    }, 1800);
  }
}


// Wire up keyboard shortcuts and auto-login after DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('li-user').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('li-pass').focus(); });
  document.getElementById('li-pass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  document.getElementById('su-pass').addEventListener('keydown', e => { if(e.key==='Enter') doSignup(); });

  // Auto-login: if a session was saved, skip the login screen
  try {
    const saved = localStorage.getItem('qt_session');
    if (saved) {
      const session = JSON.parse(saved);
      const users = _loadUsers();
      if (session.username && users[session.username]) {
        launchApp({ username: session.username, name: users[session.username].name });
      }
    }
  } catch(e) {}
});

/* ═══════════════════════════════════════
   NAV TABS
═══════════════════════════════════════ */
function showTab(t) {
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+t).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(b=>{
    if((t==='check-in'&&b.textContent.includes('Check'))||
       (t==='tracker'&&b.textContent.includes('Tracker'))||
       (t==='history'&&b.textContent.includes('History'))||
       (t==='trends'&&b.textContent.includes('Trends'))||
       (t==='tools'&&b.textContent.includes('Tools'))) {
      b.classList.add('active');
    }
  });
  if(t==='trends') renderTrends();
  if(t==='history'){ renderCalendar(); renderHistory(); }
}

/* ═══════════════════════════════════════
   CHECK-IN LOGIC
═══════════════════════════════════════ */
const likertQs=[
  {id:'l1',text:'I can fall asleep easily.'},
  {id:'l2',text:'I sleep well most nights.'},
  {id:'l3',text:'I wake up feeling rested.'},
  {id:'l4',text:'I stay alert during the day.'},
  {id:'l5',text:'I have good energy during the day.'}
];
const likertOpts=['Yes, always','Most of the time','Sometimes','Not really','No, never'];
const answers={};
const lAnswers={};

// Build likert questions and wire up option clicks – run after DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  const lc=document.getElementById('lik-container');
  likertQs.forEach((q,i)=>{
    const row=document.createElement('div');
    row.className='lik-item';
    row.innerHTML=`<span class="lik-label">Q${i+8}. ${q.text}</span><div class="lik-btns">${likertOpts.map(o=>`<button type="button" class="lbtn" data-lq="${q.id}" data-v="${o}">${o}</button>`).join('')}</div>`;
    lc.appendChild(row);
  });

  document.querySelectorAll('.opts').forEach(grp=>{
    grp.querySelectorAll('.opt').forEach(btn=>{
      btn.addEventListener('click',()=>{
        grp.querySelectorAll('.opt').forEach(b=>b.classList.remove('sel'));
        btn.classList.add('sel');
        answers[grp.dataset.q]=btn.dataset.v;
        updateProg();
      });
    });
  });
  document.querySelectorAll('.lbtn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll(`.lbtn[data-lq="${btn.dataset.lq}"]`).forEach(b=>b.classList.remove('sel'));
      btn.classList.add('sel');
      lAnswers[btn.dataset.lq]=btn.dataset.v;
      updateProg();
    });
  });
});

function updateProg() {
  const done=Object.keys(answers).length+Object.keys(lAnswers).length;
  const pct=Math.round((done/12)*100);
  document.getElementById('prog-bar').style.width=pct+'%';
  document.getElementById('prog-txt').textContent=`${done} of 12`;
  document.getElementById('submit-btn').disabled=(done<12);
}

function lScore(v) {
  return{'Yes, always':5,'Most of the time':4,'Sometimes':3,'Not really':2,'No, never':1}[v]||3;
}
function sleepScore() {
  const s={};
  likertQs.forEach(q=>{s[q.id]=lScore(lAnswers[q.id]);});
  return Math.round(((s.l1+s.l2+s.l3+s.l4+s.l5)/5)*10);
}
function phoneRisk() {
  return{'no phone before bed':0,'less than 30 minutes':1,'30 min–1 hour':2,'1–2 hours':3,'2–3 hours':4,'more than 3 hours':5}[answers.phonetime]||0;
}
function isLateNight(){return answers.bedtime==='after 12 AM'||answers.bedtime==='11 PM–12 AM';}

/* ── CONTRADICTION DETECTOR ── */
function detectContradictions() {
  const contra=[];
  const feelGoodAll=
    (lAnswers.l3==='Yes, always'||lAnswers.l3==='Most of the time')&&
    (lAnswers.l5==='Yes, always'||lAnswers.l5==='Most of the time')&&
    (lAnswers.l4==='Yes, always'||lAnswers.l4==='Most of the time')&&
    (lAnswers.l1==='Yes, always'||lAnswers.l1==='Most of the time');

  const overwork=answers.workhours==='9 or more hours';
  const longsleep=answers.sleep==='9 or more hours';
  const highPhone=answers.phonetime==='2–3 hours'||answers.phonetime==='more than 3 hours';
  const lateBed=answers.bedtime==='after 12 AM'||answers.bedtime==='11 PM–12 AM';

  if(feelGoodAll&&overwork) {
    contra.push({
      t:'🔮 You feel great — but your workload is something to watch',
      b:[
        `<strong>What we see:</strong> You say you feel good — but you work ${answers.workhours} a day. That's a lot.`,
        `<strong>Why it matters:</strong> Stress from heavy work can build up slowly. Many people feel fine until they suddenly feel very tired or burned out.`,
        `<strong>What to watch for:</strong> If you start feeling more irritable, struggling to relax, or needing lots of coffee to get going, those are early signs. Even if you feel okay now, taking regular rest days is a good idea.`
      ]
    });
  }
  if(feelGoodAll&&longsleep) {
    contra.push({
      t:'🔮 You feel energetic — but you sleep 9+ hours every night',
      b:[
        `<strong>What we see:</strong> You say you have good energy, but you sleep ${answers.sleep} every night.`,
        `<strong>Why it matters:</strong> Sleeping that long while feeling fine can sometimes mean your body is more tired than you realise, or that you're not very active.`,
        `<strong>Try this:</strong> Experiment with 7–8 hours of sleep for 2 weeks. If you feel just as good, you were probably sleeping more than you need. If you feel worse, your body genuinely needs the extra sleep — and that's useful to know.`
      ]
    });
  }
  if(feelGoodAll&&highPhone) {
    contra.push({
      t:`🔮 You feel rested — but ${answers.phonetime} of phone use before bed is a risk`,
      b:[
        `<strong>What we see:</strong> You say you sleep well, but you use your phone ${answers.phonetime} before sleeping.`,
        `<strong>Why it matters:</strong> Phone screens affect your sleep even when you don't notice it. You might feel okay now — but this habit slowly makes sleep less deep over time.`,
        `<strong>Try this:</strong> Put your phone away 30 minutes before bed for just one week. Many people are surprised how much better they sleep. You might go from "feeling good" to "feeling great".`
      ]
    });
  }
  if(feelGoodAll&&lateBed) {
    contra.push({
      t:`🔮 Late bedtime + feeling fine — it's a balance worth watching`,
      b:[
        `<strong>What we see:</strong> You go to bed ${answers.bedtime} and say you feel rested and energised.`,
        `<strong>Why it matters:</strong> Some people naturally do fine going to bed late. But if you also work a lot or use your phone before bed, that balance can disappear quickly.`,
        `<strong>Keep an eye on it:</strong> If your energy drops during a stressful time, try going to bed 30–45 minutes earlier. That's usually the quickest fix.`
      ]
    });
  }
  return contra;
}

/* ── SAVE CHECK-IN TO DATABASE ── */
async function saveCheckInToDB(answersData, lAnswersData, score) {
  const token = localStorage.getItem('qt_token');
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/checkins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({
        date: new Date().toISOString(),
        answers: answersData,
        lAnswers: lAnswersData,
        score: score
      })
    });
    if (!res.ok) console.warn('Check-in DB save failed:', res.status);
  } catch(e) {
    console.log('DB save failed, kept in localStorage only', e);
  }
}

function showResults() {
  document.getElementById('tracker-form').style.display='none';
  const rd=document.getElementById('results');
  rd.style.display='block';
  window.scrollTo(0,0);

  const ud=getUserData();
  if(ud) {
    ud.checkInHistory.push({
      date:new Date().toISOString(),
      answers:{...answers},
      lAnswers:{...lAnswers},
      score:sleepScore()
    });
    saveUserData();
    saveCheckInToDB(answers, lAnswers, sleepScore()); // ← saves to Railway DB
  }

  const sc=sleepScore();
  const pr=phoneRisk();
  const late=isLateNight();
  const overwork=answers.workhours==='9 or more hours';
  const sedentary=answers.worktype==='Sitting';
  const feelRested=lAnswers.l3==='Yes, always'||lAnswers.l3==='Most of the time';
  const poorRested=lAnswers.l3==='Not really'||lAnswers.l3==='No, never';
  const feelEnergetic=lAnswers.l5==='Yes, always'||lAnswers.l5==='Most of the time';
  const lowEnergy=lAnswers.l5==='Not really'||lAnswers.l5==='No, never';
  const daySleepy=lAnswers.l4==='Not really'||lAnswers.l4==='No, never';
  const hardToSleep=lAnswers.l1==='Not really'||lAnswers.l1==='No, never';
  const shortSleep=answers.sleep==='0–4 hours'||answers.sleep==='5–6 hours';
  const goodHours=answers.sleep==='7–8 hours'||answers.sleep==='9 or more hours';
  const outcomeGood=feelRested&&feelEnergetic&&!daySleepy;
  const outcomePoor=poorRested||lowEnergy||daySleepy;

  let intro='',emoji='✨';
  if(outcomeGood){intro="You feel rested and have good energy. You're doing great — keep it up!";emoji='🌟';}
  else if(outcomePoor&&goodHours){intro=`You sleep ${answers.sleep} but still don't feel your best. More hours in bed isn't always the answer — going to bed at the same time and using your phone less at night can help a lot.`;emoji='⚠️';}
  else if(outcomePoor&&shortSleep){intro=`You sleep ${answers.sleep} and it's affecting your energy. A few small changes to your bedtime can make a big difference quickly.`;emoji='💤';}
  else{intro='Some things are going well and some can get better. Your tips below are based on what you told us.';emoji='🔍';}

  // ── Helper: context-aware Habit Tracker nudge ──────────────────────────
  const ud_recs = getUserData();
  const hasLogs = ud_recs && ud_recs.logs && ud_recs.logs.length > 0;
  const trackerNudge = (habitId, habitLabel) => {
    if (hasLogs) {
      const habitLogs = ud_recs.logs.filter(l => l.habitId === habitId);
      if (habitLogs.length >= 3) {
        return `<strong>📊 Your tracker data:</strong> You've already logged ${habitLabel} ${habitLogs.length} time${habitLogs.length > 1 ? 's' : ''}! Keep that streak going — consistent logging helps you spot patterns and celebrate real progress.`;
      }
      return `<strong>📊 Track it:</strong> You've started logging in the Habit Tracker — amazing first step! Adding your ${habitLabel} daily will reveal patterns you can't see from memory alone.`;
    }
    return `<strong>📊 Start tracking:</strong> Head to the <em>Habit Tracker</em> tab and log your ${habitLabel} each day. Even one week of data will show you patterns that are impossible to see in your head.`;
  };

  // ── Recommendations ────────────────────────────────────────────────────
  // Format: { l: level, t: title, s: short summary + action sentence, b: [tracker nudge] }
  const recs=[];

  const phoneHigh  = answers.phonetime==='1–2 hours'||answers.phonetime==='2–3 hours'||answers.phonetime==='more than 3 hours';
  const phoneMed   = answers.phonetime==='30 min–1 hour';
  const phoneHours = {'no phone before bed':'none','30 min–1 hour':'30 min–1 hr','1–2 hours':'1–2 hrs','2–3 hours':'2–3 hrs','more than 3 hours':'3+ hrs'}[answers.phonetime]||'some';

  // ── Outcome-good cards ──
  if(outcomeGood&&late) recs.push({l:'',t:'✅ You feel great, your late-night routine is working for you',
    s:`You go to bed ${answers.bedtime} and still feel full of energy. That's great! Try to keep the same bedtime every day — even on weekends. That will help you keep feeling this good.`,
    b:[trackerNudge('sleep','sleep')]});
  else if(outcomeGood) recs.push({l:'',t:'✅ Your habits are working — you feel rested and full of energy',
    s:`You sleep well, wake up feeling good, and stay alert all day. That means your daily habits are working. Just keep doing what you're doing and check in again in a few weeks.`,
    b:[trackerNudge('sleep','sleep')]});

  // ── Sleep quality poor but hours are fine ──
  if(outcomePoor&&goodHours) recs.push({l:'warn',t:"⚠️ You sleep enough hours but the quality needs a small fix",
    s:`You already sleep ${answers.sleep}, which is good. To feel better, try putting your phone away 30–60 minutes before bed and waking up at the same time each day. This can make your sleep much more restful.`,
    b:[trackerNudge('sleep','sleep hours')]});

  // ── Short sleep + poor outcome ──
  if(outcomePoor&&shortSleep&&!overwork&&!phoneHigh) recs.push({l:'bad',t:"🔴 Your body needs a bit more sleep",
    s:`You're getting by on ${answers.sleep}, but your body needs more rest to feel its best. Try going to bed just 20 minutes earlier each week. Even a little more sleep can give you more energy and a better mood.`,
    b:[trackerNudge('sleep','sleep')]});

  // ── Hard to fall asleep ──
  if(hardToSleep) recs.push({l:'warn',t:"⚠️ You find it hard to fall asleep — a calm bedtime routine can help",
    s:`Your mind stays busy at bedtime, which makes it hard to sleep. Try a simple wind-down: turn off screens, dim the lights, and do something calm like reading for 20–30 minutes before bed. This tells your brain it's time to rest.`,
    b:[trackerNudge('sleep','sleep')]});

  // ── Daytime sleepiness ──
  if(daySleepy) recs.push({
    l:(daySleepy&&poorRested)?'bad':'warn',
    t:(daySleepy&&poorRested)?"🔴 You feel tired during the day — let's help you feel more awake":"⚠️ You're getting through the day — just a small sleep fix can help",
    s:(daySleepy&&poorRested)
      ?`Feeling drained every day is hard. Try going to bed and waking up at the same time each day, and put your phone away 30 minutes before bed. Most people notice a real difference in just a few days.`
      :`You're doing okay, but you feel sleepy during the day. The quickest fix is simple: wake up at the same time every day — even on weekends. This helps your body know when to feel awake and when to sleep.`,
    b:[trackerNudge('sleep','sleep quality')]});

  // ── Phone only (no short sleep) ──
  if(pr>=2&&outcomePoor&&!shortSleep) recs.push({l:'warn',t:"⚠️ You already know about your phone habit — that's the first step",
    s:`You use your phone ${answers.phonetime} before bed. That's actually quite common! Try putting your phone away 30 minutes earlier at night for just 5 days. Many people sleep much deeper with this one small change.`,
    b:[trackerNudge('screen','screen time')]});

  // ── Overwork only (no short sleep, no late) ──
  if(overwork&&outcomePoor&&!shortSleep&&!late) recs.push({l:'bad',t:"🔴 You work a lot — your body needs time to recover",
    s:`Working ${answers.workhours} a day takes a lot out of you. Try to stop all work at least 1 hour before bed. Even a short walk outside can help your body relax and get ready for sleep.`,
    b:[trackerNudge('work','work hours')]});

  // ── COMBINED-FACTORS ──

  // Scenario A: overwork + short sleep + high phone
  if(overwork&&shortSleep&&phoneHigh) recs.push({l:'bad',t:'🔴 Three things are hurting your sleep at the same time',
    s:`You work ${answers.workhours}, sleep only ${answers.sleep}, and use your phone ${phoneHours} before bed. Each one is okay on its own, but together they drain your energy every day. Start with two steps: sleep 1–2 hours more and put your phone away 30 minutes earlier at night. You'll likely feel better within a week.`,
    b:[`<strong>📊 Track it:</strong> Go to the <em>Habit Tracker</em> tab and log your sleep each night. One week of tracking will show you how much better you're doing.`]});

  // Scenario B: overwork + short sleep, phone is fine
  else if(overwork&&shortSleep&&!phoneHigh&&!phoneMed) recs.push({l:'bad',t:'🔴 Long work days are cutting into your sleep time',
    s:`You work ${answers.workhours} and sleep only ${answers.sleep}. That doesn't leave much time for your body to rest and recover. Try going to bed 45–60 minutes earlier on work nights. You'll likely feel more energy within just a few days.`,
    b:[trackerNudge('sleep','sleep')]});

  // Scenario C: short sleep + high phone, no overwork
  else if(!overwork&&shortSleep&&phoneHigh) recs.push({l:'warn',t:'⚠️ Your phone at night is taking time away from your sleep',
    s:`You sleep ${answers.sleep} and use your phone ${phoneHours} before bed. The two are connected — phone light makes your brain stay awake longer than you think. Try swapping the last 30 minutes of phone time for something screen-free. You might gain 20–40 more minutes of real sleep without even changing your bedtime.`,
    b:[trackerNudge('screen','screen time')]});

  // Scenario D: good hours + high phone + feeling poor
  if(!shortSleep&&goodHours&&phoneHigh&&outcomePoor) recs.push({l:'warn',t:'⚠️ You sleep enough hours — but your phone is making it less restful',
    s:`You sleep ${answers.sleep}, which should be enough to feel good. But you also use your phone ${phoneHours} before bed, which breaks up your deep sleep. Try keeping your phone away for the last 30 minutes before bed for just one week. You'll likely notice you wake up feeling much better.`,
    b:[trackerNudge('screen','screen time')]});

  // Scenario E: overwork + late bedtime + poor outcome
  if(overwork&&late&&outcomePoor) recs.push({l:'bad',t:'🔴 Long work days and a late bedtime leave little time to recover',
    s:`You work ${answers.workhours} and go to bed ${answers.bedtime}. That means your body barely has time to rest before morning. Try to finish all work at least 1 hour before you want to sleep. Even a short walk helps your body relax and makes sleep deeper.`,
    b:[trackerNudge('work','work hours')]});

  // Scenario F: sedentary + low energy
  if(sedentary&&lowEnergy) recs.push({l:'',t:"🪑 You do desk work — moving a little more can boost your energy",
    s:`Sitting most of the day can make you feel more tired, not less. Try standing up and moving for 2 minutes every hour, and go for a short walk after lunch. It sounds small, but many people feel much more alert and focused when they do this.`,
    b:[trackerNudge('exercise','movement')]});

  // Scenario G: night owl + poor outcome
  if(late&&outcomePoor) recs.push({l:'bad',t:"🔴 You stay up late — going to bed just a little earlier can help a lot",
    s:`You go to bed ${answers.bedtime} and it's affecting how you feel. You don't have to become a morning person! Just try going to bed 15 minutes earlier each week until you reach 11 pm. Small steps like this are easier to stick to and really work.`,
    b:[trackerNudge('sleep','sleep')]});

  // Contradictions
  const contras=detectContradictions();
  const contraHTML=contras.map(c=>`<div class="rec contra"><h4>${c.t}</h4><ul>${c.b.map(b=>`<li>${b}</li>`).join('')}</ul></div>`).join('');

  if(recs.length===0&&contras.length===0) recs.push({l:'',t:'✅ Everything looks good — keep going!',
    s:`Your habits and how you feel are both in a healthy place. That's great to see! Just keep doing what you're doing and check in again in a few weeks.`,
    b:[trackerNudge('sleep','sleep')]});

  rd.innerHTML=`
    <div class="res-hero">
      <div class="res-emoji">${emoji}</div>
      <h3>Here is what we found\u2026</h3>
      <p>${intro}</p>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-val">${answers.workhours.replace(' hours','')}</div><div class="stat-sub">Work / day</div></div>
      <div class="stat"><div class="stat-val">${answers.sleep.replace(' hours','')}</div><div class="stat-sub">Sleep / night</div></div>
      <div class="stat"><div class="stat-val">${sc}<span style="font-size:12px;font-weight:400">/50</span></div><div class="stat-sub">Sleep score</div></div>
      <div class="stat"><div class="stat-val" style="font-size:13px">${answers.bedtime}</div><div class="stat-sub">Bedtime</div></div>
    </div>
    <div id="ai-feedback-section"></div>
    <button type="button" id="restart-btn" onclick="restartForm()">&#8617; Take the quiz again</button>
  `;

  // Trigger AI feedback asynchronously
  generateAIFeedback({ answers: {...answers}, lAnswers: {...lAnswers}, sc });
}


/* ═══════════════════════════════════════
   PERSONALISED TIPS ENGINE (local, no API)
═══════════════════════════════════════ */
function generateAIFeedback({ answers, lAnswers, sc }) {
  const section = document.getElementById('ai-feedback-section');
  if (!section) return;
  const fb = buildLocalFeedback(answers, lAnswers, sc);
  renderAIFeedback(section, fb);
}

/* ── Sources reference table ── */
const SOURCES_DB = {
  aasm:    { short:'AASM, 2015',             full:'American Academy of Sleep Medicine. (2015). Recommended amount of sleep for a healthy adult. Sleep Health, 1(1), 40–43.',                                                   url:'https://doi.org/10.1016/j.sleh.2014.12.010' },
  bmc:     { short:'BMC Public Health, 2024', full:'BMC Public Health. (2024). Sleep duration and mental health outcomes in adolescents: A population-based study.',                                                             url:'https://bmcpublichealth.biomedcentral.com/articles/10.1186/s12889-024-18725-1' },
  statcan: { short:'Statistics Canada, 2022', full:'Statistics Canada. (2022). Sleep duration and health in Canada. Health Reports.',                                                                                           url:'https://www150.statcan.gc.ca/n1/pub/82-003-x/2022003/article/00001-eng.htm' },
  springer:{ short:'Springer, 2024',          full:'Springer. (2024). Sleep duration and cognitive/health outcomes in adults: A systematic review.',                                                                            url:'https://link.springer.com/article/10.1186/s41606-024-00109-4' },
  guardian:{ short:'The Guardian, 2024',      full:'The Guardian. (2024, November 26). Irregular sleep patterns raise risk of stroke and heart attack, study finds.',                                                          url:'https://www.theguardian.com/society/2024/nov/26/irregular-sleep-pattern-raises-risk-of-stroke-and-heart-attack-uk-study-finds' }
};

function cite(key){ return ''; } // kept for safety; inline citations removed

function buildLocalFeedback(a, la, sc) {
  /* ── Flags ── */
  const sleep       = a.sleep       || '';
  const phone       = a.phonetime   || '';
  const workhours   = a.workhours   || '';
  const bedtime     = a.bedtime     || '';
  const worktype    = a.worktype    || '';

  const goodSleep   = sleep === '7–8 hours';
  const shortSleep  = sleep === '0–4 hours' || sleep === '5–6 hours';
  const longSleep   = sleep === '9 or more hours';
  const noPhone     = phone === 'no phone before bed';
  const lowPhone    = phone === '30 min–1 hour';
  const medPhone    = phone === '1–2 hours';
  const highPhone   = phone === '2–3 hours' || phone === 'more than 3 hours';
  const overwork    = workhours === '9 or more hours';
  const longWork    = workhours === '7–8 hours';
  const lateNight   = bedtime === 'after 12 AM' || bedtime === '11 PM–12 AM';
  const earlyBed    = bedtime === '9–10 PM';
  const sitting     = worktype === 'Sitting';

  const feelRested    = la.l3 === 'Yes, always' || la.l3 === 'Most of the time';
  const poorRested    = la.l3 === 'Not really'  || la.l3 === 'No, never';
  const feelEnergy    = la.l5 === 'Yes, always' || la.l5 === 'Most of the time';
  const lowEnergy     = la.l5 === 'Not really'  || la.l5 === 'No, never';
  const alertDay      = la.l4 === 'Yes, always' || la.l4 === 'Most of the time';
  const sleepyDay     = la.l4 === 'Not really'  || la.l4 === 'No, never';
  const fallsAsleep   = la.l1 === 'Yes, always' || la.l1 === 'Most of the time';
  const hardSleep     = la.l1 === 'Not really'  || la.l1 === 'No, never';

  const outcomeGood = feelRested && feelEnergy && !sleepyDay;
  const outcomePoor = poorRested || lowEnergy || sleepyDay;

  const usedSources = new Set();
  function track(key){ usedSources.add(key); }

  /* ══════════════════════════════════
     1. WHAT'S GOING WELL
     — one friendly sentence, no inline citation
  ══════════════════════════════════ */
  let whatsGoingWell = '';
  if (goodSleep && outcomeGood) {
    track('aasm');
    whatsGoingWell = `You sleep ${sleep} every night and feel rested and alert all day. That's exactly what healthy sleep looks like. Keep it up! 🎉`;
  } else if (goodSleep && !outcomeGood) {
    track('aasm');
    whatsGoingWell = `You sleep ${sleep} every night, that's the healthy amount. You've got the foundation right. Now let's make that sleep feel more restful.`;
  } else if (longSleep && outcomeGood) {
    track('springer');
    whatsGoingWell = `You make time for sleep, and it shows that you feel rested and full of energy. That's a great habit to protect.`;
  } else if (shortSleep && feelEnergy) {
    track('aasm');
    whatsGoingWell = `You manage to keep your energy up even on ${sleep}. Getting just a little more rest will help you feel even better.`;
  } else if (noPhone) {
    track('statcan');
    whatsGoingWell = `You keep your phone away before bed, that's one of the best things you can do for sleep. Well done!`;
  } else if (earlyBed) {
    track('guardian');
    whatsGoingWell = `Going to bed at ${bedtime} gives your body great recovery time. Early bedtimes are really good for your health.`;
  } else if (!overwork && !shortSleep) {
    track('aasm');
    whatsGoingWell = `You're not overworking and you get enough sleep, that's a healthy balance. Your body has time to rest and recover.`;
  } else {
    track('bmc');
    whatsGoingWell = `You're tracking your habits, and that's the first step. Awareness is how real change starts.`;
  }

  /* ══════════════════════════════════
     2. ONE THING TO WORK ON
     — specific, kind, no inline citation
  ══════════════════════════════════ */
  // let areaOfImprovement = '';
  // if (highPhone && (outcomePoor || !feelRested)) {
  //   track('statcan');
  //   areaOfImprovement = `Continuous screen time without breaks may lead to eye strain, fatigue, and reduced focus. Taking regular breaks from screens every 30 minutes can help protect your vision and mental clarity.`;
  // } else if (medPhone && outcomePoor) {
  //   track('statcan');
  //   areaOfImprovement = `Using your phone ${phone} before bed is likely making your sleep lighter. Cutting that down even by 30 minutes can make a real difference to how rested you feel.`;
  // } else if (shortSleep && outcomePoor) {
  //   track('aasm');
  //   areaOfImprovement = `Sleeping less than 7 hours may increase the risk of stroke, poor health, and early death. Maintaining healthy sleep habits supports better physical and mental well-being.`;
  // } else if (overwork && outcomePoor) {
  //   track('springer');
  //   areaOfImprovement = `Working ${workhours} a day makes it hard for your body to switch off at night. Try stopping all work at least 1 hour before bed even a short walk helps your body wind down.`;
  // } else if (lateNight && outcomePoor) {
  //   track('guardian');
  //   areaOfImprovement = `Going to bed ${bedtime} is quite late. Your body sleeps best within a regular window. Try shifting your bedtime just 15 minutes earlier each week.`;
  // } else if (hardSleep) {
  //   track('statcan');
  //   areaOfImprovement = `You find it hard to fall asleep. Your brain needs a signal that it's time to rest. Try a calm, screen-free wind-down for 20 minutes before bed do reading, stretching, or just dim lights.`;
  // } else if (highPhone && outcomeGood) {
  //   track('statcan');
  //   areaOfImprovement = `Even though you feel okay, more hours of screen time can still affect your eyes and focus over time. Continuous screen time without breaks may lead to eye strain, fatigue, and reduced focus. Taking regular breaks helps protect your long-term health.`;
  // } else if (longSleep && !feelEnergy) {
  //   track('springer');
  //   areaOfImprovement = `Sleeping more than 9 hours may increase the risk of stroke, poor health, and early death. Maintaining healthy sleep habits supports better physical and mental well-being.`;
  // } else {
  //   track('guardian');
  //   areaOfImprovement = `Try going to bed and waking up at the same time every day even on weekends. It's one of the simplest habits that makes a real difference.`;
  // }
  const improvements = [];

  if (highPhone && (outcomePoor || !feelRested)) {
    track('statcan');
    improvements.push(`Continuous screen time without breaks may lead to eye strain, fatigue, and reduced focus. Taking regular breaks from screens every 30 minutes can help protect your vision and mental clarity.`);
  }
  if (medPhone && outcomePoor) {
    track('statcan');
    improvements.push(`Using your phone ${phone} before bed is likely making your sleep lighter. Cutting that down even by 30 minutes can make a real difference to how rested you feel.`);
  }
  if (shortSleep && outcomePoor) {
    track('aasm');
    improvements.push(`Sleeping less than 7 hours may increase the risk of stroke, poor health, and early death. Maintaining healthy sleep habits supports better physical and mental well-being.`);
  }
  if (shortSleep && outcomeGood) {  // ← polite version when they feel fine
    track('aasm');
    improvements.push(`That's great that you're feeling good! Though sleeping less than 7 hours can still carry risks over time. Research links it to increased chances of stroke, poor health, and early death. It may be worth gradually working toward 7–8 hours to protect your long-term well-being.`);
  }
  if (overwork && outcomePoor) {
    track('springer');
    improvements.push(`Working ${workhours} a day makes it hard for your body to switch off at night. Researcch suggest that working for longer hours increase the risk of stroke, heart disease, stress, fatigue, and long-term health complications.
      
    Try stopping all work at least 1 hour before bed even a short walk helps your body wind down.`);
  }
  if (overwork && outcomeGood) {  // ← polite version when they feel fine
    track('springer');
    improvements.push(`It's great you're feeling okay! That said, working ${workhours} a day can still quietly wear on your body over time. 
      
    Research suggests long working hours affect sleep quality and also increase the risk of stroke, heart disease, stress, fatigue, and long-term health complications. 
    
    Winding down at least 1 hour before bed can help protect you long term.`);
  }
  if (lateNight && outcomePoor) {
    track('guardian');
    improvements.push(`Going to bed ${bedtime} is quite late. Your body sleeps best within a regular window. Try shifting your bedtime just 15 minutes earlier each week.`);
  }

  if (bedtime === '9–10 pm') {
  improvements.push(`Great timing! Going to bed between 9–10 PM lets your body follow its natural rhythm where melatonin rises and your body starts preparing for deep sleep right on schedule.`);
  } else if (bedtime === '10–11 pm') {
    improvements.push(`Sleeping between 10–11 PM is a solid window. Your growth hormone activates and tissue repair begins around 10 PM, so you're giving your body the recovery time it needs.`);
  } else if (bedtime === '11 pm–midnight') {
    improvements.push(`Going to bed between 11 PM–midnight means you may be missing the liver detox and energy restoration phase that peaks around 11 PM. Try shifting your bedtime a little earlier.`);
  } else if (bedtime === 'After midnight') {
    improvements.push(`Going to bed after midnight means your brain misses its key toxin-clearing and memory processing window around 12 AM, and you may be cutting into your deepest recovery sleep at 1–2 AM. Even shifting 30 minutes earlier can help your body catch up.`);
  }


  if (hardSleep) {
    track('statcan');
    improvements.push(`You find it hard to fall asleep. Your brain needs a signal that it's time to rest. Try a calm, screen-free wind-down for 20 minutes before bed do reading, stretching, or just dim lights.`);
  }
  if (highPhone && outcomeGood) {
    track('statcan');
    improvements.push(`Even though you feel okay, more hours of screen time can still affect your eyes and focus over time. Continuous screen time without breaks may lead to eye strain, fatigue, and reduced focus. Taking regular breaks helps protect your long-term health.`);
  }
  if (longSleep && !feelEnergy) {
    track('springer');
    improvements.push(`Sleeping more than 9 hours may increase the risk of stroke, poor health, and early death. Maintaining healthy sleep habits supports better physical and mental well-being.`);
  }
  if (longSleep && feelEnergy) {  // ← polite version when they feel fine
    track('springer');
    improvements.push(`Glad you're feeling energised! Even so, consistently sleeping more than 9 hours has been linked to increased health risks including stroke and poor long-term health. It may be worth checking in with a doctor if long sleep is a regular pattern for you.`);
  }

  if (improvements.length === 0) {
    track('guardian');
    improvements.push(`Try going to bed and waking up at the same time every day even on weekends. It's one of the simplest habits that makes a real difference.`);
  }

  const areaOfImprovement = improvements.join('<br><br>');

  /* ══════════════════════════════════
     3. YOUR 3 STEPS  (replaces research bullets + 8-8-8 actions)
     — plain, personal, no citations inline
  ══════════════════════════════════ */
  const actions = [];

  if (goodSleep)       { track('aasm');     actions.push(`🛌 Keep sleeping ${sleep}, you're right in the healthy range`); }
  else if (shortSleep) { track('aasm');     actions.push(`🛌 Go to bed 15 minutes earlier each week until you reach 7–8 hours`); }
  else if (longSleep)  { track('springer'); actions.push(`🛌 Try to sleep regularly for about 7–8 hours each night. Good, deep sleep is usually more important than just sleeping for many hours`); }
  else                 { track('aasm');     actions.push(`🛌 Aim for 7–8 hours of sleep each night`); }

  if (noPhone)              { track('statcan'); actions.push(`📵 Keep your phone away before bed, that habit is working`); }
  else if (lowPhone)        { track('statcan'); actions.push(`📵 Try cutting your pre-bed phone time from ${phone} to under 30 minutes`); }
  else if (medPhone||highPhone) { track('statcan'); actions.push(`📵 Take a 10-minute screen break every 30 minutes to reduce eye strain and improve focus. Continuous screen time without breaks can lead to fatigue and reduced productivity.`); }
  else                      {                   actions.push(`📵 Put your phone away 30 minutes before you sleep`); }

  if (lateNight)      { track('guardian'); actions.push(`🌙 Try sleeping 15 minutes earlier each week, small changes are easier to maintain.`); }
  else if (overwork)  { track('springer'); actions.push(`💼 Finish studying or working at least an hour before bedtime so your mind can relax and prepare for sleep.`); }
  else if (hardSleep) {                    actions.push(`🌙 Spend 20–30 minutes before bed doing something calm with no screens`); }
  else                {                    actions.push(`🌙 Keep a consistent wake-up time even on weekends`); }

  /* ══════════════════════════════════
     4. CLOSING NOTE  (replaces whyItMatters + gentleReminder)
     — warm, one sentence, no citation
  ══════════════════════════════════ */
  let gentleReminder = '';
  if (outcomeGood) {
    gentleReminder = `You're already doing the important things right, consistency is all you need to keep feeling this good.`;
  } else if (highPhone) {
    gentleReminder = `More hours of screen time without breaks can lead to eye strain and fatigue. Short breaks every 30 minutes make a real difference to how you feel.`;
  } else if (shortSleep) {
    gentleReminder = `Small gradual changes are easier and more effective than sudden big changes.`;
  } else if (overwork) {
    gentleReminder = `Rest isn't the opposite of being productive, it's what makes productivity possible. Protect your wind-down time.`;
  } else if (lateNight) {
    gentleReminder = `You don't have to become a morning person, just nudge your bedtime a little earlier and your body will do the rest.`;
  } else {
    gentleReminder = `Small, consistent changes to your sleep routine tend to have a much bigger impact than you'd expect.`;
  }

  /* ── Collect only the sources actually cited ── */
  const sources = [...usedSources].map(k => SOURCES_DB[k]);

  return { whatsGoingWell, areaOfImprovement, actions, gentleReminder, sources };
}

function renderAIFeedback(section, fb) {
  const actionsHtml = (fb.actions || [])
    .map(a => `<div class="ai-action">${a}</div>`).join('');

  const sourcesHtml = (fb.sources && fb.sources.length) ? `
    <details class="ai-sources-toggle">
      <summary>📚 View sources</summary>
      <ol class="ai-sources-list">
        ${fb.sources.map(s => `<li>${s.full} <a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.url}</a></li>`).join('')}
      </ol>
    </details>` : '';

  section.innerHTML = `
    <div class="ai-feedback-card">
      <div class="ai-feedback-header">
        <span class="ai-feedback-badge">✨ Tips just for you</span>
      </div>

      <div class="ai-block ai-block-green">
        <div class="ai-block-label">✅ What's going well</div>
        <p>${fb.whatsGoingWell || ''}</p>
      </div>

      <div class="ai-block ai-block-amber">
        <div class="ai-block-label">⚠️ One thing to work on</div>
        <p>${fb.areaOfImprovement || ''}</p>
      </div>

      ${actionsHtml ? `
      <div class="ai-block ai-block-purple">
        <div class="ai-block-label">🎯 Your 3 steps</div>
        <div class="ai-actions">${actionsHtml}</div>
      </div>` : ''}

      ${fb.gentleReminder ? `
      <div class="ai-block ai-block-reminder">
        <p>${fb.gentleReminder}</p>
        <button class="tracker-nav-btn" onclick="showTab('tracker')" title="Go to Tracker">
          📊 Try the Tracker
        </button>
      </div>` : ''}

      ${sourcesHtml}
    </div>`;
}

function restartForm() {
  document.getElementById('results').innerHTML='';
  document.getElementById('results').style.display='none';
  document.getElementById('tracker-form').style.display='block';
  document.querySelectorAll('.opt,.lbtn').forEach(b=>b.classList.remove('sel'));
  Object.keys(answers).forEach(k=>delete answers[k]);
  Object.keys(lAnswers).forEach(k=>delete lAnswers[k]);
  document.getElementById('prog-bar').style.width='0%';
  document.getElementById('prog-txt').textContent='0 of 12';
  document.getElementById('submit-btn').disabled=true;
  window.scrollTo(0,0);
}

/* ═══════════════════════════════════════
   HABIT TRACKER CARDS
═══════════════════════════════════════ */
const HABITS=[
  {id:'sleep',name:'Sleep',icon:'🌙',unit:'hrs',color:'#534AB7'},
  {id:'work',name:'Work',icon:'💻',unit:'hrs',color:'#1D9E75'},
  {id:'exercise',name:'Exercise',icon:'🏃',unit:'mins',color:'#BA7517'},
  {id:'screen',name:'Screen time',icon:'📱',unit:'hrs',color:'#C0392B'},
  {id:'reading',name:'Reading',icon:'📚',unit:'mins',color:'#0F6E56'},
  {id:'meditation',name:'Meditation',icon:'🧘',unit:'mins',color:'#2EBF8E'},
];

const SOUNDS=[
  {id:'bell',name:'🔔 Bell'},
  {id:'chime',name:'🎵 Chime'},
  {id:'nature',name:'🌿 Nature'},
  {id:'soft',name:'🎶 Soft tone'},
];

let _alarmLoopTimer = null;
let _alarmLoopAudio = null;
let _audioCtx = null;

/* Call once on login (user gesture) to unlock AudioContext */
function unlockAudio() {
  if (_audioCtx) return;
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // play a silent blip to unlock it
    const g = _audioCtx.createGain(); g.gain.value = 0; g.connect(_audioCtx.destination);
    const o = _audioCtx.createOscillator(); o.connect(g);
    o.start(); o.stop(_audioCtx.currentTime + 0.001);
  } catch(e) { _audioCtx = null; }
}

function stopAlarmSound() {
  if (_alarmLoopTimer) { clearInterval(_alarmLoopTimer); _alarmLoopTimer = null; }
  if (_alarmLoopAudio) { try { _alarmLoopAudio.pause(); _alarmLoopAudio.currentTime = 0; } catch(e){} _alarmLoopAudio = null; }
}

function _beep(soundId) {
  try {
    const ctx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    const freqs = { bell:[523,659,784], chime:[880,1047,1319], nature:[440,554,659], soft:[349,440,523] };
    const f = freqs[soundId] || freqs.bell;
    osc.frequency.setValueAtTime(f[0], ctx.currentTime);
    osc.frequency.setValueAtTime(f[1], ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(f[2], ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    osc.start(); osc.stop(ctx.currentTime + 0.9);
  } catch(e) {}
}

function playSound(soundId, customDataUrl) {
  stopAlarmSound();
  if (customDataUrl) {
    _alarmLoopAudio = new Audio(customDataUrl);
    _alarmLoopAudio.loop = true;
    _alarmLoopAudio.play().catch(()=>{});
    return;
  }
  _beep(soundId);
  _alarmLoopTimer = setInterval(() => _beep(soundId), 1500);
}

function previewSound(soundId, customDataUrl) {
  if (customDataUrl) { const a = new Audio(customDataUrl); a.play().catch(()=>{}); return; }
  _beep(soundId);
}


function fmt12(val24){
  if(!val24)return{h:'',m:'',ampm:'AM'};
  const [hh,mm]=val24.split(':').map(Number);
  const ampm=hh<12?'AM':'PM';
  const h12=hh%12||12;
  return{h:String(h12),m:String(mm).padStart(2,'0'),ampm};
}
function to24(h,m,ampm){
  let hh=parseInt(h)||0;
  const mm=parseInt(m)||0;
  if(ampm==='AM'&&hh===12)hh=0;
  if(ampm==='PM'&&hh!==12)hh+=12;
  return hh.toString().padStart(2,'0')+':'+mm.toString().padStart(2,'0');
}
function calcDiff(t1,t2){
  if(!t1||!t2)return null;
  const [h1,m1]=t1.split(':').map(Number);
  const [h2,m2]=t2.split(':').map(Number);
  let diff=(h2*60+m2)-(h1*60+m1);
  if(diff<0)diff+=1440;
  const hrs=Math.floor(diff/60);
  const mins=diff%60;
  return hrs>0?(mins>0?`${hrs}h ${mins}m`:`${hrs}h`):(mins>0?`${mins}m`:null);
}

function ampmPicker(prefix,label,defaultVal){
  const f=fmt12(defaultVal);
  return `<div class="ampm-field">
    <label>${label}</label>
    <div class="ampm-wrap">
      <input class="ampm-hour" id="${prefix}-h" type="number" min="1" max="12" value="${f.h}" placeholder="12">
      <span class="ampm-sep">:</span>
      <input class="ampm-min" id="${prefix}-m" type="number" min="0" max="59" value="${f.m}" placeholder="00">
      <div class="ampm-toggle">
        <button type="button" class="ampm-btn${f.ampm==='AM'?' sel':''}" id="${prefix}-am" onclick="setAmPm('${prefix}','AM')" tabindex="-1">AM</button>
        <button type="button" class="ampm-btn${f.ampm==='PM'?' sel':''}" id="${prefix}-pm" onclick="setAmPm('${prefix}','PM')" tabindex="-1">PM</button>
      </div>
    </div>
  </div>`;
}

function setAmPm(prefix,val){
  document.getElementById(prefix+'-am').classList.toggle('sel',val==='AM');
  document.getElementById(prefix+'-pm').classList.toggle('sel',val==='PM');
  updateDiff(prefix.split('-log-')[0].replace(/^log-/,''));
}
function getAmPmVal(prefix){
  const h=document.getElementById(prefix+'-h')?.value||'12';
  const m=document.getElementById(prefix+'-m')?.value||'00';
  const ampm=document.getElementById(prefix+'-am')?.classList.contains('sel')?'AM':'PM';
  return to24(h,m,ampm);
}
function updateDiff(hId){
  const start=getAmPmVal(`log-${hId}-start`);
  const end=getAmPmVal(`log-${hId}-end`);
  const diff=calcDiff(start,end);
  const el=document.getElementById(`diff-${hId}`);
  if(el)el.textContent=diff?`⏱ Duration: ${diff}`:'';
  // auto-fill duration field
  if(diff){
    const [h1,m1]=start.split(':').map(Number);
    const [h2,m2]=end.split(':').map(Number);
    let mins=(h2*60+m2)-(h1*60+m1);
    if(mins<0)mins+=1440;
    const habit=HABITS.find(h=>h.id===hId);
    const durEl=document.getElementById('dur-'+hId);
    if(durEl&&habit){
      durEl.value=habit.unit==='hrs'?(mins/60).toFixed(1):mins;
    }
  }
}

function buildHabitCards(){
  const wrap=document.getElementById('habit-cards-wrap');
  if(!wrap) return;
  wrap.innerHTML='';
  const ud=getUserData();
  if(!ud) return;
  HABITS.forEach(h=>{
    const enabled=!!ud.habitEnabled[h.id];
    const alarm=ud.alarms[h.id]||{};
    const selSound=ud.selectedSounds[h.id]||'bell';
    const card=document.createElement('div');
    card.className='habit-card';
    card.id='habit-card-'+h.id;
    card.innerHTML=`
      <div class="habit-card-head">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="habit-icon-btn" style="background:${h.color}18;border-color:${h.color}40" onclick="toggleHabit('${h.id}')">${h.icon}</div>
          <div>
            <div class="habit-name">${h.name}</div>
            ${alarm.active?`<div class="alarm-mini-badge">⏰ ${fmt12(alarm.from).h}:${fmt12(alarm.from).m} ${fmt12(alarm.from).ampm} – ${fmt12(alarm.to).h}:${fmt12(alarm.to).m} ${fmt12(alarm.to).ampm}</div>`:'<div class="alarm-mini-badge muted">No alarm set</div>'}
          </div>
        </div>
        <div class="habit-card-actions">
          <button class="icon-action-btn ${alarm.active?'alarm-on':''}" title="Set alarm" onclick="toggleAlarmPanel('${h.id}')">⏰</button>
          <button class="icon-action-btn log-action-btn" title="Log now" onclick="toggleLogPanel('${h.id}')">✏️</button>
          <div class="habit-toggle" onclick="toggleHabit('${h.id}')">
            <span class="toggle-lbl" style="font-size:11px;color:var(--muted)">${enabled?'On':'Off'}</span>
            <div class="toggle-track ${enabled?'on':''}" id="toggle-${h.id}"><div class="toggle-knob"></div></div>
          </div>
        </div>
      </div>

      <div class="alarm-panel" id="alarm-panel-${h.id}" style="display:none">
        <div class="panel-section-lbl">⏰ Set alarm window</div>
        <div class="alarm-ampm-row">
          ${ampmPicker(`alarm-${h.id}-from`,'From',alarm.from||'08:00')}
          <div class="ampm-arrow">→</div>
          ${ampmPicker(`alarm-${h.id}-to`,'Until',alarm.to||'22:00')}
        </div>
        <div class="sound-row" style="margin-top:10px">
          <div class="sound-label">Alarm sound</div>
          <div class="sound-opts">
            ${SOUNDS.map(s=>`<button class="sound-btn ${selSound===s.id?'sel':''}" onclick="selectSound('${h.id}','${s.id}',this)">${s.name}</button>`).join('')}
            <button class="upload-sound-btn" onclick="document.getElementById('sound-upload-${h.id}').click()">📎 My sound</button>
            <input type="file" id="sound-upload-${h.id}" accept="audio/*" style="display:none" onchange="uploadSound('${h.id}',this)">
          </div>
        </div>
        <button class="set-alarm-btn" style="margin-top:10px" onclick="setAlarmAmPm('${h.id}')">${alarm.active?'Update alarm ⏰':'Set alarm ⏰'}</button>
        ${alarm.active?`<button class="set-alarm-btn" style="margin-top:6px;background:var(--red-lt);color:var(--red);border-color:var(--red)" onclick="clearAlarm('${h.id}')">Remove alarm</button>`:''}
      </div>

      <div class="log-panel" id="log-panel-${h.id}" style="display:none">
        <div class="panel-section-lbl">✏️ Log today's ${h.name.toLowerCase()}</div>
        <div class="log-ampm-row">
          ${ampmPicker(`log-${h.id}-start`,'Start time','09:00')}
          <div class="ampm-arrow">→</div>
          ${ampmPicker(`log-${h.id}-end`,'End time','10:00')}
        </div>
        <div class="diff-display" id="diff-${h.id}"></div>
        <div class="dur-manual-row">
          <div class="ampm-field" style="flex:1">
            <label>Or enter duration (${h.unit})</label>
            <input type="number" id="dur-${h.id}" min="0" max="24" step="0.5" placeholder="e.g. 7.5" class="dur-input">
          </div>
        </div>
        <textarea class="log-note" id="note-${h.id}" rows="2" placeholder="Optional note…"></textarea>
        <button class="log-btn" style="margin-top:8px" onclick="logHabit('${h.id}')">Save log ✓</button>
      </div>`;
    wrap.appendChild(card);

    // wire up live diff updates
    ['h','m','am','pm'].forEach(s=>{
      const elS=document.getElementById(`log-${h.id}-start-${s==='am'?'am':s==='pm'?'pm':s}`);
      const elE=document.getElementById(`log-${h.id}-end-${s==='am'?'am':s==='pm'?'pm':s}`);
      if(elS)elS.addEventListener('input',()=>updateDiff(h.id));
      if(elE)elE.addEventListener('input',()=>updateDiff(h.id));
    });
  });
}

function toggleAlarmPanel(id){
  const p=document.getElementById('alarm-panel-'+id);
  const l=document.getElementById('log-panel-'+id);
  if(l)l.style.display='none';
  if(p)p.style.display=p.style.display==='none'?'block':'none';
}
function toggleLogPanel(id){
  const p=document.getElementById('log-panel-'+id);
  const a=document.getElementById('alarm-panel-'+id);
  if(a)a.style.display='none';
  if(p){
    p.style.display=p.style.display==='none'?'block':'none';
    if(p.style.display==='block') updateDiff(id);
  }
}
function setAlarmAmPm(id){
  const ud=getUserData();if(!ud)return;
  const from=getAmPmVal(`alarm-${id}-from`);
  const to=getAmPmVal(`alarm-${id}-to`);
  ud.alarms[id]={from,to,active:true};
  saveUserData();
  buildHabitCards();
  // re-open alarm panel
  setTimeout(()=>{ const p=document.getElementById('alarm-panel-'+id); if(p)p.style.display='block'; },50);
}
function clearAlarm(id){
  const ud=getUserData();if(!ud)return;
  ud.alarms[id]={active:false};
  saveUserData();
  buildHabitCards();
}

function toggleHabit(id){
  const ud=getUserData();if(!ud)return;
  ud.habitEnabled[id]=!ud.habitEnabled[id];
  saveUserData();
  buildHabitCards();
}

function selectSound(habitId,soundId,btn){
  const ud=getUserData();if(!ud)return;
  ud.selectedSounds[habitId]=soundId;
  const container=btn.closest('.sound-opts');
  container.querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  previewSound(soundId,ud.customSounds[habitId]);
  saveUserData();
}

function uploadSound(habitId,input){
  const ud=getUserData();if(!ud)return;
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    ud.customSounds[habitId]=e.target.result;
    ud.selectedSounds[habitId]='custom';
    saveUserData();
    const card=document.getElementById('habit-card-'+habitId);
    if(card){
      card.querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
      const upBtn=input.previousElementSibling;
      if(upBtn){upBtn.textContent='✅ '+file.name.substring(0,16);}
    }
    previewSound('custom',e.target.result);
  };
  reader.readAsDataURL(file);
}

/* setAlarm replaced by setAlarmAmPm above */

async function logHabit(id) {
  const ud = getUserData(); if (!ud) return;
  const dur = parseFloat(document.getElementById('dur-' + id).value) || 0;
  const startT = getAmPmVal(`log-${id}-start`);
  const endT = getAmPmVal(`log-${id}-end`);
  const note = document.getElementById('note-' + id).value;
  const habit = HABITS.find(h => h.id === id);
  if (!dur && !startT) { alert('Please enter a duration or start time.'); return; }

  const entry = {
    id: Date.now(),
    habitId: id,
    habitName: habit.name,
    habitIcon: habit.icon,
    date: new Date().toISOString().split('T')[0],
    duration: dur,
    unit: habit.unit,
    startTime: startT,
    endTime: endT,
    note
  };

  // Save locally as before
  ud.logs.push(entry);
  saveUserData();

  // Also save to backend
  const token = localStorage.getItem('qt_token');
  if (token) {
    fetch(`${API_BASE}/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({
        habit_id:   entry.habitId,
        habit_name: entry.habitName,
        habit_icon: entry.habitIcon,
        date:       entry.date,
        duration:   entry.duration,
        unit:       entry.unit,
        note:       entry.note
      })
    }).catch(e => console.warn('Log sync failed', e));
  }

  document.getElementById('dur-' + id).value = '';
  document.getElementById('note-' + id).value = '';
  const btn = document.querySelector(`#habit-card-${id} .log-btn`);
  if (btn) { const orig = btn.textContent; btn.textContent = '✅ Saved!'; btn.style.background = 'var(--green-dk)'; setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1500); }
  renderCalendar();
  renderTrends();
  renderHistory();
  renderTrackerTodayLogs();
}
/* ═══════════════════════════════════════
   ALARM WATCHER
═══════════════════════════════════════ */
let alarmInterval=null;
let firedToday={};

function startAlarmWatcher(){
  alarmInterval=setInterval(checkAlarms,30000);
  checkAlarms();
}
function stopAlarmWatcher(){
  if(alarmInterval)clearInterval(alarmInterval);
  alarmInterval=null;
  firedToday={};
}
function checkAlarms(){
  const ud=getUserData();if(!ud)return;
  const now=new Date();
  const hm=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  const todayKey=new Date().toDateString();
  HABITS.forEach(h=>{
    const alarm=ud.alarms[h.id];
    if(!alarm||!alarm.active)return;
    const key=h.id+'_'+todayKey;
    if(firedToday[key])return;
    if(hm>=alarm.from&&hm<=alarm.to){
      firedToday[key]=true;
      triggerAlarm(h,ud.selectedSounds[h.id]||'bell',ud.customSounds[h.id]);
    }
  });
}
function triggerAlarm(habit,soundId,customData){
  playSound(soundId,customData);
  currentAlarmHabit=habit;
  document.getElementById('alarm-modal-icon').textContent=habit.icon;
  document.getElementById('alarm-modal-title').textContent=`Time to log ${habit.name}!`;
  document.getElementById('alarm-modal-sub').textContent=`Your ${habit.name.toLowerCase()} reminder is here. Ready to record?`;
  document.getElementById('alarm-modal').style.display='flex';
}
function dismissAlarm(){stopAlarmSound();document.getElementById('alarm-modal').style.display='none';currentAlarmHabit=null;}
function goLogFromAlarm(){
  document.getElementById('alarm-modal').style.display='none';
  if(currentAlarmHabit){
    showTab('tracker');
    setTimeout(()=>{
      const el=document.getElementById('dur-'+currentAlarmHabit.id);
      if(el)el.focus();
    },300);
  }
  currentAlarmHabit=null;
}

/* ═══════════════════════════════════════
   CALENDAR
═══════════════════════════════════════ */
let calYear=new Date().getFullYear();
let calMonth=new Date().getMonth();
let selectedDay=null;
let importedCalEvents=[];

function uploadCalendar(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const text=e.target.result;
    const events=parseICS(text);
    importedCalEvents=importedCalEvents.concat(events);
    renderCalendar();
    alert(`✅ Imported ${events.length} events from calendar.`);
  };
  reader.readAsText(file);
}

function parseICS(text){
  const events=[];
  const blocks=text.split('BEGIN:VEVENT');
  blocks.slice(1).forEach(block=>{
    const summaryM=block.match(/SUMMARY:(.+)/);
    const dateM=block.match(/DTSTART[^:]*:(\d{8})/);
    if(summaryM&&dateM){
      const d=dateM[1];
      events.push({
        title:summaryM[1].trim(),
        date:`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`
      });
    }
  });
  return events;
}

function changeMonth(delta){
  calMonth+=delta;
  if(calMonth>11){calMonth=0;calYear++;}
  if(calMonth<0){calMonth=11;calYear--;}
  renderCalendar();
}

function renderCalendar(){
  const label=document.getElementById('cal-month-label');
  const grid=document.getElementById('cal-grid');
  if(!label||!grid)return;
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  label.textContent=months[calMonth]+' '+calYear;
  grid.innerHTML='';
  const days=['Su','Mo','Tu','We','Th','Fr','Sa'];
  days.forEach(d=>{
    const el=document.createElement('div');
    el.className='cal-day-name';el.textContent=d;grid.appendChild(el);
  });
  const first=new Date(calYear,calMonth,1).getDay();
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const today=new Date();
  const todayStr=today.toISOString().split('T')[0];
  const ud=getUserData();
  const logDates=new Set(ud?ud.logs.map(l=>l.date):[]);
  const futureDates=new Set([...logDates].filter(d=>d>todayStr));

  for(let i=0;i<first;i++){
    const prev=new Date(calYear,calMonth,-(first-i-1));
    const el=document.createElement('div');
    el.className='cal-day other-month';
    el.textContent=prev.getDate();
    grid.appendChild(el);
  }
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el=document.createElement('div');
    el.className='cal-day';
    el.textContent=d;
    if(today.getFullYear()===calYear&&today.getMonth()===calMonth&&today.getDate()===d) el.classList.add('today');
    if(logDates.has(dateStr)) el.classList.add('has-log');
    if(futureDates.has(dateStr)) el.classList.add('has-plan');
    if(selectedDay===dateStr) el.classList.add('selected');
    el.onclick=()=>{selectedDay=dateStr;renderCalendar();showDayLogs(dateStr);};
    grid.appendChild(el);
  }
  if(selectedDay)showDayLogs(selectedDay);
}

function showDayLogs(dateStr){
  const panel=document.getElementById('day-log-panel');
  const title=document.getElementById('day-log-title');
  const entries=document.getElementById('day-log-entries');
  const ud=getUserData();
  const d=new Date(dateStr+'T12:00:00');
  const todayStr=new Date().toISOString().split('T')[0];
  const isFuture=dateStr>todayStr;
  const opts={weekday:'long',month:'long',day:'numeric'};
  title.textContent=d.toLocaleDateString('en-US',opts)+(isFuture?' 🔮 — Planned':'');
  entries.innerHTML='';
  const dayLogs=(ud?ud.logs:[]).filter(l=>l.date===dateStr);
  const calEvts=importedCalEvents.filter(e=>e.date===dateStr);

  if(!dayLogs.length&&!calEvts.length){
    if(isFuture){
      entries.innerHTML=`<div style="font-size:13px;color:var(--hint);padding:8px 0 4px">No plans yet. Go to <strong>Tracker</strong> and pick this date to schedule something.</div>
      <button class="log-btn" style="margin-top:6px" onclick="lfGoToDate('${dateStr}')">＋ Plan this day →</button>`;
    } else {
      entries.innerHTML=`<div style="font-size:13px;color:var(--hint);padding:8px 0">No logs recorded for this day.</div>`;
    }
    return;
  }

  dayLogs.forEach(l=>{
    const item=document.createElement('div');
    item.className='log-entry-item';
    item.innerHTML=`<div class="log-entry-icon">${l.habitIcon}</div>
      <div class="log-entry-meta">
        <div class="log-entry-habit">${l.habitName}${l.isQuickAlarm?'<span class="qa-history-badge">⏰ Alarm</span>':''}</div>
        <div class="log-entry-dur">${l.startTime?`${l.startTime}–${l.endTime||'?'} · `:''}${l.duration} ${l.unit}</div>
        ${l.note?`<div class="log-entry-note">💬 ${l.note}</div>`:''}
      </div>
      <button onclick="deleteLog(${l.id})" style="background:none;border:none;cursor:pointer;color:var(--hint);font-size:16px;padding:2px 4px;flex-shrink:0" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--hint)'">🗑</button>`;
    entries.appendChild(item);
  });
  
  // Show calendar events with option to convert to schedule
  calEvts.forEach(e=>{
    const item=document.createElement('div');
    item.className='log-entry-item';
    item.innerHTML=`<div class="log-entry-icon">📅</div>
      <div class="log-entry-meta">
        <div class="log-entry-habit">${e.title}</div>
        <div class="log-entry-dur">Calendar event</div>
      </div>
      <button class="log-btn" style="padding:6px 10px;font-size:11px;margin:0" onclick="convertCalEventToSchedule('${e.title}','${dateStr}')">＋ Add to Tracker</button>`;
    entries.appendChild(item);
  });
  
  if(isFuture){
    const addBtn=document.createElement('button');
    addBtn.className='log-btn';
    addBtn.style.marginTop='8px';
    addBtn.textContent='＋ Add more to this day →';
    addBtn.onclick=()=>lfGoToDate(dateStr);
    entries.appendChild(addBtn);
  }
}

/* Convert calendar event to schedule */
function convertCalEventToSchedule(title, date) {
  const ud = getUserData();
  if (!ud) return;
  if (!ud.schedules) ud.schedules = [];
  
  // Try to match category from title
  let category = 'Other';
  const titleLower = title.toLowerCase();
  const catMap = {
    'sleep': 'Sleep', 'meeting': 'Work', 'work': 'Work', 'class': 'Studies',
    'study': 'Studies', 'exercise': 'Exercise', 'gym': 'Exercise', 'run': 'Exercise',
    'meal': 'Meals', 'lunch': 'Meals', 'dinner': 'Meals', 'breakfast': 'Meals',
    'reading': 'Reading', 'book': 'Reading', 'meditation': 'Meditation', 'yoga': 'Meditation'
  };
  for (const [key, val] of Object.entries(catMap)) {
    if (titleLower.includes(key)) { category = val; break; }
  }
  
  // Default time 9am-10am
  const entry = {
    id: Date.now(),
    category,
    date,
    fromTime: '09:00',
    toTime: '10:00',
    durationMins: 60,
    tasks: [],
    createdAt: new Date().toISOString(),
    fromCal: true,
    calTitle: title
  };
  
  ud.schedules.push(entry);
  saveUserData();
  renderTrackerSchedules();
  alert(`✅ Added "${title}" to your Tracker schedules!`);
}

/* ═══════════════════════════════════════
   CALENDAR 2  (mini, inside Tracker tab)
═══════════════════════════════════════ */
let cal2Year=new Date().getFullYear();
let cal2Month=new Date().getMonth();
let selectedDay2=null;

function changeMonth2(delta){
  cal2Month+=delta;
  if(cal2Month>11){cal2Month=0;cal2Year++;}
  if(cal2Month<0){cal2Month=11;cal2Year--;}
  renderCalendar2();
}

function renderCalendar2(){
  const label=document.getElementById('cal2-month-label');
  const grid=document.getElementById('cal2-grid');
  if(!label||!grid)return;
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  label.textContent=months[cal2Month]+' '+cal2Year;
  grid.innerHTML='';
  const days=['Su','Mo','Tu','We','Th','Fr','Sa'];
  days.forEach(d=>{const el=document.createElement('div');el.className='cal-day-name';el.textContent=d;grid.appendChild(el);});
  const first=new Date(cal2Year,cal2Month,1).getDay();
  const daysInMonth=new Date(cal2Year,cal2Month+1,0).getDate();
  const today=new Date();
  const ud=getUserData();
  const logDates=new Set(ud?ud.logs.map(l=>l.date):[]);
  for(let i=0;i<first;i++){const el=document.createElement('div');el.className='cal-day other-month';el.textContent=new Date(cal2Year,cal2Month,-(first-i-1)).getDate();grid.appendChild(el);}
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=`${cal2Year}-${String(cal2Month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el=document.createElement('div');
    el.className='cal-day';
    el.textContent=d;
    if(today.getFullYear()===cal2Year&&today.getMonth()===cal2Month&&today.getDate()===d) el.classList.add('today');
    if(logDates.has(dateStr)) el.classList.add('has-log');
    if(selectedDay2===dateStr) el.classList.add('selected');
    el.onclick=()=>{selectedDay2=dateStr;renderCalendar2();showDayLogs2(dateStr);};
    grid.appendChild(el);
  }
  if(selectedDay2)showDayLogs2(selectedDay2);
}

function showDayLogs2(dateStr){
  const panel=document.getElementById('day2-log-panel');
  const title=document.getElementById('day2-log-title');
  const entries=document.getElementById('day2-log-entries');
  if(!panel||!title||!entries)return;
  panel.style.display='block';
  const d=new Date(dateStr+'T12:00:00');
  const isToday=dateStr===new Date().toISOString().split('T')[0];
  const isFuture=dateStr>new Date().toISOString().split('T')[0];
  title.textContent=d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})+(isFuture?' 🔮':'');
  entries.innerHTML='';
  const ud=getUserData();
  const dayLogs=(ud?ud.logs:[]).filter(l=>l.date===dateStr);
  if(!dayLogs.length){
    if(isFuture){
      entries.innerHTML=`<div style="font-size:13px;color:var(--hint);padding:8px 0">No plans yet for this day. Use the log form above to schedule an activity.</div>`;
    } else {
      entries.innerHTML=`<div style="font-size:13px;color:var(--hint);padding:8px 0">Nothing logged for this day.</div>`;
    }
    return;
  }
  dayLogs.forEach(l=>{
    const item=document.createElement('div');
    item.className='log-entry-item';
    // For display: prefer displayUnit; convert hrs→mins when displayUnit was mins
    const dispUnit=l.displayUnit||l.unit||'hrs';
    const dispDur=dispUnit==='mins'&&l.unit==='hrs'
      ? Math.round(l.duration*60)
      : l.duration;
    item.innerHTML=`<div class="log-entry-icon">${l.habitIcon}</div>
      <div class="log-entry-meta">
        <div class="log-entry-habit">${l.habitName}</div>
        <div class="log-entry-dur">${l.startTime?`${l.startTime}–${l.endTime||'?'} · `:''}${dispDur} ${dispUnit}</div>
        ${l.note?`<div class="log-entry-note">💬 ${l.note}</div>`:''}
      </div>
      <button onclick="deleteLog(${l.id})" style="background:none;border:none;cursor:pointer;color:var(--hint);font-size:16px;padding:2px 4px;flex-shrink:0" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--hint)'">🗑</button>`;
    entries.appendChild(item);
  });
}

/* ═══════════════════════════════════════
   NEW LOG FORM  (Tracker tab)
═══════════════════════════════════════ */
let _lfCat='';
let _lfIcon='📋';
let _lfSound='bell';
let _lfCustomSound=null;

// Habit id map for trends compatibility
const LF_CAT_HABIT_MAP={
  'Sleep':'sleep','Work':'work','Exercise':'exercise','Screen Use':'screen',
  'Reading':'reading','Meditation':'meditation','Meals':'meals','Studies':'studies'
};
const LF_CAT_UNIT_MAP={
  'Sleep':'hrs','Work':'hrs','Screen Use':'hrs','Meals':'hrs',
  'Exercise':'mins','Reading':'mins','Meditation':'mins','Studies':'mins'
};

function lfInit(){
  // Set today's date
  const dateEl=document.getElementById('lf-date');
  if(dateEl) dateEl.value=new Date().toISOString().split('T')[0];
  // Wire live diff only if elements exist
  ['lf-start-h','lf-start-m','lf-end-h','lf-end-m'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.addEventListener('input',lfUpdateDiff);
  });
  lfUpdateDiff();
}

document.addEventListener('DOMContentLoaded', lfInit);

function lfSetAmPm(side,val){
  document.getElementById(`lf-${side}-am`).classList.toggle('sel',val==='AM');
  document.getElementById(`lf-${side}-pm`).classList.toggle('sel',val==='PM');
  lfUpdateDiff();
}
function _lfGetTime(side){
  const hEl=document.getElementById(`lf-${side}-h`);
  const mEl=document.getElementById(`lf-${side}-m`);
  const amEl=document.getElementById(`lf-${side}-am`);
  if(!hEl||!mEl||!amEl) return null;
  const h=hEl.value||'8';
  const m=mEl.value||'00';
  const isAM=amEl.classList.contains('sel');
  return to24(h,m,isAM?'AM':'PM');
}
function lfUpdateDiff(){
  const from=_lfGetTime('start');
  const to=_lfGetTime('end');
  if(from===null||to===null) return;
  const diff=calcDiff(from,to);
  const el=document.getElementById('lf-diff');
  if(el) el.textContent=diff?`⏱ Duration: ${diff}`:'';
}
function lfSelectCat(btn){
  document.getElementById('lf-cats').querySelectorAll('.lf-cat-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  _lfCat=btn.dataset.cat;
  _lfIcon=btn.dataset.icon||'📋';
  const customInput=document.getElementById('lf-custom');
  if(!_lfCat){customInput.style.display='block';customInput.focus();}
  else{customInput.style.display='none';customInput.value='';}
}
function lfCustomTyped(){
  _lfCat='';
  document.getElementById('lf-cats').querySelectorAll('.lf-cat-btn').forEach(b=>b.classList.remove('sel'));
}
function lfToggleReminder(){
  const checked=document.getElementById('lf-reminder-check').checked;
  document.getElementById('lf-reminder-sound').style.display=checked?'block':'none';
}
function lfSelectSound(btn){
  btn.closest('.sound-opts').querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  _lfSound=btn.dataset.sound;
  _lfCustomSound=null;
  previewSound(_lfSound,null);
}
function lfUploadSound(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{_lfCustomSound=e.target.result;_lfSound='custom';previewSound('custom',_lfCustomSound);};
  reader.readAsDataURL(file);
}
function lfSaveLog(){
  const customText=document.getElementById('lf-custom').value.trim();
  const cat=customText||_lfCat;
  const icon=customText?'✍':_lfIcon;
  const msg=document.getElementById('lf-msg');
  const dateVal=document.getElementById('lf-date').value;

  if(!cat){msg.textContent='Please pick a category.';msg.className='auth-msg err';return;}
  if(!dateVal){msg.textContent='Please pick a date.';msg.className='auth-msg err';return;}

  const from=_lfGetTime('start');
  const to=_lfGetTime('end');
  const diff=calcDiff(from,to);
  const [h1,m1]=from.split(':').map(Number);
  const [h2,m2]=to.split(':').map(Number);
  let durationMins=(h2*60+m2)-(h1*60+m1);
  if(durationMins<0)durationMins+=1440;
  const unit=LF_CAT_UNIT_MAP[cat]||'hrs';
  const duration=unit==='hrs'?+(durationMins/60).toFixed(4):durationMins;
  const habitId=LF_CAT_HABIT_MAP[cat]||cat.toLowerCase().replace(/\s+/g,'-');

  const ud=getUserData();if(!ud)return;

  const entry={
    id:Date.now(),
    habitId,
    habitName:cat,
    habitIcon:icon,
    date:dateVal,
    duration: +(durationMins/60).toFixed(4),  // always hrs — consistent with stopwatch
    unit: 'hrs',                               // unified unit for trend aggregation
    displayUnit: unit,                         // keep original unit for display in history
    startTime:_aaFmtDisplay?_aaFmtDisplay(from):from,
    endTime:_aaFmtDisplay?_aaFmtDisplay(to):to,
    note:document.getElementById('lf-note').value.trim()
  };
  ud.logs.push(entry);

  // If reminder checked, save alarm
  const hasReminder=document.getElementById('lf-reminder-check').checked;
  if(hasReminder){
    if(!ud.quickAlarms)ud.quickAlarms=[];
    ud.quickAlarms.push({
      id:entry.id,date:dateVal,fromTime:from,toTime:to,
      fromDisplay:entry.startTime,toDisplay:entry.endTime,
      duration:diff||'—',durationMins,durationHrs:+(durationMins/60).toFixed(2),
      category:cat,sound:_lfSound,createdAt:new Date().toISOString()
    });
    _scheduleQuickAlarm({id:entry.id,date:dateVal,fromTime:from,toTime:to,
      fromDisplay:entry.startTime,toDisplay:entry.endTime,
      duration:diff||'—',category:cat,sound:_lfSound});
  }

  saveUserData();

  msg.textContent=`✅ Logged! ${cat} · ${diff||duration+' '+unit}`;
  msg.className='auth-msg ok';

  // Reset form partially
  document.getElementById('lf-note').value='';
  document.getElementById('lf-reminder-check').checked=false;
  document.getElementById('lf-reminder-sound').style.display='none';

  renderCalendar2();
  renderCalendar();
  renderTrends();
  renderHistory();

  // Show it on mini cal
  selectedDay2=dateVal;
  cal2Year=parseInt(dateVal.split('-')[0]);
  cal2Month=parseInt(dateVal.split('-')[1])-1;
  renderCalendar2();

  setTimeout(()=>{msg.textContent='';msg.className='auth-msg';},3000);
}

/* ═══════════════════════════════════════
   TRENDS & CHARTS
═══════════════════════════════════════ */
let chartInstances={};

/* Palette for multi-line chart — one colour per activity */
const TREND_PALETTE=[
  '#1D9E75','#534AB7','#BA7517','#C0392B','#2980B9','#8E44AD','#16A085','#D35400','#27AE60','#E91E8C'
];

/* Track which activity is currently focused (null = show all) */
let _trendFocusKey = null;

/* Multi-select state for Tableau-style filtering */
let _trendSelectedKeys = null; // null = all selected
let _trendDateFrom = null;
let _trendDateTo = null;

/* ═══════════════════════════════════════
   TODAY'S SNAPSHOT — interactive bar chart
═══════════════════════════════════════ */
function buildTodaySnapshot(logs, byActivity, allDates, palette, activityKeys) {
  const card = document.createElement('div');
  card.className = 'chart-card';
  card.id = 'today-snapshot-card';

  // Get today's ISO date string
  const todayISO = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

  // Collect today's data per activity
  const todayItems = activityKeys.map((key, idx) => {
    const act = byActivity[key];
    const hrs = act.byDate[todayISO] || 0;
    const color = palette[idx % palette.length];
    return { key, name: act.name, icon: act.icon, hrs, color };
  }).filter(it => it.hrs > 0);

  // Also check if today has any data at all for a "no data today" state
  const hasTodayData = todayItems.length > 0;

  // Formatted today label
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Compute max for bar scaling
  const maxHrs = hasTodayData ? Math.max(...todayItems.map(it => it.hrs)) : 1;

  // Build the snapshot header with hamburger to filter by habit
  card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;flex-wrap:wrap;gap:8px">
      <div>
        <div class="chart-title" style="margin-bottom:2px">📅 Today's Snapshot</div>
        <div class="chart-sub" style="margin-bottom:0">${todayLabel}</div>
      </div>
      <div style="position:relative" id="snap-hamburger-wrap">
        <button type="button" id="snap-hamburger-btn" style="padding:6px 11px;border:1px solid var(--border);border-radius:var(--r);background:var(--surf);color:var(--text);cursor:pointer;font-size:12px;font-weight:500;display:flex;align-items:center;gap:5px">
          ☰ <span id="snap-filter-label">All habits</span>
        </button>
        <div id="snap-dropdown" style="position:absolute;top:calc(100% + 4px);right:0;background:var(--surf);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:150;min-width:170px;display:none;flex-direction:column;overflow:hidden"></div>
      </div>
    </div>
    <div id="snap-bars-wrap" style="margin-top:14px"></div>
    <div id="snap-total-row" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px"></div>`;

  // Function to render bars (called on filter change)
  function renderBars(filterKey) {
    const barsWrap = card.querySelector('#snap-bars-wrap');
    const totalRow = card.querySelector('#snap-total-row');
    const filterLabel = card.querySelector('#snap-filter-label');

    const items = filterKey ? todayItems.filter(it => it.key === filterKey) : todayItems;

    if (filterLabel) {
      if (!filterKey) {
        filterLabel.textContent = 'All habits';
      } else {
        const found = todayItems.find(it => it.key === filterKey);
        filterLabel.textContent = found ? found.icon + ' ' + found.name : 'All habits';
      }
    }

    if (!hasTodayData || items.length === 0) {
      barsWrap.innerHTML = `<div style="text-align:center;padding:28px 16px;color:var(--hint);font-size:13px">
        <div style="font-size:28px;margin-bottom:8px">🌅</div>
        <div>Nothing logged today yet.</div>
        <div style="font-size:11px;margin-top:4px">Track activities in the Tracker tab to see them here.</div>
      </div>`;
      totalRow.innerHTML = '';
      return;
    }

    const localMax = Math.max(...items.map(it => it.hrs));
    let html = '';
    items.forEach(it => {
      const pct = localMax > 0 ? (it.hrs / localMax) * 100 : 0;
      const displayHrs = it.hrs >= 1
        ? it.hrs.toFixed(1) + ' h'
        : Math.round(it.hrs * 60) + ' m';
      const barPct = Math.max(pct, 3); // min 3% so bar is always visible
      html += `
        <div class="snap-bar-row" data-key="${it.key}" style="margin-bottom:11px;cursor:pointer" title="Click to focus in Activity Trends">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:12px;font-weight:600;color:var(--text)">${it.icon} ${it.name}</span>
            <span style="font-size:11px;font-weight:700;color:${it.color}">${displayHrs}</span>
          </div>
          <div style="background:var(--surf2);border-radius:6px;height:10px;overflow:hidden;position:relative">
            <div class="snap-bar-fill" style="
              height:100%;
              width:${barPct.toFixed(1)}%;
              background:${it.color};
              border-radius:6px;
              transition:width .5s cubic-bezier(.4,0,.2,1);
              position:relative;
            ">
              <div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent 60%,rgba(255,255,255,0.18));border-radius:6px"></div>
            </div>
          </div>
        </div>`;
    });
    barsWrap.innerHTML = html;

    // Total row
    const totalHrs = items.reduce((s, it) => s + it.hrs, 0);
    const totalDisplay = totalHrs >= 1 ? totalHrs.toFixed(1) + ' hrs' : Math.round(totalHrs * 60) + ' min';
    const actCount = items.length;
    totalRow.innerHTML = `
      <span style="font-size:11px;color:var(--hint)">${actCount} activit${actCount === 1 ? 'y' : 'ies'} logged today</span>
      <span style="font-size:13px;font-weight:700;color:var(--text)">Total: ${totalDisplay}</span>`;

    // Wire bar-row clicks → focus Activity Trends chart
    barsWrap.querySelectorAll('.snap-bar-row').forEach(row => {
      row.addEventListener('mouseenter', () => { row.style.opacity = '0.8'; });
      row.addEventListener('mouseleave', () => { row.style.opacity = '1'; });
      row.addEventListener('click', () => {
        const k = row.dataset.key;
        // Scroll to trends chart and focus
        if (typeof _trendFocusKey !== 'undefined') {
          // applyFocus is scoped inside renderTrends, so we toggle via a custom event
          document.dispatchEvent(new CustomEvent('snapshot-focus', { detail: { key: k } }));
          // Smooth-scroll to activity trends card
          const trendCard = document.querySelector('#chart-combined-trends');
          if (trendCard) trendCard.closest('.chart-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  // Build dropdown
  function buildDropdown() {
    const dd = card.querySelector('#snap-dropdown');
    dd.innerHTML = '';

    // All option
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.textContent = '🗂 All habits';
    allBtn.style.cssText = 'padding:10px 14px;text-align:left;border:none;background:var(--green-lt);color:var(--text);cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);transition:background .15s';
    allBtn.onmouseover = () => allBtn.style.background = 'var(--green-lt)';
    allBtn.onmouseout = () => allBtn.style.background = 'var(--green-lt)';
    allBtn.onclick = () => { renderBars(null); dd.style.display = 'none'; buildDropdown(); };
    dd.appendChild(allBtn);

    // Per-activity (use all logged activities, not just today)
    activityKeys.forEach((key, idx) => {
      const act = byActivity[key];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = act.icon + ' ' + act.name;
      btn.style.cssText = 'padding:10px 14px;text-align:left;border:none;background:transparent;color:var(--text);cursor:pointer;font-size:13px;transition:background .15s';
      btn.onmouseover = () => btn.style.background = 'var(--green-lt)';
      btn.onmouseout = () => btn.style.background = 'transparent';
      btn.onclick = () => { renderBars(key); dd.style.display = 'none'; buildDropdown(); };
      dd.appendChild(btn);
    });
  }

  buildDropdown();
  renderBars(null);

  // Hamburger toggle
  setTimeout(() => {
    const btn = card.querySelector('#snap-hamburger-btn');
    const dd = card.querySelector('#snap-dropdown');
    if (btn && dd) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dd.style.display = dd.style.display === 'none' ? 'flex' : 'none';
      });
      const closeSnap = (e) => {
        const wrap = card.querySelector('#snap-hamburger-wrap');
        if (wrap && !wrap.contains(e.target)) dd.style.display = 'none';
      };
      if (window._snapDropdownListener) document.removeEventListener('click', window._snapDropdownListener);
      window._snapDropdownListener = closeSnap;
      document.addEventListener('click', closeSnap);
    }
  }, 0);

  return card;
}



async function renderTrends(){
  const content=document.getElementById('trends-content');
  if(!content)return;

  // ── Fetch logs from backend ──
  try {
    const token = localStorage.getItem('qt_token');
    if (token) {
      const res = await fetch(`${API_BASE}/logs`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const dbLogs = await res.json();
      if (Array.isArray(dbLogs) && dbLogs.length) {
        const ud = getUserData();
        if (ud) {
          dbLogs.forEach(l => {
            const exists = ud.logs.find(local => local.id === l.id);
            if (!exists) ud.logs.push({
              id: l.id,
              habitId: l.habit_id,
              habitName: l.habit_name,
              habitIcon: l.habit_icon || '📋',
              date: normalizeDateValue(l.date),
              duration: l.duration,
              unit: l.unit || 'hrs',
              note: l.note
            });
          });
          normalizeLogDates(ud);
          saveUserData();
        }
      }
    }
  } catch(e) {
    console.warn('Could not fetch logs from backend:', e);
  }

  const ud=getUserData();
  if(!ud||!ud.logs.length){
    content.innerHTML=`<div class="no-data-msg"><div class="no-data-icon">📊</div><div>No habit logs yet.</div><div style="margin-top:6px;font-size:12px">Log your habits in the Tracker tab to see trends here.</div></div>`;
    return;
  }

  Object.values(chartInstances).forEach(c=>{try{c.destroy();}catch(e){}});
  chartInstances={};
  content.innerHTML='';

  /* ── 1. Build per-activity daily aggregates ── */
  const byActivity={};
  ud.logs.forEach(l=>{
    const key=l.habitId||l.habitName.toLowerCase().replace(/\s+/g,'-');
    if(!byActivity[key]) byActivity[key]={name:l.habitName,icon:l.habitIcon||'📋',byDate:{}};
    const durationHrs = l.unit==='mins' ? l.duration/60 : l.duration;
    byActivity[key].byDate[l.date]=(byActivity[key].byDate[l.date]||0)+durationHrs;
  });

  const activityKeys=Object.keys(byActivity);
  if(!activityKeys.length){
    content.innerHTML=`<div class="no-data-msg"><div class="no-data-icon">📊</div><div>No activity logs yet.</div></div>`;
    return;
  }

  /* ── 2. Full date range ── */
  const allDatesSet=new Set();
  activityKeys.forEach(k=>Object.keys(byActivity[k].byDate).forEach(d=>allDatesSet.add(d)));
  const sparseList=[...allDatesSet].sort();
  const fullDates=[];
  if(sparseList.length>0){
    const cur=new Date(sparseList[0]+'T12:00');
    const last=new Date(sparseList[sparseList.length-1]+'T12:00');
    while(cur<=last){ fullDates.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate()+1); }
  }

  // Init date range state to full range
  if(!_trendDateFrom) _trendDateFrom = fullDates[0]||'';
  if(!_trendDateTo)   _trendDateTo   = fullDates[fullDates.length-1]||'';
  if(!_trendSelectedKeys) _trendSelectedKeys = new Set(activityKeys);

  /* ── 3. Build all datasets ── */
  const allDatasets=activityKeys.map((key,idx)=>{
    const act=byActivity[key];
    const color=TREND_PALETTE[idx%TREND_PALETTE.length];
    return{
      label:`${act.icon} ${act.name}`,
      data: fullDates.map(d=>act.byDate[d]!=null?+act.byDate[d].toFixed(2):null),
      borderColor:color,
      backgroundColor:color+'22',
      pointBackgroundColor:color,
      pointRadius:4,
      pointHoverRadius:7,
      tension:.35,
      fill:false,
      spanGaps:true,
      _key:key
    };
  });

  /* ── TODAY'S SNAPSHOT ── */
  const snapshotCard = buildTodaySnapshot(ud.logs, byActivity, fullDates, TREND_PALETTE, activityKeys);
  content.appendChild(snapshotCard);

  /* ── 4. Tableau-style filter bar card ── */
  const filterCard = document.createElement('div');
  filterCard.className = 'chart-card';
  filterCard.style.cssText = 'padding:14px 16px';
  filterCard.innerHTML = `
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
      <span style="font-size:13px;font-weight:500;color:var(--text)">📅 Date range</span>
      <input type="date" id="trend-date-from" value="${_trendDateFrom}" style="padding:5px 8px;border:1px solid var(--border);border-radius:var(--r);background:var(--surf);color:var(--text);font-size:12px">
      <span style="font-size:12px;color:var(--muted)">to</span>
      <input type="date" id="trend-date-to" value="${_trendDateTo}" style="padding:5px 8px;border:1px solid var(--border);border-radius:var(--r);background:var(--surf);color:var(--text);font-size:12px">
      <div style="display:flex;gap:6px;margin-left:4px">
        <button type="button" class="trend-quick-btn" data-days="7" style="padding:4px 10px;border:1px solid var(--border);border-radius:20px;background:var(--surf);color:var(--muted);cursor:pointer;font-size:11px">7d</button>
        <button type="button" class="trend-quick-btn" data-days="30" style="padding:4px 10px;border:1px solid var(--border);border-radius:20px;background:var(--surf);color:var(--muted);cursor:pointer;font-size:11px">30d</button>
        <button type="button" class="trend-quick-btn" data-days="90" style="padding:4px 10px;border:1px solid var(--border);border-radius:20px;background:var(--surf);color:var(--muted);cursor:pointer;font-size:11px">90d</button>
        <button type="button" class="trend-quick-btn" data-days="0" style="padding:4px 10px;border:1px solid var(--border);border-radius:20px;background:var(--surf);color:var(--muted);cursor:pointer;font-size:11px">All</button>
      </div>
    </div>
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px">
      <span style="font-size:13px;font-weight:500;color:var(--text)">🏃 Activity</span>
      <div style="position:relative" id="trend-multi-wrap">
        <button type="button" id="trend-multi-btn" style="padding:5px 12px;border:1px solid var(--border);border-radius:var(--r);background:var(--surf);color:var(--text);font-size:13px;font-family:'Sora',sans-serif;cursor:pointer;display:flex;align-items:center;gap:6px;min-width:160px;justify-content:space-between">
          <span id="trend-multi-label">☰ All habits</span><span style="font-size:10px;opacity:.5">▾</span>
        </button>
        <div id="trend-multi-dropdown" style="display:none;position:absolute;top:calc(100% + 4px);left:0;background:var(--surf);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:200;min-width:190px;overflow:hidden;flex-direction:column">
          <label style="display:flex;align-items:center;gap:8px;padding:9px 13px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);background:var(--green-lt,#f0faf5)">
            <input type="checkbox" id="trend-cb-all" checked style="accent-color:var(--green)"> <span>☰ All habits</span>
          </label>
          ${activityKeys.map((key,i)=>{const act=byActivity[key];const color=TREND_PALETTE[i%TREND_PALETTE.length];return `<label style="display:flex;align-items:center;gap:8px;padding:8px 13px;cursor:pointer;font-size:13px;transition:background .12s" onmouseover="this.style.background='var(--green-lt,#f0faf5)'" onmouseout="this.style.background='transparent'"><input type="checkbox" class="trend-cb-act" data-key="${key}" checked style="accent-color:${color}"> <span>${act.icon} ${act.name}</span></label>`;}).join('')}
        </div>
      </div>
      <span id="trend-range-label" style="font-size:11px;color:var(--hint)"></span>
    </div>`;
  content.appendChild(filterCard);

  /* ── 5. Chart card ── */
  const card=document.createElement('div');
  card.className='chart-card';
  card.style.cssText='padding:20px 16px 16px';
  card.innerHTML=`
    <div class="chart-title" style="margin-bottom:4px">📈 Activity Trends</div>
    <div class="chart-sub" style="margin-bottom:14px">Daily hours · select an activity above or click a badge below</div>
    <div style="position:relative;width:100%;height:280px;margin-top:8px">
      <canvas id="chart-combined-trends" role="img" aria-label="Combined activity trends chart"></canvas>
    </div>
    <div class="trend-acts-grid" id="trend-acts-grid" style="margin-top:16px"></div>`;
  content.appendChild(card);

  /* ── 7. Get filtered dates and datasets ── */
  function getFilteredDates(){
    return fullDates.filter(d=> d >= _trendDateFrom && d <= _trendDateTo);
  }

  function getFilteredDatasets(){
    const filtered = getFilteredDates();
    return allDatasets
      .filter(ds => _trendSelectedKeys.has(ds._key))
      .map(ds => ({
        ...ds,
        data: filtered.map(d => {
          const act = byActivity[ds._key];
          return act.byDate[d]!=null ? +act.byDate[d].toFixed(2) : null;
        })
      }));
  }

  function getFilteredLabels(){
    const filtered = getFilteredDates();
    // Smart label density: show fewer labels when range is large
    const total = filtered.length;
    return filtered.map((d,i)=>{
      if(total <= 14) return new Date(d+'T12:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
      if(total <= 60) return i%7===0 ? new Date(d+'T12:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
      return i%14===0 ? new Date(d+'T12:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
    });
  }

  /* ── 8. Refresh chart when filters change ── */
  function refreshChart(){
    const ch = chartInstances['combined'];
    if(!ch) return;
    const ds = getFilteredDatasets();
    const labels = getFilteredLabels();
    ch.config.data.labels = labels;
    ch.config.data.datasets = ds;
    ch._resize();
    ch._draw();
    // Update range label
    const lbl = document.getElementById('trend-range-label');
    if(lbl){
      const days = getFilteredDates().length;
      const sel = _trendSelectedKeys.size;
      lbl.textContent = `${days} days · ${sel} of ${activityKeys.length} habits shown`;
    }
  }

  /* ── 9. Build stat badges ── */
  function buildBadges(){
    const grid = document.getElementById('trend-acts-grid');
    if(!grid) return;
    const filtered = getFilteredDates();
    grid.innerHTML = activityKeys.map((key,i)=>{
      const act = byActivity[key];
      const color = TREND_PALETTE[i%TREND_PALETTE.length];
      const vals = filtered.map(d=>act.byDate[d]||0).filter(v=>v>0);
      const trend = calcTrend(vals);
      const on = _trendSelectedKeys.has(key);
      const arrow = trend.dir==='up'?'↑':trend.dir==='down'?'↓':'→';
      const opacity = on ? '1' : '0.3';
      return `<div class="trend-act-badge" data-key="${key}" style="border-left:3px solid ${color};cursor:pointer;opacity:${opacity};transition:opacity .2s">
        <span class="trend-act-name">${act.icon} ${act.name}</span>
        <span class="trend-act-arrow ${trend.dir}">${arrow} ${trend.dir}</span>
        <span class="trend-act-avg">avg ${trend.avg.toFixed(2)} hrs/day</span>
      </div>`;
    }).join('');
    grid.querySelectorAll('.trend-act-badge').forEach(badge=>{
      badge.addEventListener('click',()=>{
        const k = badge.dataset.key;
        // Toggle: if only this key selected → go back to all; else select only this
        if(_trendSelectedKeys.size===1 && _trendSelectedKeys.has(k)){
          _trendSelectedKeys = new Set(activityKeys);
          document.querySelectorAll('.trend-cb-act').forEach(cb => cb.checked = true);
          const allCb = document.getElementById('trend-cb-all'); if (allCb) allCb.checked = true;
          const lbl = document.getElementById('trend-multi-label'); if (lbl) lbl.textContent = '☰ All habits';
        } else {
          _trendSelectedKeys = new Set([k]);
          document.querySelectorAll('.trend-cb-act').forEach(cb => { cb.checked = cb.dataset.key === k; });
          const allCb = document.getElementById('trend-cb-all'); if (allCb) allCb.checked = false;
          const act = byActivity[k];
          const lbl = document.getElementById('trend-multi-label');
          if (lbl && act) lbl.textContent = act.icon + ' ' + act.name;
        }
        refreshChart();
        buildBadges();
      });
    });
  }

  /* ── 10. Wire date inputs ── */
  setTimeout(()=>{
    const fromEl = document.getElementById('trend-date-from');
    const toEl   = document.getElementById('trend-date-to');
    if(fromEl) fromEl.addEventListener('change',e=>{ _trendDateFrom=e.target.value; refreshChart(); buildBadges(); });
    if(toEl)   toEl.addEventListener('change',e=>{ _trendDateTo=e.target.value; refreshChart(); buildBadges(); });

    document.querySelectorAll('.trend-quick-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const days = parseInt(btn.dataset.days);
        const last = fullDates[fullDates.length-1]||new Date().toISOString().split('T')[0];
        if(days===0){
          _trendDateFrom = fullDates[0]||last;
        } else {
          const d = new Date(last+'T12:00');
          d.setDate(d.getDate()-(days-1));
          _trendDateFrom = d.toISOString().split('T')[0];
        }
        _trendDateTo = last;
        if(fromEl) fromEl.value = _trendDateFrom;
        if(toEl)   toEl.value   = _trendDateTo;
        refreshChart();
        buildBadges();
      });
    });

    // ── Multi-select activity dropdown ──
    function _syncMultiLabel() {
      const allCb  = document.getElementById('trend-cb-all');
      const actCbs = document.querySelectorAll('.trend-cb-act');
      const checkedKeys = [...actCbs].filter(cb => cb.checked).map(cb => cb.dataset.key);
      const allChecked  = checkedKeys.length === activityKeys.length;
      if (allCb) allCb.checked = allChecked;
      const lbl = document.getElementById('trend-multi-label');
      if (!lbl) return;
      if (allChecked || checkedKeys.length === 0) {
        lbl.textContent = '☰ All habits';
      } else if (checkedKeys.length === 1) {
        const act = byActivity[checkedKeys[0]];
        lbl.textContent = act ? act.icon + ' ' + act.name : '1 selected';
      } else {
        lbl.textContent = checkedKeys.length + ' habits';
      }
    }

    function _applyMultiSelection() {
      const actCbs = document.querySelectorAll('.trend-cb-act');
      const checkedKeys = [...actCbs].filter(cb => cb.checked).map(cb => cb.dataset.key);
      _trendSelectedKeys = checkedKeys.length ? new Set(checkedKeys) : new Set(activityKeys);
      _syncMultiLabel();
      refreshChart(); buildBadges();
    }

    const multiBtn = document.getElementById('trend-multi-btn');
    const multiDd  = document.getElementById('trend-multi-dropdown');
    if (multiBtn && multiDd) {
      multiBtn.addEventListener('click', e => {
        e.stopPropagation();
        multiDd.style.display = multiDd.style.display === 'none' ? 'flex' : 'none';
      });
      // All habits checkbox
      const allCb = document.getElementById('trend-cb-all');
      if (allCb) {
        allCb.addEventListener('change', () => {
          document.querySelectorAll('.trend-cb-act').forEach(cb => cb.checked = allCb.checked);
          _applyMultiSelection();
        });
      }
      // Individual checkboxes
      document.querySelectorAll('.trend-cb-act').forEach(cb => {
        cb.addEventListener('change', () => _applyMultiSelection());
      });
      // Close on outside click
      const _closeMD = e => {
        const wrap = document.getElementById('trend-multi-wrap');
        if (wrap && !wrap.contains(e.target)) multiDd.style.display = 'none';
      };
      if (window._trendMultiDropListener) document.removeEventListener('click', window._trendMultiDropListener);
      window._trendMultiDropListener = _closeMD;
      document.addEventListener('click', _closeMD);
    }
  },0);

  /* ── 11. Render chart ── */
  setTimeout(()=>{
    const ctx=document.getElementById('chart-combined-trends');
    if(!ctx)return;
    chartInstances['combined']=new Chart(ctx,{
      type:'line',
      data:{labels: getFilteredLabels(), datasets: getFilteredDatasets()},
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:c=>{ if(c.parsed.y===null)return null; return ` ${c.dataset.label}: ${c.parsed.y} hrs`; }}}
        },
        onClick:function(dot){
          if(!dot||!dot.ds)return;
          // Show full-date detail popup for ALL habits at this date index
          const filteredDates = getFilteredDates();
          const dateISO = filteredDates[dot.i];
          if(!dateISO) return;
          _showDotDetailPopup(dateISO, activityKeys, byActivity, TREND_PALETTE);
        },
        scales:{
          x:{ grid:{color:'rgba(0,0,0,0.04)'}, ticks:{font:{size:11},color:'#a09c96',maxRotation:45} },
          y:{ min:0, grid:{color:'rgba(0,0,0,0.04)'}, ticks:{font:{size:11},color:'#a09c96',maxTicksLimit:6,callback:v=>v+' h'} }
        }
      }
    });

    buildBadges();
    refreshChart();

    // Wire snapshot-focus event
    if(window._snapshotFocusListener) document.removeEventListener('snapshot-focus',window._snapshotFocusListener);
    window._snapshotFocusListener=(e)=>{
      const k=e.detail&&e.detail.key;
      if(k){
        _trendSelectedKeys=new Set([k]);
        // Sync checkboxes
        document.querySelectorAll('.trend-cb-act').forEach(cb => { cb.checked = cb.dataset.key === k; });
        const allCb = document.getElementById('trend-cb-all');
        if (allCb) allCb.checked = false;
        const act = byActivity[k];
        const lbl = document.getElementById('trend-multi-label');
        if (lbl && act) lbl.textContent = act.icon + ' ' + act.name;
        refreshChart(); buildBadges();
      }
    };
    document.addEventListener('snapshot-focus',window._snapshotFocusListener);
  },50);

  /* ── 12. Sleep score card ── */
  if(ud.checkInHistory&&ud.checkInHistory.length>0){
    const scoreCard=buildScoreChart(ud.checkInHistory);
    content.appendChild(scoreCard);
  }

  /* ── 13. Insight card ── */
  const ins=buildInsight(ud.logs,ud.checkInHistory||[]);
  if(ins)content.appendChild(ins);
}

function buildScoreChart(history){
  const card=document.createElement('div');
  card.className='chart-card';
  const labels=history.map(h=>h.date?new Date(h.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'?');
  const scores=history.map(h=>h.score);
  const trend=calcTrend(scores);
  card.innerHTML=`
    <div class="chart-title">Sleep score over time</div>
    <div class="chart-sub">From your check-ins</div>
    <div style="position:relative;width:100%;height:180px"><canvas id="chart-score" role="img" aria-label="Sleep score trend chart">Your sleep scores over time.</canvas></div>
    <div class="trend-badge ${trend.dir}" style="margin-top:10px">
      ${trend.dir==='up'?'↑ Improving':trend.dir==='down'?'↓ Declining':'→ Stable'}
      (avg ${Math.round(trend.avg)}/50)
    </div>
    <div class="chart-rec">${getScoreRec(trend)}</div>`;
  setTimeout(()=>{
    const ctx=document.getElementById('chart-score');
    if(!ctx)return;
    chartInstances['score']=new Chart(ctx,{
      type:'line',
      data:{labels,datasets:[{label:'Sleep score',data:scores,borderColor:'#1D9E75',backgroundColor:'rgba(29,158,117,0.08)',pointBackgroundColor:'#1D9E75',tension:.35,fill:true}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{min:0,max:50,ticks:{stepSize:10}}}}
    });
  },50);
  return card;
}



function calcTrend(vals){
  if(!vals.length)return{dir:'neutral',avg:0,slope:0};
  const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
  if(vals.length<2)return{dir:'neutral',avg,slope:0};
  const n=vals.length;
  const sumX=vals.reduce((_,__,i)=>_+i,0);
  const sumY=vals.reduce((a,b)=>a+b,0);
  const sumXY=vals.reduce((a,b,i)=>a+i*b,0);
  const sumXX=vals.reduce((a,_,i)=>a+i*i,0);
  const slope=(n*sumXY-sumX*sumY)/(n*sumXX-sumX*sumX);
  const dir=Math.abs(slope)<0.05?'neutral':slope>0?'up':'down';
  return{dir,avg,slope};
}

function getScoreRec(trend){
  if(trend.dir==='up') return `<strong>Great trajectory!</strong> Your sleep quality is improving. Keep your current bedtime routine consistent.`;
  if(trend.dir==='down') return `<strong>Your sleep score is declining.</strong> Check if work hours or screen time have increased recently — those are the first places to look.`;
  return `<strong>Stable score.</strong> To move the needle, focus on one habit at a time — start with your phone use before bed.`;
}

function getHabitRec(id,trend,unit){
  const recs={
    sleep:{up:'Sleep duration improving — great! Aim to keep it above 7 hours consistently.',down:'Sleep hours are declining. Try a consistent bedtime, even 15 min earlier helps.',neutral:'Sleep is stable. Try logging what time you go to bed to spot patterns.'},
    work:{up:'Work hours trending up. Watch out for fatigue — schedule clear start and stop times.',down:'Work hours decreasing — good if intentional. Make sure rest time is actually restful.',neutral:'Work hours are stable. Consistent boundaries support long-term energy.'},
    exercise:{up:'Exercise is trending up — excellent! Your energy levels should reflect this soon.',down:'Exercise declining. Even a 10-min walk daily counts. Start small.',neutral:'Exercise is steady. Try adding one new activity per week to build gradually.'},
    screen:{up:'Screen time increasing. This may be affecting your sleep depth.',down:'Screen time going down — especially before bed, this has a direct positive effect on sleep.',neutral:'Screen time stable. Try tracking when you use it most — evening use is highest risk.'},
    reading:{up:'Reading more is a great wind-down habit, especially before bed.',down:'Reading less recently. Even 10 pages before bed can help with sleep onset.',neutral:'Consistent reading habit. Great for mental wind-down.'},
    meditation:{up:'Meditation practice growing — this directly supports stress recovery and sleep.',down:'Meditation dipping. Even 5 minutes of deep breathing counts.',neutral:'Steady meditation practice — keep it going.'},
  };
  const r=recs[id];
  if(!r)return '';
  return r[trend.dir]||r.neutral;
}

function buildInsight(logs,checkIns){
  if(checkIns.length<2||!logs.length)return null;
  const card=document.createElement('div');
  card.className='chart-card';
  const sleepLogs=logs.filter(l=>l.habitId==='sleep');
  if(sleepLogs.length<2){card.innerHTML=`<div class="chart-title">💡 Insight</div><div class="chart-sub" style="margin-top:6px">Log more sleep data to unlock correlation insights.</div>`;return card;}
  const lastScore=checkIns[checkIns.length-1].score;
  const sleepAvg=sleepLogs.reduce((a,b)=>a+b.duration,0)/sleepLogs.length;
  const insight=lastScore>35
    ?`Your recent check-in score is strong (${lastScore}/50). Your average logged sleep of ${sleepAvg.toFixed(1)} hrs supports this — continue prioritising consistent sleep times.`
    :`Your check-in score is ${lastScore}/50 with an average logged sleep of ${sleepAvg.toFixed(1)} hrs. Increasing sleep consistency (not just duration) is likely to move this score higher.`;
  card.innerHTML=`<div class="chart-title">💡 Key insight</div><div style="font-size:13px;color:var(--muted);margin-top:8px;line-height:1.7">${insight}</div>`;
  return card;
}

/* ═══════════════════════════════════════
   DOT DETAIL POPUP — Trends chart click
═══════════════════════════════════════ */
function _showDotDetailPopup(dateISO, activityKeys, byActivity, palette) {
  // Format date label
  const dateObj = new Date(dateISO + 'T12:00');
  const isToday = dateISO === new Date().toLocaleDateString('en-CA');
  const isYesterday = dateISO === new Date(Date.now()-86400000).toLocaleDateString('en-CA');
  const dateLabel = isToday ? 'Today'
    : isYesterday ? 'Yesterday'
    : dateObj.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

  // Gather all habits that have data on this date
  const rows = activityKeys.map((key, idx) => {
    const act = byActivity[key];
    const hrs = act.byDate[dateISO] || 0;
    const color = palette[idx % palette.length];
    return { key, name: act.name, icon: act.icon, hrs, color };
  });

  const hasAny = rows.some(r => r.hrs > 0);

  // Build rows HTML
  let rowsHTML = '';
  rows.forEach(r => {
    const totalMins = Math.round(r.hrs * 60);
    const display = totalMins === 0 ? '—'
      : totalMins < 60 ? totalMins + ' min'
      : (Math.floor(totalMins/60)) + 'h' + (totalMins%60 > 0 ? ' ' + (totalMins%60) + 'm' : '');
    const opacity = r.hrs > 0 ? '1' : '0.35';
    rowsHTML += `
      <div class="ddp-row" style="opacity:${opacity}">
        <div class="ddp-dot" style="background:${r.color}"></div>
        <span class="ddp-habit">${r.icon} ${r.name}</span>
        <span class="ddp-val" style="color:${r.hrs>0?r.color:'var(--hint)'}">${display}</span>
      </div>`;
  });

  if (!hasAny) {
    rowsHTML = `<div style="text-align:center;padding:20px 0;color:var(--hint);font-size:13px">Nothing logged on this day.</div>`;
  }

  // Total
  const totalHrs = rows.reduce((s,r)=>s+r.hrs,0);
  const totalMins = Math.round(totalHrs*60);
  const totalDisplay = totalMins === 0 ? '0 min'
    : totalMins < 60 ? totalMins + ' min'
    : Math.floor(totalMins/60) + 'h' + (totalMins%60>0?' '+totalMins%60+'m':'');

  const popup = document.getElementById('dot-detail-popup');
  if (!popup) return;
  popup.innerHTML = `
    <div class="ddp-box">
      <div class="ddp-header">
        <div>
          <div class="ddp-date">${dateLabel}</div>
          <div class="ddp-subtitle">${dateISO}</div>
        </div>
        <button class="ddp-close" onclick="document.getElementById('dot-detail-popup').style.display='none'">✕</button>
      </div>
      <div class="ddp-rows">${rowsHTML}</div>
      ${hasAny ? `<div class="ddp-total"><span>Total logged</span><span>${totalDisplay}</span></div>` : ''}
    </div>`;
  popup.style.display = 'flex';
}

/* ═══════════════════════════════════════
   SETTINGS
═══════════════════════════════════════ */

function deleteAccount() {
  if (!currentUser) return;
  const confirmed = confirm(`Are you sure you want to permanently delete your account "@${currentUser.username}" and all your data? This cannot be undone.`);
  if (!confirmed) return;
  const pass = prompt('Enter your password to confirm:');
  if (pass === null) return;
  const users = _loadUsers();
  if (!users[currentUser.username] || users[currentUser.username].pass !== pass) {
    alert('Incorrect password. Account not deleted.');
    return;
  }
  localStorage.removeItem('qt_data_' + currentUser.username);
  localStorage.removeItem('qt_session');
  delete users[currentUser.username];
  _saveUsers(users);
  currentUser = null;
  _currentData = null;
  location.reload();
}

function lfGoToDate(dateStr){
  showTab('tracker');
  setTimeout(()=>{
    const dateEl=document.getElementById('lf-date');
    if(dateEl){dateEl.value=dateStr;}
    cal2Year=parseInt(dateStr.split('-')[0]);
    cal2Month=parseInt(dateStr.split('-')[1])-1;
    selectedDay2=dateStr;
    renderCalendar2();
    document.getElementById('log-form-card').scrollIntoView({behavior:'smooth'});
  },100);
}
let historyFilter = 'all';
let historyYear   = null;
let historyMonth  = null;

/* Format a log entry's duration for display — always readable */
function _fmtLogDuration(l) {
  const hrs = l.unit === 'mins' ? l.duration / 60 : Number(l.duration) || 0;
  const totalMins = Math.round(hrs * 60);
  if (totalMins < 1) return '< 1m';
  if (totalMins < 60) return totalMins + 'min';
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? h + 'h ' + m + 'min' : h + 'h';
}

function renderHistory() {
  const content    = document.getElementById('history-content');
  const filterWrap = document.getElementById('history-filter');
  if (!content || !filterWrap) return;

  const ud = getUserData();
  if (!ud || !ud.logs.length) {
    filterWrap.innerHTML = '';
    content.innerHTML = `<div class="no-data-msg"><div class="no-data-icon">📖</div><div>No logs yet.</div><div style="margin-top:6px;font-size:12px">Log habits in the Tracker tab and they'll appear here.</div></div>`;
    return;
  }

  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];

  const allLogs = ud.logs.filter(l => !l.isQuickAlarm);

  // Build year list from actual data
  const yearSet = new Set(allLogs.map(l => normalizeDateValue(l.date).slice(0,4)).filter(Boolean));
  const years   = [...yearSet].sort((a,b) => b - a);

  const now = new Date();
  if (historyYear  === null) historyYear  = String(now.getFullYear());
  if (historyMonth === null) historyMonth = String(now.getMonth()+1).padStart(2,'0');
  if (!yearSet.has(historyYear) && years.length) historyYear = years[0];

  // Build month list for selected year
  const monthSet = new Set(
    allLogs
      .map(l => normalizeDateValue(l.date))
      .filter(d => d && d.startsWith(historyYear))
      .map(d => d.slice(5,7))
  );
  const months = [...monthSet].sort((a,b) => b - a);
  if (!monthSet.has(historyMonth) && months.length) historyMonth = months[0];

  // ── Filter bar ────────────────────────────────────────────────────────
  filterWrap.innerHTML = '';
  filterWrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px';

  // Year select
  const yearSel = document.createElement('select');
  yearSel.className = 'hist-period-sel';
  years.forEach(y => {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    if (y === historyYear) o.selected = true;
    yearSel.appendChild(o);
  });
  yearSel.onchange = () => {
    historyYear  = yearSel.value;
    historyMonth = null;
    renderHistory();
  };

  // Month select
  const monthSel = document.createElement('select');
  monthSel.className = 'hist-period-sel';
  months.forEach(m => {
    const o = document.createElement('option');
    o.value = m;
    o.textContent = MONTH_NAMES[parseInt(m,10)-1];
    if (m === historyMonth) o.selected = true;
    monthSel.appendChild(o);
  });
  monthSel.onchange = () => {
    historyMonth = monthSel.value;
    renderHistory();
  };

  filterWrap.appendChild(yearSel);
  filterWrap.appendChild(monthSel);

  // Divider
  const divider = document.createElement('div');
  divider.style.cssText = 'width:1px;height:22px;background:var(--border);margin:0 2px;flex-shrink:0';
  filterWrap.appendChild(divider);

  // Activity hamburger (existing behaviour)
  const activeLog = allLogs.find(l => l.habitId === historyFilter);
  const actLabel  = historyFilter === 'all'
    ? '☰ Activities'
    : (activeLog ? activeLog.habitIcon + ' ' + activeLog.habitName : '☰ Activities');

  const hamburgerContainer = document.createElement('div');
  hamburgerContainer.style.cssText = 'position:relative;display:inline-block';

  const hamburgerBtn = document.createElement('button');
  hamburgerBtn.type = 'button';
  hamburgerBtn.textContent = actLabel;
  hamburgerBtn.className = 'hist-period-sel hist-act-btn';

  const dropdown = document.createElement('div');
  dropdown.id = 'history-filter-dropdown';
  dropdown.className = 'hist-act-dropdown';

  const allOption = document.createElement('button');
  allOption.type = 'button';
  allOption.textContent = '🗂 All';
  allOption.className = 'hist-act-item' + (historyFilter === 'all' ? ' active' : '');
  allOption.onclick = () => { historyFilter = 'all'; dropdown.style.display = 'none'; renderHistory(); };
  dropdown.appendChild(allOption);

  const seen = new Set();
  allLogs.forEach(l => {
    if (seen.has(l.habitId)) return;
    seen.add(l.habitId);
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.textContent = l.habitIcon + ' ' + l.habitName;
    opt.className = 'hist-act-item' + (historyFilter === l.habitId ? ' active' : '');
    opt.onclick = () => { historyFilter = l.habitId; dropdown.style.display = 'none'; renderHistory(); };
    dropdown.appendChild(opt);
  });

  hamburgerBtn.onclick = () => {
    dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none';
  };
  hamburgerContainer.appendChild(hamburgerBtn);
  hamburgerContainer.appendChild(dropdown);
  filterWrap.appendChild(hamburgerContainer);

  setTimeout(() => {
    const close = (e) => {
      if (!hamburgerContainer.contains(e.target) && dropdown.style.display === 'flex')
        dropdown.style.display = 'none';
    };
    if (window._historyDropdownListener) document.removeEventListener('click', window._historyDropdownListener);
    window._historyDropdownListener = close;
    document.addEventListener('click', close);
  }, 0);

  // ── Filter logs to period + activity ─────────────────────────────────
  const prefix = historyYear + '-' + historyMonth;

  const logs = allLogs
    .filter(l => {
      const d = normalizeDateValue(l.date);
      return d.startsWith(prefix) && (historyFilter === 'all' || l.habitId === historyFilter);
    })
    .slice()
    .sort((a,b) => b.id - a.id);

  content.innerHTML = '';

  // ── Monthly summary strip ─────────────────────────────────────────────
  if (logs.length) {
    const totalHrs = logs.reduce((s,l) => {
      return s + (l.unit === 'mins' ? l.duration/60 : Number(l.duration)||0);
    }, 0);
    const totalMins  = Math.round(totalHrs * 60);
    const h = Math.floor(totalMins/60), m = totalMins%60;
    const totalLabel = totalMins < 60
      ? totalMins + 'min'
      : (h + 'h' + (m ? ' ' + m + 'min' : ''));

    const summary = document.createElement('div');
    summary.className = 'hist-month-summary';
    summary.innerHTML = `
      <span class="hist-month-label">${MONTH_NAMES[parseInt(historyMonth,10)-1]} ${historyYear}</span>
      <span class="hist-month-stats">${logs.length} entr${logs.length===1?'y':'ies'} &nbsp;·&nbsp; <strong>${totalLabel}</strong> total</span>`;
    content.appendChild(summary);
  }

  // ── No entries state ──────────────────────────────────────────────────
  if (!logs.length) {
    content.innerHTML += `<div class="no-data-msg" style="padding:36px 20px">
      <div class="no-data-icon">🗓️</div>
      <div>No logs for ${MONTH_NAMES[parseInt(historyMonth,10)-1]} ${historyYear}.</div>
      <div style="margin-top:6px;font-size:12px">Try a different month or activity filter.</div>
    </div>`;
    return;
  }

  // ── Group by day and render ───────────────────────────────────────────
  const byDate = {};
  logs.forEach(l => {
    const dk = normalizeDateValue(l.date);
    if (!byDate[dk]) byDate[dk] = [];
    byDate[dk].push(l);
  });

  const todayStr     = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now()-86400000).toISOString().split('T')[0];

  Object.keys(byDate).sort((a,b) => b.localeCompare(a)).forEach(dateStr => {
    const d   = new Date(dateStr + 'T12:00:00');
    const lbl = dateStr === todayStr
      ? 'Today'
      : dateStr === yesterdayStr
        ? 'Yesterday'
        : d.toLocaleDateString('en-US', {weekday:'long', month:'short', day:'numeric'});

    const heading = document.createElement('div');
    heading.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 0 8px;border-top:.5px solid var(--border);margin-top:4px';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:11px;font-weight:600;color:var(--hint);letter-spacing:.07em;text-transform:uppercase';
    title.textContent = lbl;

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear day';
    clearBtn.style.cssText = 'font-size:11px;padding:6px 10px;border:1px solid var(--border);border-radius:999px;background:transparent;color:var(--text);cursor:pointer;font-family:\'Sora\',sans-serif;transition:background .15s';
    clearBtn.onmouseover = () => clearBtn.style.background = 'var(--red-lt)';
    clearBtn.onmouseout  = () => clearBtn.style.background = 'transparent';
    clearBtn.onclick = () => clearLogsByDate(dateStr);

    heading.appendChild(title);
    heading.appendChild(clearBtn);
    content.appendChild(heading);

    byDate[dateStr].forEach(l => {
      const item = document.createElement('div');
      item.className = 'log-entry-item';
      item.style.cssText = 'background:var(--surf);border:.5px solid var(--border);border-radius:var(--r);padding:12px 14px;margin-bottom:8px;display:flex;align-items:flex-start;gap:12px';
      item.innerHTML = `
        <div class="log-entry-icon" style="flex-shrink:0">${l.habitIcon}</div>
        <div class="log-entry-meta" style="flex:1;min-width:0">
          <div class="log-entry-habit">
            ${l.habitName}
            ${l.isSchedule ? '<span class="sc-history-badge">📅 Schedule</span>' : ''}
            ${l.note && l.note.startsWith('Stopwatch') ? '<span class="sc-history-badge sw-badge">⏱ Stopwatch</span>' : ''}
          </div>
          <div class="log-entry-dur">
            <strong>${_fmtLogDuration(l)}</strong>
            ${l.startTime ? `<span style="color:var(--hint)"> · ${l.startTime}${l.endTime ? '–'+l.endTime : ''}</span>` : ''}
          </div>
        </div>
        <button onclick="deleteLog(${l.id})" title="Delete this entry"
          style="background:none;border:none;cursor:pointer;color:var(--hint);font-size:16px;padding:2px 4px;flex-shrink:0;line-height:1"
          onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--hint)'">🗑</button>`;
      content.appendChild(item);
    });
  });
}


function _renderActivitySummary(container, ud) {
  return; // Summary section removed per user request
  // Always aggregate ALL logs (ignore current historyFilter) so summary is always complete
  const allLogs = ud.logs.filter(l => !l.isQuickAlarm);
  if (!allLogs.length) return;

  // Also pull durations from schedules (planned time), stored separately
  // Aggregate by habitId → { name, icon, totalHrs, sessions }
  const byActivity = {};

  allLogs.forEach(l => {
    const key = l.habitId || l.habitName;
    if (!byActivity[key]) {
      byActivity[key] = { name: l.habitName, icon: l.habitIcon || '📋', totalHrs: 0, sessions: 0 };
    }
    // Normalise to hours
    const hrs = l.unit === 'mins' ? l.duration / 60 : Number(l.duration) || 0;
    byActivity[key].totalHrs += hrs;
    byActivity[key].sessions += 1;
  });

  const entries = Object.values(byActivity).sort((a, b) => b.totalHrs - a.totalHrs);
  if (!entries.length) return;

  // Helper: format hours nicely
  function _fmtHrs(hrs) {
    if (hrs < 1/60) return '< 1m';
    const totalMins = Math.round(hrs * 60);
    if (totalMins < 60) return `${totalMins}m`;
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  const section = document.createElement('div');
  section.className = 'hist-summary-section';
  section.innerHTML = `
    <div class="hist-summary-header">
      <span class="hist-summary-title">📊 Total by Activity</span>
      <span class="hist-summary-sub">All-time · across all logs</span>
    </div>
    <div class="hist-summary-grid">
      ${entries.map(e => `
        <div class="hist-summary-card">
          <div class="hist-summary-icon">${e.icon}</div>
          <div class="hist-summary-info">
            <div class="hist-summary-name">${e.name}</div>
            <div class="hist-summary-sessions">${e.sessions} session${e.sessions !== 1 ? 's' : ''}</div>
          </div>
          <div class="hist-summary-total">${_fmtHrs(e.totalHrs)}</div>
        </div>`).join('')}
    </div>`;

  container.appendChild(section);
}

function deleteLog(logId) {
  const ud = getUserData();
  if (!ud) return;
  const idx = ud.logs.findIndex(l => l.id === logId);
  if (idx === -1) return;
  ud.logs.splice(idx, 1);
  saveUserData();
  renderHistory();
  renderCalendar();
  renderCalendar2();
  renderTrends();
}

function clearLogsByDate(dateStr) {
  const ud = getUserData();
  if (!ud) return;
  const normalizedDate = normalizeDateValue(dateStr);
  if (!normalizedDate) return;
  ud.logs = ud.logs.filter(l => normalizeDateValue(l.date) !== normalizedDate);
  saveUserData();
  renderHistory();
  renderCalendar();
  renderCalendar2();
  renderTrends();
}

/* ═══════════════════════════════════════
   EXPORT
═══════════════════════════════════════ */
function exportCSV(){
  const ud=getUserData();
  if(!ud||!ud.logs.length){alert('No logs to export yet.');return;}
  
  // Group by date + habit
  const byDayHabit={};
  ud.logs.forEach(l=>{
    const key=normalizeDateValue(l.date)+'_'+l.habitName;
    if(!byDayHabit[key]){
      byDayHabit[key]={date:normalizeDateValue(l.date),name:l.habitName,totalHrs:0,sessions:0};
    }
    const hrs=l.unit==='mins'?l.duration/60:Number(l.duration)||0;
    byDayHabit[key].totalHrs+=hrs;
    byDayHabit[key].sessions+=1;
  });

  const rows=[['Date','Habit','Total Hours','Total Minutes','Sessions']];
  Object.values(byDayHabit)
    .sort((a,b)=>a.date.localeCompare(b.date))
    .forEach(h=>{
      rows.push([h.date, h.name, h.totalHrs.toFixed(2), Math.round(h.totalHrs*60), h.sessions]);
    });

  const csv=rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='quick-tracker-daily.csv';
  a.click();
}

function exportExcel(){
  const ud=getUserData();
  if(!ud||!ud.logs.length){alert('No logs to export yet.');return;}

  // Group by date + habit
  const byDayHabit={};
  ud.logs.forEach(l=>{
    const key=normalizeDateValue(l.date)+'_'+l.habitName;
    if(!byDayHabit[key]){
      byDayHabit[key]={date:normalizeDateValue(l.date),name:l.habitName,totalHrs:0,sessions:0};
    }
    const hrs=l.unit==='mins'?l.duration/60:Number(l.duration)||0;
    byDayHabit[key].totalHrs+=hrs;
    byDayHabit[key].sessions+=1;
  });

  const rows=[['Date','Habit','Total Hours','Total Minutes','Sessions']];
  Object.values(byDayHabit)
    .sort((a,b)=>a.date.localeCompare(b.date))
    .forEach(h=>{
      rows.push([h.date, h.name, h.totalHrs.toFixed(2), Math.round(h.totalHrs*60), h.sessions]);
    });

  const header=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>td{font-family:Calibri,sans-serif;font-size:11pt;padding:4px 8px;border:1px solid #ccc}th{background:#1D9E75;color:#fff;font-weight:600}</style></head><body><table>`;
  const htmlRows=rows.map((r,i)=>`<tr>${r.map(c=>`<${i===0?'th':'td'}>${c}</${i===0?'th':'td'}>`).join('')}</tr>`).join('');
  const html=header+htmlRows+'</table></body></html>';
  const blob=new Blob([html],{type:'application/vnd.ms-excel'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='quick-tracker-daily.xls';
  a.click();
}
/* ═══════════════════════════════════════
   ADD ALARM MODAL  (floating + button)
═══════════════════════════════════════ */

// Category icons map for display
const AA_CAT_ICONS = {
  'Studies':'📚','Sleep':'😴','Screen Use':'📱','Exercise':'🏃','Meals':'🍽','Other':'✍'
};

// State for the add-alarm modal
let _aaSound = 'bell';
let _aaCustomSoundData = null;
let _aaSelectedCat = '';

function openAddAlarmModal() {
  _aaSound = 'bell';
  _aaCustomSoundData = null;
  _aaSelectedCat = '';

  // Reset fields
  document.getElementById('aa-from-h').value = '8';
  document.getElementById('aa-from-m').value = '00';
  document.getElementById('aa-to-h').value = '9';
  document.getElementById('aa-to-m').value = '00';
  aaSetAmPm('from','AM');
  aaSetAmPm('to','AM');
  document.getElementById('aa-custom-activity').value = '';
  document.getElementById('aa-categories').querySelectorAll('.aa-cat-btn').forEach(b=>b.classList.remove('sel'));
  document.getElementById('aa-sounds').querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
  const bellBtn = document.querySelector('#aa-sounds [data-sound="bell"]');
  if(bellBtn) bellBtn.classList.add('sel');
  const msg = document.getElementById('aa-msg');
  msg.textContent=''; msg.className='auth-msg';
  _aaDurationUpdate();
  document.getElementById('add-alarm-modal').style.display = 'flex';
}

function closeAddAlarmModal() {
  document.getElementById('add-alarm-modal').style.display = 'none';
}

function aaSetAmPm(side, val) {
  document.getElementById(`aa-${side}-am`).classList.toggle('sel', val==='AM');
  document.getElementById(`aa-${side}-pm`).classList.toggle('sel', val==='PM');
  _aaDurationUpdate();
}

function _aaGetTime(side) {
  const h = document.getElementById(`aa-${side}-h`).value;
  const m = document.getElementById(`aa-${side}-m`).value;
  const isAM = document.getElementById(`aa-${side}-am`).classList.contains('sel');
  return to24(h, m, isAM ? 'AM' : 'PM');
}

function _aaDurationUpdate() {
  const from = _aaGetTime('from');
  const to   = _aaGetTime('to');
  const disp = document.getElementById('aa-duration-display');
  if(!disp) return;
  const diff = calcDiff(from, to);
  disp.textContent = diff ? `Total Duration: ${diff}` : 'Total Duration: —';
}

// Wire live updates once DOM ready
document.addEventListener('DOMContentLoaded', function() {
  ['aa-from-h','aa-from-m','aa-to-h','aa-to-m'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', _aaDurationUpdate);
  });
});

function aaSelectCat(btn) {
  document.getElementById('aa-categories').querySelectorAll('.aa-cat-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  _aaSelectedCat = btn.dataset.cat;
  // Clear custom text if a preset is chosen
  document.getElementById('aa-custom-activity').value = '';
}

function aaClearCatIfTyping() {
  // If user types in custom field, deselect any preset category
  if(document.getElementById('aa-custom-activity').value.trim()) {
    document.getElementById('aa-categories').querySelectorAll('.aa-cat-btn').forEach(b=>b.classList.remove('sel'));
    _aaSelectedCat = '';
  }
}

function aaSelectSound(btn) {
  document.getElementById('aa-sounds').querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  _aaSound = btn.dataset.sound;
  _aaCustomSoundData = null;
  previewSound(_aaSound, null);
}

function aaUploadSound(input) {
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    _aaCustomSoundData = e.target.result;
    _aaSound = 'custom';
    document.getElementById('aa-sounds').querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
    input.previousElementSibling.textContent = '✅ ' + file.name.substring(0,16);
    previewSound('custom', _aaCustomSoundData);
  };
  reader.readAsDataURL(file);
}

function saveAddAlarm() {
  const from = _aaGetTime('from');
  const to   = _aaGetTime('to');
  const customText = document.getElementById('aa-custom-activity').value.trim();
  const category = customText || _aaSelectedCat;
  const msg = document.getElementById('aa-msg');

  if(!category) {
    msg.textContent = 'Please select a category or enter a custom activity.';
    msg.className = 'auth-msg err';
    return;
  }

  const diff = calcDiff(from, to);
  const fromDisplay = _aaFmtDisplay(from);
  const toDisplay   = _aaFmtDisplay(to);

  // Calculate duration in minutes for data
  const [h1,m1] = from.split(':').map(Number);
  const [h2,m2] = to.split(':').map(Number);
  let durationMins = (h2*60+m2) - (h1*60+m1);
  if(durationMins < 0) durationMins += 1440;
  const durationHrs = +(durationMins/60).toFixed(2);

  const ud = getUserData();
  if(!ud) { msg.textContent='Please sign in first.'; msg.className='auth-msg err'; return; }

  // Ensure quickAlarms array exists
  if(!ud.quickAlarms) ud.quickAlarms = [];

  const entry = {
    id: Date.now(),
    date: new Date().toISOString().split('T')[0],
    fromTime: from,
    toTime: to,
    fromDisplay,
    toDisplay,
    duration: diff || '—',
    durationMins,
    durationHrs,
    category,
    isCustomCategory: !!customText,
    sound: _aaSound,
    createdAt: new Date().toISOString()
  };

  ud.quickAlarms.push(entry);

  // Also push into logs array so it shows in History and Trends
  const catIcon = AA_CAT_ICONS[category] || '⏰';
  ud.logs.push({
    id: entry.id,
    habitId: 'quickalarm',
    habitName: category,
    habitIcon: catIcon,
    date: entry.date,
    duration: durationHrs,
    unit: 'hrs',
    startTime: fromDisplay,
    endTime: toDisplay,
    note: `Quick Alarm · ${diff||'—'} · Sound: ${_aaSound}`,
    isQuickAlarm: true
  });

  saveUserData();

  // Schedule the alarm notification
  _scheduleQuickAlarm(entry);

  msg.textContent = `✅ Alarm saved! ${fromDisplay} → ${toDisplay} · ${diff||'—'}`;
  msg.className = 'auth-msg ok';

  renderHistory();
  renderTrends();
  renderCalendar();

  setTimeout(()=>{ closeAddAlarmModal(); }, 1400);
}

function _aaFmtDisplay(time24) {
  const f = fmt12(time24);
  return `${f.h}:${f.m} ${f.ampm}`;
}

/* ── Quick Alarm scheduler ── */
let _qaTimers = [];

function _scheduleQuickAlarm(entry) {
  const now = new Date();

  function _getSound() {
    const ud = getUserData();
    const snd = entry.sound || 'bell';
    const custom = (ud && ud.customSounds) ? ud.customSounds['quickalarm'] : null;
    return { snd, custom };
  }

  function _showModal(icon, title, sub) {
    document.getElementById('alarm-modal-icon').textContent = icon;
    document.getElementById('alarm-modal-title').textContent = title;
    document.getElementById('alarm-modal-sub').textContent = sub;
    document.getElementById('alarm-modal').style.display = 'flex';
    currentAlarmHabit = { id: 'quickalarm', name: entry.category };
  }

  const catIcon = AA_CAT_ICONS[entry.category] || String.fromCodePoint(0x23F0);

  // FROM: time to START
  const [fh, fm] = entry.fromTime.split(':').map(Number);
  const fromMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), fh, fm, 0) - now;
  if (fromMs >= 0 && fromMs <= 86400000) {
    _qaTimers.push(setTimeout(() => {
      const { snd, custom } = _getSound();
      playSound(snd === 'custom' ? 'custom' : snd, snd === 'custom' ? custom || _aaCustomSoundData : null);
      _showModal(catIcon, String.fromCodePoint(0x1F7E2) + ' Time to start ' + entry.category + '!', entry.fromDisplay + ' to ' + entry.toDisplay);
    }, fromMs));
  }

  // UNTIL: time to STOP
  const [th, tm] = entry.toTime.split(':').map(Number);
  const toMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), th, tm, 0) - now;
  if (toMs >= 0 && toMs <= 86400000) {
    _qaTimers.push(setTimeout(() => {
      stopAlarmSound();
      const { snd, custom } = _getSound();
      playSound(snd === 'custom' ? 'custom' : snd, snd === 'custom' ? custom || _aaCustomSoundData : null);
      _showModal(catIcon, String.fromCodePoint(0x1F534) + ' Time to stop ' + entry.category + '!', entry.toDisplay + ' — your session has ended');
    }, toMs));
  }
}


/* Re-arm today's quick alarms and schedules after login/refresh */
function _rearmQuickAlarms() {
  const ud = getUserData(); if (!ud) return;
  const n = new Date();
  const todayStr = n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');
  if (ud.quickAlarms) ud.quickAlarms.filter(a => a.date === todayStr).forEach(_scheduleQuickAlarm);
  if (ud.schedules) {
    ud.schedules.filter(s => s.date === todayStr).forEach(s => {
      const fromDisp = _scFmt12(s.fromTime);
      const toDisp   = _scFmt12(s.toTime);
      _scheduleQuickAlarm({ id: s.id, date: s.date, fromTime: s.fromTime, toTime: s.toTime, fromDisplay: fromDisp, toDisplay: toDisp, category: s.category, sound: 'bell' });
    });
  }
}

/* Extend renderTrends to include Quick Alarm data by category */
const _origRenderTrends = renderTrends;
renderTrends = function() {
  _origRenderTrends();
  _renderQuickAlarmTrends();
};

function _renderQuickAlarmTrends() {
  const ud = getUserData();
  if(!ud || !ud.quickAlarms || !ud.quickAlarms.length) return;
  const content = document.getElementById('trends-content');
  if(!content) return;

  // Group by category
  const byCat = {};
  ud.quickAlarms.forEach(a => {
    if(!byCat[a.category]) byCat[a.category] = [];
    byCat[a.category].push(a);
  });

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `<div style="font-size:11px;font-weight:600;color:var(--hint);text-transform:uppercase;letter-spacing:.08em;padding:12px 0 8px;border-top:.5px solid var(--border);margin-top:8px">⏰ Quick Alarm Activity</div>`;

  Object.entries(byCat).forEach(([cat, alarms]) => {
    const totalMins = alarms.reduce((s,a)=>s+(a.durationMins||0), 0);
    const totalHrs = (totalMins/60).toFixed(1);
    const avgMins = Math.round(totalMins / alarms.length);
    const catIcon = AA_CAT_ICONS[cat] || '⏰';

    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `
      <div class="chart-title">${catIcon} ${cat}</div>
      <div class="chart-sub">${alarms.length} session${alarms.length>1?'s':''} logged via Quick Alarm</div>
      <div class="diff-analysis">
        <div class="diff-chip"><strong>${totalHrs}h</strong> total</div>
        <div class="diff-chip"><strong>${avgMins}m</strong> avg/session</div>
        <div class="diff-chip muted">${alarms.length} alarm${alarms.length>1?'s':''}</div>
      </div>
      <div class="chart-rec" style="margin-top:10px">
        ${_qaInsight(cat, avgMins, alarms.length)}
      </div>`;
    wrapper.appendChild(card);
  });

  content.appendChild(wrapper);
}

function _qaInsight(cat, avgMins, count) {
  const insights = {
    'Studies': avgMins >= 60
      ? `<strong>Great focus sessions!</strong> Averaging ${avgMins} minutes of study. Consistent sessions like this build deep learning habits.`
      : `<strong>Short bursts of study</strong> (avg ${avgMins} min). Try extending to 45–60 min sessions for deeper focus.`,
    'Sleep': avgMins >= 420
      ? `<strong>Good sleep duration</strong> — averaging ${(avgMins/60).toFixed(1)} hours. Consistency is key; try keeping the same bedtime.`
      : `<strong>Sleep may be short</strong> (avg ${(avgMins/60).toFixed(1)} hrs). Most adults need 7–9 hours for full recovery.`,
    'Screen Use': avgMins <= 60
      ? `<strong>Healthy screen time!</strong> Keeping it to ${avgMins} min average is great for eye health and sleep.`
      : `<strong>Screen time is high</strong> (avg ${(avgMins/60).toFixed(1)} hrs). Consider screen-free windows, especially before bed.`,
    'Exercise': avgMins >= 30
      ? `<strong>Active lifestyle!</strong> ${avgMins} min sessions meet the WHO recommended 150 min/week goal.`
      : `<strong>Keep building!</strong> Aim for 30+ min sessions. Even short workouts add up over ${count} sessions.`,
    'Meals': avgMins <= 30
      ? `<strong>Mindful meal timing.</strong> Logging meals helps you stay aware of eating patterns.`
      : `<strong>Long meal windows</strong> (avg ${avgMins} min). Consider whether relaxed meals are intentional or distracted eating.`,
  };
  return insights[cat] || `<strong>${count} logged sessions</strong> for "${cat}". Keep tracking to reveal patterns over time.`;
}

/* Also extend History so Quick Alarm entries show their badge */
const _origRenderHistory = renderHistory;
renderHistory = function() {
  _origRenderHistory();
  // After rendering, add filter button for Quick Alarms if any exist
  const ud = getUserData();
  if(!ud || !ud.quickAlarms || !ud.quickAlarms.length) return;
  const filterWrap = document.getElementById('history-filter');
  if(!filterWrap) return;
  // Check if a QA filter button already exists
  if(filterWrap.querySelector('[data-qa-filter]')) return;
  const btn = document.createElement('button');
  btn.className = 'sound-btn' + (historyFilter === 'quickalarm' ? ' sel' : '');
  btn.textContent = '⏰ Quick Alarm';
  btn.setAttribute('data-qa-filter','1');
  btn.onclick = () => { historyFilter = 'quickalarm'; renderHistory(); };
  filterWrap.appendChild(btn);
};
/* ═══════════════════════════════════════
   SCHEDULE TRACKER  –  new tracker tab
═══════════════════════════════════════ */

const SC_CAT_ICONS = {
  'Sleep':'🌙','Work':'💻','Exercise':'🏃','Studies':'📚',
  'Meals':'🍽','Screen Use':'📱','Reading':'📖','Meditation':'🧘','Other':'✍'
};

let _scSelectedCat = '';
let _scEditId = null;   // null = new, else ID of schedule being edited

/* ── Helpers ── */
function _scFmt12(time24) {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}
function _scGet24(prefix) {
  const hEl = document.getElementById(`sc-${prefix}-h`);
  const mEl = document.getElementById(`sc-${prefix}-m`);
  const amBtn = document.getElementById(`sc-${prefix}-am`);
  let h = parseInt(hEl.value) || 12;
  const m = parseInt(mEl.value) || 0;
  const isAM = amBtn.classList.contains('sel');
  if (isAM && h === 12) h = 0;
  if (!isAM && h !== 12) h += 12;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function _scSet12(prefix, time24) {
  const [h, m] = time24.split(':').map(Number);
  const isAM = h < 12;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  document.getElementById(`sc-${prefix}-h`).value = h12;
  document.getElementById(`sc-${prefix}-m`).value = String(m).padStart(2,'0');
  document.getElementById(`sc-${prefix}-am`).classList.toggle('sel', isAM);
  document.getElementById(`sc-${prefix}-pm`).classList.toggle('sel', !isAM);
}
function scSetAmPm(prefix, val) {
  document.getElementById(`sc-${prefix}-am`).classList.toggle('sel', val==='AM');
  document.getElementById(`sc-${prefix}-pm`).classList.toggle('sel', val==='PM');
  _scUpdateDuration();
}
function _scUpdateDuration() {
  const from = _scGet24('from');
  const to   = _scGet24('to');
  const disp = document.getElementById('sc-duration-display');
  if (!disp) return;
  const [h1,m1] = from.split(':').map(Number);
  const [h2,m2] = to.split(':').map(Number);
  let diff = (h2*60+m2) - (h1*60+m1);
  if (diff < 0) diff += 1440;
  const hrs = Math.floor(diff/60);
  const mins = diff % 60;
  disp.textContent = diff === 0 ? 'Total Duration: —'
    : `Total Duration: ${hrs > 0 ? hrs+'h ' : ''}${mins > 0 ? mins+'m' : ''}`;
}

// Wire duration watchers after DOM
document.addEventListener('DOMContentLoaded', function() {
  ['sc-from-h','sc-from-m','sc-to-h','sc-to-m'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', _scUpdateDuration);
  });
});

function scSelectCat(btn) {
  document.querySelectorAll('#sc-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  _scSelectedCat = btn.dataset.cat;
  document.getElementById('sc-custom-activity').value = '';
}
function scClearCatIfTyping() {
  document.querySelectorAll('#sc-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  _scSelectedCat = '';
}

function scSetDate(rel) {
  const d = new Date();
  if (rel === 'tomorrow') d.setDate(d.getDate() + 1);
  if (rel === 'next-week') d.setDate(d.getDate() + 7);
  document.getElementById('sc-date').value = d.toISOString().split('T')[0];
}

/* ── Open / Close modal ── */
function openScheduleModal(editId) {
  _scEditId = editId || null;
  const modal = document.getElementById('schedule-modal');
  const titleEl = document.getElementById('schedule-modal-title');
  const saveBtnEl = document.getElementById('sc-save-btn');

  // Reset
  document.querySelectorAll('#sc-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  _scSelectedCat = '';
  document.getElementById('sc-custom-activity').value = '';
  _scTasks = [];
  _scRenderChecklist();
  document.getElementById('sc-task-input').value = '';
  document.getElementById('sc-msg').textContent = '';
  document.getElementById('sc-msg').className = 'auth-msg';

  if (editId) {
    // Load existing
    titleEl.textContent = '✏️ Edit Schedule';
    saveBtnEl.textContent = '💾 Update Schedule';
    const ud = getUserData();
    const sc = (ud.schedules || []).find(s => s.id === editId);
    if (sc) {
      document.getElementById('sc-date').value = sc.date;
      _scSet12('from', sc.fromTime);
      _scSet12('to', sc.toTime);
      _scTasks = sc.tasks ? JSON.parse(JSON.stringify(sc.tasks)) : [];
      _scRenderChecklist();
      const customText = SC_CAT_ICONS[sc.category] ? '' : sc.category;
      if (customText) {
        document.getElementById('sc-custom-activity').value = sc.category;
      } else {
        const catBtn = document.querySelector(`#sc-categories .aa-cat-btn[data-cat="${sc.category}"]`);
        if (catBtn) { catBtn.classList.add('sel'); _scSelectedCat = sc.category; }
      }
    }
  } else {
    titleEl.textContent = '📅 Add Schedule';
    saveBtnEl.textContent = '💾 Save Schedule';
    // default to today
    document.getElementById('sc-date').value = new Date().toISOString().split('T')[0];
    _scSet12('from', '08:00');
    _scSet12('to', '09:00');
  }
  _scUpdateDuration();
  modal.style.display = 'flex';
}

function closeScheduleModal() {
  document.getElementById('schedule-modal').style.display = 'none';
}

/* ── Save / Update ── */
async function saveSchedule() {
  const customText = document.getElementById('sc-custom-activity').value.trim();
  const category = customText || _scSelectedCat;
  const date = document.getElementById('sc-date').value;
  const tasks = _scTasks.map(t => ({...t}));  // snapshot
  const msgEl = document.getElementById('sc-msg');

  if (!category) {
    msgEl.textContent = 'Please select an activity or enter a custom one.';
    msgEl.className = 'auth-msg err';
    return;
  }
  if (!date) {
    msgEl.textContent = 'Please choose a date.';
    msgEl.className = 'auth-msg err';
    return;
  }

  const from = _scGet24('from');
  const to   = _scGet24('to');
  const [h1,m1] = from.split(':').map(Number);
  const [h2,m2] = to.split(':').map(Number);
  let durationMins = (h2*60+m2) - (h1*60+m1);
  if (durationMins < 0) durationMins += 1440;
  const durationHrs = +(durationMins / 60).toFixed(4);

  const icon = SC_CAT_ICONS[category] || '📌';
  const habitId = LF_CAT_HABIT_MAP[category] || category.toLowerCase().replace(/\s+/g, '-');
  const fromDisp = _scFmt12(from);
  const toDisp   = _scFmt12(to);

  const ud = getUserData();
  if (!ud.schedules) ud.schedules = [];

  if (_scEditId) {
    // Update existing schedule entry
    const idx = ud.schedules.findIndex(s => s.id === _scEditId);
    if (idx !== -1) {
      ud.schedules[idx] = { ...ud.schedules[idx], category, date, fromTime: from, toTime: to, durationMins, tasks, updatedAt: new Date().toISOString() };
    }
    // Update matching log entry
    const logIdx = ud.logs.findIndex(l => l.scheduleId === _scEditId);
    if (logIdx !== -1) {
      ud.logs[logIdx] = {
        ...ud.logs[logIdx],
        habitId, habitName: category, habitIcon: icon,
        date, duration: durationHrs, unit: 'hrs',
        startTime: fromDisp, endTime: toDisp,
        note: `Schedule · ${fromDisp} → ${toDisp}`
      };
    }
    msgEl.textContent = '✅ Schedule updated!';
  } else {
    // New schedule entry
    const schedId = Date.now();
    const entry = {
      id: schedId,
      category,
      date,
      fromTime: from,
      toTime: to,
      durationMins,
      tasks,
      createdAt: new Date().toISOString()
    };
    ud.schedules.push(entry);

    // Also push into logs so it appears in History and summary totals
    ud.logs.push({
      id: schedId,
      scheduleId: schedId,
      habitId,
      habitName: category,
      habitIcon: icon,
      date,
      duration: durationHrs,
      unit: 'hrs',
      startTime: fromDisp,
      endTime: toDisp,
      note: `Schedule · ${fromDisp} → ${toDisp}`,
      isSchedule: true
    });

    msgEl.textContent = '✅ Schedule saved!';

    // Sync new schedule to backend for cross-device access
    const token = localStorage.getItem('qt_token');
    if (token) {
      fetch(`${API_BASE}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          id:            schedId,
          category,
          date,
          from_time:     from,
          to_time:       to,
          duration_mins: durationMins,
          tasks:         JSON.stringify(tasks)
        })
      }).catch(e => console.warn('Schedule sync failed:', e));
    }
  }

  msgEl.className = 'auth-msg ok';
  saveUserData();

  // ── Fire start + end alarms if the schedule is for today ──
  const todayStr = new Date().toISOString().split('T')[0];
  if (date === todayStr) {
    _scheduleQuickAlarm({
      id: _scEditId || Date.now(),
      date,
      fromTime: from,
      toTime: to,
      fromDisplay: fromDisp,
      toDisplay: toDisp,
      category,
      sound: 'bell'
    });
  }

  renderTrackerSchedules();
  renderHistory();
  renderTrends();
  renderTrackerTodayLogs();
  setTimeout(() => closeScheduleModal(), 900);
}

/* ── Delete ── */
function deleteSchedule(id) {
  if (!confirm('Remove this schedule?')) return;
  const ud = getUserData();
  ud.schedules = (ud.schedules || []).filter(s => s.id !== id);
  // Also remove the matching log entry
  ud.logs = ud.logs.filter(l => l.scheduleId !== id);
  saveUserData();

  renderTrackerSchedules();
  renderHistory();
  renderTrends();
  renderTrackerTodayLogs();
}

/* ── Render ── */
function renderTrackerSchedules() {
  const ud = getUserData();
  const allSchedules = (ud && ud.schedules) ? [...ud.schedules] : [];
  const emptyState = document.getElementById('tracker-empty-state');
  const listWrap = document.getElementById('tracker-schedules-wrap');
  const listEl = document.getElementById('tracker-schedule-list');

  const today = new Date().toISOString().split('T')[0];

  // Only show today's and future schedules; silently skip past ones
  const schedules = allSchedules.filter(sc => sc.date >= today);

  if (!schedules.length) {
    emptyState.style.display = 'flex';
    listWrap.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  listWrap.style.display = 'block';
  listEl.innerHTML = '';

  // Sort by date then time
  schedules.sort((a, b) => (a.date + a.fromTime).localeCompare(b.date + b.fromTime));

  // Group by date
  const groups = {};
  schedules.forEach(sc => {
    if (!groups[sc.date]) groups[sc.date] = [];
    groups[sc.date].push(sc);
  });

  Object.keys(groups).sort().forEach(date => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'schedule-date-group';

    const d = new Date(date + 'T00:00:00');
    const label = date === today ? 'Today' : _formatDateLabel(d);

    if (date === today) {
      const headerDiv = document.createElement('div');
      headerDiv.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px';
      headerDiv.innerHTML = `<div class="schedule-date-group-label" style="margin-bottom:0">${label}</div>`;
      const clearTodayBtn = document.createElement('button');
      clearTodayBtn.type = 'button';
      clearTodayBtn.textContent = '🗑 Clear today';
      clearTodayBtn.style.cssText = 'font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:999px;background:transparent;color:var(--hint);cursor:pointer;font-family:\'Sora\',sans-serif;transition:background .15s,color .15s;flex-shrink:0';
      clearTodayBtn.onmouseover = () => { clearTodayBtn.style.background = 'var(--red-lt,#fdecea)'; clearTodayBtn.style.color = 'var(--red,#c0392b)'; };
      clearTodayBtn.onmouseout  = () => { clearTodayBtn.style.background = 'transparent'; clearTodayBtn.style.color = 'var(--hint)'; };
      clearTodayBtn.onclick = () => {
        if (!confirm('Remove all today\'s schedules and their log entries?')) return;
        const ud = getUserData();
        const todayIds = (ud.schedules || []).filter(s => s.date === today).map(s => s.id);
        ud.schedules = (ud.schedules || []).filter(s => s.date !== today);
        ud.logs = (ud.logs || []).filter(l => !(l.date === today && (l.isSchedule || todayIds.includes(l.scheduleId))));
        saveUserData();
        renderTrackerSchedules();
        renderHistory();
        renderTrends();
      };
      headerDiv.appendChild(clearTodayBtn);
      groupDiv.appendChild(headerDiv);
    } else {
      groupDiv.innerHTML = `<div class="schedule-date-group-label">${label}</div>`;
    }

    groups[date].forEach(sc => {
      const icon = SC_CAT_ICONS[sc.category] || '📌';
      const fromDisp = _scFmt12(sc.fromTime);
      const toDisp   = _scFmt12(sc.toTime);
      const hrs = Math.floor(sc.durationMins/60);
      const mins = sc.durationMins % 60;
      const durStr = (hrs > 0 ? hrs+'h ' : '') + (mins > 0 ? mins+'m' : '');

      const badgeClass = date > today ? 'future' : date === today ? 'today' : 'past';
      const badgeText  = date > today ? '📆 Upcoming' : date === today ? '📍 Today' : '✔ Past';

      const card = document.createElement('div');
      card.className = 'schedule-card';
      card.dataset.id = sc.id;

      // Build tasks HTML
      let tasksHtml = '';
      const tasks = sc.tasks || [];
      if (tasks.length) {
        const done = tasks.filter(t => t.done).length;
        tasksHtml = `<div class="sc-card-checklist" id="card-tasks-${sc.id}">
          ${tasks.map((t,i) => `
            <div class="sc-card-task">
              <input type="checkbox" class="sc-card-task-cb" ${t.done?'checked':''} onchange="scToggleCardTask(${sc.id},${i},this)" title="Mark done">
              <span class="sc-card-task-label${t.done?' done':''}" id="task-lbl-${sc.id}-${i}">${_escHtml(t.text)}</span>
            </div>`).join('')}
          <span class="sc-checklist-count">✓ ${done}/${tasks.length} done</span>
        </div>`;
      }

      card.innerHTML = `
        <div class="schedule-card-top">
          <div class="schedule-card-icon">${icon}</div>
          <div class="schedule-card-info">
            <div class="schedule-card-cat">${sc.category}</div>
            <div class="schedule-card-date">
              <span class="schedule-date-badge ${badgeClass}">${badgeText}</span>
              <span>${_niceDate(date)}</span>
            </div>
            <div class="schedule-card-time">⏰ ${fromDisp} → ${toDisp} · ${durStr || '—'}</div>
            ${tasksHtml}
          </div>
        </div>
        <div class="schedule-card-actions">
          <button class="sc-edit-btn" onclick="openScheduleModal(${sc.id})">✏️ Edit</button>
          <button class="sc-delete-btn" onclick="deleteSchedule(${sc.id})" title="Remove">🗑</button>
        </div>`;
      groupDiv.appendChild(card);
    });

    listEl.appendChild(groupDiv);
  });

  /* ── Activity summary inside tracker ── */
  _renderTrackerSummary(listEl, ud);
}

function _renderTrackerSummary(container, ud) {
  return; // Tracker summary removed per user request
  if (!ud || !ud.logs) return;
  const allLogs = ud.logs.filter(l => !l.isQuickAlarm);
  if (!allLogs.length) return;

  function _fmtHrs(hrs) {
    if (hrs < 1/60) return '< 1m';
    const totalMins = Math.round(hrs * 60);
    if (totalMins < 60) return totalMins + 'm';
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
  }

  const byActivity = {};
  allLogs.forEach(l => {
    const key = l.habitId || l.habitName;
    if (!byActivity[key]) {
      byActivity[key] = { name: l.habitName, icon: l.habitIcon || '📋', totalHrs: 0, sessions: 0 };
    }
    const hrs = l.unit === 'mins' ? l.duration / 60 : Number(l.duration) || 0;
    byActivity[key].totalHrs += hrs;
    byActivity[key].sessions += 1;
  });

  const entries = Object.values(byActivity).sort((a, b) => b.totalHrs - a.totalHrs);
  if (!entries.length) return;

  const section = document.createElement('div');
  section.className = 'hist-summary-section';
  section.innerHTML = `
    <div class="hist-summary-header">
      <span class="hist-summary-title">📊 Total by Activity</span>
      <span class="hist-summary-sub">All-time · across all logs</span>
    </div>
    <div class="hist-summary-grid">
      ${entries.map(e => `
        <div class="hist-summary-card">
          <div class="hist-summary-icon">${e.icon}</div>
          <div class="hist-summary-info">
            <div class="hist-summary-name">${e.name}</div>
            <div class="hist-summary-sessions">${e.sessions} session${e.sessions !== 1 ? 's' : ''}</div>
          </div>
          <div class="hist-summary-total">${_fmtHrs(e.totalHrs)}</div>
        </div>`).join('')}
    </div>`;
  container.appendChild(section);
}

function _niceDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
}
function _formatDateLabel(d) {
  return d.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
}

/* ── TODAY'S LOGGED TIME (shown at bottom of Tracker tab) ── */
function renderTrackerTodayLogs() {
  const wrap = document.getElementById('tracker-today-logs');
  if (!wrap) return;

  const ud = getUserData();
  const todayStr = new Date().toISOString().split('T')[0];
  const todayLogs = ud ? ud.logs.filter(l => !l.isQuickAlarm && normalizeDateValue(l.date) === todayStr) : [];

  if (!todayLogs.length) {
    wrap.innerHTML = '';
    return;
  }

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0 8px;border-top:.5px solid var(--border);margin-top:4px">
      <div style="font-size:11px;font-weight:600;color:var(--hint);letter-spacing:.07em;text-transform:uppercase">Today</div>
      <button type="button" onclick="clearTodayTrackerLogs()"
        style="font-size:11px;padding:6px 10px;border:1px solid var(--border);border-radius:999px;background:transparent;color:var(--text);cursor:pointer;font-family:'Sora',sans-serif;transition:background .15s,color .15s"
        onmouseover="this.style.background='var(--red-lt)';this.style.color='var(--red)'"
        onmouseout="this.style.background='transparent';this.style.color='var(--text)'">🗑 Clear today</button>
    </div>`;

  todayLogs.slice().sort((a, b) => b.id - a.id).forEach(l => {
    const durLabel = _fmtLogDuration(l);
    const timeLabel = l.startTime ? `<span style="color:var(--hint)"> · ${l.startTime}${l.endTime ? '–' + l.endTime : ''}</span>` : '';
    html += `
      <div style="background:var(--surf);border:.5px solid var(--border);border-radius:var(--r);padding:11px 14px;margin-bottom:8px;display:flex;align-items:center;gap:12px">
        <div style="width:34px;height:34px;border-radius:10px;background:var(--surf2);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${l.habitIcon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;color:var(--text)">${l.habitName}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px"><strong>${durLabel}</strong>${timeLabel}</div>
        </div>
        <button onclick="deleteTodayLog(${l.id})" title="Delete"
          style="background:none;border:none;cursor:pointer;color:var(--hint);font-size:16px;padding:2px 4px;flex-shrink:0;line-height:1"
          onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--hint)'">🗑</button>
      </div>`;
  });

  wrap.innerHTML = html;
}

function deleteTodayLog(logId) {
  const ud = getUserData();
  if (!ud) return;
  const idx = ud.logs.findIndex(l => l.id === logId);
  if (idx === -1) return;
  ud.logs.splice(idx, 1);
  saveUserData();
  renderTrackerTodayLogs();
  renderHistory();
  renderCalendar();
  renderTrends();
}

function clearTodayTrackerLogs() {
  const ud = getUserData();
  if (!ud) return;
  const todayStr = new Date().toISOString().split('T')[0];
  ud.logs = ud.logs.filter(l => normalizeDateValue(l.date) !== todayStr);
  saveUserData();
  renderTrackerTodayLogs();
  renderHistory();
  renderCalendar();
  renderTrends();
}

/* Patch showTab to render schedules + today logs when tracker is opened */
const _origShowTab = showTab;
showTab = function(t) {
  _origShowTab(t);
  if (t === 'tracker') { renderTrackerSchedules(); renderTrackerTodayLogs(); }
};

/* Also hide/show FAB based on active tab */
const __origShowTab = showTab;
showTab = function(t) {
  __origShowTab(t);
  const fab = document.getElementById('fab-add');
  if (fab) fab.style.display = (t === 'tracker') ? 'none' : '';
};

/* On login, render schedules and hide FAB if on tracker */
const _origLaunchApp = launchApp;
// Patch launchApp to also init schedules
document.addEventListener('DOMContentLoaded', function() {
  // After app launches, renderTrackerSchedules is called via showTab override
  // Ensure fab is visible by default (not tracker tab)
  const fab = document.getElementById('fab-add');
  if (fab) fab.style.display = '';
});

// Close schedule modal on overlay click
document.addEventListener('DOMContentLoaded', function() {
  const overlay = document.getElementById('schedule-modal');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeScheduleModal();
    });
  }
});

/* ═══════════════════════════════════════
   PLAN-YOUR-DAY CHECKLIST (Schedule modal)
═══════════════════════════════════════ */
let _scTasks = [];   // [{text, done}]

function _scRenderChecklist() {
  const container = document.getElementById('sc-checklist');
  if (!container) return;
  container.innerHTML = '';
  if (!_scTasks.length) return;

  _scTasks.forEach((task, i) => {
    const row = document.createElement('div');
    row.className = 'sc-task-row';
    row.draggable = true;
    row.dataset.idx = i;
    row.innerHTML = `
      <input type="checkbox" class="sc-task-cb" ${task.done ? 'checked' : ''}
        onchange="_scToggleTask(${i}, this)" title="Mark done">
      <span class="sc-task-text${task.done ? ' done' : ''}" id="sc-task-text-${i}">${_escHtml(task.text)}</span>
      <button type="button" class="sc-task-del" onclick="_scDeleteTask(${i})" title="Remove">✕</button>`;
    container.appendChild(row);
  });
}

function _scToggleTask(i, cb) {
  _scTasks[i].done = cb.checked;
  const lbl = document.getElementById(`sc-task-text-${i}`);
  if (lbl) lbl.classList.toggle('done', cb.checked);
}

function _scDeleteTask(i) {
  _scTasks.splice(i, 1);
  _scRenderChecklist();
}

function scAddTask() {
  const inp = document.getElementById('sc-task-input');
  const text = inp.value.trim();
  if (!text) return;
  _scTasks.push({ text, done: false });
  inp.value = '';
  _scRenderChecklist();
  inp.focus();
}

function scHandleTaskKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); scAddTask(); }
}

function scQuickAdd(btn) {
  const text = btn.textContent.trim();
  if (_scTasks.find(t => t.text === text)) return; // no dupes
  _scTasks.push({ text, done: false });
  _scRenderChecklist();
}

/* Toggle task done state directly on the schedule card (without opening modal) */
function scToggleCardTask(scheduleId, taskIdx, cb) {
  const ud = getUserData();
  if (!ud || !ud.schedules) return;
  const sc = ud.schedules.find(s => s.id === scheduleId);
  if (!sc || !sc.tasks || !sc.tasks[taskIdx]) return;
  sc.tasks[taskIdx].done = cb.checked;
  saveUserData();

  // Update label style + count inline without full re-render
  const lbl = document.getElementById(`task-lbl-${scheduleId}-${taskIdx}`);
  if (lbl) lbl.classList.toggle('done', cb.checked);

  // Update the "X/Y done" count badge
  const wrap = document.getElementById(`card-tasks-${scheduleId}`);
  if (wrap) {
    const countEl = wrap.querySelector('.sc-checklist-count');
    if (countEl) {
      const done = sc.tasks.filter(t => t.done).length;
      countEl.textContent = `✓ ${done}/${sc.tasks.length} done`;
    }
  }
}

function _escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
/* ═══════════════════════════════════════
   SINGLE ALARM
═══════════════════════════════════════ */


let _saSound = 'bell';
let _saTimers = [];  // {id, timeout, time, label}

function saSetAmPm(val) {
  document.getElementById('sa-am').classList.toggle('sel', val === 'AM');
  document.getElementById('sa-pm').classList.toggle('sel', val === 'PM');
}

function saSelectSound(btn) {
  document.querySelectorAll('#tab-tools .sound-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  _saSound = btn.dataset.sound;
  previewSound(_saSound, null);
}

function _saGetTime() {
  const h = parseInt(document.getElementById('sa-h').value) || 12;
  const m = parseInt(document.getElementById('sa-m').value) || 0;
  const isAM = document.getElementById('sa-am').classList.contains('sel');
  return to24(h, m, isAM ? 'AM' : 'PM');
}

function setSingleAlarm() {
  const time24 = _saGetTime();
  const label = document.getElementById('sa-label').value.trim() || 'Alarm';
  const msg = document.getElementById('sa-msg');
  const now = new Date();
  const [h, m] = time24.split(':').map(Number);
  const alarmTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  let delay = alarmTime - now;
  if (delay <= 0) {
    msg.textContent = '⚠️ That time has already passed today.';
    msg.className = 'auth-msg err';
    return;
  }

  const id = Date.now();
  const f = fmt12(time24);
  const displayTime = `${f.h}:${f.m} ${f.ampm}`;
  const sound = _saSound;

  const t = setTimeout(() => {
    playSound(sound, null);
    document.getElementById('alarm-modal-icon').textContent = '⏰';
    document.getElementById('alarm-modal-title').textContent = label;
    document.getElementById('alarm-modal-sub').textContent = `Single alarm · ${displayTime}`;
    document.getElementById('alarm-modal').style.display = 'flex';
    if (Notification.permission === 'granted') {
      new Notification(`⏰ ${label}`, { body: displayTime });
    }
    // Remove from list
    _saTimers = _saTimers.filter(a => a.id !== id);
    _saRenderList();
  }, delay);

  _saTimers.push({ id, t, displayTime, label, sound });
  _saRenderList();

  msg.textContent = `✅ Alarm set for ${displayTime}`;
  msg.className = 'auth-msg ok';
  setTimeout(() => { msg.textContent = ''; msg.className = 'auth-msg'; }, 3000);
}

function _saRenderList() {
  const list = document.getElementById('sa-list');
  if (!list) return;
  if (!_saTimers.length) { list.innerHTML = ''; return; }
  list.innerHTML = `<div style="font-size:11px;font-weight:600;color:var(--hint);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Active alarms</div>` +
    _saTimers.map(a => `
      <div class="sa-alarm-row">
        <span class="sa-alarm-time">⏰ ${a.displayTime}</span>
        <span class="sa-alarm-label">${_escHtml(a.label)}</span>
        <button class="sa-cancel-btn" onclick="saCancelAlarm(${a.id})">✕</button>
      </div>`).join('');
}

function saCancelAlarm(id) {
  const entry = _saTimers.find(a => a.id === id);
  if (entry) clearTimeout(entry.t);
  _saTimers = _saTimers.filter(a => a.id !== id);
  _saRenderList();
}

/* ═══════════════════════════════════════
   STOPWATCH
═══════════════════════════════════════ */
/* ═══════════════════════════════════════
   STOPWATCH
   Paste this block anywhere in spttool.js
   (replace the old STOPWATCH section entirely)
═══════════════════════════════════════ */
let _swRunning  = false;
let _swStartTime = 0;
let _swElapsed  = 0;      // ms accumulated before last pause
let _swInterval = null;
let _swLaps     = [];
let _swCat      = '';
let _swFinalMs  = 0;      // saved when stopped, for logging

/* ── Start / Pause / Resume ── */
function swStartStop() {
  const btn      = document.getElementById('sw-start-btn');
  const stopBtn  = document.getElementById('sw-stop-btn');
  const resetBtn = document.getElementById('sw-reset-btn');

  if (!_swRunning) {
    // ▶ Start (or Resume)
    _swStartTime = Date.now();
    _swInterval  = setInterval(_swTick, 100);
    _swRunning   = true;
    btn.textContent = '⏸ Pause';
    btn.classList.remove('start'); btn.classList.add('pause');
    stopBtn.disabled  = false;
    resetBtn.disabled = false;
    document.getElementById('sw-log-section').style.display = 'none';
    document.getElementById('sw-log-msg').textContent = '';
  } else {
    // ⏸ Pause
    _swElapsed += Date.now() - _swStartTime;
    clearInterval(_swInterval);
    _swRunning  = false;
    _swFinalMs  = _swElapsed;
    btn.textContent = '▶ Resume';
    btn.classList.remove('pause'); btn.classList.add('start');
  }
}

/* ── Stop — freezes timer, shows activity picker ── */
function swStop() {
  if (_swRunning) {
    _swElapsed += Date.now() - _swStartTime;
    clearInterval(_swInterval);
    _swRunning = false;
  }
  _swFinalMs = _swElapsed;

  // Reset start button to ▶ Start
  const btn = document.getElementById('sw-start-btn');
  btn.textContent = '▶ Start';
  btn.classList.remove('pause'); btn.classList.add('start');

  // Disable Stop, keep Reset enabled
  document.getElementById('sw-stop-btn').disabled = true;

  // Show activity picker with recorded time
  document.getElementById('sw-log-section').style.display = 'block';
  const timedEl = document.getElementById('sw-timed-display');
  if (timedEl) timedEl.textContent = `⏱ Time recorded: ${_swFmt(_swFinalMs)}`;

  // Clear previous selection
  document.getElementById('sw-log-msg').textContent = '';
  document.querySelectorAll('#sw-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  _swCat = '';
  const customInput = document.getElementById('sw-custom-activity');
  if (customInput) customInput.value = '';
}

/* ── Reset — clears everything back to zero ── */
function swReset() {
  clearInterval(_swInterval);
  _swRunning   = false;
  _swElapsed   = 0;
  _swStartTime = 0;
  _swFinalMs   = 0;
  _swLaps      = [];
  _swCat       = '';

  const displayEl = document.getElementById('sw-display');
  if (displayEl) displayEl.textContent = '00:00:00';

  const btn = document.getElementById('sw-start-btn');
  if (btn) {
    btn.textContent = '▶ Start';
    btn.classList.remove('pause');
    btn.classList.add('start');
  }

  const stopBtn = document.getElementById('sw-stop-btn');
  if (stopBtn) stopBtn.disabled = true;

  const resetBtn = document.getElementById('sw-reset-btn');
  if (resetBtn) resetBtn.disabled = true;

  const logSection = document.getElementById('sw-log-section');
  if (logSection) logSection.style.display = 'none';

  const lapsEl = document.getElementById('sw-laps');
  if (lapsEl) lapsEl.innerHTML = '';

  const logMsg = document.getElementById('sw-log-msg');
  if (logMsg) logMsg.textContent = '';

  document.querySelectorAll('#sw-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));

  const customInput = document.getElementById('sw-custom-activity');
  if (customInput) customInput.value = '';
}

/* ── Internal tick ── */
function _swTick() {
  const total = _swElapsed + (Date.now() - _swStartTime);
  document.getElementById('sw-display').textContent = _swFmt(total);
}

/* ── Time formatter  HH:MM:SS ── */
function _swFmt(ms) {
  const s   = Math.floor(ms / 1000);
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

/* ── Activity selection ── */
function swSelectCat(btn) {
  document.querySelectorAll('#sw-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  _swCat = btn.dataset.cat;
  const customInput = document.getElementById('sw-custom-activity');
  if (customInput) customInput.value = '';
}

function swClearCatIfTyping() {
  _swCat = '';
  document.querySelectorAll('#sw-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
}

/* ── Save to History ── */
async function swLogTime() {
  const customText = (document.getElementById('sw-custom-activity')?.value || '').trim();
  // const customText = (document.getElementById('sc-custom-activity')?.value || '').trim();
  const cat = customText || _swCat;
  
  if (!cat) {
    const msg = document.getElementById('sw-log-msg');
    msg.textContent = 'Please select an activity or type one.';
    msg.className = 'auth-msg err';
    return;
  }
  const ud = getUserData();
  if (!ud) return;

  const ms  = _swFinalMs || _swElapsed;
  const hrs = +((ms / 60000) / 60).toFixed(4);

  const catIcons = {
    'Activity':'🎯','Sleep':'🌙','Work':'💻','Exercise':'🏃','Studies':'📚',
    'Meals':'🍽','Screen Use':'📱','Reading':'📖','Meditation':'🧘'
  };
  const icon    = customText ? '✍' : (catIcons[cat] || '⏱');
  const habitId = (typeof LF_CAT_HABIT_MAP !== 'undefined' && LF_CAT_HABIT_MAP[cat])
                  || cat.toLowerCase().replace(/\s+/g, '-');
  const today   = new Date().toISOString().split('T')[0];

  // ── Save to local storage (keep as before) ──
  ud.logs.push({
    id: Date.now(), habitId, habitName: cat, habitIcon: icon,
    date: today, duration: hrs, unit: 'hrs',
    startTime: '', endTime: '', note: `Stopwatch · ${_swFmt(ms)}`
  });
  saveUserData();

  // ── POST to backend ──
  try {
    const res = await fetch(`${API_BASE}/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('qt_token')
      },
      body: JSON.stringify({
        habit_id:   habitId,
        habit_name: cat,
        habit_icon: icon,
        date:       today,
        duration:   hrs,
        unit:       'hrs',
        note:       `Stopwatch · ${_swFmt(ms)}`
      })
    });
    const data = await res.json();
    console.log('Log saved to DB:', data);
  } catch (e) {
    console.error('Failed to save log to backend:', e);
  }

  if (typeof renderHistory          === 'function') renderHistory();
  if (typeof renderCalendar         === 'function') renderCalendar();
  if (typeof renderCalendar2        === 'function') renderCalendar2();
  if (typeof renderTrends           === 'function') renderTrends();
  if (typeof renderTrackerSchedules === 'function') renderTrackerSchedules();
  if (typeof renderTrackerTodayLogs === 'function') renderTrackerTodayLogs();

  const msg = document.getElementById('sw-log-msg');
  msg.textContent = `✅ Saved ${_swFmt(ms)} of ${cat} to History!`;
  msg.className = 'auth-msg ok';
}

/* ── Lap (kept for internal use, not shown in UI) ── */
function swLap() {
  const total = _swElapsed + (Date.now() - _swStartTime);
  _swLaps.push(total);
  _swRenderLaps();
}
function _swRenderLaps() {
  const el = document.getElementById('sw-laps');
  if (!el) return;
  let prev = 0;
  el.innerHTML = _swLaps.map((t, i) => {
    const split = t - prev; prev = t;
    return `<div class="sw-lap-row">
      <span class="sw-lap-num">Lap ${i+1}</span>
      <span class="sw-lap-split">${_swFmt(split)}</span>
      <span class="sw-lap-total">${_swFmt(t)}</span>
    </div>`;
  }).join('');
}