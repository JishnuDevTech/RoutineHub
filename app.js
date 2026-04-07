// ============================================================
//  app.js — Main application logic
//  All data reads/writes go through firebase.js helpers
// ============================================================

// ===== APP STATE =====
const APP = {
    user:          null,   // Firebase Auth user object
    profile:       null,   // Firestore user profile
    tasks:         [],
    events:        [],
    schedule:      [],
    priorities:    [],
    habits:        [],
    notes:         [],
    reminders:     [],
    calMonth:      new Date().getMonth(),
    calYear:       new Date().getFullYear(),
    activeNoteId:  null,
    taskFilter:    'all',
    selectedDate:  null,
    noteTimer:     null,
    pomoState: {
      running:   false,
      total:     25 * 60,
      remaining: 25 * 60,
      interval:  null,
      session:   1,
      label:     'Work Session',
    },
  };
  
  // ===== QUOTES =====
  const QUOTES = [
    '"The secret of getting ahead is getting started."',
    '"Focus on being productive instead of busy."',
    '"Small steps every day lead to big results."',
    '"Consistency is the key to achievement."',
    '"One day or day one — you decide."',
    '"Do something today that your future self will thank you for."',
    '"You don\'t have to be great to start, but you have to start to be great."',
  ];
  
  // ============================================================
  //  AUTH FLOW
  // ============================================================
  
  // Auth state observer — central entry point
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      APP.user    = user;
      APP.profile = await getUserProfile(user.uid);
      showApp();
      startAllListeners();
      initUI();
    } else {
      APP.user    = null;
      APP.profile = null;
      unsubscribeAll();
      showAuthScreen();
    }
  });
  
  function showAuthScreen() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-shell').classList.add('hidden');
  }
  
  function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-shell').classList.remove('hidden');
    populateUserUI();
  }
  
  function populateUserUI() {
    const user    = APP.user;
    const profile = APP.profile;
    const name    = profile?.firstName
      ? `${profile.firstName} ${profile.lastName || ''}`.trim()
      : user.displayName || user.email.split('@')[0];
  
    document.getElementById('user-display-name').textContent = name;
    document.getElementById('user-email-display').textContent = user.email;
  
    const avatarEl      = document.getElementById('user-avatar');
    const fallbackEl    = document.getElementById('user-avatar-fallback');
    const photoURL      = profile?.photoURL || user.photoURL;
  
    if (photoURL) {
      avatarEl.src = photoURL;
      avatarEl.style.display = 'block';
      fallbackEl.style.display = 'none';
    } else {
      avatarEl.style.display = 'none';
      fallbackEl.style.display = 'flex';
      fallbackEl.textContent = name.charAt(0).toUpperCase();
    }
  
    // Update sidebar avatar fallback initial
    document.querySelectorAll('.user-avatar-fallback').forEach(el => {
      el.textContent = name.charAt(0).toUpperCase();
    });
  }
  
  // ===== AUTH TABS =====
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('form-' + tab.dataset.tab).classList.add('active');
    });
  });
  
  // ===== GOOGLE LOGIN =====
  ['google-login-btn', 'google-signup-btn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', async () => {
      const res = await signInWithGoogle();
      if (!res.success) showAuthError('login-error', res.error);
    });
  });
  
  // ===== EMAIL LOGIN =====
  document.getElementById('login-btn')?.addEventListener('click', async () => {
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) { showAuthError('login-error', 'Please fill in all fields.'); return; }
    const res = await signInWithEmail(email, password);
    if (!res.success) showAuthError('login-error', res.error);
  });
  
  // ===== EMAIL REGISTER =====
  document.getElementById('register-btn')?.addEventListener('click', async () => {
    const first    = document.getElementById('reg-firstname').value.trim();
    const last     = document.getElementById('reg-lastname').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    if (!first || !email || !password) { showAuthError('reg-error', 'Please fill in all required fields.'); return; }
    const res = await registerWithEmail(email, password, first, last);
    if (!res.success) showAuthError('reg-error', res.error);
  });
  
  // ===== FORGOT PASSWORD =====
  document.getElementById('forgot-link')?.addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    if (!email) { showAuthError('login-error', 'Enter your email first.'); return; }
    const res = await resetPassword(email);
    if (res.success) showAuthError('login-error', '✅ Password reset email sent!');
    else showAuthError('login-error', res.error);
  });
  
  // ===== LOGOUT =====
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await signOut();
    toast('Signed out successfully');
  });
  
  function showAuthError(elId, msg) {
    const el = document.getElementById(elId);
    if (el) el.textContent = msg;
  }
  
  // ===== ENTER KEY on auth inputs =====
  ['login-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('login-btn').click();
    });
  });
  ['reg-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('register-btn').click();
    });
  });
  
  // ============================================================
  //  REAL-TIME LISTENERS (start after login)
  // ============================================================
  
  function startAllListeners() {
    const uid = APP.user.uid;
  
    listenTasks(uid, tasks => {
      APP.tasks = tasks;
      renderTasks();
      renderDashTasks();
      updateDashStats();
    });
  
    listenEvents(uid, events => {
      APP.events = events;
      renderCalendar();
      if (APP.selectedDate) showEvents(APP.selectedDate);
    });
  
    listenSchedule(uid, blocks => {
      APP.schedule = blocks;
      renderSchedule();
      renderDashSchedule();
    });
  
    listenPriorities(uid, items => {
      APP.priorities = items;
      renderPriorities();
    });
  
    listenHabits(uid, habits => {
      APP.habits = habits;
      renderHabits();
      updateDashStats();
    });
  
    listenNotes(uid, notes => {
      APP.notes = notes;
      renderNotes();
      updateDashStats();
    });
  
    listenReminders(uid, reminders => {
      APP.reminders = reminders;
      renderReminders();
      renderDashReminders();
      checkReminderNotifications();
    });
  }
  
  // ============================================================
  //  INIT UI (once user is logged in)
  // ============================================================
  
  function initUI() {
    updateGreeting();
    renderMiniCal();
    setInterval(updateGreeting, 60000);
    setInterval(checkReminderNotifications, 60000);
    bindNavEvents();
    bindFilterEvents();
    bindNoteEvents();
    bindSearchEvent();
    document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);
    document.getElementById('hamburger-btn')?.addEventListener('click', toggleSidebar);
    document.getElementById('notif-btn')?.addEventListener('click', () => showSection('reminders'));
  }
  
  // ============================================================
  //  NAVIGATION
  // ============================================================
  
  function bindNavEvents() {
    document.querySelectorAll('.nav-item[data-section]').forEach(el => {
      el.addEventListener('click', () => {
        showSection(el.dataset.section);
        // Close sidebar on mobile
        if (window.innerWidth <= 860) {
          document.getElementById('sidebar').classList.remove('open');
        }
      });
    });
  }
  
  function showSection(name) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
    const sectionEl = document.getElementById('section-' + name);
    const navEl     = document.querySelector(`[data-section="${name}"]`);
  
    if (sectionEl) sectionEl.classList.add('active');
    if (navEl)     navEl.classList.add('active');
  
    const titleMap = {
      dashboard: 'Dashboard', tasks: 'Task Manager', calendar: 'Calendar',
      schedule: 'Schedule', priorities: 'Priorities', habits: 'Habits',
      notes: 'Notes', reminders: 'Reminders', pomodoro: 'Pomodoro', ai: 'AI Assistant',
    };
    document.getElementById('topbar-title').textContent = titleMap[name] || name;
  
    // Scroll content to top on section change
    document.getElementById('main-content').scrollTo({ top: 0, behavior: 'smooth' });
  
    // Trigger section-specific renders
    if (name === 'calendar') renderCalendar();
  }
  
  function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
  }
  
  // Close sidebar when clicking outside
  document.addEventListener('click', e => {
    const sidebar  = document.getElementById('sidebar');
    const hamburger = document.getElementById('hamburger-btn');
    if (window.innerWidth <= 860 && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && e.target !== hamburger) {
        sidebar.classList.remove('open');
      }
    }
  });
  
  // ============================================================
  //  GREETING & CLOCK
  // ============================================================
  
  function updateGreeting() {
    const h = new Date().getHours();
    const name = APP.profile?.firstName || APP.user?.displayName?.split(' ')[0] || 'there';
    const msg = h < 12 ? `Good Morning, ${name}! ☀️` : h < 17 ? `Good Afternoon, ${name}! 🌤` : `Good Evening, ${name}! 🌙`;
    const el = document.getElementById('greeting-msg');
    if (el) el.textContent = msg;
  
    const dateEl = document.getElementById('greeting-date');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
    const quoteEl = document.getElementById('quote-text');
    if (quoteEl) quoteEl.textContent = QUOTES[new Date().getDay() % QUOTES.length];
  }
  
  // ============================================================
  //  DASHBOARD STATS
  // ============================================================
  
  function updateDashStats() {
    const total = APP.tasks.length;
    const done  = APP.tasks.filter(t => t.done).length;
    const pct   = total ? Math.round((done / total) * 100) : 0;
  
    setEl('stat-tasks', total);
    setEl('stat-done', done);
    setEl('stat-notes', APP.notes.length);
  
    // Count habits completed today
    const todayIdx  = new Date().getDay();
    const todayHabits = APP.habits.filter(h => (h.completedDays || []).includes(todayIdx)).length;
    setEl('stat-habits', todayHabits);
  
    setEl('dash-progress', pct + '%');
  
    // Progress ring
    const circle = document.getElementById('progress-circle');
    if (circle) {
      const circumference = 2 * Math.PI * 34; // r=34
      const offset = circumference - (pct / 100) * circumference;
      circle.style.strokeDashoffset = offset;
    }
  
    // Badge
    const badge = document.getElementById('task-badge');
    if (badge) badge.textContent = APP.tasks.filter(t => !t.done).length;
  }
  
  function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
  
  // ============================================================
  //  DASHBOARD — quick renders
  // ============================================================
  
  function renderDashTasks() {
    const el = document.getElementById('dash-tasks-list');
    if (!el) return;
    const recent = APP.tasks.slice(0, 6);
    if (!recent.length) { el.innerHTML = '<div class="empty-state"><p>No tasks yet — add some!</p></div>'; return; }
    el.innerHTML = recent.map(t => `
      <div class="task-item ${t.done ? 'done' : ''}" style="margin-bottom:6px">
        <div class="task-check ${t.done ? 'checked' : ''}" onclick="toggleTask('${t.id}')">
          ${t.done ? checkSVG() : ''}
        </div>
        <div>
          <div class="task-name">${escHtml(t.name)}</div>
          <div class="task-meta">
            <span class="tag priority-${t.priority}">${t.priority}</span>
            <span class="tag cat-${t.category}">${t.category}</span>
          </div>
        </div>
      </div>`).join('');
  }
  
  function renderDashSchedule() {
    const el = document.getElementById('dash-schedule-list');
    if (!el) return;
    if (!APP.schedule.length) { el.innerHTML = '<div class="empty-state"><p>No schedule blocks yet</p></div>'; return; }
    const sorted = [...APP.schedule].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 5);
    el.innerHTML = sorted.map(b => `
      <div class="schedule-block ${b.color || ''}" style="margin-bottom:4px">
        <strong>${b.start}${b.end ? ' – ' + b.end : ''}</strong> · ${escHtml(b.name)}
      </div>`).join('');
  }
  
  function renderDashReminders() {
    const el = document.getElementById('dash-reminders-list');
    if (!el) return;
    if (!APP.reminders.length) { el.innerHTML = '<div class="empty-state"><p>No reminders set</p></div>'; return; }
    const sorted = [...APP.reminders].sort((a, b) => a.time.localeCompare(b.time)).slice(0, 5);
    el.innerHTML = sorted.map(r => `
      <div class="reminder-item">
        <div class="reminder-time">${r.time}</div>
        <div class="reminder-text">${escHtml(r.text)}</div>
        <span class="tag ${r.type}">${r.type.replace('priority-', '').replace('cat-', '')}</span>
      </div>`).join('');
  }
  
  // ============================================================
  //  TASKS
  // ============================================================
  
  function bindFilterEvents() {
    document.getElementById('task-filters')?.addEventListener('click', e => {
      if (e.target.dataset.filter) {
        document.querySelectorAll('#task-filters .filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        APP.taskFilter = e.target.dataset.filter;
        renderTasks();
      }
    });
  }
  
  function renderTasks() {
    const el = document.getElementById('tasks-list');
    if (!el) return;
  
    let tasks = [...APP.tasks];
    const f = APP.taskFilter;
    if (f === 'pending')  tasks = tasks.filter(t => !t.done);
    else if (f === 'done') tasks = tasks.filter(t => t.done);
    else if (f === 'high') tasks = tasks.filter(t => t.priority === 'high');
    else if (['study', 'personal', 'health', 'work', 'gaming', 'projects'].includes(f))
      tasks = tasks.filter(t => t.category === f);
  
    if (!tasks.length) { el.innerHTML = '<div class="empty-state"><p>No tasks here yet!</p></div>'; return; }
  
    el.innerHTML = tasks.map(t => `
      <div class="task-item ${t.done ? 'done' : ''}">
        <div class="task-check ${t.done ? 'checked' : ''}" onclick="toggleTask('${t.id}')">
          ${t.done ? checkSVG() : ''}
        </div>
        <div style="flex:1;min-width:0">
          <div class="task-name">${escHtml(t.name)}</div>
          <div class="task-meta">
            <span class="tag priority-${t.priority}">${t.priority}</span>
            <span class="tag cat-${t.category}">${escHtml(t.category)}</span>
          </div>
          ${t.date ? `<div class="task-date">📅 ${t.date}</div>` : ''}
        </div>
        <div class="task-actions">
          <button class="icon-btn del" onclick="deleteTask('${t.id}')" title="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>`).join('');
  }
  
  async function addTask() {
    const name = document.getElementById('task-name-input').value.trim();
    if (!name) { toast('Please enter a task name'); return; }
  
    await addTaskDB(APP.user.uid, {
      name,
      priority: document.getElementById('task-priority').value,
      category: document.getElementById('task-category').value,
      date:     document.getElementById('task-date').value,
    });
  
    document.getElementById('task-name-input').value = '';
    document.getElementById('task-date').value = '';
    closeModal('task-modal');
    toast('✅ Task added!');
  }
  
  async function toggleTask(id) {
    const t = APP.tasks.find(t => t.id === id);
    if (t) await updateTaskDB(APP.user.uid, id, { done: !t.done });
  }
  
  async function deleteTask(id) {
    await deleteTaskDB(APP.user.uid, id);
    toast('Task deleted');
  }
  
  // ============================================================
  //  CALENDAR
  // ============================================================
  
  function renderCalendar() {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const label  = document.getElementById('cal-month-label');
    if (label) label.textContent = `${months[APP.calMonth]} ${APP.calYear}`;
  
    const grid = document.getElementById('cal-grid');
    if (!grid) return;
  
    const days  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    let html    = days.map(d => `<div class="cal-dow">${d}</div>`).join('');
  
    const first      = new Date(APP.calYear, APP.calMonth, 1).getDay();
    const daysInMonth = new Date(APP.calYear, APP.calMonth + 1, 0).getDate();
    const daysInPrev  = new Date(APP.calYear, APP.calMonth, 0).getDate();
    const today      = new Date();
  
    for (let i = 0; i < first; i++) {
      html += `<div class="cal-day other-month">${daysInPrev - first + 1 + i}</div>`;
    }
  
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday  = d === today.getDate() && APP.calMonth === today.getMonth() && APP.calYear === today.getFullYear();
      const dateStr  = `${APP.calYear}-${String(APP.calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hasEvent = APP.events.some(e => e.date === dateStr);
      html += `<div class="cal-day ${isToday ? 'today' : ''} ${hasEvent ? 'has-event' : ''}" onclick="showEvents('${dateStr}')">${d}</div>`;
    }
  
    grid.innerHTML = html;
    renderMiniCal();
  }
  
  function changeMonth(dir) {
    APP.calMonth += dir;
    if (APP.calMonth > 11) { APP.calMonth = 0; APP.calYear++; }
    if (APP.calMonth < 0)  { APP.calMonth = 11; APP.calYear--; }
    renderCalendar();
  }
  
  function showEvents(dateStr) {
    APP.selectedDate = dateStr;
    const label = document.getElementById('events-date-label');
    if (label) label.textContent = `Events on ${formatDateDisplay(dateStr)}`;
    const evs = APP.events.filter(e => e.date === dateStr);
    const el  = document.getElementById('events-list');
    if (!el) return;
    if (!evs.length) { el.innerHTML = '<div class="empty-state"><p>No events on this date. Click "+ Add Event" to add one!</p></div>'; return; }
    el.innerHTML = evs.map(e => `
      <div class="event-item">
        <div class="event-dot" style="background:var(--${e.color || 'accent'})"></div>
        <div style="flex:1">
          <strong>${escHtml(e.name)}</strong>
          ${e.time ? ` <span style="color:var(--text3);font-size:12px">· ${e.time}</span>` : ''}
        </div>
        <button class="icon-btn del" onclick="deleteEvent('${e.id}')">✕</button>
      </div>`).join('');
  }
  
  async function addEvent() {
    const name = document.getElementById('event-name-input').value.trim();
    const date = document.getElementById('event-date-input').value;
    if (!name || !date) { toast('Please fill in event name and date'); return; }
  
    await addEventDB(APP.user.uid, {
      name,
      date,
      time:  document.getElementById('event-time-input').value,
      color: document.getElementById('event-color').value,
    });
  
    document.getElementById('event-name-input').value = '';
    document.getElementById('event-date-input').value = '';
    document.getElementById('event-time-input').value = '';
    closeModal('event-modal');
    toast('📅 Event added!');
  }
  
  async function deleteEvent(id) {
    await deleteEventDB(APP.user.uid, id);
    if (APP.selectedDate) showEvents(APP.selectedDate);
    toast('Event removed');
  }
  
  function renderMiniCal() {
    const el = document.getElementById('mini-cal');
    if (!el) return;
    const now = new Date(), m = now.getMonth(), y = now.getFullYear();
    const days = ['S','M','T','W','T','F','S'];
    let html = `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">`;
    html += days.map(d => `<div style="text-align:center;font-size:10px;color:var(--text3);padding:3px;font-weight:700">${d}</div>`).join('');
    const first = new Date(y, m, 1).getDay();
    const total = new Date(y, m + 1, 0).getDate();
    const today = now.getDate();
    for (let i = 0; i < first; i++) html += '<div></div>';
    for (let d = 1; d <= total; d++) {
      const isToday = d === today;
      const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const hasEv   = APP.events.some(e => e.date === dateStr);
      html += `<div style="text-align:center;font-size:11px;padding:4px 2px;border-radius:5px;cursor:pointer;position:relative;
        ${isToday ? 'background:var(--accent);color:white;font-weight:700' : 'color:var(--text2)'}
        ${hasEv && !isToday ? 'font-weight:700;color:var(--accent)' : ''}">${d}</div>`;
    }
    html += '</div>';
    el.innerHTML = html;
  }
  
  // ============================================================
  //  SCHEDULE
  // ============================================================
  
  function renderSchedule() {
    const el = document.getElementById('schedule-timeline');
    if (!el) return;
  
    const hours = Array.from({ length: 19 }, (_, i) => i + 5); // 5AM to 11PM
    let html    = '';
  
    hours.forEach(h => {
      const ampm  = h < 12 ? 'AM' : 'PM';
      const hour  = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const label = `${hour} ${ampm}`;
      const blocks = APP.schedule.filter(s => parseInt((s.start || '00:00').split(':')[0]) === h);
  
      html += `<div class="time-slot">
        <div class="time-label">${label}</div>
        <div class="time-line">
          ${blocks.map(b => `
            <div class="schedule-block ${b.color || ''}">
              <span><strong>${b.start}${b.end ? ' – ' + b.end : ''}</strong> · ${escHtml(b.name)}</span>
              <button onclick="deleteScheduleBlock('${b.id}')" style="margin-left:auto;background:none;border:none;cursor:pointer;color:inherit;opacity:0.6;font-size:12px;padding:0 4px">✕</button>
            </div>`).join('')}
        </div>
      </div>`;
    });
  
    el.innerHTML = html;
  }
  
  async function addScheduleBlock() {
    const name  = document.getElementById('sch-name-input').value.trim();
    const start = document.getElementById('sch-start').value;
    const end   = document.getElementById('sch-end').value;
    if (!name || !start) { toast('Please enter a name and start time'); return; }
  
    await addScheduleDB(APP.user.uid, {
      name, start, end,
      color: document.getElementById('sch-color').value,
    });
  
    document.getElementById('sch-name-input').value = '';
    document.getElementById('sch-start').value = '';
    document.getElementById('sch-end').value   = '';
    closeModal('schedule-modal');
    toast('🕐 Schedule block added!');
  }
  
  async function deleteScheduleBlock(id) {
    await deleteScheduleDB(APP.user.uid, id);
    toast('Block removed');
  }
  
  // ============================================================
  //  PRIORITIES
  // ============================================================
  
  function renderPriorities() {
    const el = document.getElementById('priorities-list');
    if (!el) return;
  
    if (!APP.priorities.length) { el.innerHTML = '<div class="empty-state"><p>No priorities added yet</p></div>'; return; }
  
    el.innerHTML = APP.priorities.map((p, i) => `
      <div class="priority-item">
        <div class="priority-num ${i === 1 ? 'p2' : i >= 2 ? 'p3' : ''}">${i + 1}</div>
        <div class="task-check ${p.done ? 'checked' : ''}" onclick="togglePriority('${p.id}')">
          ${p.done ? checkSVG() : ''}
        </div>
        <div style="flex:1">
          <span style="font-size:14px;font-weight:500;${p.done ? 'text-decoration:line-through;opacity:0.5' : ''}">${escHtml(p.text)}</span>
        </div>
        <button class="icon-btn del" onclick="deletePriority('${p.id}')">✕</button>
      </div>`).join('');
  
    const done = APP.priorities.filter(p => p.done).length;
    const pct  = APP.priorities.length ? Math.round((done / APP.priorities.length) * 100) : 0;
    setEl('priority-pct', pct + '%');
    const bar = document.getElementById('priority-bar');
    if (bar) bar.style.width = pct + '%';
  }
  
  async function addPriority() {
    const text = document.getElementById('priority-input').value.trim();
    if (!text) { toast('Enter a priority'); return; }
  
    await addPriorityDB(APP.user.uid, { text });
    document.getElementById('priority-input').value = '';
    closeModal('priority-modal');
    toast('⭐ Priority added!');
  }
  
  async function togglePriority(id) {
    const p = APP.priorities.find(p => p.id === id);
    if (p) await updatePriorityDB(APP.user.uid, id, { done: !p.done });
  }
  
  async function deletePriority(id) {
    await deletePriorityDB(APP.user.uid, id);
    toast('Priority removed');
  }
  
  // ============================================================
  //  HABITS
  // ============================================================
  
  const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  
  function renderHabits() {
    const el = document.getElementById('habits-list');
    if (!el) return;
  
    if (!APP.habits.length) { el.innerHTML = '<div class="empty-state"><p>No habits tracked yet! Add your first habit.</p></div>'; return; }
  
    const todayIdx = new Date().getDay();
  
    el.innerHTML = APP.habits.map(h => {
      const completed  = h.completedDays || [];
      const weekPct    = Math.round((completed.length / 7) * 100);
      const doneToday  = completed.includes(todayIdx);
  
      return `<div class="habit-item">
        <div class="habit-icon">${h.emoji || '✅'}</div>
        <div class="habit-info">
          <div class="habit-name">${escHtml(h.name)}</div>
          <div class="habit-streak">🔥 ${h.streak || 0} day streak</div>
          <div class="progress-bar mt-4" style="height:4px">
            <div class="progress-fill" style="width:${weekPct}%;background:var(--green)"></div>
          </div>
        </div>
        <div class="habit-days">
          ${WEEK_DAYS.map((d, i) => `
            <div class="habit-day ${completed.includes(i) ? 'done' : ''} ${i === todayIdx ? 'today' : ''}"
                 onclick="toggleHabitDay('${h.id}', ${i})">${d}</div>`).join('')}
        </div>
        <button class="icon-btn del" onclick="deleteHabit('${h.id}')" style="margin-left:8px" title="Delete">✕</button>
      </div>`;
    }).join('');
  }
  
  async function toggleHabitDay(id, dayIdx) {
    const h = APP.habits.find(h => h.id === id);
    if (!h) return;
  
    const completed = [...(h.completedDays || [])];
    const pos = completed.indexOf(dayIdx);
    let streak = h.streak || 0;
  
    if (pos >= 0) {
      completed.splice(pos, 1);
      if (dayIdx === new Date().getDay()) streak = Math.max(0, streak - 1);
    } else {
      completed.push(dayIdx);
      if (dayIdx === new Date().getDay()) streak++;
    }
  
    await updateHabitDB(APP.user.uid, id, { completedDays: completed, streak });
  }
  
  async function addHabit() {
    const name = document.getElementById('habit-name-input').value.trim();
    if (!name) { toast('Enter habit name'); return; }
  
    await addHabitDB(APP.user.uid, {
      name,
      emoji: document.getElementById('habit-emoji').value,
    });
  
    document.getElementById('habit-name-input').value = '';
    closeModal('habit-modal');
    toast('💪 Habit added!');
  }
  
  async function deleteHabit(id) {
    await deleteHabitDB(APP.user.uid, id);
    toast('Habit removed');
  }
  
  // ============================================================
  //  NOTES
  // ============================================================
  
  function bindNoteEvents() {
    document.getElementById('note-title')?.addEventListener('input', scheduleAutoSave);
    document.getElementById('note-body')?.addEventListener('input', scheduleAutoSave);
  }
  
  function renderNotes() {
    const listEl = document.getElementById('notes-list-items');
    if (!listEl) return;
  
    if (!APP.notes.length) {
      listEl.innerHTML = '<div class="empty-state" style="padding:20px"><p>No notes yet</p></div>';
      return;
    }
  
    listEl.innerHTML = APP.notes.map(n => `
      <div class="note-list-item ${n.id === APP.activeNoteId ? 'active' : ''}" onclick="openNote('${n.id}')">
        <div class="note-list-title">${escHtml(n.title || 'Untitled')}</div>
        <div class="note-list-preview">${escHtml((n.body || '').substring(0, 60))}</div>
        <div class="note-list-date">${n.updatedAt?.toDate ? n.updatedAt.toDate().toLocaleDateString() : (n.date || '')}</div>
      </div>`).join('');
  
    // Load active note
    if (APP.activeNoteId) {
      const note = APP.notes.find(n => n.id === APP.activeNoteId);
      if (note) {
        const titleEl = document.getElementById('note-title');
        const bodyEl  = document.getElementById('note-body');
        // Only update if user isn't actively typing
        if (titleEl && document.activeElement !== titleEl) titleEl.value = note.title || '';
        if (bodyEl  && document.activeElement !== bodyEl)  bodyEl.value  = note.body  || '';
      }
    } else if (APP.notes.length) {
      openNote(APP.notes[0].id);
    }
  }
  
  function openNote(id) {
    APP.activeNoteId = id;
    const note = APP.notes.find(n => n.id === id);
    if (note) {
      const titleEl = document.getElementById('note-title');
      const bodyEl  = document.getElementById('note-body');
      if (titleEl) titleEl.value = note.title || '';
      if (bodyEl)  bodyEl.value  = note.body  || '';
    }
    renderNotes();
  }
  
  async function newNote() {
    const ref  = await addNoteDB(APP.user.uid, { title: '', body: '' });
    APP.activeNoteId = ref.id;
    setTimeout(() => document.getElementById('note-title')?.focus(), 100);
    toast('📝 New note created');
  }
  
  function scheduleAutoSave() {
    const ind = document.getElementById('note-autosave-indicator');
    if (ind) { ind.textContent = '● Saving...'; ind.style.color = 'var(--amber)'; }
    clearTimeout(APP.noteTimer);
    APP.noteTimer = setTimeout(autoSaveNote, 800);
  }
  
  async function autoSaveNote() {
    if (!APP.activeNoteId || !APP.user) return;
    const title = document.getElementById('note-title')?.value || '';
    const body  = document.getElementById('note-body')?.value  || '';
    await updateNoteDB(APP.user.uid, APP.activeNoteId, { title, body });
    const ind = document.getElementById('note-autosave-indicator');
    if (ind) { ind.textContent = '● Auto-saved'; ind.style.color = 'var(--green)'; }
  }
  
  async function deleteNote() {
    if (!APP.activeNoteId) return;
    await deleteNoteDB(APP.user.uid, APP.activeNoteId);
    APP.activeNoteId = APP.notes.find(n => n.id !== APP.activeNoteId)?.id || null;
    const titleEl = document.getElementById('note-title');
    const bodyEl  = document.getElementById('note-body');
    if (titleEl) titleEl.value = '';
    if (bodyEl)  bodyEl.value  = '';
    toast('Note deleted');
  }
  
  function filterNotes(q) {
    const ql     = q.toLowerCase();
    const el     = document.getElementById('notes-list-items');
    if (!el) return;
    const filtered = APP.notes.filter(n =>
      (n.title || '').toLowerCase().includes(ql) ||
      (n.body  || '').toLowerCase().includes(ql)
    );
    el.innerHTML = filtered.map(n => `
      <div class="note-list-item ${n.id === APP.activeNoteId ? 'active' : ''}" onclick="openNote('${n.id}')">
        <div class="note-list-title">${escHtml(n.title || 'Untitled')}</div>
        <div class="note-list-preview">${escHtml((n.body || '').substring(0, 60))}</div>
      </div>`).join('') || '<div class="empty-state" style="padding:20px"><p>No matches</p></div>';
  }
  
  // ============================================================
  //  REMINDERS
  // ============================================================
  
  function renderReminders() {
    const el = document.getElementById('reminders-list');
    if (!el) return;
  
    if (!APP.reminders.length) { el.innerHTML = '<div class="empty-state"><p>No reminders set yet</p></div>'; return; }
  
    const sorted = [...APP.reminders].sort((a, b) => a.time.localeCompare(b.time));
    el.innerHTML = sorted.map(r => `
      <div class="reminder-item">
        <div class="reminder-time">${r.time}</div>
        <div class="reminder-text">${escHtml(r.text)}</div>
        <span class="tag ${r.type}">${r.type.replace('priority-', '').replace('cat-', '')}</span>
        <button class="icon-btn del" onclick="deleteReminder('${r.id}')" style="margin-left:8px">✕</button>
      </div>`).join('');
  }
  
  async function addReminder() {
    const text = document.getElementById('reminder-text-input').value.trim();
    const time = document.getElementById('reminder-time-input').value;
    if (!text || !time) { toast('Enter text and time'); return; }
  
    await addReminderDB(APP.user.uid, {
      text,
      time,
      type: document.getElementById('reminder-type').value,
    });
  
    document.getElementById('reminder-text-input').value = '';
    document.getElementById('reminder-time-input').value = '';
    closeModal('reminder-modal');
    toast('🔔 Reminder set!');
  }
  
  async function deleteReminder(id) {
    await deleteReminderDB(APP.user.uid, id);
    toast('Reminder removed');
  }
  
  function checkReminderNotifications() {
    const now  = new Date();
    const h    = String(now.getHours()).padStart(2, '0');
    const m    = String(now.getMinutes()).padStart(2, '0');
    const time = `${h}:${m}`;
  
    const due = APP.reminders.filter(r => r.time === time);
    due.forEach(r => toast(`🔔 Reminder: ${r.text}`));
  
    const dot = document.getElementById('notif-dot');
    if (dot) dot.classList.toggle('visible', APP.reminders.length > 0);
  }
  
  // ============================================================
  //  POMODORO
  // ============================================================
  
  function setPomo(mins, label, el) {
    resetPomo();
    APP.pomoState.total     = mins * 60;
    APP.pomoState.remaining = mins * 60;
    APP.pomoState.label     = label;
  
    setEl('pomo-label', label);
    setEl('pomo-timer', `${String(mins).padStart(2, '0')}:00`);
  
    document.querySelectorAll('#pomo-mode-btns .filter-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
  }
  
  function togglePomo() {
    const ps = APP.pomoState;
    if (ps.running) {
      clearInterval(ps.interval);
      ps.running = false;
      setEl('pomo-btn', '▶ Resume');
    } else {
      ps.running  = true;
      setEl('pomo-btn', '⏸ Pause');
      ps.interval = setInterval(() => {
        ps.remaining--;
        const m   = Math.floor(ps.remaining / 60);
        const s   = ps.remaining % 60;
        setEl('pomo-timer', `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
        const pct = ((ps.total - ps.remaining) / ps.total) * 100;
        const bar = document.getElementById('pomo-progress');
        if (bar) bar.style.width = pct + '%';
        if (ps.remaining <= 0) {
          clearInterval(ps.interval);
          ps.running = false;
          ps.session = Math.min(ps.session + 1, 4);
          setEl('pomo-session', ps.session);
          setEl('pomo-btn', '▶ Start');
          toast('🍅 Pomodoro session complete! Take a break.');
        }
      }, 1000);
    }
  }
  
  function resetPomo() {
    const ps = APP.pomoState;
    clearInterval(ps.interval);
    ps.running  = false;
    ps.remaining = ps.total;
    const m = Math.floor(ps.total / 60);
    setEl('pomo-timer', `${String(m).padStart(2, '0')}:00`);
    setEl('pomo-btn', '▶ Start');
    const bar = document.getElementById('pomo-progress');
    if (bar) bar.style.width = '0%';
  }
  
  // ============================================================
  //  GLOBAL SEARCH
  // ============================================================
  
  function bindSearchEvent() {
    const input = document.getElementById('global-search');
    if (!input) return;
    input.addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      if (!q || q.length < 2) return;
  
      const taskMatch    = APP.tasks.find(t => t.name.toLowerCase().includes(q));
      const noteMatch    = APP.notes.find(n => (n.title + n.body).toLowerCase().includes(q));
      const habitMatch   = APP.habits.find(h => h.name.toLowerCase().includes(q));
  
      if (taskMatch)  { showSection('tasks');  toast(`Found task: ${taskMatch.name}`); }
      else if (noteMatch)  { showSection('notes');  openNote(noteMatch.id); toast(`Found note: ${noteMatch.title || 'Untitled'}`); }
      else if (habitMatch) { showSection('habits'); toast(`Found habit: ${habitMatch.name}`); }
    });
  }
  
  // ============================================================
  //  MODAL HELPERS
  // ============================================================
  
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  }
  
  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }
  
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
  });
  
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
  });
  
  // ============================================================
  //  THEME TOGGLE
  // ============================================================
  
  function toggleTheme() {
    const html = document.documentElement;
    html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('rh-theme', html.dataset.theme);
  }
  
  // Restore saved theme
  const savedTheme = localStorage.getItem('rh-theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  
  // ============================================================
  //  TOAST
  // ============================================================
  
  function toast(msg, duration = 3000) {
    const wrap = document.getElementById('toast-wrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      el.style.transition = '0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }
  
  // ============================================================
  //  UTILITY HELPERS
  // ============================================================
  
  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  
  function checkSVG() {
    return `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
  }
  
  function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }