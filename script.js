// ============================================================
//  API CLIENT
// ============================================================
const API_URL = 'api.php';

const DB = {
  async fetch(endpoint, params = {}) {
    const url = new URL(API_URL, window.location.href);
    url.searchParams.append('action', endpoint);
    Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) {
        if (res.status === 401) handleAuthExpired();
        const text = await res.text();
        let msg = `Server Error (${res.status})`;
        try { msg = JSON.parse(text).error || msg; } catch(e) {}
        throw new Error(msg);
      }
      return await res.json();
    } catch (err) {
      console.error('[DB.fetch]', err);
      if (typeof showToast === 'function') showToast(err.message, 'error');
      return Array.isArray([]) ? [] : {};
    }
  },

  async post(endpoint, data) {
    const url = new URL(API_URL, window.location.href);
    url.searchParams.append('action', endpoint);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        if (res.status === 401 && endpoint !== 'login') handleAuthExpired();
        const text = await res.text();
        let msg = `Server Error (${res.status})`;
        try { msg = JSON.parse(text).error || msg; } catch(e) {}
        throw new Error(msg);
      }
      return await res.json();
    } catch (err) {
      console.error('[DB.post]', err);
      if (typeof showToast === 'function') showToast(err.message, 'error');
      return { error: err.message };
    }
  },

  // Supports multipart/form-data for file uploads
  async postForm(endpoint, formData) {
    const url = new URL(API_URL, window.location.href);
    url.searchParams.append('action', endpoint);
    try {
      const res = await fetch(url, { method: 'POST', credentials: 'same-origin', body: formData });
      if (!res.ok) {
        if (res.status === 401) handleAuthExpired();
        const text = await res.text();
        let msg = `Server Error (${res.status})`;
        try { msg = JSON.parse(text).error || msg; } catch(e) {}
        throw new Error(msg);
      }
      return await res.json();
    } catch (err) {
      console.error('[DB.postForm]', err);
      if (typeof showToast === 'function') showToast(err.message, 'error');
      return { error: err.message };
    }
  }
};

// ============================================================
//  CHANGE TRACKING
// ============================================================
let _lastSeen = null;

function initChangeTracking() {
  const key = `lastSeen_${currentUser.id}`;
  const stored = localStorage.getItem(key);
  if (stored) {
    _lastSeen = new Date(stored);
  } else {
    // First login: show changes from last 48 hours
    const d = new Date();
    d.setHours(d.getHours() - 48);
    _lastSeen = d;
  }
}

function finalizeChangeTracking() {
  if (currentUser) {
    localStorage.setItem(`lastSeen_${currentUser.id}`, new Date().toISOString());
  }
}

function isChanged(timestamp) {
  if (!timestamp || !_lastSeen) return false;
  const ts = new Date(timestamp);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7); // Only show changes from last 7 days
  return ts > _lastSeen && ts > cutoff;
}

function changeBadgeHtml(updatedAt, submittedDate) {
  if (!isChanged(updatedAt)) return '';
  const isNew = submittedDate && isChanged(submittedDate);
  if (isNew) return '<span class="change-badge change-badge-new">● NEW</span>';
  return '<span class="change-badge change-badge-updated">● UPDATED</span>';
}

function changeCardClass(updatedAt, submittedDate) {
  if (!isChanged(updatedAt)) return '';
  return isChanged(submittedDate) ? 'change-new' : 'change-updated';
}

// ============================================================
//  FILE HELPERS
// ============================================================
function getFileIcon(filename) {
  if (!filename) return '📎';
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', csv: '📊',
    ppt: '📽️', pptx: '📽️', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️',
    svg: '🖼️', webp: '🖼️', zip: '🗜️', rar: '🗜️', '7z': '🗜️', tar: '🗜️',
    gz: '🗜️', txt: '📃', md: '📃', mp4: '🎥', avi: '🎥', mp3: '🎵',
    html: '🌐', htm: '🌐', json: '⚙️', xml: '⚙️'
  };
  return map[ext] || '📎';
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

function fileDownloadLink(fileId, fileName, fileSize) {
  if (!fileId && !fileName) return '<span class="text-sm text-muted">No attachment</span>';
  if (!fileId) return `<span class="text-sm">${getFileIcon(fileName)} ${escHtml(fileName)}</span>`;
  const icon = getFileIcon(fileName);
  const size = fileSize ? `<span class="file-chip-size">${formatFileSize(fileSize)}</span>` : '';
  return `<a class="file-chip" href="api.php?action=files/download&fileId=${escAttr(fileId)}" target="_blank">${icon} ${escHtml(fileName)} ${size}</a>`;
}

// Build upload zone HTML
function uploadZoneHtml(inputId, accept = '*', label = 'Drop file here or click to browse') {
  return `
  <div class="upload-zone" id="zone_${inputId}" ondragover="uploadDragOver(event,'${inputId}')" ondragleave="uploadDragLeave(event,'${inputId}')" ondrop="uploadDrop(event,'${inputId}')">
    <input type="file" id="${inputId}" accept="${accept}" onchange="uploadSelected('${inputId}')">
    <div class="upload-zone-icon">📁</div>
    <div class="upload-zone-text">${label}</div>
    <div class="upload-zone-sub">PDF, Word, Excel, PowerPoint, Images, ZIP and more · Max 200 MB</div>
  </div>
  <div id="preview_${inputId}" style="display:none"></div>`;
}

function uploadDragOver(e, id) {
  e.preventDefault();
  document.getElementById('zone_' + id)?.classList.add('drag-over');
}
function uploadDragLeave(e, id) {
  document.getElementById('zone_' + id)?.classList.remove('drag-over');
}
function uploadDrop(e, id) {
  e.preventDefault();
  document.getElementById('zone_' + id)?.classList.remove('drag-over');
  const input = document.getElementById(id);
  if (input && e.dataTransfer.files.length) {
    // Create a new DataTransfer to set files on the input
    const dt = new DataTransfer();
    dt.items.add(e.dataTransfer.files[0]);
    input.files = dt.files;
    uploadSelected(id);
  }
}
function uploadSelected(id) {
  const input = document.getElementById(id);
  const preview = document.getElementById('preview_' + id);
  if (!input || !preview) return;
  const file = input.files[0];
  if (!file) { preview.style.display = 'none'; return; }

  const maxSize = 200 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast('File exceeds 200MB limit.', 'error');
    input.value = '';
    preview.style.display = 'none';
    return;
  }

  preview.style.display = '';
  preview.innerHTML = `
  <div class="upload-selected">
    <div class="upload-selected-icon">${getFileIcon(file.name)}</div>
    <div class="upload-selected-info">
      <div class="upload-selected-name">${escHtml(file.name)}</div>
      <div class="upload-selected-size">${formatFileSize(file.size)} · Ready to upload</div>
    </div>
    <button type="button" class="upload-remove" onclick="removeUpload('${id}')" title="Remove">✕</button>
  </div>`;
}
function removeUpload(id) {
  const input = document.getElementById(id);
  if (input) input.value = '';
  const preview = document.getElementById('preview_' + id);
  if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
}

// ============================================================
//  AUTH STATE
// ============================================================
let currentUser = null;
let currentRole = null;

function openAuth(role) {
  currentRole = role;
  document.getElementById('authTitle').textContent = `${cap(role)} Login`;
  document.getElementById('authSub').textContent = `Welcome to the FYP Management Portal`;
  document.getElementById('authModal').classList.remove('hidden');
  document.getElementById('loginForm').classList.remove('hidden');
  document.getElementById('registerForm').classList.add('hidden');
  clearAlert();
  document.querySelectorAll('[onclick="toggleRegister()"]').forEach(el => {
    el.style.display = role === 'admin' ? 'none' : '';
  });
  const saved = getSavedCredentials(role);
  if (saved.email) document.getElementById('loginEmail').value = saved.email;
  if (saved.pass)  document.getElementById('loginPassword').value = saved.pass;

  // Show demo credentials for the selected role (so testers need not open the DB).
  const demo = {
    admin:      { email: 'admin@example.com',      pass: 'admin123' },
    supervisor: { email: 'supervisor@example.com', pass: 'sup123'   },
    student:    { email: 'student@example.com',    pass: 'stu123'   }
  }[role];
  const demoBox = document.getElementById('demoCreds');
  if (demoBox && demo) {
    demoBox.innerHTML =
      `<span class="demo-creds-title">🔑 Demo ${cap(role)} Login</span>` +
      `<span class="demo-creds-row">Email: <code>${demo.email}</code></span>` +
      `<span class="demo-creds-row">Password: <code>${demo.pass}</code></span>`;
  }
}

function closeAuth() {
  document.getElementById('authModal').classList.add('hidden');
  clearAlert();
}

function toggleRegister() {
  document.getElementById('loginForm').classList.toggle('hidden');
  document.getElementById('registerForm').classList.toggle('hidden');
  clearAlert();
}

function showAlert(msg, type = 'error') {
  document.getElementById('alertBox').innerHTML = `<div class="alert alert-${type}">⚠️ ${msg}</div>`;
}
function clearAlert() { document.getElementById('alertBox').innerHTML = ''; }

function getSavedCredentials(role) {
  try { return JSON.parse(localStorage.getItem('savedCreds_' + role)) || {}; }
  catch(e) { return {}; }
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  if (!email || !pass) { showAlert('Please fill in all fields.'); return; }

  const user = await DB.post('login', { email, password: pass, role: currentRole });
  if (user.error) { showAlert('Invalid credentials or wrong role.'); return; }

  localStorage.setItem('savedCreds_' + currentRole, JSON.stringify({ email, pass }));
  currentUser = user;
  closeAuth();
  launchApp();
}

async function doRegister() {
  if (currentRole !== 'student') { showAlert('Registration only for students.'); return; }
  const name  = document.getElementById('regName').value.trim();
  const roll  = document.getElementById('regRoll').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPassword').value;
  if (!name || !roll || !email || !pass) { showAlert('Please fill all fields.'); return; }
  if (pass.length < 6) { showAlert('Password must be at least 6 characters.'); return; }

  const result = await DB.post('register', { name, rollNo: roll, email, password: pass, role: 'student' });
  if (result.error) { showAlert(result.error); return; }

  showAlert('Registration successful! Please login.', 'success');
  setTimeout(toggleRegister, 1200);
}

function logout() {
  // Destroy the server session, then reset client state.
  DB.post('logout', {});
  resetToLanding();
}

// Reset the UI back to the landing/login screen without hitting the server.
function resetToLanding() {
  finalizeChangeTracking();
  currentUser = null;
  currentRole = null;
  _lastSeen = null;
  document.getElementById('app').classList.remove('active');
  document.getElementById('landing').style.display = 'flex';
  document.getElementById('app').style.display = '';
}

// Called when the server reports the session is no longer valid (401).
let _authExpiredHandled = false;
function handleAuthExpired() {
  if (_authExpiredHandled || !currentUser) return;
  _authExpiredHandled = true;
  if (typeof showToast === 'function') showToast('Your session has expired. Please log in again.', 'warning');
  resetToLanding();
  setTimeout(() => { _authExpiredHandled = false; }, 1000);
}

// ============================================================
//  APP LAUNCH
// ============================================================
function launchApp() {
  initChangeTracking();
  document.getElementById('landing').style.display = 'none';
  document.getElementById('app').classList.add('active');
  document.getElementById('avatarInitial').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('sidebarName').textContent  = currentUser.name;
  document.getElementById('sidebarRole').textContent  = cap(currentUser.role);
  document.getElementById('roleBadge').textContent    = cap(currentUser.role);
  buildNav();
  navigate(currentRole === 'admin' ? 'admin-dashboard' : currentRole === 'supervisor' ? 'sup-dashboard' : 'stu-dashboard');
  updateNotifBadge();
}

// ============================================================
//  NAVIGATION
// ============================================================
const navConfigs = {
  student: [
    { section: 'Main', items: [
      { id: 'stu-dashboard',  icon: '🏠', label: 'Dashboard' },
      { id: 'stu-proposal',   icon: '📄', label: 'My Project' },
      { id: 'stu-supervisors',icon: '🔎', label: 'Find Supervisor' },
      { id: 'stu-milestones', icon: '🎯', label: 'Milestones' },
      { id: 'stu-tasks',      icon: '📋', label: 'My Tasks' },
      { id: 'stu-reports',    icon: '📊', label: 'Reports' },
    ]},
    { section: 'FYP Tools', items: [
      { id: 'stu-timeline',   icon: '🗓️', label: 'FYP Timeline' },
      { id: 'stu-announcements', icon: '📢', label: 'Announcements' },
      { id: 'stu-meetings',   icon: '📅', label: 'Meetings' },
      { id: 'stu-grades',     icon: '🎓', label: 'My Grades' },
      { id: 'stu-messages',   icon: '💬', label: 'Messages', notif: true },
    ]},
    { section: 'Account', items: [
      { id: 'stu-profile', icon: '👤', label: 'My Profile' },
    ]}
  ],
  supervisor: [
    { section: 'Main', items: [
      { id: 'sup-dashboard',  icon: '🏠', label: 'Dashboard' },
      { id: 'sup-proposals',  icon: '📋', label: 'Proposals' },
      { id: 'sup-projects',   icon: '📁', label: 'Active Projects' },
    ]},
    { section: 'FYP Tools', items: [
      { id: 'sup-timeline',   icon: '🗓️', label: 'FYP Timeline' },
      { id: 'sup-announcements', icon: '📢', label: 'Announcements' },
      { id: 'sup-requests',   icon: '📨', label: 'Sup. Requests' },
      { id: 'sup-meetings',   icon: '📅', label: 'Meetings' },
      { id: 'sup-evaluate',   icon: '🎓', label: 'Evaluate' },
      { id: 'sup-messages',   icon: '💬', label: 'Messages', notif: true },
    ]},
    { section: 'Account', items: [
      { id: 'sup-profile', icon: '👤', label: 'My Profile' },
    ]}
  ],
  admin: [
    { section: 'Main', items: [
      { id: 'admin-dashboard',     icon: '🏠', label: 'Dashboard' },
      { id: 'admin-users',         icon: '👥', label: 'Users' },
      { id: 'admin-projects',      icon: '📁', label: 'All Projects' },
      { id: 'admin-assignments',   icon: '🔗', label: 'Assignments' },
    ]},
    { section: 'Management', items: [
      { id: 'admin-analytics',     icon: '📈', label: 'Analytics' },
      { id: 'admin-evaluate',      icon: '🎓', label: 'Evaluations' },
      { id: 'admin-deadlines',     icon: '🗓️', label: 'FYP Timeline' },
      { id: 'admin-announcements', icon: '📢', label: 'Announcements' },
      { id: 'admin-reports',       icon: '📊', label: 'Reports' },
      { id: 'admin-audit',         icon: '📋', label: 'Audit Log' },
    ]},
    { section: 'System', items: [
      { id: 'admin-profile', icon: '👤', label: 'Profile' },
    ]}
  ]
};

async function buildNav() {
  const cfg = navConfigs[currentRole] || [];
  let html = '';
  const unreadCount = await countUnread();
  cfg.forEach(section => {
    html += `<div class="nav-section"><div class="nav-section-label">${section.section}</div>`;
    section.items.forEach(item => {
      const unread = item.notif ? unreadCount : 0;
      html += `<div class="nav-item" id="nav-${item.id}" onclick="navigate('${item.id}')">
        <span class="nav-icon">${item.icon}</span>
        <span>${item.label}</span>
        ${unread > 0 ? `<span class="notif-count" style="position:relative;top:auto;right:auto;margin-left:auto;border:none">${unread}</span>` : ''}
      </div>`;
    });
    html += '</div>';
  });
  document.getElementById('sidebarNav').innerHTML = html;
}

const pageTitles = {
  'stu-dashboard': 'Dashboard', 'stu-proposal': 'My Project', 'stu-supervisors': 'Find a Supervisor', 'stu-milestones': 'Milestones',
  'stu-tasks': 'My Tasks', 'stu-reports': 'Reports', 'stu-timeline': 'FYP Timeline', 'stu-announcements': 'Announcements', 'stu-meetings': 'Meetings', 'stu-grades': 'My Grades',
  'stu-messages': 'Messages', 'stu-profile': 'My Profile',
  'sup-dashboard': 'Dashboard', 'sup-proposals': 'Project Proposals', 'sup-projects': 'Active Projects',
  'sup-timeline': 'FYP Timeline', 'sup-announcements': 'Announcements', 'sup-requests': 'Supervision Requests', 'sup-meetings': 'Meetings', 'sup-evaluate': 'Evaluate Projects',
  'sup-messages': 'Messages', 'sup-profile': 'My Profile',
  'admin-dashboard': 'Dashboard', 'admin-users': 'User Management', 'admin-projects': 'All Projects',
  'admin-assignments': 'Supervisor Assignments', 'admin-analytics': 'Analytics & Insights', 'admin-evaluate': 'Evaluations', 'admin-deadlines': 'FYP Timeline', 'admin-announcements': 'Announcements', 'admin-reports': 'Reports Overview',
  'admin-audit': 'Audit Log', 'admin-profile': 'Profile'
};

async function navigate(viewId) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-' + viewId);
  if (navEl) navEl.classList.add('active');
  document.getElementById('pageTitle').textContent = pageTitles[viewId] || 'Dashboard';
  document.getElementById('pageContent').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text3)"><div style="text-align:center"><div style="font-size:32px;margin-bottom:12px">⏳</div><div>Loading...</div></div></div>';
  const html = await renderView(viewId);
  document.getElementById('pageContent').innerHTML = html;
  closeSidebar();
}

async function renderView(id) {
  const renders = {
    'stu-dashboard':    renderStudentDashboard,
    'stu-proposal':     renderStudentProposal,
    'stu-supervisors':  renderStudentSupervisors,
    'stu-milestones':   renderStudentMilestones,
    'stu-tasks':        renderStudentTasks,
    'stu-reports':      renderStudentReports,
    'stu-timeline':     renderTimeline,
    'stu-announcements': renderUserAnnouncements,
    'stu-meetings':     renderStudentMeetings,
    'stu-grades':       renderStudentGrades,
    'stu-messages':     renderMessages,
    'stu-profile':      renderProfile,
    'sup-dashboard':    renderSupervisorDashboard,
    'sup-proposals':    renderSupervisorProposals,
    'sup-projects':     renderSupervisorProjects,
    'sup-timeline':     renderTimeline,
    'sup-announcements': renderUserAnnouncements,
    'sup-requests':     renderSupervisorRequests,
    'sup-meetings':     renderSupervisorMeetings,
    'sup-evaluate':     renderSupervisorEvaluate,
    'sup-messages':     renderMessages,
    'sup-profile':      renderProfile,
    'admin-dashboard':  renderAdminDashboard,
    'admin-users':      renderAdminUsers,
    'admin-projects':   renderAdminProjects,
    'admin-assignments':renderAdminAssignments,
    'admin-analytics':  renderAdminAnalytics,
    'admin-evaluate':   renderSupervisorEvaluate,
    'admin-deadlines':  renderAdminDeadlines,
    'admin-announcements': renderAdminAnnouncements,
    'admin-reports':    renderAdminReports,
    'admin-audit':      renderAdminAuditLog,
    'admin-profile':    renderProfile,
  };
  return renders[id] ? await renders[id]() : `<div class="empty-state"><div class="empty-icon">🚧</div><div class="empty-title">Coming Soon</div></div>`;
}

// ============================================================
//  HELPERS
// ============================================================
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function uid() { return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }
function fmt(d) {
  if (!d) return '—';
  return new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function timeAgo(d) {
  if (!d) return '';
  const diff = Math.floor((Date.now() - new Date(d)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return fmt(d);
}
function escHtml(v = '') {
  return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
function escAttr(v = '') { return escHtml(v); }
function statusBadge(s) {
  const map = { approved: 'badge-green', pending: 'badge-yellow', rejected: 'badge-red', 'in-progress': 'badge-blue', submitted: 'badge-purple', returned: 'badge-red', completed: 'badge-green', reviewed: 'badge-green', student: 'badge-blue', supervisor: 'badge-purple', admin: 'badge-gray' };
  const labels = { 'in-progress': 'In Progress', submitted: 'Submitted', returned: 'Needs Revision' };
  return `<span class="badge ${map[s] || 'badge-gray'}">${labels[s] || cap(s || 'unknown')}</span>`;
}

let _userCache = {};
async function getUser(id) {
  if (_userCache[id]) return _userCache[id];
  const users = await DB.fetch('users');
  users.forEach(u => { _userCache[u.id] = u; });
  return _userCache[id] || { name: 'Unknown', id };
}
async function myProject() {
  const projects = await DB.fetch('projects', { studentId: currentUser.id });
  return projects[0] || null;
}
async function countUnread() {
  const inbox = await DB.fetch('messages', { inbox: 1 });
  return Array.isArray(inbox) ? inbox.filter(m => !m.is_read).length : 0;
}

// Build a unified notification list: unread messages + deadline/meeting alerts.
async function gatherNotifications() {
  const items = [];
  const now = new Date();
  const soonMs = 3 * 86400000; // 3 days
  const msgView = currentRole === 'supervisor' ? 'sup-messages' : (currentRole === 'admin' ? 'admin-dashboard' : 'stu-messages');

  try {
    const inbox = await DB.fetch('messages', { inbox: 1 });
    (inbox || []).filter(m => !m.is_read).forEach(m => items.push({
      icon: '💬', title: `New message from ${m.fromName || 'someone'}`, desc: m.text, time: m.timestamp, view: msgView, urgent: false
    }));
  } catch (e) {}

  if (currentRole === 'student') {
    const tasks = await DB.fetch('tasks', { studentId: currentUser.id });
    (tasks || []).filter(t => t.status !== 'completed' && t.dueDate).forEach(t => {
      const diff = new Date(t.dueDate + 'T23:59:59') - now;
      if (diff < 0) items.push({ icon: '🔴', title: `Overdue task: ${t.title}`, desc: `Was due ${fmt(t.dueDate)}`, time: t.dueDate, view: 'stu-tasks', urgent: true });
      else if (diff < soonMs) items.push({ icon: '⏰', title: `Task due soon: ${t.title}`, desc: `Due ${fmt(t.dueDate)}`, time: t.dueDate, view: 'stu-tasks', urgent: true });
    });
    const meetings = await DB.fetch('meetings');
    (meetings || []).filter(m => m.status === 'scheduled').forEach(m => {
      const diff = new Date(m.scheduledAt) - now;
      if (diff > 0 && diff < soonMs) items.push({ icon: '📅', title: `Upcoming: ${m.title}`, desc: fmtTime(m.scheduledAt), time: m.scheduledAt, view: 'stu-meetings', urgent: false });
    });
  } else if (currentRole === 'supervisor') {
    const reqs = await DB.fetch('supervisor_requests');
    (reqs || []).filter(r => r.status === 'pending').forEach(r => items.push({
      icon: '📨', title: 'New supervision request', desc: `${r.studentName || 'A student'} requested you as supervisor`, time: r.createdAt, view: 'sup-requests', urgent: true
    }));
    const meetings = await DB.fetch('meetings');
    (meetings || []).filter(m => m.status === 'scheduled').forEach(m => {
      const diff = new Date(m.scheduledAt) - now;
      if (diff > 0 && diff < soonMs) items.push({ icon: '📅', title: `Upcoming: ${m.title}`, desc: fmtTime(m.scheduledAt), time: m.scheduledAt, view: 'sup-meetings', urgent: false });
    });
  }

  // Department deadlines (all roles): overdue or due within 7 days.
  if (currentRole === 'student' || currentRole === 'supervisor') {
    const weekMs = 7 * 86400000;
    const tlView = currentRole === 'student' ? 'stu-timeline' : 'sup-timeline';
    const deadlines = await DB.fetch('deadlines');
    (deadlines || []).forEach(d => {
      const diff = new Date(d.dueDate + 'T23:59:59') - now;
      if (diff < 0 && diff > -weekMs) items.push({ icon: '🗓️', title: `Deadline passed: ${d.title}`, desc: `Was due ${fmt(d.dueDate)}`, time: d.dueDate, view: tlView, urgent: true });
      else if (diff >= 0 && diff < weekMs) items.push({ icon: '🗓️', title: `Deadline: ${d.title}`, desc: `Due ${fmt(d.dueDate)}`, time: d.dueDate, view: tlView, urgent: true });
    });

    // Recent department announcements (last 14 days).
    const annView = currentRole === 'student' ? 'stu-announcements' : 'sup-announcements';
    const announcements = await DB.fetch('announcements', { role: currentRole });
    (announcements || []).forEach(a => {
      if (now - new Date(a.createdAt) < 14 * 86400000) {
        items.push({ icon: '📢', title: `Announcement: ${a.title}`, desc: a.body, time: a.createdAt, view: annView, urgent: a.priority === 'urgent' });
      }
    });
  }
  return items;
}

async function updateNotifBadge() {
  const items = await gatherNotifications();
  const el = document.getElementById('notifCount');
  if (!el) return;
  const count = items.length;
  if (count > 0) { el.textContent = count > 9 ? '9+' : count; el.classList.remove('hidden'); }
  else { el.classList.add('hidden'); }
}
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}

// ============================================================
//  NOTIFICATIONS PANEL
// ============================================================
async function toggleNotifPanel() {
  let panel = document.getElementById('notifPanel');
  if (panel) { panel.remove(); return; }

  const items = await gatherNotifications();

  panel = document.createElement('div');
  panel.id = 'notifPanel';
  panel.style.cssText = 'position:fixed;top:64px;right:20px;width:340px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:0 16px 48px rgba(0,0,0,.4);z-index:200;overflow:hidden;animation:slideIn .2s ease';
  panel.innerHTML = `
  <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:14px;font-weight:700">🔔 Notifications</span>
    <button onclick="document.getElementById('notifPanel').remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px">✕</button>
  </div>
  <div style="max-height:360px;overflow-y:auto">
    ${items.length ? items.slice(0, 15).map(n => `
    <div style="padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;${n.urgent ? 'border-left:3px solid var(--danger)' : ''}" onclick="navigate('${n.view}');document.getElementById('notifPanel')?.remove()">
      <div style="font-size:12px;font-weight:600">${n.icon} ${escHtml(n.title)}</div>
      <div style="font-size:12px;color:var(--text2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(n.desc || '')}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px">${timeAgo(n.time)}</div>
    </div>`).join('') : '<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px">No new notifications 🎉</div>'}
  </div>`;
  document.body.appendChild(panel);
  setTimeout(() => document.addEventListener('click', e => { if (!panel.contains(e.target) && e.target.id !== 'notifBtn') panel.remove(); }, { once: true }), 100);
}

// ============================================================
//  HISTORY / AUDIT MODAL
// ============================================================
async function showHistoryModal(entityType, entityId, entityTitle) {
  const [logs, versions] = await Promise.all([
    DB.fetch('audit_logs', { entityType, entityId }),
    DB.fetch('document_versions', { entityType, entityId })
  ]);

  const existing = document.getElementById('historyModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'historyModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
  <div class="modal modal-lg">
    <button class="modal-close" onclick="document.getElementById('historyModal').remove()">✕</button>
    <div class="modal-title">📋 Change History</div>
    <div class="modal-sub" style="margin-bottom:16px">${escHtml(entityTitle)}</div>
    <div class="tabs">
      <button class="tab active" onclick="switchHistTab(this,'htActivity')">Activity Log <span class="badge badge-blue" style="margin-left:4px">${logs.length}</span></button>
      <button class="tab" onclick="switchHistTab(this,'htVersions')">Document Versions <span class="badge badge-purple" style="margin-left:4px">${versions.length}</span></button>
    </div>
    <div id="htActivity" class="audit-log-list">
      ${logs.length ? logs.map(renderAuditEntry).join('') : '<div class="empty-state" style="padding:30px"><div class="empty-icon">📋</div><div class="empty-title">No activity yet</div></div>'}
    </div>
    <div id="htVersions" style="display:none" class="audit-log-list">
      ${versions.length ? versions.map((v, idx) => {
        const prev = versions[idx + 1]; // versions are newest-first; prev = older
        const diffId = 'diff_' + v.id;
        return `
      <div class="audit-item">
        <div class="version-pill">v${v.version}</div>
        <div class="audit-body">
          <div class="audit-main"><span class="semi">${escHtml(v.changedByName || 'User')}</span> saved version ${v.version}</div>
          ${v.title ? `<div class="text-sm text-muted mt-1">${escHtml(v.title)}</div>` : ''}
          <div class="audit-time">${fmtTime(v.timestamp)}</div>
          ${prev
            ? `<button class="btn btn-xs mt-2" onclick="document.getElementById('${diffId}').classList.toggle('hidden')">📝 View changes from v${prev.version}</button>
               <div id="${diffId}" class="hidden">${renderDiff(prev.description, v.description)}</div>`
            : '<div class="text-xs text-muted mt-1">First version</div>'}
        </div>
      </div>`; }).join('') : '<div class="empty-state" style="padding:30px"><div class="empty-icon">📄</div><div class="empty-title">No versions saved</div></div>'}
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function switchHistTab(btn, tabId) {
  document.querySelectorAll('#historyModal .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  ['htActivity', 'htVersions'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === tabId ? '' : 'none';
  });
}

// Line-level diff (LCS) between two blocks of text → [{t:'same'|'add'|'del', v}]
function diffLines(oldStr, newStr) {
  const a = (oldStr || '').split('\n'), b = (newStr || '').split('\n');
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: 'same', v: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: 'del', v: a[i] }); i++; }
    else { out.push({ t: 'add', v: b[j] }); j++; }
  }
  while (i < n) { out.push({ t: 'del', v: a[i++] }); }
  while (j < m) { out.push({ t: 'add', v: b[j++] }); }
  return out;
}

// Render a GitHub-style red/green diff of two text blocks.
function renderDiff(oldText, newText) {
  const rows = diffLines(oldText, newText);
  if (!rows.some(r => r.t !== 'same')) return '<div class="text-sm text-muted" style="margin-top:6px">No text changes in this version.</div>';
  const body = rows.map(r => {
    const cls = r.t === 'add' ? 'diff-add' : r.t === 'del' ? 'diff-del' : 'diff-same';
    const sign = r.t === 'add' ? '+' : r.t === 'del' ? '−' : ' ';
    return `<div class="diff-row ${cls}"><span class="diff-sign">${sign}</span>${escHtml(r.v) || '&nbsp;'}</div>`;
  }).join('');
  return `<div class="diff-legend"><span><span class="sw" style="background:#2ea043"></span>added</span><span><span class="sw" style="background:#f85149"></span>removed</span></div><div class="diff-box">${body}</div>`;
}

function renderAuditEntry(log) {
  const icons = {
    created: '✅', submitted: '📤', updated: '✏️', field_updated: '✏️',
    deleted: '🗑️', status_changed: '🔄', feedback_added: '💬', reviewed: '✅',
    approved: '✅', rejected: '❌', returned: '↩️', file_uploaded: '📎',
    member_added: '➕', member_removed: '➖', reassigned: '🔗', password_changed: '🔑',
    login: '🔐', logout: '🚪', registered: '👤', progress_updated: '📈'
  };
  const actionLabels = {
    created: 'created', submitted: 'submitted', updated: 'updated', field_updated: 'updated field in',
    deleted: 'deleted', status_changed: 'changed status of', feedback_added: 'added feedback to',
    reviewed: 'reviewed', approved: 'approved', rejected: 'rejected', returned: 'returned for revision',
    file_uploaded: 'uploaded a file to', member_added: 'added a member to', member_removed: 'removed a member from',
    reassigned: 'reassigned', password_changed: 'changed password for',
    login: 'logged in', logout: 'logged out', registered: 'registered', progress_updated: 'updated progress of'
  };
  const icon = icons[log.action] || '📋';
  const actionText = actionLabels[log.action] || log.action;

  let changeHtml = '';
  if (log.fieldName && (log.oldValue || log.newValue)) {
    changeHtml = `<div class="audit-change">
      <span class="audit-field">${escHtml(log.fieldName)}:</span>
      ${log.oldValue ? `<span class="audit-old">${escHtml(String(log.oldValue).slice(0, 60))}</span><span class="audit-arrow">→</span>` : ''}
      ${log.newValue ? `<span class="audit-new">${escHtml(String(log.newValue).slice(0, 60))}</span>` : ''}
    </div>`;
  }

  return `
  <div class="audit-item">
    <div class="audit-icon">${icon}</div>
    <div class="audit-body">
      <div class="audit-main">
        <span class="semi">${escHtml(log.userName || 'System')}</span>
        <span class="text-muted"> ${actionText} </span>
        <span class="badge badge-gray" style="font-size:9px;padding:1px 6px">${log.entityType}</span>
      </div>
      ${changeHtml}
      <div class="audit-time">${fmtTime(log.timestamp)} · ${timeAgo(log.timestamp)}</div>
    </div>
  </div>`;
}

// ============================================================
//  STUDENT VIEWS
// ============================================================
async function renderStudentDashboard() {
  const [proj, unread] = await Promise.all([myProject(), countUnread()]);
  const [milestones, reports, supervisor] = proj
    ? await Promise.all([
        DB.fetch('milestones', { projectId: proj.id }),
        DB.fetch('reports',    { projectId: proj.id }),
        getUser(proj.supervisorId)
      ])
    : [[], [], null];

  const done    = milestones.filter(m => m.status === 'completed').length;
  const inprog  = milestones.filter(m => m.status === 'in-progress').length;
  const pending = milestones.filter(m => m.status === 'pending').length;
  const reviewed = reports.filter(r => r.status === 'reviewed').length;

  // Recent activity from audit
  const recentLogs = proj ? await DB.fetch('audit_logs', { entityType: 'project', entityId: proj.id, limit: 5 }) : [];

  const projChanged = proj ? changeBadgeHtml(proj.updatedAt, proj.submittedDate) : '';

  return `
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-icon">📁</div>
      <div class="stat-value">${proj ? '1' : '0'}</div>
      <div class="stat-label">Active Project</div>
      ${proj ? `<div class="stat-trend trend-${proj.status === 'approved' ? 'up' : 'down'}">● ${cap(proj.status)}</div>` : ''}
    </div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--success),#059669)">
      <div class="stat-icon">✅</div>
      <div class="stat-value">${done}</div>
      <div class="stat-label">Milestones Done</div>
      <div class="stat-trend"><span class="text-muted">${inprog} in progress · ${pending} pending</span></div>
    </div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--warning),#d97706)">
      <div class="stat-icon">📊</div>
      <div class="stat-value">${reports.length}</div>
      <div class="stat-label">Reports Submitted</div>
      <div class="stat-trend"><span class="text-muted">${reviewed} reviewed</span></div>
    </div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--accent3),#7c3aed)">
      <div class="stat-icon">💬</div>
      <div class="stat-value">${unread}</div>
      <div class="stat-label">Unread Messages</div>
      ${unread > 0 ? '<div class="stat-trend trend-down">● Needs attention</div>' : ''}
    </div>
  </div>

  ${proj ? `
  <div class="grid-2" style="margin-bottom:20px">
    <div class="card ${changeCardClass(proj.updatedAt, proj.submittedDate)}">
      <div class="card-header">
        <div class="card-title">📁 Project Overview ${projChanged}</div>
        <div class="flex gap-2">
          <button class="btn btn-xs btn-history" onclick="showHistoryModal('project','${proj.id}',${JSON.stringify(proj.title)})">📋 History</button>
          ${statusBadge(proj.status)}
        </div>
      </div>
      ${isChanged(proj.updatedAt) && !isChanged(proj.submittedDate) ? `<div class="change-indicator">✏️ This project was updated since your last visit</div>` : ''}
      <div class="text-xl bold mb-4" style="color:var(--accent)">${escHtml(proj.title)}</div>
      <div class="text-sm text-muted mb-4" style="line-height:1.7">${escHtml(proj.description || 'No description.')}</div>
      <div style="margin-bottom:16px">
        <div class="flex justify-between text-sm mb-2">
          <span class="text-muted">Overall Progress</span><span class="bold">${proj.progress || 0}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${proj.progress || 0}%"></div></div>
      </div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:8px">
        <div class="text-sm"><span class="text-muted">Supervisor:</span> <strong>${supervisor ? supervisor.name : 'Not Assigned'}</strong></div>
        <div class="text-sm"><span class="text-muted">Submitted:</span> ${fmt(proj.submittedDate)}</div>
        <div class="text-sm"><span class="text-muted">Category:</span> ${escHtml(proj.category || '—')}</div>
        <div class="text-sm"><span class="text-muted">Technologies:</span> <span class="font-mono">${escHtml(proj.technologies || '—')}</span></div>
      </div>
      ${proj.feedback ? `<div class="alert alert-info mt-3" style="margin-bottom:0">💬 <strong>Supervisor:</strong> <em>${escHtml(proj.feedback)}</em></div>` : ''}
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">🎯 Milestone Progress</div></div>
      <div class="milestone-gantt">
        ${milestones.slice(0, 5).map(m => {
          const cls = m.status === 'completed' ? 'gantt-completed' : m.status === 'in-progress' ? 'gantt-inprogress' : 'gantt-pending';
          const pct = m.status === 'completed' ? 100 : m.status === 'in-progress' ? 60 : 10;
          return `<div class="gantt-row">
            <div class="gantt-label text-sm">${escHtml(m.title)}</div>
            <div class="gantt-bar-wrap" title="${m.status}">
              <div class="gantt-bar ${cls}" style="width:${pct}%">${pct > 20 ? m.status.replace('-',' ') : ''}</div>
            </div>
          </div>`;
        }).join('')}
        ${milestones.length === 0 ? '<div class="text-sm text-muted">No milestones added yet.</div>' : ''}
      </div>
      <div class="flex gap-3 mt-4" style="font-size:11px;color:var(--text3)">
        <span>✅ ${done} done</span>
        <span>▶ ${inprog} in progress</span>
        <span>⏸ ${pending} pending</span>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><div class="card-title">🕐 Recent Activity</div></div>
    <div class="activity-feed">
      ${recentLogs.length ? recentLogs.map(log => `
      <div class="activity-item">
        <div class="activity-dot" style="background:${log.action.includes('approved') || log.action === 'reviewed' ? 'var(--success)' : log.action.includes('rejected') ? 'var(--danger)' : 'var(--accent)'}"></div>
        <div class="activity-body">
          <div class="activity-text"><strong>${escHtml(log.userName || 'System')}</strong> ${escHtml(log.action.replace(/_/g, ' '))}${log.newValue ? ` → <em>${escHtml(String(log.newValue).slice(0,40))}</em>` : ''}</div>
          <div class="activity-time">${fmtTime(log.timestamp)} · ${timeAgo(log.timestamp)}</div>
        </div>
      </div>`).join('') : '<div class="text-sm text-muted" style="padding:12px 0">No recent activity recorded.</div>'}
    </div>
  </div>` : `
  <div class="card">
    <div class="empty-state">
      <div class="empty-icon">📝</div>
      <div class="empty-title">No Project Submitted Yet</div>
      <div class="empty-desc mb-4">Start by submitting your FYP proposal to your supervisor.</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:400px;margin:0 auto">
        <div class="quick-action" onclick="navigate('stu-proposal')"><div class="quick-action-icon">📝</div><div class="quick-action-label">Submit Proposal</div></div>
        <div class="quick-action" onclick="navigate('stu-messages')"><div class="quick-action-icon">💬</div><div class="quick-action-label">Message Supervisor</div></div>
        <div class="quick-action" onclick="navigate('stu-profile')"><div class="quick-action-icon">👤</div><div class="quick-action-label">View Profile</div></div>
      </div>
    </div>
  </div>`}`;
}

async function renderStudentProposal() {
  const proj = await myProject();
  const allUsers = await DB.fetch('users');
  const supervisors = allUsers.filter(u => u.role === 'supervisor');

  if (proj) {
    const supervisor = await getUser(proj.supervisorId);
    const changed = changeCardClass(proj.updatedAt, proj.submittedDate);
    const badge   = changeBadgeHtml(proj.updatedAt, proj.submittedDate);

    // ----- Submission history (resubmissions) -----
    const submissions = await DB.fetch('proposal_submissions', { projectId: proj.id });
    // ----- Group members -----
    const members  = await DB.fetch('project_members', { projectId: proj.id });
    const isLeader = currentUser.id === proj.studentId;
    const memberIds = members.map(m => m.studentId);
    const addable  = allUsers.filter(u => u.role === 'student' && !memberIds.includes(u.id));
    const full     = members.length >= 4;
    const membersCard = `
    <div class="card mb-4">
      <div class="card-header">
        <div class="card-title">👥 ${members.length > 1 ? 'Group' : 'Individual'} Project</div>
        <span class="badge ${members.length > 1 ? 'badge-purple' : 'badge-gray'}">${members.length} member${members.length > 1 ? 's' : ''}</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Member</th><th>Roll No</th><th>Role</th>${isLeader ? '<th></th>' : ''}</tr></thead>
        <tbody>
          ${members.map(m => `<tr>
            <td class="semi">${escHtml(m.name || '—')}${m.studentId === currentUser.id ? ' <span class="text-muted">(you)</span>' : ''}</td>
            <td class="text-sm text-muted">${escHtml(m.rollNo || '—')}</td>
            <td>${m.isLeader == 1 ? '<span class="badge badge-green">Leader</span>' : '<span class="badge badge-blue">Member</span>'}</td>
            ${isLeader ? `<td>${m.isLeader == 1 ? '' : `<button class="btn btn-xs btn-danger" onclick="removeMember('${proj.id}','${m.studentId}')">Remove</button>`}</td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table></div>
      ${isLeader ? (full ? `<div class="text-sm text-muted mt-3">Group is full (maximum 4 members).</div>` : `
        <div class="flex gap-2 mt-4" style="align-items:flex-end">
          <div class="form-group" style="flex:1;margin:0"><label class="form-label">Add a group member</label>
            <select class="form-select" id="addMemberSelect">
              <option value="">Select a student…</option>
              ${addable.map(s => `<option value="${s.id}">${escHtml(s.name)}${s.rollNo ? ` — ${escHtml(s.rollNo)}` : ''}</option>`).join('')}
            </select></div>
          <button class="btn btn-primary" onclick="addMember('${proj.id}')">➕ Add</button>
        </div>
        <div class="text-xs text-muted mt-2">Add teammates to make this a group project. A student can only belong to one FYP group.</div>
      `) : ''}
    </div>`;
    return `
    <div class="card mb-4 ${changed}">
      <div class="card-header">
        <div class="card-title">📄 Project Details ${badge}</div>
        <div class="flex gap-2">
          <button class="btn btn-xs btn-history" onclick="showHistoryModal('project','${proj.id}',${JSON.stringify(proj.title)})">📋 History</button>
          ${statusBadge(proj.status)}
        </div>
      </div>
      ${isChanged(proj.updatedAt) && !isChanged(proj.submittedDate) ? `<div class="change-indicator">✏️ This project was updated since your last visit — <span style="font-weight:700">${timeAgo(proj.updatedAt)}</span></div>` : ''}
      <div class="form-grid mb-4">
        <div><div class="form-label mb-2">Project Title</div><div class="semi">${escHtml(proj.title)}</div></div>
        <div><div class="form-label mb-2">Category</div><div>${escHtml(proj.category || '—')}</div></div>
        <div><div class="form-label mb-2">Technologies</div><div class="font-mono text-sm">${escHtml(proj.technologies || '—')}</div></div>
        <div><div class="form-label mb-2">Supervisor</div><div class="semi">${escHtml(supervisor.name)}</div></div>
        <div><div class="form-label mb-2">Submitted</div><div>${fmt(proj.submittedDate)}</div></div>
        <div><div class="form-label mb-2">Progress</div>
          <div class="flex items-center gap-2">
            <div class="progress-bar" style="flex:1"><div class="progress-fill" style="width:${proj.progress || 0}%"></div></div>
            <span class="text-sm bold">${proj.progress || 0}%</span>
          </div>
        </div>
        ${proj.fileId ? `<div><div class="form-label mb-2">Proposal Document</div><div>${fileDownloadLink(proj.fileId, proj.fileName, proj.fileSize)}</div></div>` : ''}
      </div>
      <div class="form-label mb-2">Description</div>
      <div class="text-sm" style="line-height:1.8;color:var(--text2);background:var(--surface2);padding:16px;border-radius:var(--radius)">${escHtml(proj.description)}</div>
      ${proj.feedback ? `<div class="alert alert-info mt-4" style="margin-bottom:0"><strong>💬 Supervisor Feedback:</strong> ${escHtml(proj.feedback)}</div>` : ''}
    </div>

    ${membersCard}

    ${submissionTimelineHtml(submissions)}

    ${(() => {
      const rejected = proj.status === 'rejected';
      // Only the group leader can edit/resubmit the proposal.
      const editCard = isLeader ? `
      <div class="card">
        <div class="card-header"><div class="card-title">${rejected ? '🔁 Revise & Resubmit Proposal' : '✏️ Edit Proposal'}</div></div>
        ${rejected ? '<div class="alert alert-warning mb-3" style="margin-top:0">Your proposal was rejected. Revise it below and resubmit for review.</div>' : '<div class="text-sm text-muted mb-4">Update your project details. Changes are tracked in history.</div>'}
        <div class="form-group mb-3"><label class="form-label">Project Title</label><input class="form-input" id="editTitle" value="${escAttr(proj.title)}"></div>
        <div class="form-group mb-3"><label class="form-label">Technologies</label><input class="form-input" id="editTech" value="${escAttr(proj.technologies || '')}"></div>
        <div class="form-group mb-3"><label class="form-label">Description</label><textarea class="form-textarea" id="editDesc" rows="3">${escHtml(proj.description)}</textarea></div>
        <div class="form-group mb-4"><label class="form-label">Replace Attachment (optional)</label>
          ${uploadZoneHtml('editFile', '*', 'Drop updated document here or click to browse')}
        </div>
        <button class="btn btn-primary" onclick="updateProposal('${proj.id}')">${rejected ? '🔁 Resubmit for Review' : '✏️ Save Changes'}</button>
      </div>` : '';

      if (proj.status === 'approved') {
        return `<div class="grid-2">
          <div class="card">
            <div class="card-header"><div class="card-title">📈 Progress</div><span class="badge badge-blue">Auto-calculated</span></div>
            <div class="text-center" style="padding:16px 0">
              <div style="font-size:56px;font-weight:800;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1">${proj.progress || 0}%</div>
              <div class="text-sm text-muted mt-3">Based on completed milestones</div>
              <div class="progress-bar mt-4" style="height:12px"><div class="progress-fill" style="width:${proj.progress || 0}%"></div></div>
            </div>
            <div class="alert alert-info mt-4" style="margin-bottom:0;font-size:12px">🎯 Progress updates automatically when you mark milestones complete.</div>
          </div>
          ${editCard}
        </div>`;
      }
      return editCard;
    })()}`;
  }

  return `
  <div class="card">
    <div class="card-header"><div class="card-title">📄 Submit Project Proposal</div></div>
    <div id="proposalAlert"></div>
    <div class="form-group mb-4">
      <label class="form-label">Project Title *</label>
      <input class="form-input" id="propTitle" placeholder="e.g., Smart Library Management System">
    </div>
    <div class="form-grid mb-4">
      <div class="form-group">
        <label class="form-label">Category *</label>
        <select class="form-select" id="propCat">
          <option value="">Select Category</option>
          <option>Web Development</option><option>Mobile App</option><option>Machine Learning</option>
          <option>Database Systems</option><option>Network Security</option><option>IoT</option>
          <option>Cloud Computing</option><option>Blockchain</option><option>Other</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Preferred Supervisor *</label>
        <select class="form-select" id="propSup">
          <option value="">Select Supervisor</option>
          ${supervisors.map(s => `<option value="${s.id}">${escHtml(s.name)} — ${escHtml(s.specialization || 'IT')}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group mb-4">
      <label class="form-label">Technologies / Tools *</label>
      <input class="form-input" id="propTech" placeholder="e.g., HTML, CSS, PHP, MySQL">
    </div>
    <div class="form-group mb-4">
      <label class="form-label">Project Description *</label>
      <textarea class="form-textarea" id="propDesc" placeholder="Describe your project objectives, scope, methodology, and expected outcomes..." rows="5"></textarea>
    </div>
    <div class="form-group mb-4">
      <label class="form-label">Proposal Document (optional)</label>
      ${uploadZoneHtml('propFile', '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.txt', 'Drop proposal document here or click to browse')}
    </div>
    <button class="btn btn-primary" onclick="submitProposal()">🚀 Submit Proposal</button>
  </div>`;
}

async function submitProposal() {
  const title = document.getElementById('propTitle').value.trim();
  const cat   = document.getElementById('propCat').value;
  const sup   = document.getElementById('propSup').value;
  const tech  = document.getElementById('propTech').value.trim();
  const desc  = document.getElementById('propDesc').value.trim();
  const alertEl = document.getElementById('proposalAlert');

  if (!title || !cat || !sup || !tech || !desc) {
    alertEl.innerHTML = `<div class="alert alert-error">⚠️ Please fill all required fields.</div>`;
    return;
  }

  const fileEl = document.getElementById('propFile');
  const file   = fileEl?.files?.[0];
  if (file && file.size > 200 * 1024 * 1024) {
    alertEl.innerHTML = `<div class="alert alert-error">⚠️ File exceeds 200MB limit.</div>`;
    return;
  }

  alertEl.innerHTML = `<div class="alert alert-info">⏳ Submitting proposal${file ? ' and uploading file' : ''}...</div>`;

  const id = uid();
  const formData = new FormData();
  formData.append('id', id);
  formData.append('title', title);
  formData.append('category', cat);
  formData.append('supervisorId', sup);
  formData.append('technologies', tech);
  formData.append('description', desc);
  formData.append('studentId', currentUser.id);
  formData.append('studentName', currentUser.name);
  formData.append('status', 'pending');
  formData.append('submittedDate', new Date().toISOString().split('T')[0]);
  formData.append('progress', '0');
  formData.append('feedback', '');
  if (file) formData.append('file', file);

  const result = await DB.postForm('projects/create', formData);
  if (result.error) {
    alertEl.innerHTML = `<div class="alert alert-error">⚠️ ${escHtml(result.error)}</div>`;
    return;
  }
  showToast('Proposal submitted successfully!', 'success');
  navigate('stu-proposal');
}

async function updateProposal(projId) {
  const title = document.getElementById('editTitle')?.value.trim();
  const tech  = document.getElementById('editTech')?.value.trim();
  const desc  = document.getElementById('editDesc')?.value.trim();
  if (!title || !tech || !desc) { showToast('Fill all required fields.', 'error'); return; }

  const file = document.getElementById('editFile')?.files?.[0];
  if (file && file.size > 200 * 1024 * 1024) { showToast('File exceeds 200MB limit.', 'error'); return; }

  showToast('Saving changes...', 'info');
  const formData = new FormData();
  formData.append('id', projId);
  formData.append('title', title);
  formData.append('technologies', tech);
  formData.append('description', desc);
  formData.append('actorId', currentUser.id);
  formData.append('actorName', currentUser.name);
  if (file) formData.append('file', file);

  const result = await DB.postForm('projects/update', formData);
  if (result.error) { showToast(result.error, 'error'); return; }
  showToast('Project updated! Changes tracked in history.', 'success');
  navigate('stu-proposal');
}

async function addMember(projId) {
  const sel = document.getElementById('addMemberSelect');
  const studentId = sel ? sel.value : '';
  if (!studentId) { showToast('Select a student to add.', 'error'); return; }
  const res = await DB.post('projects/addMember', { projectId: projId, studentId });
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('Group member added.', 'success');
  navigate('stu-proposal');
}

async function removeMember(projId, studentId) {
  if (!confirm('Remove this member from the group?')) return;
  const res = await DB.post('projects/removeMember', { projectId: projId, studentId });
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('Member removed.', 'info');
  navigate('stu-proposal');
}


async function renderStudentMilestones() {
  const proj = await myProject();
  if (!proj) return `<div class="card"><div class="empty-state"><div class="empty-icon">🎯</div><div class="empty-title">No Project Found</div><div class="empty-desc">Submit a project proposal first.</div></div></div>`;

  const [milestones, allTasks] = await Promise.all([
    DB.fetch('milestones', { projectId: proj.id }),
    DB.fetch('tasks', { studentId: currentUser.id })
  ]);
  const myTasks = allTasks.filter(t => t.projectId === proj.id);

  const done           = milestones.filter(m => m.status === 'completed').length;
  const overdueMilest  = milestones.filter(m => m.status !== 'completed' && new Date(m.dueDate + 'T00:00:00') < new Date()).length;
  const overdueTasks   = myTasks.filter(t => t.status !== 'completed' && new Date(t.dueDate + 'T00:00:00') < new Date()).length;
  const pendingTasks   = myTasks.filter(t => t.status !== 'completed').length;

  return `
  <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--success),#059669)">
      <div class="stat-icon">✅</div><div class="stat-value">${done}/${milestones.length}</div><div class="stat-label">Milestones Done</div>
    </div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--danger),#dc2626)">
      <div class="stat-icon">⚠️</div><div class="stat-value">${overdueMilest}</div><div class="stat-label">Overdue Phases</div>
      ${overdueMilest ? '<div class="stat-trend trend-down">● Needs attention</div>' : ''}
    </div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--accent3),#7c3aed)">
      <div class="stat-icon">📋</div><div class="stat-value">${pendingTasks}</div><div class="stat-label">Pending Tasks</div>
    </div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--warning),#d97706)">
      <div class="stat-icon">🔥</div><div class="stat-value">${overdueTasks}</div><div class="stat-label">Overdue Tasks</div>
      ${overdueTasks ? '<div class="stat-trend trend-down">● Act now</div>' : ''}
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-title">🎯 Project Milestones & Tasks</div>
      <span class="badge badge-gray" style="font-size:10px">Set by supervisor</span>
    </div>

    ${milestones.length ? milestones.map(m => {
      const isOverdue = m.status !== 'completed' && new Date(m.dueDate + 'T00:00:00') < new Date();
      const cls = m.status === 'completed' ? 'ms-completed' : isOverdue ? 'ms-overdue' : m.status === 'in-progress' ? 'ms-inprogress' : 'ms-pending';
      const mTasks = myTasks.filter(t => t.milestoneId === m.id);
      const taskDone = mTasks.filter(t => t.status === 'completed').length;
      return `
      <div class="milestone-detail-card ${cls} mb-3">
        <div class="ms-status-indicator"></div>
        <div class="ms-content">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-2" style="flex-wrap:wrap">
                <span class="semi">${escHtml(m.title)}</span>
                ${statusBadge(m.status)}
                ${isOverdue ? '<span class="badge badge-red" style="font-size:9px">⚠ OVERDUE</span>' : ''}
                ${changeBadgeHtml(m.updatedAt, null)}
              </div>
              ${m.description ? `<div class="text-sm text-muted mb-3" style="line-height:1.7;background:var(--surface);padding:10px 12px;border-radius:8px">${escHtml(m.description)}</div>` : ''}
              <div class="flex gap-4 text-xs" style="flex-wrap:wrap;color:var(--text3)">
                <span>📅 Deadline: <strong style="color:${isOverdue ? 'var(--danger)' : 'var(--text)'};font-size:12px">${fmt(m.dueDate)}</strong></span>
                ${m.createdByName ? `<span>👨‍🏫 Assigned by: <strong style="color:var(--text2)">${escHtml(m.createdByName)}</strong></span>` : ''}
                ${mTasks.length ? `<span>📋 Tasks: <strong>${taskDone}/${mTasks.length} done</strong></span>` : ''}
              </div>
            </div>
          </div>

          ${mTasks.length ? `<div class="ms-tasks-list">${mTasks.map(t => taskRowHtml(t)).join('')}</div>` : ''}

          ${proj.status === 'approved' ? `
          <div class="flex gap-2 mt-3">
            ${m.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="setMilestoneStatus('${m.id}','in-progress')">▶ Start Phase</button>` : ''}
            ${m.status === 'in-progress' ? `<button class="btn btn-success btn-sm" onclick="setMilestoneStatus('${m.id}','completed')">✓ Complete Phase</button>` : ''}
            ${m.status === 'completed' ? `<span style="color:var(--success);font-size:13px;font-weight:600">✅ Phase Complete · ${fmt(m.updatedAt)}</span>` : ''}
            ${m.status !== 'pending' ? `<button class="btn btn-ghost btn-sm" onclick="setMilestoneStatus('${m.id}','pending')">↩ Reopen</button>` : ''}
          </div>` : ''}
        </div>
      </div>`;
    }).join('') : `
    <div class="empty-state" style="padding:40px 20px">
      <div class="empty-icon">🎯</div>
      <div class="empty-title">No Milestones Assigned Yet</div>
      <div class="empty-desc">Your supervisor will define project milestones and assign tasks.<br>Check back after discussing your project plan.</div>
    </div>`}

    ${myTasks.filter(t => !t.milestoneId).length ? `
    <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:20px">
      <div class="form-label mb-3">📋 Standalone Tasks</div>
      ${myTasks.filter(t => !t.milestoneId).map(t => taskRowHtml(t)).join('')}
    </div>` : ''}
  </div>`;
}

function taskRowHtml(t) {
  const isOverdue = t.status !== 'completed' && new Date(t.dueDate + 'T00:00:00') < new Date();
  const priorityColor = { low: 'var(--success)', medium: 'var(--accent)', high: 'var(--warning)', urgent: 'var(--danger)' }[t.priority] || 'var(--accent)';
  return `
  <div class="task-row ${t.status === 'completed' ? 'task-done' : ''} ${isOverdue ? 'task-overdue' : ''}">
    <div class="task-priority-dot" style="background:${priorityColor}"></div>
    <div class="task-row-content">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2" style="flex-wrap:wrap">
          <span class="semi text-sm ${t.status === 'completed' ? 'line-through' : ''}">${escHtml(t.title)}</span>
          <span class="task-priority-label" style="color:${priorityColor}">${(t.priority || 'medium').toUpperCase()}</span>
          ${isOverdue ? '<span class="badge badge-red" style="font-size:9px">OVERDUE</span>' : ''}
        </div>
        ${statusBadge(t.status)}
      </div>
      ${t.description ? `<div class="text-xs text-muted mt-1" style="line-height:1.5">${escHtml(t.description)}</div>` : ''}
      <div class="flex gap-3 mt-2 items-center" style="flex-wrap:wrap">
        <span class="text-xs" style="color:${isOverdue ? 'var(--danger)' : 'var(--text3)'}">📅 ${fmt(t.dueDate)}</span>
        ${t.status !== 'completed' ? `
        <button class="btn btn-xs btn-primary" style="padding:2px 10px;font-size:11px" onclick="updateTaskStatus('${t.id}','${t.status === 'pending' ? 'in-progress' : 'completed'}')">
          ${t.status === 'pending' ? '▶ Start' : '✓ Complete'}
        </button>` : `<span style="color:var(--success);font-size:11px;font-weight:600">✅ Done ${t.completedDate ? fmt(t.completedDate) : ''}</span>`}
      </div>
    </div>
  </div>`;
}

async function setMilestoneStatus(id, status) {
  await DB.post('milestones/updateStatus', { id, status, actorId: currentUser.id, actorName: currentUser.name });
  const proj = await myProject();
  if (proj) {
    const milestones = await DB.fetch('milestones', { projectId: proj.id });
    const total    = milestones.length;
    const done     = milestones.filter(m => (m.id === id ? status : m.status) === 'completed').length;
    const progress = total > 0 ? Math.round(done / total * 100) : 0;
    await DB.post('projects/updateProgress', { id: proj.id, progress, actorId: currentUser.id, actorName: currentUser.name });
  }
  navigate('stu-milestones');
}

async function updateTaskStatus(taskId, status) {
  await DB.post('tasks/updateStatus', { id: taskId, status, actorId: currentUser.id, actorName: currentUser.name });
  const dest = currentRole === 'student' ? 'stu-milestones' : 'sup-projects';
  navigate(dest);
}

async function renderStudentTasks() {
  const allTasks = await DB.fetch('tasks', { studentId: currentUser.id });
  const now = new Date();
  const isOverdueFn = t => t.status !== 'completed' && new Date(t.dueDate + 'T00:00:00') < now;
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  const priorityColor = p => ({ low: 'var(--success)', medium: 'var(--accent)', high: 'var(--warning)', urgent: 'var(--danger)' }[p] || 'var(--accent)');

  const active    = allTasks.filter(t => t.status !== 'completed').sort((a, b) => {
    const od = Number(isOverdueFn(b)) - Number(isOverdueFn(a));
    if (od !== 0) return od;
    const pd = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
    if (pd !== 0) return pd;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });
  const completed  = allTasks.filter(t => t.status === 'completed');
  const overdue    = active.filter(isOverdueFn);

  return `
  <div class="stat-grid">
    <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-value">${allTasks.length}</div><div class="stat-label">Total Tasks</div></div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--danger),#dc2626)">
      <div class="stat-icon">🔥</div><div class="stat-value">${overdue.length}</div><div class="stat-label">Overdue</div>
      ${overdue.length ? '<div class="stat-trend trend-down">● Immediate action needed</div>' : ''}
    </div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--accent),var(--accent2))">
      <div class="stat-icon">▶</div><div class="stat-value">${active.filter(t => t.status === 'in-progress').length}</div><div class="stat-label">In Progress</div>
    </div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--success),#059669)">
      <div class="stat-icon">✅</div><div class="stat-value">${completed.length}</div><div class="stat-label">Completed</div>
    </div>
  </div>

  ${overdue.length ? `
  <div class="alert alert-error mb-4">
    <span style="font-size:22px;flex-shrink:0">🚨</span>
    <div><div class="semi mb-1">You have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}!</div>
    <div class="text-sm">${overdue.map(t => escHtml(t.title)).join(' · ')}</div></div>
  </div>` : ''}

  ${active.length ? `
  <div class="card mb-4">
    <div class="card-header">
      <div class="card-title">📋 Active Tasks</div>
      <span class="badge badge-blue">${active.length} remaining</span>
    </div>
    ${active.map(t => {
      const od = isOverdueFn(t);
      const pc = priorityColor(t.priority);
      return `
      <div class="task-full-card ${od ? 'task-overdue-card' : ''} mb-3">
        <div class="task-full-left" style="background:${pc}"></div>
        <div class="task-full-body">
          <div class="flex justify-between items-start" style="flex-wrap:wrap;gap:8px">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1" style="flex-wrap:wrap">
                <span class="semi">${escHtml(t.title)}</span>
                <span style="font-size:9px;font-weight:800;padding:2px 7px;border-radius:4px;background:${pc}22;color:${pc};border:1px solid ${pc}44">${(t.priority || 'medium').toUpperCase()}</span>
                ${od ? '<span class="badge badge-red" style="font-size:9px">OVERDUE</span>' : ''}
              </div>
              ${t.description ? `<div class="text-sm text-muted mb-2" style="line-height:1.6">${escHtml(t.description)}</div>` : ''}
              <div class="flex gap-4 text-xs" style="flex-wrap:wrap;color:var(--text3)">
                <span>📅 Due: <strong style="color:${od ? 'var(--danger)' : 'var(--text)'}">${fmt(t.dueDate)}</strong></span>
                ${t.projectTitle ? `<span>📁 ${escHtml(t.projectTitle)}</span>` : ''}
                ${t.assignedByName ? `<span>👨‍🏫 By ${escHtml(t.assignedByName)}</span>` : ''}
              </div>
            </div>
            ${statusBadge(t.status)}
          </div>
          <div class="flex gap-2 mt-3">
            <button class="btn btn-primary btn-sm" onclick="openTaskModal('${t.id}')">📂 Open / Submit Work</button>
            ${t.status === 'returned' ? '<span class="badge badge-red" style="align-self:center">Needs revision — see feedback</span>' : ''}
            ${t.status === 'submitted' ? '<span class="badge badge-purple" style="align-self:center">Awaiting review</span>' : ''}
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>` : ''}

  ${completed.length ? `
  <div class="card">
    <div class="card-header"><div class="card-title">✅ Completed Tasks</div><span class="badge badge-green">${completed.length}</span></div>
    ${completed.map(t => `
    <div class="task-completed-row">
      <span style="font-size:18px">✅</span>
      <div class="flex-1 min-w-0">
        <div class="text-sm line-through" style="color:var(--text3)">${escHtml(t.title)}</div>
        <div class="text-xs text-muted">Completed ${t.completedDate ? fmt(t.completedDate) : '—'} · Assigned by ${escHtml(t.assignedByName || 'Supervisor')}</div>
      </div>
      <button class="btn btn-ghost btn-xs" onclick="openTaskModal('${t.id}')">📂 Details</button>
    </div>`).join('')}
  </div>` : ''}

  ${!allTasks.length ? `
  <div class="card"><div class="empty-state">
    <div class="empty-icon">📋</div>
    <div class="empty-title">No Tasks Assigned Yet</div>
    <div class="empty-desc">Your supervisor will assign specific tasks with deadlines once the project is underway.</div>
  </div></div>` : ''}`;
}

async function renderStudentReports() {
  const proj = await myProject();
  if (!proj) return `<div class="card"><div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">No Project Found</div></div></div>`;

  const reports = await DB.fetch('reports', { projectId: proj.id });
  const pendingCount  = reports.filter(r => r.status === 'pending').length;
  const reviewedCount = reports.filter(r => r.status === 'reviewed').length;

  return `
  <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
    <div class="stat-card"><div class="stat-icon">📊</div><div class="stat-value">${reports.length}</div><div class="stat-label">Total Reports</div></div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--warning),#d97706)"><div class="stat-icon">⏳</div><div class="stat-value">${pendingCount}</div><div class="stat-label">Awaiting Review</div></div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--success),#059669)"><div class="stat-icon">✅</div><div class="stat-value">${reviewedCount}</div><div class="stat-label">Reviewed</div></div>
  </div>

  <div class="card mb-4">
    <div class="card-header">
      <div class="card-title">📊 Submitted Reports</div>
      <span class="badge badge-blue">${reports.length} total</span>
    </div>
    ${reports.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Report Title</th><th>Attachment</th><th>Submitted</th><th>Status</th><th>Supervisor Feedback</th><th></th></tr></thead>
        <tbody>
          ${reports.map(r => {
            const ch = changeBadgeHtml(r.updatedAt, r.submittedDate);
            return `<tr class="${changeCardClass(r.updatedAt, r.submittedDate)}">
              <td class="semi">${escHtml(r.title)} ${ch}</td>
              <td>${fileDownloadLink(r.fileId, r.fileName, r.fileSize)}</td>
              <td class="text-sm text-muted">${fmt(r.submittedDate)}</td>
              <td>${statusBadge(r.status)}</td>
              <td class="text-sm text-muted">${r.feedback ? escHtml(r.feedback) : '<em>Awaiting review</em>'}</td>
              <td><button class="btn btn-xs btn-history" onclick="showHistoryModal('report','${r.id}',${JSON.stringify(r.title)})">📋</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : '<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">No Reports Yet</div><div class="empty-desc">Submit your first progress report below.</div></div>'}
  </div>

  ${proj.status === 'approved' ? `
  <div class="card">
    <div class="card-header"><div class="card-title">📤 Submit New Report</div></div>
    <div id="reportAlert"></div>
    <div class="form-group mb-4"><label class="form-label">Report Title *</label><input class="form-input" id="repTitle" placeholder="e.g., Phase 3 Progress Report"></div>
    <div class="form-group mb-4"><label class="form-label">Summary / Description *</label><textarea class="form-textarea" id="repDesc" placeholder="Describe what has been accomplished, challenges faced, and next steps..." rows="4"></textarea></div>
    <div class="form-group mb-4">
      <label class="form-label">Attach Report File (optional)</label>
      ${uploadZoneHtml('repFile', '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.txt,.mp4', 'Drop report document here or click to browse')}
    </div>
    <button class="btn btn-primary" onclick="submitReport()">📤 Submit Report</button>
  </div>` : ''}`;
}

async function submitReport() {
  const title = document.getElementById('repTitle').value.trim();
  const desc  = document.getElementById('repDesc').value.trim();
  const alertEl = document.getElementById('reportAlert');
  if (!title || !desc) { alertEl.innerHTML = `<div class="alert alert-error">⚠️ Fill all required fields.</div>`; return; }

  const file = document.getElementById('repFile')?.files?.[0];
  if (file && file.size > 200 * 1024 * 1024) {
    alertEl.innerHTML = `<div class="alert alert-error">⚠️ File exceeds 200MB limit.</div>`;
    return;
  }

  alertEl.innerHTML = `<div class="alert alert-info">⏳ Submitting${file ? ' and uploading file' : ''}...</div>`;

  const proj = await myProject();
  const formData = new FormData();
  formData.append('id', uid());
  formData.append('projectId', proj.id);
  formData.append('studentId', currentUser.id);
  formData.append('studentName', currentUser.name);
  formData.append('title', title);
  formData.append('description', desc);
  formData.append('submittedDate', new Date().toISOString().split('T')[0]);
  if (file) formData.append('file', file);

  const result = await DB.postForm('reports/create', formData);
  if (result.error) { alertEl.innerHTML = `<div class="alert alert-error">⚠️ ${escHtml(result.error)}</div>`; return; }
  showToast('Report submitted!', 'success');
  navigate('stu-reports');
}

// ============================================================
//  MESSAGES
// ============================================================
async function renderMessages() {
  await buildNav();
  await updateNotifBadge();

  const allUsers = await DB.fetch('users');
  let contactPool = [];

  if (currentRole === 'student') {
    // Supervisor + my group teammates.
    const proj = await myProject();
    if (proj) {
      const members = await DB.fetch('project_members', { projectId: proj.id });
      const ids = new Set(members.map(m => m.studentId).filter(id => id !== currentUser.id));
      ids.add(proj.supervisorId);
      contactPool = allUsers.filter(u => ids.has(u.id));
    }
  } else if (currentRole === 'supervisor') {
    // All members across all my approved projects (not just the leaders).
    const myProjects = await DB.fetch('projects', { supervisorId: currentUser.id });
    const approved = myProjects.filter(p => p.status === 'approved');
    const memberLists = await Promise.all(approved.map(p => DB.fetch('project_members', { projectId: p.id })));
    const ids = new Set();
    memberLists.forEach(list => list.forEach(m => ids.add(m.studentId)));
    contactPool = allUsers.filter(u => ids.has(u.id));
  } else {
    contactPool = allUsers.filter(u => u.id !== currentUser.id);
  }

  return `
  <div style="display:grid;grid-template-columns:280px 1fr;gap:20px;height:calc(100vh - 140px)">
    <div class="card" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);font-weight:700;font-size:14px">💬 Conversations</div>
      <div style="flex:1;overflow-y:auto">
        ${contactPool.length ? contactPool.map(u => `
        <div onclick="openChat('${u.id}')" style="padding:14px 20px;border-bottom:1px solid var(--border);cursor:pointer;transition:var(--transition)" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
          <div class="flex items-center gap-3">
            <div style="width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent3));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0">${u.name.charAt(0)}</div>
            <div>
              <div class="semi text-sm">${escHtml(u.name)}</div>
              <div class="text-xs text-muted">${cap(u.role || '')}</div>
            </div>
          </div>
        </div>`).join('') : '<div class="text-sm text-muted" style="padding:20px">No contacts available.</div>'}
      </div>
    </div>
    <div class="card" id="chatArea" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
      <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text3)">
        <div style="text-align:center"><div style="font-size:48px;margin-bottom:16px">💬</div><div class="text-muted">Select a conversation to start messaging</div></div>
      </div>
    </div>
  </div>`;
}

async function openChat(partnerId) {
  const partner  = await getUser(partnerId);
  const chatMsgs = await DB.fetch('messages', { toId: currentUser.id, fromId: partnerId });
  document.getElementById('chatArea').innerHTML = `
  <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">
    <div style="width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent3));display:flex;align-items:center;justify-content:center;font-weight:700">${partner.name.charAt(0)}</div>
    <div><div class="semi">${escHtml(partner.name)}</div><div class="text-xs text-muted">${cap(partner.role)}</div></div>
  </div>
  <div id="chatMsgs" style="flex:1;overflow-y:auto;padding:20px">
    ${chatMsgs.length ? chatMsgs.map(m => `
    <div>
      <div class="msg-bubble ${m.fromId === currentUser.id ? 'sent' : 'recv'}">${escHtml(m.text)}</div>
      <div class="msg-meta" style="${m.fromId === currentUser.id ? 'text-align:right' : ''}">${fmtTime(m.timestamp)}</div>
    </div>`).join('') : '<div class="text-sm text-muted text-center">No messages yet. Say hello! 👋</div>'}
  </div>
  <div style="padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:10px">
    <input class="form-input" id="msgInput" placeholder="Type a message..." style="flex:1" onkeypress="if(event.key==='Enter')sendMsg('${partnerId}')">
    <button class="btn btn-primary" onclick="sendMsg('${partnerId}')">Send →</button>
  </div>`;
  setTimeout(() => { const el = document.getElementById('chatMsgs'); if (el) el.scrollTop = el.scrollHeight; }, 50);
}

async function sendMsg(toId) {
  const input = document.getElementById('msgInput');
  const text  = input?.value.trim();
  if (!text) return;
  await DB.post('messages/create', { id: uid(), fromId: currentUser.id, toId, text, timestamp: new Date().toISOString() });
  input.value = '';
  await openChat(toId);
  await updateNotifBadge();
}

// ============================================================
//  PROFILE
// ============================================================
function renderProfile() {
  const u = currentUser;
  return `
  <div style="max-width:600px">
    <div class="card mb-4">
      <div style="display:flex;align-items:center;gap:20px;margin-bottom:24px">
        <div style="width:72px;height:72px;border-radius:20px;background:linear-gradient(135deg,var(--accent),var(--accent3));display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800">${u.name.charAt(0)}</div>
        <div>
          <div class="text-xl bold">${escHtml(u.name)}</div>
          <div class="text-sm text-muted">${escHtml(u.email)}</div>
          <div class="mt-2">${statusBadge(u.role)}</div>
        </div>
      </div>
      <div class="form-grid mb-2">
        <div><div class="form-label mb-2">Roll Number</div><div class="font-mono semi">${escHtml(u.rollNo || '—')}</div></div>
        <div><div class="form-label mb-2">Member Since</div><div>${fmt(u.joinDate)}</div></div>
      </div>
    </div>

    <div class="card mb-4">
      <div class="card-header"><div class="card-title">✏️ Edit Profile</div></div>
      <div id="profileAlert"></div>
      <div class="form-group mb-3"><label class="form-label">Full Name *</label><input class="form-input" id="profName" value="${escAttr(u.name)}"></div>
      ${u.role === 'student'
        ? `<div class="form-group mb-3"><label class="form-label">Program</label><input class="form-input" id="profProgram" value="${escAttr(u.program || '')}" placeholder="e.g., BS IT"></div>`
        : `<div class="form-group mb-3"><label class="form-label">Specialization</label><input class="form-input" id="profSpec" value="${escAttr(u.specialization || '')}" placeholder="e.g., AI, Web"></div>`}
      <div class="form-group mb-4"><label class="form-label">Department</label><input class="form-input" id="profDept" value="${escAttr(u.department || 'IT')}"></div>
      <button class="btn btn-primary" onclick="saveProfile()">💾 Save Profile</button>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">🔑 Change Password</div></div>
      <div id="pwdAlert"></div>
      <div class="form-group mb-4"><label class="form-label">Current Password</label><input class="form-input" type="password" id="oldPwd" placeholder="••••••••"></div>
      <div class="form-group mb-4"><label class="form-label">New Password</label><input class="form-input" type="password" id="newPwd" placeholder="Min. 6 characters"></div>
      <button class="btn btn-primary" onclick="changePassword()">💾 Save Password</button>
    </div>
  </div>`;
}

async function saveProfile() {
  const alertEl = document.getElementById('profileAlert');
  const name = document.getElementById('profName').value.trim();
  if (!name) { alertEl.innerHTML = `<div class="alert alert-error">Name is required.</div>`; return; }
  const payload = { name, department: document.getElementById('profDept')?.value.trim() || '' };
  const progEl = document.getElementById('profProgram'); if (progEl) payload.program = progEl.value.trim();
  const specEl = document.getElementById('profSpec');    if (specEl) payload.specialization = specEl.value.trim();
  const res = await DB.post('users/update', payload);
  if (res.error) { alertEl.innerHTML = `<div class="alert alert-error">${escHtml(res.error)}</div>`; return; }
  // Reflect changes in the live session/sidebar.
  currentUser.name = name; if (progEl) currentUser.program = payload.program;
  if (specEl) currentUser.specialization = payload.specialization; currentUser.department = payload.department;
  document.getElementById('sidebarName').textContent = name;
  document.getElementById('avatarInitial').textContent = name.charAt(0).toUpperCase();
  showToast('Profile updated.', 'success');
  navigate(currentRole === 'admin' ? 'admin-profile' : currentRole === 'supervisor' ? 'sup-profile' : 'stu-profile');
}

async function changePassword() {
  const oldPwd  = document.getElementById('oldPwd').value.trim();
  const newPwd  = document.getElementById('newPwd').value.trim();
  const alertEl = document.getElementById('pwdAlert');
  if (!oldPwd || !newPwd) { alertEl.innerHTML = `<div class="alert alert-error">Fill both fields.</div>`; return; }
  if (newPwd.length < 6) { alertEl.innerHTML = `<div class="alert alert-error">New password must be at least 6 characters.</div>`; return; }
  const result = await DB.post('users/changePassword', { id: currentUser.id, oldPassword: oldPwd, newPassword: newPwd });
  if (result.error) { alertEl.innerHTML = `<div class="alert alert-error">${escHtml(result.error)}</div>`; return; }
  alertEl.innerHTML = `<div class="alert alert-success">✅ Password changed successfully!</div>`;
  document.getElementById('oldPwd').value = '';
  document.getElementById('newPwd').value = '';
}

// ============================================================
//  SUPERVISOR VIEWS
// ============================================================
async function renderSupervisorDashboard() {
  const [myProjects, allUsers] = await Promise.all([
    DB.fetch('projects', { supervisorId: currentUser.id }),
    DB.fetch('users')
  ]);

  const pending  = myProjects.filter(p => p.status === 'pending');
  const approved = myProjects.filter(p => p.status === 'approved');
  const rejected = myProjects.filter(p => p.status === 'rejected');
  const studIds  = [...new Set(approved.map(p => p.studentId))];
  const recentLogs = await DB.fetch('audit_logs', { entityType: 'project', limit: 8 });

  // Filter logs to only projects I supervise
  const myProjIds = new Set(myProjects.map(p => p.id));
  const myLogs    = recentLogs.filter(l => myProjIds.has(l.entityId));

  return `
  <div class="stat-grid">
    <div class="stat-card"><div class="stat-icon">📁</div><div class="stat-value">${myProjects.length}</div><div class="stat-label">Total Projects</div></div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--warning),#d97706)"><div class="stat-icon">⏳</div><div class="stat-value">${pending.length}</div><div class="stat-label">Pending Review</div>
      ${pending.length > 0 ? `<div class="stat-trend trend-down">● Needs attention</div>` : ''}
    </div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--success),#059669)"><div class="stat-icon">✅</div><div class="stat-value">${approved.length}</div><div class="stat-label">Approved</div></div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--accent3),#7c3aed)"><div class="stat-icon">👨‍🎓</div><div class="stat-value">${studIds.length}</div><div class="stat-label">Active Students</div></div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-header"><div class="card-title">📋 Projects Overview</div></div>
      ${myProjects.length ? `
      <div style="display:flex;flex-direction:column;gap:12px">
        ${(await Promise.all(myProjects.map(async p => {
          const stu = allUsers.find(u => u.id === p.studentId) || { name: 'Unknown' };
          const ch  = changeBadgeHtml(p.updatedAt, p.submittedDate);
          return `<div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border)">
            <div style="flex:1;min-width:0">
              <div class="semi text-sm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.title)} ${ch}</div>
              <div class="text-xs text-muted">${escHtml(stu.name)} · ${fmt(p.submittedDate)}</div>
              <div class="progress-bar" style="height:4px;margin-top:6px"><div class="progress-fill" style="width:${p.progress || 0}%"></div></div>
            </div>
            <div class="flex flex-col items-center gap-2">${statusBadge(p.status)}<span class="text-xs bold" style="color:var(--accent)">${p.progress || 0}%</span></div>
          </div>`;
        }))).join('')}
      </div>` : '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No Projects Yet</div></div>'}
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">🕐 Recent Changes</div><span class="badge badge-blue">${myLogs.length}</span></div>
      <div class="activity-feed">
        ${myLogs.length ? myLogs.slice(0, 6).map(log => `
        <div class="activity-item">
          <div class="activity-dot" style="background:${log.action.includes('approved') || log.action === 'reviewed' ? 'var(--success)' : log.action.includes('rejected') ? 'var(--danger)' : 'var(--accent)'}"></div>
          <div class="activity-body">
            <div class="activity-text"><strong>${escHtml(log.userName || 'User')}</strong> ${escHtml(log.action.replace(/_/g, ' '))}${log.newValue ? ` → <em>${escHtml(String(log.newValue).slice(0, 30))}</em>` : ''}</div>
            <div class="activity-time">${fmtTime(log.timestamp)}</div>
          </div>
        </div>`).join('') : '<div class="text-sm text-muted" style="padding:12px 0">No recent activity.</div>'}
      </div>
    </div>
  </div>`;
}

// Renders the per-attempt submission/review history (only when resubmitted).
function submissionTimelineHtml(subs) {
  if (!subs || subs.length <= 1) return '';
  const asc = [...subs].sort((a, b) => a.attempt - b.attempt);
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:12px">
    <div class="semi text-sm mb-2">🔁 Submission history — ${subs.length} attempts</div>
    ${asc.map(s => `<div style="padding:7px 0;border-top:1px solid var(--border)">
      <div class="flex items-center gap-2" style="flex-wrap:wrap">
        <span class="badge badge-gray">Attempt #${s.attempt}</span>
        ${statusBadge(s.status)}
        <span class="text-xs text-muted">submitted ${fmtTime(s.submittedAt)}${s.reviewedAt ? ` · reviewed ${fmtTime(s.reviewedAt)}` : ''}</span>
      </div>
      ${s.feedback ? `<div class="text-xs text-muted mt-1">💬 ${escHtml(s.feedback)}</div>` : ''}
    </div>`).join('')}
  </div>`;
}

async function renderSupervisorProposals() {
  const myProjects = await DB.fetch('projects', { supervisorId: currentUser.id });
  const pending    = myProjects.filter(p => p.status === 'pending');
  const allUsers   = await DB.fetch('users');
  // Pre-fetch each pending proposal's submission history.
  const subsLists  = await Promise.all(pending.map(p => DB.fetch('proposal_submissions', { projectId: p.id })));
  const subsByProj = {}; pending.forEach((p, i) => { subsByProj[p.id] = subsLists[i]; });

  return `
  <div class="card">
    <div class="card-header">
      <div class="card-title">📋 Pending Proposals</div>
      <span class="badge badge-yellow">${pending.length} Pending</span>
    </div>
    ${pending.length ? pending.map(p => {
      const stu = allUsers.find(u => u.id === p.studentId) || { name: 'Unknown', rollNo: '' };
      return `
      <div class="card mb-4 change-new" style="background:var(--surface2)">
        <div class="flex justify-between items-center mb-3">
          <div>
            <div class="semi text-lg">${escHtml(p.title)} <span class="change-badge change-badge-new">NEW</span></div>
            <div class="text-xs text-muted mt-1">🎓 ${escHtml(stu.name)} (${escHtml(stu.rollNo || '')}) · ${fmt(p.submittedDate)}</div>
          </div>
          <button class="btn btn-xs btn-history" onclick="showHistoryModal('project','${p.id}',${JSON.stringify(p.title)})">📋 History</button>
        </div>
        ${(subsByProj[p.id] && subsByProj[p.id].length > 1) ? `<div class="alert alert-warning mb-3" style="margin-top:0">🔁 Resubmission — attempt #${subsByProj[p.id].length}. Previous attempts &amp; feedback below.</div>` : ''}
        ${submissionTimelineHtml(subsByProj[p.id])}
        <div class="text-sm text-muted mb-3" style="line-height:1.7;background:var(--surface);padding:12px;border-radius:var(--radius)">${escHtml(p.description)}</div>
        <div class="chip-list mb-3">
          <span class="chip">📂 ${escHtml(p.category || 'Uncategorized')}</span>
          ${(p.technologies || '').split(',').filter(Boolean).map(t => `<span class="chip">🔧 ${escHtml(t.trim())}</span>`).join('')}
        </div>
        ${p.fileId ? `<div class="mb-3">${fileDownloadLink(p.fileId, p.fileName, p.fileSize)}</div>` : ''}
        <div class="form-group mb-3">
          <label class="form-label">Feedback / Decision Notes</label>
          <textarea class="form-textarea" id="fb_${p.id}" rows="2" placeholder="Write feedback that will be visible to the student...">${escHtml(p.feedback || '')}</textarea>
        </div>
        <div class="flex gap-3">
          <button class="btn btn-success btn-sm" onclick="reviewProposal('${p.id}','approved')">✅ Approve Proposal</button>
          <button class="btn btn-danger btn-sm" onclick="reviewProposal('${p.id}','rejected')">❌ Reject Proposal</button>
        </div>
      </div>`;
    }).join('') : `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">All Caught Up!</div><div class="empty-desc">No pending proposals to review.</div></div>`}
  </div>`;
}

async function reviewProposal(projId, decision) {
  const fb = document.getElementById('fb_' + projId)?.value || '';
  const result = await DB.post('projects/review', {
    id: projId, status: decision, feedback: fb,
    approvalDate: new Date().toISOString().split('T')[0],
    actorId: currentUser.id, actorName: currentUser.name
  });
  if (result.error) { showToast(result.error, 'error'); return; }
  showToast(`Proposal ${decision}!`, decision === 'approved' ? 'success' : 'error');
  navigate('sup-proposals');
}

async function renderSupervisorProjects() {
  const myProjects = await DB.fetch('projects', { supervisorId: currentUser.id });
  const approved   = myProjects.filter(p => p.status === 'approved');

  if (!approved.length) {
    return `<div class="card"><div class="empty-state"><div class="empty-icon">📁</div><div class="empty-title">No Active Projects</div><div class="empty-desc">Approve pending proposals to manage milestones and tasks.</div></div></div>`;
  }

  let html = '';
  for (const p of approved) {
    const [stu, milestones, tasks, allReports, members] = await Promise.all([
      getUser(p.studentId),
      DB.fetch('milestones', { projectId: p.id }),
      DB.fetch('tasks', { projectId: p.id }),
      DB.fetch('reports', { projectId: p.id }),
      DB.fetch('project_members', { projectId: p.id })
    ]);
    const pendingReports = allReports.filter(r => r.status === 'pending');
    const doneMilest     = milestones.filter(m => m.status === 'completed').length;
    const doneTasks      = tasks.filter(t => t.status === 'completed').length;
    const overdueTasks   = tasks.filter(t => t.status !== 'completed' && new Date(t.dueDate + 'T00:00:00') < new Date()).length;
    const overdueMilest  = milestones.filter(m => m.status !== 'completed' && new Date(m.dueDate + 'T00:00:00') < new Date()).length;
    const ch = changeBadgeHtml(p.updatedAt, p.submittedDate);

    html += `
    <div class="card mb-5">
      <!-- Project Header -->
      <div class="card-header" style="margin-bottom:12px">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1" style="flex-wrap:wrap">
            <span class="text-lg semi">${escHtml(p.title)}</span>
            ${ch}
            ${statusBadge(p.status)}
          </div>
          <div class="text-xs text-muted">👨‍🎓 ${escHtml(stu.name)} &nbsp;·&nbsp; ${escHtml(stu.rollNo || 'N/A')} &nbsp;·&nbsp; Approved ${fmt(p.approvalDate)}</div>
        </div>
        <button class="btn btn-xs btn-history" onclick="showHistoryModal('project','${p.id}',${JSON.stringify(p.title)})">📋 History</button>
      </div>

      <!-- Progress Row -->
      <div class="flex items-center gap-3 mb-3" style="flex-wrap:wrap">
        <div class="progress-bar" style="flex:1;min-width:120px"><div class="progress-fill" style="width:${p.progress || 0}%"></div></div>
        <span class="semi text-sm">${p.progress || 0}%</span>
        <span class="badge badge-blue">🎯 ${doneMilest}/${milestones.length} milestones</span>
        <span class="badge badge-purple">📋 ${doneTasks}/${tasks.length} tasks</span>
        ${overdueTasks  ? `<span class="badge badge-red">⚠ ${overdueTasks} task${overdueTasks > 1 ? 's' : ''} overdue</span>` : ''}
        ${overdueMilest ? `<span class="badge badge-red">⚠ ${overdueMilest} phase${overdueMilest > 1 ? 's' : ''} overdue</span>` : ''}
        ${pendingReports.length ? `<span class="badge badge-yellow">📊 ${pendingReports.length} report${pendingReports.length > 1 ? 's' : ''} to review</span>` : ''}
      </div>

      <!-- Tabs -->
      <div class="proj-tabs">
        <button class="proj-tab active" data-proj="${p.id}" data-tab="milestones" onclick="supProjectTab('${p.id}','milestones')">🎯 Milestones <span class="badge badge-blue" style="margin-left:4px">${milestones.length}</span></button>
        <button class="proj-tab" data-proj="${p.id}" data-tab="tasks" onclick="supProjectTab('${p.id}','tasks')">📋 Tasks <span class="badge badge-purple" style="margin-left:4px">${tasks.length}</span></button>
        <button class="proj-tab" data-proj="${p.id}" data-tab="reports" onclick="supProjectTab('${p.id}','reports')">📊 Reports ${pendingReports.length ? `<span class="badge badge-yellow" style="margin-left:4px">${pendingReports.length}</span>` : ''}</button>
      </div>

      <!-- ===== MILESTONES TAB ===== -->
      <div id="pt_${p.id}_milestones">
        ${milestones.length ? milestones.map(m => {
          const isOD = m.status !== 'completed' && new Date(m.dueDate + 'T00:00:00') < new Date();
          const cls  = m.status === 'completed' ? 'ms-completed' : isOD ? 'ms-overdue' : m.status === 'in-progress' ? 'ms-inprogress' : 'ms-pending';
          const mTasks = tasks.filter(t => t.milestoneId === m.id);
          return `
          <div class="milestone-detail-card ${cls} mb-3">
            <div class="ms-status-indicator"></div>
            <div class="ms-content">
              <div class="flex justify-between items-start">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1" style="flex-wrap:wrap">
                    <span class="semi">${escHtml(m.title)}</span>
                    ${statusBadge(m.status)}
                    ${isOD ? '<span class="badge badge-red" style="font-size:9px">OVERDUE</span>' : ''}
                  </div>
                  ${m.description ? `<div class="text-sm text-muted mb-2" style="line-height:1.6">${escHtml(m.description)}</div>` : ''}
                  <div class="flex gap-4 text-xs" style="color:var(--text3);flex-wrap:wrap">
                    <span>📅 Deadline: <strong style="color:${isOD ? 'var(--danger)' : 'var(--text)'}">${fmt(m.dueDate)}</strong></span>
                    ${mTasks.length ? `<span>📋 ${mTasks.filter(t => t.status === 'completed').length}/${mTasks.length} tasks done</span>` : '<span>No tasks linked</span>'}
                  </div>
                </div>
                <button class="btn btn-danger btn-xs" style="margin-left:8px" onclick="deleteSupMilestone('${m.id}')">🗑</button>
              </div>
            </div>
          </div>`;
        }).join('') : `<div class="text-sm text-muted mb-4" style="padding:16px 0;text-align:center;border:1px dashed var(--border);border-radius:var(--radius)">No milestones added yet. Add one below.</div>`}

        <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:8px">
          <div class="form-label mb-3">➕ Add New Milestone</div>
          <div class="form-grid mb-3">
            <div class="form-group"><label class="form-label">Title *</label><input class="form-input" id="ms_title_${p.id}" placeholder="e.g., System Design Phase"></div>
            <div class="form-group"><label class="form-label">Deadline *</label><input class="form-input" type="date" id="ms_due_${p.id}"></div>
          </div>
          <div class="form-group mb-3"><label class="form-label">Description / Objectives</label>
            <textarea class="form-textarea" id="ms_desc_${p.id}" rows="2" placeholder="Describe what the student must deliver by this deadline..."></textarea>
          </div>
          <button class="btn btn-primary btn-sm" onclick="addSupMilestone('${p.id}','${stu.id}')">➕ Add Milestone</button>
        </div>
      </div>

      <!-- ===== TASKS TAB ===== -->
      <div id="pt_${p.id}_tasks" style="display:none">
        ${tasks.length ? tasks.map(t => {
          const isOD = t.status !== 'completed' && new Date(t.dueDate + 'T00:00:00') < new Date();
          return `
          <div class="task-sup-card ${isOD && t.status !== 'completed' ? 'task-overdue-card' : ''} mb-2">
            <div class="task-priority-badge ${t.priority}">${(t.priority || 'med').toUpperCase()}</div>
            <div class="task-sup-body">
              <div class="flex justify-between items-center" style="flex-wrap:wrap;gap:6px">
                <div>
                  <div class="semi text-sm ${t.status === 'completed' ? 'line-through' : ''}">${escHtml(t.title)}</div>
                  ${t.description ? `<div class="text-xs text-muted mt-1">${escHtml(t.description.slice(0, 100))}${t.description.length > 100 ? '…' : ''}</div>` : ''}
                </div>
                <div class="flex gap-2 items-center">
                  ${statusBadge(t.status)}
                  <button class="btn btn-xs ${t.status === 'submitted' ? 'btn-success' : ''}" onclick="openTaskModal('${t.id}')">${t.status === 'submitted' ? '🔍 Review' : '📂 Details'}</button>
                  <button class="btn btn-danger btn-xs" onclick="deleteTask('${t.id}')">🗑</button>
                </div>
              </div>
              <div class="flex gap-3 mt-2 text-xs" style="color:var(--text3);flex-wrap:wrap">
                <span>👤 ${escHtml((members.find(mm => mm.studentId === t.assignedTo) || {}).name || 'Unassigned')}</span>
                <span>📅 Due: <strong style="color:${isOD ? 'var(--danger)' : 'var(--text)'}">${fmt(t.dueDate)}</strong> ${isOD ? '<span class="badge badge-red" style="font-size:9px">OVERDUE</span>' : ''}</span>
                ${t.milestoneId ? `<span>🎯 ${escHtml((milestones.find(m => m.id === t.milestoneId) || {}).title || '')}</span>` : '<span>Standalone</span>'}
                ${t.studentNotes ? `<span>💬 Student: <em>${escHtml(t.studentNotes.slice(0, 60))}</em></span>` : ''}
              </div>
            </div>
          </div>`;
        }).join('') : `<div class="text-sm text-muted mb-4" style="padding:16px 0;text-align:center;border:1px dashed var(--border);border-radius:var(--radius)">No tasks assigned yet. Assign one below.</div>`}

        <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:8px">
          <div class="form-label mb-3">📋 Assign New Task</div>
          <div class="form-grid mb-3">
            <div class="form-group"><label class="form-label">Task Title *</label><input class="form-input" id="task_title_${p.id}" placeholder="e.g., Design ER Diagram"></div>
            <div class="form-group"><label class="form-label">Deadline *</label><input class="form-input" type="date" id="task_due_${p.id}"></div>
          </div>
          <div class="form-grid mb-3">
            <div class="form-group"><label class="form-label">Priority</label>
              <select class="form-select" id="task_priority_${p.id}">
                <option value="low">🟢 Low</option>
                <option value="medium" selected>🔵 Medium</option>
                <option value="high">🟡 High</option>
                <option value="urgent">🔴 Urgent</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Link to Milestone (optional)</label>
              <select class="form-select" id="task_milestone_${p.id}">
                <option value="">— Standalone task —</option>
                ${milestones.map(m => `<option value="${m.id}">${escHtml(m.title)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group mb-3"><label class="form-label">Assign to ${members.length > 1 ? 'member' : 'student'}</label>
            <select class="form-select" id="task_assignee_${p.id}">
              ${members.map(m => `<option value="${m.studentId}">${escHtml(m.name || 'Member')}${m.isLeader == 1 ? ' (Leader)' : ''}</option>`).join('')}
            </select>
          </div>
          <div class="form-group mb-3"><label class="form-label">Task Description</label>
            <textarea class="form-textarea" id="task_desc_${p.id}" rows="2" placeholder="Describe what the student needs to do..."></textarea>
          </div>
          <button class="btn btn-primary btn-sm" onclick="assignTask('${p.id}','${stu.id}')">📋 Assign Task</button>
        </div>
      </div>

      <!-- ===== REPORTS TAB ===== -->
      <div id="pt_${p.id}_reports" style="display:none">
        ${pendingReports.length ? pendingReports.map(r => `
        <div class="change-new mb-3" style="display:flex;align-items:flex-start;gap:12px;padding:14px;background:var(--surface2);border-radius:var(--radius);border:1px solid rgba(16,185,129,.25)">
          <div style="flex:1;min-width:0">
            <div class="semi text-sm mb-1">${escHtml(r.title)} <span class="change-badge change-badge-new">NEW</span></div>
            <div class="text-xs text-muted mb-2">${escHtml((r.description || '').slice(0, 120))}${(r.description || '').length > 120 ? '…' : ''}</div>
            <div>${fileDownloadLink(r.fileId, r.fileName, r.fileSize)}</div>
            <div class="text-xs text-muted mt-1">Submitted ${fmt(r.submittedDate)}</div>
          </div>
          <div style="flex:1;min-width:180px">
            <textarea class="form-textarea" id="rfb_${r.id}" placeholder="Write feedback for the student..." rows="2" style="font-size:12px;min-height:60px"></textarea>
            <button class="btn btn-success btn-sm mt-2 w-full" style="justify-content:center" onclick="reviewReport('${r.id}')">✅ Mark as Reviewed</button>
          </div>
        </div>`).join('') : `
        <div class="empty-state" style="padding:40px"><div class="empty-icon">📊</div>
          <div class="empty-title">No Pending Reports</div>
          <div class="empty-desc">All reports for this project have been reviewed.</div>
        </div>`}
      </div>
    </div>`;
  }
  return html;
}

function supProjectTab(projId, tab) {
  ['milestones', 'tasks', 'reports'].forEach(t => {
    const el = document.getElementById(`pt_${projId}_${t}`);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll(`[data-proj="${projId}"]`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

async function addSupMilestone(projId) {
  const title = document.getElementById(`ms_title_${projId}`)?.value.trim();
  const due   = document.getElementById(`ms_due_${projId}`)?.value;
  const desc  = document.getElementById(`ms_desc_${projId}`)?.value.trim() || '';
  if (!title || !due) { showToast('Title and deadline are required.', 'error'); return; }
  const result = await DB.post('milestones/create', {
    id: uid(), projectId: projId, title, description: desc, dueDate: due, status: 'pending', notes: '',
    actorId: currentUser.id, actorName: currentUser.name
  });
  if (result.error) { showToast(result.error, 'error'); return; }
  showToast('Milestone added!', 'success');
  navigate('sup-projects');
}

async function assignTask(projId, studentId) {
  const title       = document.getElementById(`task_title_${projId}`)?.value.trim();
  const due         = document.getElementById(`task_due_${projId}`)?.value;
  const priority    = document.getElementById(`task_priority_${projId}`)?.value || 'medium';
  const milestoneId = document.getElementById(`task_milestone_${projId}`)?.value || '';
  const desc        = document.getElementById(`task_desc_${projId}`)?.value.trim() || '';
  // Assign to the chosen group member, falling back to the project leader.
  const assignedTo  = document.getElementById(`task_assignee_${projId}`)?.value || studentId;
  if (!title || !due) { showToast('Title and deadline are required.', 'error'); return; }
  const result = await DB.post('tasks/create', {
    id: uid(), projectId: projId, milestoneId: milestoneId || null, title, description: desc,
    assignedTo, actorId: currentUser.id, actorName: currentUser.name, priority, dueDate: due
  });
  if (result.error) { showToast(result.error, 'error'); return; }
  showToast('Task assigned!', 'success');
  navigate('sup-projects');
}

async function deleteSupMilestone(milestoneId) {
  if (!confirm('Delete this milestone? Tasks linked to it will become standalone.')) return;
  await DB.post('milestones/delete', { id: milestoneId, actorId: currentUser.id, actorName: currentUser.name });
  showToast('Milestone deleted.', 'success');
  navigate('sup-projects');
}

async function deleteTask(taskId) {
  if (!confirm('Delete this task?')) return;
  await DB.post('tasks/delete', { id: taskId, actorId: currentUser.id, actorName: currentUser.name });
  showToast('Task deleted.', 'success');
  navigate('sup-projects');
}

async function reviewReport(reportId) {
  const fb = document.getElementById('rfb_' + reportId)?.value || 'Report reviewed.';
  const result = await DB.post('reports/review', {
    id: reportId, status: 'reviewed', feedback: fb,
    actorId: currentUser.id, actorName: currentUser.name
  });
  if (result.error) { showToast(result.error, 'error'); return; }
  showToast('Report reviewed!', 'success');
  navigate('sup-projects');
}

// ============================================================
//  ADMIN VIEWS
// ============================================================
async function renderAdminDashboard() {
  const [users, projects] = await Promise.all([DB.fetch('users'), DB.fetch('projects')]);
  const students   = users.filter(u => u.role === 'student');
  const supervisors = users.filter(u => u.role === 'supervisor');
  const pending    = projects.filter(p => p.status === 'pending');
  const approved   = projects.filter(p => p.status === 'approved');
  const rejected   = projects.filter(p => p.status === 'rejected');
  const recentLogs = await DB.fetch('audit_logs', { limit: 10 });

  return `
  <div class="stat-grid">
    <div class="stat-card"><div class="stat-icon">👨‍🎓</div><div class="stat-value">${students.length}</div><div class="stat-label">Total Students</div></div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--success),#059669)"><div class="stat-icon">👨‍🏫</div><div class="stat-value">${supervisors.length}</div><div class="stat-label">Supervisors</div></div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--warning),#d97706)"><div class="stat-icon">⏳</div><div class="stat-value">${pending.length}</div><div class="stat-label">Pending Proposals</div>
      ${pending.length ? '<div class="stat-trend trend-down">● Needs action</div>' : ''}
    </div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--accent3),#7c3aed)"><div class="stat-icon">📁</div><div class="stat-value">${projects.length}</div><div class="stat-label">Total Projects</div></div>
  </div>

  <div class="grid-2" style="margin-bottom:20px">
    <div class="card">
      <div class="card-header"><div class="card-title">📊 Project Status Breakdown</div></div>
      ${[['pending', 'var(--warning)', pending.length], ['approved', 'var(--success)', approved.length], ['rejected', 'var(--danger)', rejected.length]].map(([s, c, count]) => {
        const pct = projects.length ? Math.round(count / projects.length * 100) : 0;
        return `<div style="margin-bottom:16px">
          <div class="flex justify-between text-sm mb-1"><span>${statusBadge(s)}</span><span class="semi">${count} (${pct}%)</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${c}"></div></div>
        </div>`;
      }).join('')}
      <div class="section-divider">Supervisor Workload</div>
      ${supervisors.map(s => {
        const count = projects.filter(p => p.supervisorId === s.id).length;
        const pct   = projects.length ? Math.round(count / projects.length * 100) : 0;
        return `<div style="margin-bottom:12px">
          <div class="flex justify-between text-sm mb-1"><span>${escHtml(s.name)}</span><span class="text-muted">${count} projects</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>`;
      }).join('')}
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">🕐 System Activity</div><button class="btn btn-xs btn-ghost" onclick="navigate('admin-audit')">View All</button></div>
      <div class="audit-log-list" style="max-height:350px">
        ${recentLogs.length ? recentLogs.map(renderAuditEntry).join('') : '<div class="text-sm text-muted" style="padding:20px">No activity recorded.</div>'}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><div class="card-title">⚡ Quick Actions</div></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
      <div class="quick-action" onclick="navigate('admin-users')"><div class="quick-action-icon">👤</div><div class="quick-action-label">Add User</div></div>
      <div class="quick-action" onclick="navigate('admin-projects')"><div class="quick-action-icon">📁</div><div class="quick-action-label">Review Projects</div></div>
      <div class="quick-action" onclick="navigate('admin-assignments')"><div class="quick-action-icon">🔗</div><div class="quick-action-label">Reassign Supervisor</div></div>
      <div class="quick-action" onclick="navigate('admin-audit')"><div class="quick-action-icon">📋</div><div class="quick-action-label">View Audit Log</div></div>
    </div>
  </div>`;
}

async function renderAdminUsers() {
  const users    = await DB.fetch('users');
  _adminUsersCache = users;
  const filterRole = document.getElementById('roleFilter')?.value || '';
  const search     = document.getElementById('userSearch')?.value?.toLowerCase() || '';
  let filtered     = users.filter(u => u.role !== 'admin');
  if (filterRole) filtered = filtered.filter(u => u.role === filterRole);
  if (search) filtered = filtered.filter(u => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));

  return `
  <div class="card mb-4">
    <div class="card-header">
      <div class="card-title">👥 User Management</div>
      <button class="btn btn-primary btn-sm" onclick="showAddUserModal()">➕ Add User</button>
    </div>
    <div class="flex gap-3 mb-4">
      <div class="search-wrap"><input class="search-input" id="userSearch" placeholder="Search users..." oninput="navigate('admin-users')"></div>
      <select class="form-select" id="roleFilter" style="width:180px" onchange="navigate('admin-users')">
        <option value="">All Roles</option><option value="student">Students</option><option value="supervisor">Supervisors</option>
      </select>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>ID / Roll No</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>
          ${filtered.map(u => `<tr>
            <td><div class="flex items-center gap-2">
              <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--accent),var(--accent3));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0">${u.name.charAt(0)}</div>
              <span class="semi">${escHtml(u.name)}</span>
            </div></td>
            <td class="text-sm text-muted">${escHtml(u.email)}</td>
            <td>${statusBadge(u.role)}</td>
            <td class="font-mono text-sm">${escHtml(u.rollNo || u.id)}</td>
            <td class="text-sm text-muted">${fmt(u.joinDate)}</td>
            <td><div class="flex gap-2">
              <button class="btn btn-xs" onclick="editUser('${u.id}')">✏️ Edit</button>
              <button class="btn btn-danger btn-xs" onclick="deleteUser('${u.id}','${escAttr(u.name)}')">🗑</button>
            </div></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <div id="addUserModal" class="modal-overlay hidden">
    <div class="modal">
      <button class="modal-close" onclick="document.getElementById('addUserModal').classList.add('hidden')">✕</button>
      <div class="modal-title">➕ Add New User</div>
      <div class="modal-sub">Create a student or supervisor account</div>
      <div id="addUserAlert"></div>
      <div class="form-group mb-4"><label class="form-label">Role</label>
        <select class="form-select" id="newRole" onchange="toggleSupFields()">
          <option value="student">Student</option><option value="supervisor">Supervisor</option>
        </select>
      </div>
      <div class="form-grid mb-4">
        <div class="form-group"><label class="form-label">Full Name *</label><input class="form-input" id="newName"></div>
        <div class="form-group" id="rollGroup"><label class="form-label">Roll Number</label><input class="form-input" id="newRoll" placeholder="2024-CS-XXX"></div>
      </div>
      <div id="specGroup" class="form-group mb-4 hidden"><label class="form-label">Specialization</label><input class="form-input" id="newSpec" placeholder="e.g., Web Dev, AI, Networks"></div>
      <div class="form-group mb-4"><label class="form-label">Email *</label><input class="form-input" id="newEmail" type="email"></div>
      <div class="form-group mb-4"><label class="form-label">Password *</label><input class="form-input" id="newPass" type="password"></div>
      <button class="btn btn-success w-full" onclick="addUser()" style="justify-content:center">✅ Create Account</button>
    </div>
  </div>

  <div id="editUserModal" class="modal-overlay hidden">
    <div class="modal">
      <button class="modal-close" onclick="document.getElementById('editUserModal').classList.add('hidden')">✕</button>
      <div class="modal-title">✏️ Edit User</div>
      <div id="editUserAlert"></div>
      <input type="hidden" id="euId">
      <div class="form-group mb-3"><label class="form-label">Full Name *</label><input class="form-input" id="euName"></div>
      <div class="form-group mb-3"><label class="form-label">Email *</label><input class="form-input" id="euEmail" type="email"></div>
      <div class="form-grid mb-3">
        <div class="form-group"><label class="form-label">Role</label>
          <select class="form-select" id="euRole"><option value="student">Student</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option></select></div>
        <div class="form-group"><label class="form-label">Department</label><input class="form-input" id="euDept"></div>
      </div>
      <div class="form-group mb-4"><label class="form-label">Specialization / Program</label><input class="form-input" id="euSpec"></div>
      <button class="btn btn-primary w-full" onclick="saveUserEdit()" style="justify-content:center">💾 Save Changes</button>
    </div>
  </div>`;
}

let _adminUsersCache = [];
function editUser(id) {
  const u = _adminUsersCache.find(x => x.id === id);
  if (!u) return;
  document.getElementById('euId').value    = u.id;
  document.getElementById('euName').value  = u.name || '';
  document.getElementById('euEmail').value = u.email || '';
  document.getElementById('euRole').value  = u.role || 'student';
  document.getElementById('euDept').value  = u.department || '';
  document.getElementById('euSpec').value  = u.specialization || u.program || '';
  document.getElementById('editUserModal').classList.remove('hidden');
}

async function saveUserEdit() {
  const alertEl = document.getElementById('editUserAlert');
  const id = document.getElementById('euId').value;
  const name = document.getElementById('euName').value.trim();
  const email = document.getElementById('euEmail').value.trim();
  if (!name || !email) { alertEl.innerHTML = `<div class="alert alert-error">Name and email are required.</div>`; return; }
  const role = document.getElementById('euRole').value;
  const spec = document.getElementById('euSpec').value.trim();
  const res = await DB.post('users/update', {
    id, name, email, role,
    department: document.getElementById('euDept').value.trim(),
    specialization: role === 'supervisor' ? spec : '',
    program: role === 'student' ? spec : '',
  });
  if (res.error) { alertEl.innerHTML = `<div class="alert alert-error">${escHtml(res.error)}</div>`; return; }
  document.getElementById('editUserModal').classList.add('hidden');
  showToast('User updated.', 'success');
  navigate('admin-users');
}

function showAddUserModal() { document.getElementById('addUserModal')?.classList.remove('hidden'); }
function toggleSupFields() {
  const role = document.getElementById('newRole').value;
  document.getElementById('rollGroup').style.display = role === 'supervisor' ? 'none' : '';
  document.getElementById('specGroup').classList.toggle('hidden', role !== 'supervisor');
}

async function addUser() {
  const role  = document.getElementById('newRole').value;
  const name  = document.getElementById('newName').value.trim();
  const email = document.getElementById('newEmail').value.trim();
  const pass  = document.getElementById('newPass').value;
  const roll  = document.getElementById('newRoll')?.value.trim();
  const spec  = document.getElementById('newSpec')?.value.trim();
  const alertEl = document.getElementById('addUserAlert');
  if (!name || !email || !pass) { alertEl.innerHTML = `<div class="alert alert-error">Fill all required fields.</div>`; return; }
  const result = await DB.post('users/create', {
    id: uid(), name, email, password: pass, role, rollNo: roll || '', specialization: spec || '',
    department: 'IT', joinDate: new Date().toISOString().split('T')[0],
    actorId: currentUser.id, actorName: currentUser.name
  });
  if (result.error) { alertEl.innerHTML = `<div class="alert alert-error">${escHtml(result.error)}</div>`; return; }
  document.getElementById('addUserModal').classList.add('hidden');
  showToast('User created!', 'success');
  navigate('admin-users');
}

async function deleteUser(id, name) {
  if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
  const result = await DB.post('users/delete', { id, actorId: currentUser.id, actorName: currentUser.name });
  if (result.error) { showToast(result.error, 'error'); return; }
  showToast('User deleted.', 'success');
  navigate('admin-users');
}

async function renderAdminProjects() {
  const [projects, allUsers] = await Promise.all([DB.fetch('projects'), DB.fetch('users')]);
  const search       = document.getElementById('projSearch')?.value?.toLowerCase() || '';
  const statusFilter = document.getElementById('statusFilter')?.value || '';
  let filtered = projects;
  if (search) filtered = filtered.filter(p => p.title.toLowerCase().includes(search));
  if (statusFilter) filtered = filtered.filter(p => p.status === statusFilter);

  let html = `
  <div class="card">
    <div class="card-header"><div class="card-title">📁 All Projects</div><span class="badge badge-blue">${filtered.length} total</span></div>
    <div class="flex gap-3 mb-4">
      <div class="search-wrap"><input class="search-input" id="projSearch" placeholder="Search projects..." oninput="navigate('admin-projects')"></div>
      <select class="form-select" id="statusFilter" style="width:180px" onchange="navigate('admin-projects')">
        <option value="">All Status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
      </select>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Project Title</th><th>Student</th><th>Supervisor</th><th>Status</th><th>Progress</th><th>Attachment</th><th>Updated</th><th>Actions</th></tr></thead>
        <tbody>`;

  for (const p of filtered) {
    const student    = allUsers.find(u => u.id === p.studentId)   || { name: 'Unknown' };
    const supervisor = allUsers.find(u => u.id === p.supervisorId) || { name: 'Unknown' };
    const ch = changeBadgeHtml(p.updatedAt, p.submittedDate);
    html += `<tr class="${changeCardClass(p.updatedAt, p.submittedDate)}">
      <td class="semi" style="max-width:200px"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.title)} ${ch}</div></td>
      <td class="text-sm">${escHtml(student.name)}</td>
      <td class="text-sm">${escHtml(supervisor.name)}</td>
      <td>${statusBadge(p.status)}</td>
      <td><div class="flex items-center gap-2"><div class="progress-bar" style="width:60px"><div class="progress-fill" style="width:${p.progress || 0}%"></div></div><span class="text-xs">${p.progress || 0}%</span></div></td>
      <td>${p.fileId ? fileDownloadLink(p.fileId, p.fileName, p.fileSize) : '<span class="text-xs text-muted">None</span>'}</td>
      <td class="text-xs text-muted">${timeAgo(p.updatedAt)}</td>
      <td class="flex gap-2">
        <button class="btn btn-xs btn-history" onclick="showHistoryModal('project','${p.id}',${JSON.stringify(p.title)})">📋</button>
        ${p.status === 'pending' ? `<button class="btn btn-success btn-xs" onclick="adminApprove('${p.id}')">✅</button>` : ''}
        <button class="btn btn-danger btn-xs" onclick="adminDelete('${p.id}')">🗑</button>
      </td>
    </tr>`;
  }

  if (!filtered.length) html += '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text3)">No projects found</td></tr>';

  html += '</tbody></table></div></div>';
  return html;
}

async function adminApprove(id) {
  const result = await DB.post('projects/review', {
    id, status: 'approved', approvalDate: new Date().toISOString().split('T')[0],
    actorId: currentUser.id, actorName: currentUser.name
  });
  if (result.error) { showToast(result.error, 'error'); return; }
  showToast('Project approved!', 'success');
  navigate('admin-projects');
}

async function adminDelete(id) {
  if (!confirm('Delete this project and all its data? This cannot be undone.')) return;
  const result = await DB.post('projects/delete', { id, actorId: currentUser.id, actorName: currentUser.name });
  if (result.error) { showToast(result.error, 'error'); return; }
  navigate('admin-projects');
}

async function renderAdminAssignments() {
  const [allUsers, projects] = await Promise.all([DB.fetch('users'), DB.fetch('projects')]);
  const supervisors = allUsers.filter(u => u.role === 'supervisor');

  return `
  <div class="card mb-4">
    <div class="card-header"><div class="card-title">🔗 Supervisor Workload</div></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Supervisor</th><th>Specialization</th><th>Total Projects</th><th>Active</th><th>Pending</th><th>Workload</th></tr></thead>
        <tbody>
          ${supervisors.map(s => {
            const myProjs  = projects.filter(p => p.supervisorId === s.id);
            const active   = myProjs.filter(p => p.status === 'approved').length;
            const pending  = myProjs.filter(p => p.status === 'pending').length;
            const pct      = projects.length ? Math.round(myProjs.length / Math.max(projects.length, 1) * 100) : 0;
            return `<tr>
              <td><div class="semi">${escHtml(s.name)}</div><div class="text-xs text-muted">${escHtml(s.email)}</div></td>
              <td class="text-sm text-muted">${escHtml(s.specialization || 'General IT')}</td>
              <td><span class="badge badge-blue">${myProjs.length}</span></td>
              <td><span class="badge badge-green">${active}</span></td>
              <td>${pending ? `<span class="badge badge-yellow">${pending}</span>` : '—'}</td>
              <td><div class="progress-bar" style="width:100px"><div class="progress-fill" style="width:${pct}%"></div></div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><div class="card-title">🔄 Reassign Supervisor</div></div>
    <div class="form-grid mb-4">
      <div class="form-group">
        <label class="form-label">Select Project</label>
        <select class="form-select" id="reassignProj">
          <option value="">Choose project...</option>
          ${projects.map(p => `<option value="${p.id}">${escHtml(p.title.slice(0, 50))}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">New Supervisor</label>
        <select class="form-select" id="reassignSup">
          <option value="">Choose supervisor...</option>
          ${supervisors.map(s => `<option value="${s.id}">${escHtml(s.name)} — ${escHtml(s.specialization || 'IT')}</option>`).join('')}
        </select>
      </div>
    </div>
    <button class="btn btn-primary" onclick="doReassign()">🔄 Reassign Supervisor</button>
  </div>`;
}

async function doReassign() {
  const projId = document.getElementById('reassignProj').value;
  const supId  = document.getElementById('reassignSup').value;
  if (!projId || !supId) { showToast('Select both project and supervisor.', 'error'); return; }
  const result = await DB.post('projects/reassign', { id: projId, supervisorId: supId, actorId: currentUser.id, actorName: currentUser.name });
  if (result.error) { showToast(result.error, 'error'); return; }
  showToast('Supervisor reassigned!', 'success');
  navigate('admin-assignments');
}

async function renderAdminReports() {
  const [reports, projects, allUsers] = await Promise.all([
    DB.fetch('reports'), DB.fetch('projects'), DB.fetch('users')
  ]);

  let html = `
  <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat-card"><div class="stat-icon">📊</div><div class="stat-value">${reports.length}</div><div class="stat-label">Total Reports</div></div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--warning),#d97706)"><div class="stat-icon">⏳</div><div class="stat-value">${reports.filter(r => r.status === 'pending').length}</div><div class="stat-label">Pending Review</div></div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--success),#059669)"><div class="stat-icon">✅</div><div class="stat-value">${reports.filter(r => r.status === 'reviewed').length}</div><div class="stat-label">Reviewed</div></div>
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">📊 All Reports</div></div>`;

  if (reports.length) {
    html += `<div class="table-wrap"><table>
      <thead><tr><th>Report Title</th><th>Student</th><th>Project</th><th>Attachment</th><th>Submitted</th><th>Status</th><th>Feedback</th><th></th></tr></thead>
      <tbody>`;
    for (const r of reports) {
      const proj = projects.find(p => p.id === r.projectId) || { title: 'Unknown' };
      const stu  = allUsers.find(u => u.id === r.studentId)  || { name: 'Unknown' };
      const ch   = changeBadgeHtml(r.updatedAt, r.submittedDate);
      html += `<tr class="${changeCardClass(r.updatedAt, r.submittedDate)}">
        <td class="semi">${escHtml(r.title)} ${ch}</td>
        <td>${escHtml(stu.name)}</td>
        <td class="text-sm text-muted">${escHtml(proj.title.slice(0, 35))}${proj.title.length > 35 ? '...' : ''}</td>
        <td>${fileDownloadLink(r.fileId, r.fileName, r.fileSize)}</td>
        <td class="text-sm">${fmt(r.submittedDate)}</td>
        <td>${statusBadge(r.status)}</td>
        <td class="text-sm text-muted">${r.feedback ? escHtml(r.feedback.slice(0, 50)) : '—'}</td>
        <td><button class="btn btn-xs btn-history" onclick="showHistoryModal('report','${r.id}',${JSON.stringify(r.title)})">📋</button></td>
      </tr>`;
    }
    html += '</tbody></table></div>';
  } else {
    html += '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">No Reports Found</div></div>';
  }
  html += '</div>';
  return html;
}

async function renderAdminAuditLog() {
  const [filter, search] = [
    document.getElementById('auditFilter')?.value || '',
    document.getElementById('auditSearch')?.value?.toLowerCase() || ''
  ];

  let params = { limit: 200 };
  if (filter) params.entityType = filter;
  const logs = await DB.fetch('audit_logs', params);
  const filtered = search ? logs.filter(l => (l.userName || '').toLowerCase().includes(search) || l.action.includes(search)) : logs;

  return `
  <div class="card mb-4">
    <div class="card-header">
      <div class="card-title">📋 System Audit Log</div>
      <span class="badge badge-blue">${filtered.length} entries</span>
    </div>
    <div class="flex gap-3 mb-4">
      <div class="search-wrap"><input class="search-input" id="auditSearch" placeholder="Search user or action..." oninput="navigate('admin-audit')"></div>
      <select class="form-select" id="auditFilter" style="width:180px" onchange="navigate('admin-audit')">
        <option value="">All Types</option>
        <option value="project">Projects</option>
        <option value="report">Reports</option>
        <option value="milestone">Milestones</option>
        <option value="user">Users</option>
      </select>
    </div>
    <div class="audit-log-list">
      ${filtered.length ? filtered.map(renderAuditEntry).join('') : '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No Log Entries</div></div>'}
    </div>
  </div>`;
}

// ============================================================
//  EVALUATIONS & GRADING  (FYP rubric)
// ============================================================
// Rubric component weights (sum = 100). Mirrors backend grade bands.
const EVAL_RUBRIC = [
  { key: 'proposalMarks',       label: 'Proposal & Documentation', max: 15 },
  { key: 'presentationMarks',   label: 'Presentation & Defense',   max: 20 },
  { key: 'implementationMarks', label: 'Implementation & Demo',     max: 45 },
  { key: 'vivaMarks',           label: 'Viva / Q&A',                max: 20 },
];

function gradeFor(total) {
  if (total >= 85) return 'A';
  if (total >= 80) return 'B+';
  if (total >= 75) return 'B';
  if (total >= 70) return 'C+';
  if (total >= 65) return 'C';
  if (total >= 60) return 'D';
  return 'F';
}
function gradeBadgeClass(g) {
  if (g === 'A' || g === 'B+') return 'badge-green';
  if (g === 'B' || g === 'C+') return 'badge-blue';
  if (g === 'C' || g === 'D')  return 'badge-yellow';
  return 'badge-red';
}

async function renderSupervisorEvaluate() {
  const projects = (await DB.fetch('projects')).filter(p => p.status === 'approved');
  const users    = await DB.fetch('users');
  const nameOf   = id => (users.find(u => u.id === id) || {}).name || 'Unknown';
  const evals    = await DB.fetch('evaluations');

  const projectOptions = projects.length
    ? projects.map(p => `<option value="${p.id}">${escHtml(p.title)} — ${escHtml(nameOf(p.studentId))}</option>`).join('')
    : '';

  const rubricInputs = EVAL_RUBRIC.map(c => `
    <div class="form-group">
      <label class="form-label">${c.label} <span class="text-muted">/ ${c.max}</span></label>
      <input class="form-input eval-mark" type="number" min="0" max="${c.max}" step="0.5" value="0"
             id="${c.key}" data-max="${c.max}" oninput="calcEvalTotal()">
    </div>`).join('');

  return `
  <div class="card mb-4">
    <div class="card-header"><div class="card-title">🎓 Evaluate a Project</div>
      <span class="text-sm text-muted">Weighted rubric · total 100 marks</span></div>
    ${projects.length ? `
    <div id="evalAlert"></div>
    <div class="form-grid mb-4">
      <div class="form-group"><label class="form-label">Project *</label>
        <select class="form-select" id="evalProject">${projectOptions}</select></div>
      <div class="form-group"><label class="form-label">Phase *</label>
        <select class="form-select" id="evalPhase">
          <option value="fyp1">FYP-1 (Proposal / Mid)</option>
          <option value="fyp2">FYP-2 (Final / Viva)</option>
        </select></div>
      <div class="form-group"><label class="form-label">Evaluator Role</label>
        <select class="form-select" id="evalRole">
          <option value="supervisor">Supervisor</option>
          <option value="internal">Internal Examiner</option>
          <option value="external">External Examiner</option>
          <option value="coordinator">FYP Coordinator</option>
        </select></div>
    </div>
    <div class="form-grid mb-4">${rubricInputs}</div>
    <div class="flex items-center gap-3 mb-4" style="padding:14px 18px;background:var(--surface2);border-radius:12px">
      <div style="font-size:14px;font-weight:600">Total:</div>
      <div id="evalTotal" style="font-size:22px;font-weight:800;font-family:'JetBrains Mono',monospace">0<span class="text-muted" style="font-size:14px">/100</span></div>
      <div id="evalGrade" class="badge badge-gray" style="font-size:14px">F</div>
    </div>
    <div class="form-group mb-4"><label class="form-label">Remarks / Feedback</label>
      <textarea class="form-textarea" id="evalRemarks" rows="3" placeholder="Strengths, weaknesses, and recommendations..."></textarea></div>
    <button class="btn btn-primary" onclick="submitEvaluation()">🎓 Submit Evaluation</button>
    ` : '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No Approved Projects</div><div class="empty-desc">Approve a proposal first to evaluate it.</div></div>'}
  </div>

  <div class="card">
    <div class="card-header"><div class="card-title">📋 Submitted Evaluations</div>
      <span class="badge badge-blue">${evals.length} total</span></div>
    ${evals.length ? `
    <div class="table-wrap"><table>
      <thead><tr><th>Project</th><th>Phase</th><th>Evaluator</th><th>Total</th><th>Grade</th><th>Date</th></tr></thead>
      <tbody>${evals.map(e => `
        <tr>
          <td class="semi">${escHtml(e.projectTitle || '—')}</td>
          <td>${(e.phase || '').toUpperCase()}</td>
          <td class="text-sm">${escHtml(e.evaluatorName || '—')} <span class="badge badge-gray">${cap(e.evaluatorRole || 'supervisor')}</span></td>
          <td class="semi">${(+e.totalMarks).toFixed(1)}</td>
          <td><span class="badge ${gradeBadgeClass(e.grade)}">${e.grade}</span></td>
          <td class="text-sm text-muted">${fmt(e.evaluatedAt)}</td>
        </tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No Evaluations Yet</div></div>'}
  </div>`;
}

function calcEvalTotal() {
  let total = 0, valid = true;
  document.querySelectorAll('.eval-mark').forEach(inp => {
    const max = parseFloat(inp.dataset.max);
    let v = parseFloat(inp.value) || 0;
    if (v < 0) v = 0;
    if (v > max) { inp.value = max; v = max; }
    total += v;
  });
  total = Math.round(total * 10) / 10;
  const g = gradeFor(total);
  document.getElementById('evalTotal').innerHTML = `${total}<span class="text-muted" style="font-size:14px">/100</span>`;
  const gEl = document.getElementById('evalGrade');
  gEl.textContent = g;
  gEl.className = 'badge ' + gradeBadgeClass(g);
  return valid;
}

async function submitEvaluation() {
  const alertEl = document.getElementById('evalAlert');
  const projectId = document.getElementById('evalProject').value;
  if (!projectId) { alertEl.innerHTML = `<div class="alert alert-error">⚠️ Select a project.</div>`; return; }
  const payload = {
    projectId,
    phase: document.getElementById('evalPhase').value,
    evaluatorRole: document.getElementById('evalRole').value,
    remarks: document.getElementById('evalRemarks').value.trim(),
  };
  EVAL_RUBRIC.forEach(c => { payload[c.key] = parseFloat(document.getElementById(c.key).value) || 0; });

  alertEl.innerHTML = `<div class="alert alert-info">⏳ Saving evaluation...</div>`;
  const res = await DB.post('evaluations/create', payload);
  if (res.error) { alertEl.innerHTML = `<div class="alert alert-error">⚠️ ${escHtml(res.error)}</div>`; return; }
  showToast(`Evaluation saved — ${res.total}/100 (Grade ${res.grade})`, 'success');
  navigate('sup-evaluate');
}

async function renderStudentGrades() {
  const evals = await DB.fetch('evaluations');
  if (!evals.length) {
    return `<div class="card"><div class="empty-state"><div class="empty-icon">🎓</div>
      <div class="empty-title">No Grades Yet</div>
      <div class="empty-desc">Your evaluations will appear here once your supervisor grades your FYP phases.</div></div></div>`;
  }
  // Group by phase; each phase may have several evaluators (committee), combined into a final grade.
  const byPhase = {};
  evals.forEach(e => { (byPhase[e.phase] = byPhase[e.phase] || []).push(e); });
  const roleLabel = { supervisor: 'Supervisor', internal: 'Internal', external: 'External', coordinator: 'Coordinator' };

  const cards = Object.keys(byPhase).sort().map(phase => {
    const list = byPhase[phase];
    const avg = list.reduce((s, e) => s + (+e.totalMarks), 0) / list.length;
    const combinedGrade = gradeFor(avg);
    const projectTitle = list[0].projectTitle || 'Project';
    return `
    <div class="card mb-4">
      <div class="card-header">
        <div class="card-title">${phase.toUpperCase()} — ${escHtml(projectTitle)}</div>
        <span class="badge ${gradeBadgeClass(combinedGrade)}" style="font-size:15px">Final ${combinedGrade}</span>
      </div>
      <div class="flex items-center gap-3 mb-3">
        <div style="font-size:30px;font-weight:800;font-family:'JetBrains Mono',monospace">${avg.toFixed(1)}<span class="text-muted" style="font-size:15px">/100</span></div>
        <div style="flex:1;height:10px;background:var(--surface2);border-radius:6px;overflow:hidden">
          <div style="width:${Math.min(100, avg)}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent3))"></div>
        </div>
        <span class="text-sm text-muted">${list.length} evaluator${list.length > 1 ? 's' : ''} · combined average</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Evaluator</th><th>Proposal</th><th>Present.</th><th>Impl.</th><th>Viva</th><th>Total</th><th>Grade</th></tr></thead>
        <tbody>${list.map(e => `<tr>
          <td class="semi">${escHtml(e.evaluatorName || '—')} <span class="badge badge-gray">${roleLabel[e.evaluatorRole] || 'Supervisor'}</span></td>
          <td>${(+e.proposalMarks).toFixed(1)}</td><td>${(+e.presentationMarks).toFixed(1)}</td>
          <td>${(+e.implementationMarks).toFixed(1)}</td><td>${(+e.vivaMarks).toFixed(1)}</td>
          <td class="semi">${(+e.totalMarks).toFixed(1)}</td>
          <td><span class="badge ${gradeBadgeClass(e.grade)}">${e.grade}</span></td>
        </tr>`).join('')}</tbody>
      </table></div>
      ${list.filter(e => e.remarks).map(e => `<div class="mt-2 text-sm" style="padding:10px 14px;background:var(--surface2);border-radius:10px"><strong>${roleLabel[e.evaluatorRole] || 'Supervisor'} remarks:</strong> ${escHtml(e.remarks)}</div>`).join('')}
    </div>`;
  }).join('');
  const header = `<div class="card mb-4"><div class="flex items-center justify-between gap-3" style="flex-wrap:wrap">
    <div><div class="card-title">🎓 My Evaluations</div><div class="text-sm text-muted">${evals.length} evaluation${evals.length > 1 ? 's' : ''} on record</div></div>
    <button class="btn btn-primary" onclick="printResultSheet()">🖨️ Download Result Sheet (PDF)</button>
  </div></div>`;
  return header + cards;
}

// ============================================================
//  MEETINGS
// ============================================================
function meetingTypeLabel(t) {
  return ({ weekly: 'Weekly Sync', proposal: 'Proposal', review: 'Progress Review', midterm: 'Midterm', viva: 'Viva', other: 'Other' }[t] || cap(t || ''));
}

async function renderSupervisorMeetings() {
  const projects = (await DB.fetch('projects')).filter(p => p.status === 'approved');
  const users    = await DB.fetch('users');
  const nameOf   = id => (users.find(u => u.id === id) || {}).name || 'Unknown';
  const meetings = await DB.fetch('meetings');

  const now = new Date();
  const upcoming = meetings.filter(m => m.status === 'scheduled' && new Date(m.scheduledAt) >= now);
  const past     = meetings.filter(m => !(m.status === 'scheduled' && new Date(m.scheduledAt) >= now));

  const meetingRow = (m, isUpcoming) => `
    <div class="card mb-3" style="padding:16px 18px">
      <div class="flex items-center justify-between gap-3" style="flex-wrap:wrap">
        <div>
          <div class="semi">${escHtml(m.title)} <span class="badge badge-gray" style="margin-left:6px">${meetingTypeLabel(m.meetingType)}</span></div>
          <div class="text-sm text-muted mt-1">📅 ${fmtTime(m.scheduledAt)} · 📍 ${escHtml(m.location || 'TBD')}</div>
          <div class="text-sm text-muted">👤 ${escHtml(m.studentName || nameOf(m.studentId))} · ${escHtml(m.projectTitle || '')}</div>
          ${m.agenda ? `<div class="text-sm mt-1"><strong>Agenda:</strong> ${escHtml(m.agenda)}</div>` : ''}
          ${m.minutesNotes ? `<div class="text-sm mt-1" style="padding:8px 12px;background:var(--surface2);border-radius:8px"><strong>Minutes:</strong> ${escHtml(m.minutesNotes)}</div>` : ''}
        </div>
        <div class="flex items-center gap-2">
          ${statusBadge(m.status)}
          ${isUpcoming ? `
            <button class="btn btn-xs btn-success" onclick="completeMeeting('${m.id}')">✅ Complete</button>
            <button class="btn btn-xs btn-danger" onclick="cancelMeeting('${m.id}')">✖ Cancel</button>` : ''}
        </div>
      </div>
    </div>`;

  return `
  <div class="card mb-4">
    <div class="card-header"><div class="card-title">📅 Schedule a Meeting</div></div>
    ${projects.length ? `
    <div id="meetAlert"></div>
    <div class="form-grid mb-4">
      <div class="form-group"><label class="form-label">Project *</label>
        <select class="form-select" id="meetProject">${projects.map(p => `<option value="${p.id}">${escHtml(p.title)} — ${escHtml(nameOf(p.studentId))}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Type</label>
        <select class="form-select" id="meetType">
          <option value="weekly">Weekly Sync</option><option value="proposal">Proposal</option>
          <option value="review">Progress Review</option><option value="midterm">Midterm</option>
          <option value="viva">Viva</option><option value="other">Other</option>
        </select></div>
    </div>
    <div class="form-group mb-4"><label class="form-label">Title *</label>
      <input class="form-input" id="meetTitle" placeholder="e.g., Chapter 2 review"></div>
    <div class="form-grid mb-4">
      <div class="form-group"><label class="form-label">Date & Time *</label>
        <input class="form-input" type="datetime-local" id="meetWhen"></div>
      <div class="form-group"><label class="form-label">Location</label>
        <input class="form-input" id="meetLocation" placeholder="e.g., Lab 3 / Google Meet"></div>
    </div>
    <div class="form-group mb-4"><label class="form-label">Agenda</label>
      <textarea class="form-textarea" id="meetAgenda" rows="2" placeholder="What will be discussed..."></textarea></div>
    <button class="btn btn-primary" onclick="scheduleMeeting()">📅 Schedule Meeting</button>
    ` : '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No Approved Projects</div></div>'}
  </div>

  <div class="card mb-4">
    <div class="card-header"><div class="card-title">⏰ Upcoming Meetings</div><span class="badge badge-blue">${upcoming.length}</span></div>
    ${upcoming.length ? upcoming.map(m => meetingRow(m, true)).join('') : '<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">No Upcoming Meetings</div></div>'}
  </div>

  <div class="card">
    <div class="card-header"><div class="card-title">🗂️ Past Meetings</div><span class="badge badge-gray">${past.length}</span></div>
    ${past.length ? past.map(m => meetingRow(m, false)).join('') : '<div class="empty-state"><div class="empty-icon">🗂️</div><div class="empty-title">No Past Meetings</div></div>'}
  </div>`;
}

async function scheduleMeeting() {
  const alertEl = document.getElementById('meetAlert');
  const projectId = document.getElementById('meetProject').value;
  const title = document.getElementById('meetTitle').value.trim();
  const when  = document.getElementById('meetWhen').value;
  if (!projectId || !title || !when) { alertEl.innerHTML = `<div class="alert alert-error">⚠️ Project, title and date/time are required.</div>`; return; }
  // datetime-local -> 'YYYY-MM-DD HH:MM:SS'
  const scheduledAt = when.replace('T', ' ') + ':00';
  const res = await DB.post('meetings/create', {
    projectId, title,
    meetingType: document.getElementById('meetType').value,
    scheduledAt,
    location: document.getElementById('meetLocation').value.trim() || 'TBD',
    agenda: document.getElementById('meetAgenda').value.trim(),
  });
  if (res.error) { alertEl.innerHTML = `<div class="alert alert-error">⚠️ ${escHtml(res.error)}</div>`; return; }
  showToast('Meeting scheduled!', 'success');
  navigate('sup-meetings');
}

async function completeMeeting(id) {
  const minutes = prompt('Enter meeting minutes / notes (optional):', '');
  if (minutes === null) return;
  const res = await DB.post('meetings/complete', { id, minutesNotes: minutes });
  if (!res.error) { showToast('Meeting marked complete.', 'success'); navigate('sup-meetings'); }
}

async function cancelMeeting(id) {
  if (!confirm('Cancel this meeting?')) return;
  const res = await DB.post('meetings/cancel', { id });
  if (!res.error) { showToast('Meeting cancelled.', 'info'); navigate('sup-meetings'); }
}

async function renderStudentMeetings() {
  const meetings = await DB.fetch('meetings');
  const now = new Date();
  const upcoming = meetings.filter(m => m.status === 'scheduled' && new Date(m.scheduledAt) >= now);
  const past     = meetings.filter(m => !(m.status === 'scheduled' && new Date(m.scheduledAt) >= now));

  const row = m => `
    <div class="card mb-3" style="padding:16px 18px">
      <div class="flex items-center justify-between gap-3" style="flex-wrap:wrap">
        <div>
          <div class="semi">${escHtml(m.title)} <span class="badge badge-gray" style="margin-left:6px">${meetingTypeLabel(m.meetingType)}</span></div>
          <div class="text-sm text-muted mt-1">📅 ${fmtTime(m.scheduledAt)} · 📍 ${escHtml(m.location || 'TBD')}</div>
          <div class="text-sm text-muted">👨‍🏫 ${escHtml(m.supervisorName || '')}</div>
          ${m.agenda ? `<div class="text-sm mt-1"><strong>Agenda:</strong> ${escHtml(m.agenda)}</div>` : ''}
          ${m.minutesNotes ? `<div class="text-sm mt-1" style="padding:8px 12px;background:var(--surface2);border-radius:8px"><strong>Minutes:</strong> ${escHtml(m.minutesNotes)}</div>` : ''}
        </div>
        ${statusBadge(m.status)}
      </div>
    </div>`;

  return `
  <div class="card mb-4">
    <div class="card-header"><div class="card-title">⏰ Upcoming Meetings</div><span class="badge badge-blue">${upcoming.length}</span></div>
    ${upcoming.length ? upcoming.map(row).join('') : '<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">No Upcoming Meetings</div><div class="empty-desc">Your supervisor will schedule meetings here.</div></div>'}
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">🗂️ Past Meetings</div><span class="badge badge-gray">${past.length}</span></div>
    ${past.length ? past.map(row).join('') : '<div class="empty-state"><div class="empty-icon">🗂️</div><div class="empty-title">No Past Meetings</div></div>'}
  </div>`;
}

// ============================================================
//  SUPERVISOR REQUESTS
// ============================================================
async function renderSupervisorRequests() {
  const requests = await DB.fetch('supervisor_requests');
  const pending = requests.filter(r => r.status === 'pending');
  const handled = requests.filter(r => r.status !== 'pending');

  const card = (r, isPending) => `
    <div class="card mb-3" style="padding:18px">
      <div class="flex items-center justify-between gap-3 mb-2" style="flex-wrap:wrap">
        <div>
          <div class="semi">${escHtml(r.studentName || 'Student')} ${r.studentRoll ? `<span class="text-muted text-sm">(${escHtml(r.studentRoll)})</span>` : ''}</div>
          <div class="text-sm text-muted">${escHtml(r.program || '')}${r.department ? ' · ' + escHtml(r.department) : ''}</div>
        </div>
        ${statusBadge(r.status)}
      </div>
      ${r.proposalTitle ? `<div class="text-sm mb-1"><strong>Proposed title:</strong> ${escHtml(r.proposalTitle)}</div>` : ''}
      ${r.proposalSummary ? `<div class="text-sm text-muted mb-2">${escHtml(r.proposalSummary)}</div>` : ''}
      ${r.supervisorResponse ? `<div class="text-sm" style="padding:8px 12px;background:var(--surface2);border-radius:8px"><strong>Your response:</strong> ${escHtml(r.supervisorResponse)}</div>` : ''}
      ${isPending ? `
        <div class="form-group mt-3 mb-3"><textarea class="form-textarea" id="resp_${r.id}" rows="2" placeholder="Optional response to the student..."></textarea></div>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-success" onclick="respondRequest('${r.id}','accepted')">✅ Accept</button>
          <button class="btn btn-sm btn-danger" onclick="respondRequest('${r.id}','rejected')">✖ Reject</button>
        </div>` : `<div class="text-xs text-muted mt-2">Responded ${r.respondedAt ? fmt(r.respondedAt) : ''}</div>`}
    </div>`;

  return `
  <div class="card mb-4">
    <div class="card-header"><div class="card-title">📨 Pending Requests</div><span class="badge badge-yellow">${pending.length}</span></div>
    ${pending.length ? pending.map(r => card(r, true)).join('') : '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No Pending Requests</div><div class="empty-desc">Students requesting you as supervisor will appear here.</div></div>'}
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">🗂️ Handled Requests</div><span class="badge badge-gray">${handled.length}</span></div>
    ${handled.length ? handled.map(r => card(r, false)).join('') : '<div class="empty-state"><div class="empty-icon">🗂️</div><div class="empty-title">None Yet</div></div>'}
  </div>`;
}

async function respondRequest(id, status) {
  const responseEl = document.getElementById('resp_' + id);
  const response = responseEl ? responseEl.value.trim() : '';
  const res = await DB.post('supervisor_requests/respond', { id, status, response });
  if (!res.error) {
    showToast(`Request ${status}.`, status === 'accepted' ? 'success' : 'info');
    navigate('sup-requests');
  }
}

// ============================================================
//  FYP TIMELINE / DEPARTMENT DEADLINES
// ============================================================
const DEADLINE_CAT = { proposal: 'Proposal', midterm: 'Mid Evaluation', final: 'Final Submission', viva: 'Viva / Defense', other: 'Other' };
function phaseLabel(p) { return p === 'fyp1' ? 'FYP-1' : p === 'fyp2' ? 'FYP-2' : 'All Phases'; }
function deadlineCountdown(due) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(due + 'T00:00:00') - today) / 86400000);
  if (days < 0)   return { label: `${Math.abs(days)}d overdue`, cls: 'badge-red' };
  if (days === 0) return { label: 'Due today', cls: 'badge-yellow' };
  if (days <= 7)  return { label: `${days}d left`, cls: 'badge-yellow' };
  return { label: `${days}d left`, cls: 'badge-green' };
}

// Shared read-only timeline (students + supervisors).
async function renderTimeline() {
  const deadlines = await DB.fetch('deadlines');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcoming = deadlines.filter(d => new Date(d.dueDate + 'T00:00:00') >= today);
  const past     = deadlines.filter(d => new Date(d.dueDate + 'T00:00:00') <  today);
  const next = upcoming[0];

  return `
  ${next ? `<div class="card mb-4" style="border-left:4px solid var(--accent)">
    <div class="text-sm text-muted mb-1">⏭️ Next deadline</div>
    <div class="flex items-center justify-between gap-3" style="flex-wrap:wrap">
      <div><div class="semi" style="font-size:18px">${escHtml(next.title)}</div>
        <div class="text-sm text-muted">${DEADLINE_CAT[next.category] || 'Event'} · ${phaseLabel(next.phase)} · ${fmt(next.dueDate)}</div></div>
      <span class="badge ${deadlineCountdown(next.dueDate).cls}" style="font-size:14px">${deadlineCountdown(next.dueDate).label}</span>
    </div></div>` : ''}

  <div class="card mb-4">
    <div class="card-header"><div class="card-title">🗓️ Upcoming Deadlines</div><span class="badge badge-blue">${upcoming.length}</span></div>
    ${upcoming.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Deadline</th><th>Type</th><th>Phase</th><th>Date</th><th>Countdown</th></tr></thead>
      <tbody>${upcoming.map(d => { const c = deadlineCountdown(d.dueDate); return `<tr>
        <td class="semi">${escHtml(d.title)}${d.description ? `<div class="text-xs text-muted">${escHtml(d.description)}</div>` : ''}</td>
        <td>${DEADLINE_CAT[d.category] || 'Other'}</td><td>${phaseLabel(d.phase)}</td>
        <td class="text-sm">${fmt(d.dueDate)}</td><td><span class="badge ${c.cls}">${c.label}</span></td>
      </tr>`; }).join('')}</tbody></table></div>`
      : '<div class="empty-state"><div class="empty-icon">🗓️</div><div class="empty-title">No Upcoming Deadlines</div><div class="empty-desc">The department has not posted any deadlines yet.</div></div>'}
  </div>

  ${past.length ? `<div class="card"><div class="card-header"><div class="card-title">🗂️ Past Deadlines</div><span class="badge badge-gray">${past.length}</span></div>
    <div class="table-wrap"><table><tbody>${past.map(d => `<tr><td class="semi">${escHtml(d.title)}</td><td>${DEADLINE_CAT[d.category] || 'Other'}</td><td class="text-sm text-muted">${fmt(d.dueDate)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
}

// Admin management of deadlines.
let _deadlinesCache = [];
async function renderAdminDeadlines() {
  _deadlinesCache = await DB.fetch('deadlines');
  return `
  <div class="card mb-4">
    <div class="card-header"><div class="card-title" id="dlFormTitle">➕ Add Deadline</div></div>
    <div id="dlAlert"></div>
    <input type="hidden" id="dlEditId" value="">
    <div class="form-group mb-3"><label class="form-label">Title *</label><input class="form-input" id="dlTitle" placeholder="e.g., FYP-1 Proposal Submission"></div>
    <div class="form-grid mb-3">
      <div class="form-group"><label class="form-label">Date *</label><input class="form-input" type="date" id="dlDate"></div>
      <div class="form-group"><label class="form-label">Type</label>
        <select class="form-select" id="dlCategory">
          <option value="proposal">Proposal</option><option value="midterm">Mid Evaluation</option>
          <option value="final">Final Submission</option><option value="viva">Viva / Defense</option><option value="other">Other</option>
        </select></div>
    </div>
    <div class="form-grid mb-3">
      <div class="form-group"><label class="form-label">Phase</label>
        <select class="form-select" id="dlPhase"><option value="all">All Phases</option><option value="fyp1">FYP-1</option><option value="fyp2">FYP-2</option></select></div>
      <div class="form-group"><label class="form-label">Program</label><input class="form-input" id="dlProgram" value="all" placeholder="e.g., BS IT or all"></div>
    </div>
    <div class="form-group mb-4"><label class="form-label">Description</label><textarea class="form-textarea" id="dlDesc" rows="2" placeholder="Details students/supervisors should know..."></textarea></div>
    <button class="btn btn-primary" id="dlSaveBtn" onclick="saveDeadline()">➕ Add Deadline</button>
    <button class="btn btn-ghost" id="dlCancelBtn" onclick="resetDeadlineForm()" style="display:none">Cancel</button>
  </div>

  <div class="card">
    <div class="card-header"><div class="card-title">🗓️ All Deadlines</div><span class="badge badge-blue">${_deadlinesCache.length}</span></div>
    ${_deadlinesCache.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Title</th><th>Type</th><th>Phase</th><th>Date</th><th></th></tr></thead>
      <tbody>${_deadlinesCache.map(d => `<tr>
        <td class="semi">${escHtml(d.title)}</td><td>${DEADLINE_CAT[d.category] || 'Other'}</td><td>${phaseLabel(d.phase)}</td><td class="text-sm">${fmt(d.dueDate)}</td>
        <td><div class="flex gap-2">
          <button class="btn btn-xs" onclick="editDeadline('${d.id}')">✏️</button>
          <button class="btn btn-xs btn-danger" onclick="deleteDeadline('${d.id}')">🗑</button>
        </div></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><div class="empty-icon">🗓️</div><div class="empty-title">No Deadlines Yet</div><div class="empty-desc">Add the first FYP milestone deadline above.</div></div>'}
  </div>`;
}

function editDeadline(id) {
  const d = _deadlinesCache.find(x => x.id === id);
  if (!d) return;
  document.getElementById('dlEditId').value   = d.id;
  document.getElementById('dlTitle').value     = d.title;
  document.getElementById('dlDate').value       = d.dueDate;
  document.getElementById('dlCategory').value   = d.category || 'other';
  document.getElementById('dlPhase').value       = d.phase || 'all';
  document.getElementById('dlProgram').value     = d.program || 'all';
  document.getElementById('dlDesc').value         = d.description || '';
  document.getElementById('dlFormTitle').textContent = '✏️ Edit Deadline';
  document.getElementById('dlSaveBtn').textContent   = '💾 Save Changes';
  document.getElementById('dlCancelBtn').style.display = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetDeadlineForm() {
  ['dlTitle', 'dlDate', 'dlDesc'].forEach(i => { const el = document.getElementById(i); if (el) el.value = ''; });
  document.getElementById('dlEditId').value = '';
  document.getElementById('dlProgram').value = 'all';
  document.getElementById('dlFormTitle').textContent = '➕ Add Deadline';
  document.getElementById('dlSaveBtn').textContent   = '➕ Add Deadline';
  document.getElementById('dlCancelBtn').style.display = 'none';
}

async function saveDeadline() {
  const alertEl = document.getElementById('dlAlert');
  const title = document.getElementById('dlTitle').value.trim();
  const dueDate = document.getElementById('dlDate').value;
  if (!title || !dueDate) { alertEl.innerHTML = `<div class="alert alert-error">⚠️ Title and date are required.</div>`; return; }
  const payload = {
    title, dueDate,
    category: document.getElementById('dlCategory').value,
    phase: document.getElementById('dlPhase').value,
    program: document.getElementById('dlProgram').value.trim() || 'all',
    description: document.getElementById('dlDesc').value.trim(),
  };
  const editId = document.getElementById('dlEditId').value;
  const res = editId
    ? await DB.post('deadlines/update', { ...payload, id: editId })
    : await DB.post('deadlines/create', payload);
  if (res.error) { alertEl.innerHTML = `<div class="alert alert-error">⚠️ ${escHtml(res.error)}</div>`; return; }
  showToast(editId ? 'Deadline updated.' : 'Deadline added.', 'success');
  navigate('admin-deadlines');
}

async function deleteDeadline(id) {
  if (!confirm('Delete this deadline?')) return;
  const res = await DB.post('deadlines/delete', { id });
  if (!res.error) { showToast('Deadline deleted.', 'info'); navigate('admin-deadlines'); }
}

// ============================================================
//  ADMIN ANALYTICS
// ============================================================
function barRow(label, value, max, color) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<div style="margin-bottom:12px">
    <div class="flex items-center justify-between text-sm mb-1"><span>${escHtml(label)}</span><span class="semi">${value}</span></div>
    <div style="height:10px;background:var(--surface2);border-radius:6px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${color};transition:width .4s"></div></div>
  </div>`;
}

async function renderAdminAnalytics() {
  const [projects, evals, users, tasks] = await Promise.all([
    DB.fetch('projects'), DB.fetch('evaluations'), DB.fetch('users'), DB.fetch('tasks')
  ]);

  const students    = users.filter(u => u.role === 'student');
  const supervisors = users.filter(u => u.role === 'supervisor');
  const approved    = projects.filter(p => p.status === 'approved');
  const pending     = projects.filter(p => p.status === 'pending');
  const rejected    = projects.filter(p => p.status === 'rejected');
  const avgProgress = approved.length ? Math.round(approved.reduce((s, p) => s + (+p.progress || 0), 0) / approved.length) : 0;

  // Grade distribution
  const gradeOrder = ['A', 'B+', 'B', 'C+', 'C', 'D', 'F'];
  const gradeColors = { 'A': 'var(--success)', 'B+': 'var(--success)', 'B': 'var(--accent)', 'C+': 'var(--accent)', 'C': 'var(--warning)', 'D': 'var(--warning)', 'F': 'var(--danger)' };
  const gradeCounts = {}; gradeOrder.forEach(g => gradeCounts[g] = 0);
  evals.forEach(e => { if (gradeCounts[e.grade] !== undefined) gradeCounts[e.grade]++; });
  const maxGrade = Math.max(1, ...Object.values(gradeCounts));

  // Supervisor load (approved projects per supervisor)
  const loadMap = {};
  approved.forEach(p => { loadMap[p.supervisorId] = (loadMap[p.supervisorId] || 0) + 1; });
  const supLoad = supervisors.map(s => ({ name: s.name, count: loadMap[s.id] || 0 })).sort((a, b) => b.count - a.count);
  const maxLoad = Math.max(1, ...supLoad.map(s => s.count));

  // Task health
  const now = new Date();
  const tDone = tasks.filter(t => t.status === 'completed').length;
  const tProg = tasks.filter(t => t.status === 'in-progress').length;
  const tPend = tasks.filter(t => t.status === 'pending').length;
  const tOver = tasks.filter(t => t.status !== 'completed' && t.dueDate && new Date(t.dueDate + 'T23:59:59') < now).length;

  return `
  <div class="stat-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
    <div class="stat-card"><div class="stat-icon">📁</div><div class="stat-value">${projects.length}</div><div class="stat-label">Total Projects</div></div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--success),#059669)"><div class="stat-icon">✅</div><div class="stat-value">${approved.length}</div><div class="stat-label">Approved</div></div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,var(--accent),var(--accent3))"><div class="stat-icon">👨‍🎓</div><div class="stat-value">${students.length}</div><div class="stat-label">Students</div></div>
    <div class="stat-card" style="--accent-gradient:linear-gradient(90deg,#8b5cf6,#6d28d9)"><div class="stat-icon">👨‍🏫</div><div class="stat-value">${supervisors.length}</div><div class="stat-label">Supervisors</div></div>
  </div>

  <div class="grid-2" style="margin-bottom:20px">
    <div class="card">
      <div class="card-header"><div class="card-title">🎓 Grade Distribution</div><span class="badge badge-blue">${evals.length} evaluations</span></div>
      ${evals.length ? gradeOrder.map(g => barRow(`Grade ${g}`, gradeCounts[g], maxGrade, gradeColors[g])).join('')
        : '<div class="empty-state"><div class="empty-icon">🎓</div><div class="empty-title">No Evaluations Yet</div></div>'}
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">📁 Project Status</div></div>
      ${barRow('Approved', approved.length, projects.length || 1, 'var(--success)')}
      ${barRow('Pending', pending.length, projects.length || 1, 'var(--warning)')}
      ${barRow('Rejected', rejected.length, projects.length || 1, 'var(--danger)')}
      <div class="flex items-center gap-3 mt-4" style="padding:14px 18px;background:var(--surface2);border-radius:12px">
        <div style="font-size:13px;font-weight:600">Avg. progress (approved):</div>
        <div style="flex:1;height:10px;background:var(--surface);border-radius:6px;overflow:hidden"><div style="width:${avgProgress}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent3))"></div></div>
        <div class="semi">${avgProgress}%</div>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-header"><div class="card-title">👨‍🏫 Supervisor Load</div><span class="text-sm text-muted">approved projects</span></div>
      ${supLoad.length ? supLoad.map(s => barRow(s.name, s.count, maxLoad, 'var(--accent)')).join('')
        : '<div class="empty-state"><div class="empty-title">No Supervisors</div></div>'}
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">📋 Task Health</div><span class="badge badge-blue">${tasks.length} tasks</span></div>
      ${barRow('Completed', tDone, tasks.length || 1, 'var(--success)')}
      ${barRow('In progress', tProg, tasks.length || 1, 'var(--accent)')}
      ${barRow('Pending', tPend, tasks.length || 1, 'var(--warning)')}
      ${barRow('Overdue', tOver, tasks.length || 1, 'var(--danger)')}
    </div>
  </div>`;
}

// ============================================================
//  PDF / PRINT  (result sheet)
// ============================================================
function openPrintWindow(title, bodyHtml) {
  const w = window.open('', '_blank');
  if (!w) { showToast('Please allow pop-ups to download the PDF.', 'warning'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><meta charset="utf-8">
    <style>
      *{font-family:'Segoe UI',Arial,sans-serif;color:#111;box-sizing:border-box}
      body{padding:40px;max-width:820px;margin:0 auto}
      h1{font-size:20px;margin:0} h3{margin:20px 0 6px} .sub{color:#555;font-size:12px;margin-top:4px}
      table{width:100%;border-collapse:collapse;margin:12px 0}
      th,td{border:1px solid #ccc;padding:8px 10px;text-align:left;font-size:13px}
      th{background:#f3f4f6}
      .head{text-align:center;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:8px}
      .sign{margin-top:64px;display:flex;justify-content:space-between}
      .sign div{border-top:1px solid #111;padding-top:6px;width:30%;text-align:center;font-size:12px}
      @media print{body{padding:0}.noprint{display:none}}
    </style></head><body>${bodyHtml}
    <script>window.onload=function(){setTimeout(function(){window.print();},300);}<\/script>
    </body></html>`);
  w.document.close();
}

async function printResultSheet() {
  const proj = await myProject();
  if (!proj) { showToast('No project found.', 'error'); return; }
  const [evals, members, supervisor] = await Promise.all([
    DB.fetch('evaluations'),
    DB.fetch('project_members', { projectId: proj.id }),
    getUser(proj.supervisorId)
  ]);
  if (!evals.length) { showToast('No evaluations available to print yet.', 'warning'); return; }

  const rows = evals.map(e => `<tr>
    <td>${(e.phase || '').toUpperCase()}</td>
    <td>${(+e.proposalMarks).toFixed(1)}</td><td>${(+e.presentationMarks).toFixed(1)}</td>
    <td>${(+e.implementationMarks).toFixed(1)}</td><td>${(+e.vivaMarks).toFixed(1)}</td>
    <td><b>${(+e.totalMarks).toFixed(1)}</b></td><td><b>${e.grade}</b></td></tr>`).join('');
  const memberRows = members.map(m => `${escHtml(m.name || '')}${m.rollNo ? ` (${escHtml(m.rollNo)})` : ''}${m.isLeader == 1 ? ' — Leader' : ''}`).join('<br>');

  const body = `
    <div class="head">
      <h1>DEPARTMENT OF COMPUTER SCIENCE</h1>
      <div class="sub">Final Year Project Management System — Result Sheet</div>
    </div>
    <table>
      <tr><th style="width:170px">Project Title</th><td>${escHtml(proj.title)}</td></tr>
      <tr><th>${members.length > 1 ? 'Group Members' : 'Student'}</th><td>${memberRows}</td></tr>
      <tr><th>Supervisor</th><td>${escHtml(supervisor.name)}</td></tr>
      <tr><th>Category</th><td>${escHtml(proj.category || '—')}</td></tr>
    </table>
    <h3>Evaluation Summary</h3>
    <table>
      <thead><tr><th>Phase</th><th>Proposal</th><th>Presentation</th><th>Implementation</th><th>Viva</th><th>Total</th><th>Grade</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sign"><div>Supervisor</div><div>FYP Coordinator</div><div>Head of Department</div></div>
    <div style="text-align:right;color:#777;font-size:11px;margin-top:24px">Generated ${new Date().toLocaleDateString('en-GB')}</div>`;
  openPrintWindow('FYP Result Sheet', body);
}

// ============================================================
//  TASK DETAIL MODAL  (submission & review loop)
// ============================================================
async function openTaskModal(taskId) {
  const existing = document.getElementById('taskModal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'taskModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal modal-lg"><div id="taskModalInner"><div style="padding:40px;text-align:center;color:var(--text3)">⏳ Loading…</div></div></div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  await loadTaskModal(taskId);
}

async function loadTaskModal(taskId) {
  const inner = document.getElementById('taskModalInner');
  if (!inner) return;
  const [task, files, logs] = await Promise.all([
    DB.fetch('tasks', { id: taskId }),
    DB.fetch('files/list', { entityType: 'task', entityId: taskId }),
    DB.fetch('audit_logs', { entityType: 'task', entityId: taskId })
  ]);
  if (!task || !task.id) {
    inner.innerHTML = `<button class="modal-close" onclick="document.getElementById('taskModal').remove()">✕</button><div class="empty-state"><div class="empty-title">Task not found</div></div>`;
    return;
  }

  const isAssignee = currentRole === 'student' && task.assignedTo === currentUser.id;
  const isReviewer = currentRole === 'supervisor' || currentRole === 'admin';
  const pc = { low: 'var(--success)', medium: 'var(--accent)', high: 'var(--warning)', urgent: 'var(--danger)' }[task.priority] || 'var(--accent)';
  const od = task.status !== 'completed' && new Date(task.dueDate + 'T00:00:00') < new Date();

  const fileList = files.length ? files.map(f => {
    const who = f.uploadedBy === currentUser.id ? 'You'
      : (f.uploadedBy === task.supervisorId ? 'Supervisor'
      : (f.uploadedBy === task.assignedTo ? (task.assigneeName || 'Student') : 'User'));
    return `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
      ${fileDownloadLink(f.id, f.originalName, f.fileSize)}
      <div class="text-xs text-muted">by ${escHtml(who)} · ${fmtTime(f.uploadedAt)}</div></div>`;
  }).join('') : '<div class="text-sm text-muted">No files attached yet.</div>';

  let actions = '';
  if (isAssignee) {
    if (task.status === 'pending') {
      actions = `<button class="btn btn-primary" onclick="startTaskFromModal('${task.id}')">▶ Start Task</button>`;
    } else if (task.status === 'in-progress' || task.status === 'returned') {
      actions = `
      <div class="form-group mb-3"><label class="form-label">Your notes (what you did)</label>
        <textarea class="form-textarea" id="tmNotes" rows="2" placeholder="Summarise your work / what's in the file...">${escHtml(task.studentNotes || '')}</textarea></div>
      <div class="form-group mb-3"><label class="form-label">Attach file / code (optional — zip, pdf, etc.)</label>
        <input type="file" id="tmFile" class="form-input" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.rar,.7z,.txt,.csv,.json,.md,.mp4"></div>
      <button class="btn btn-success" onclick="submitTaskWork('${task.id}')">📤 Submit for Review</button>`;
    } else if (task.status === 'submitted') {
      actions = `<div class="alert alert-info" style="margin:0">⏳ Submitted — awaiting your supervisor's review.</div>`;
    } else if (task.status === 'completed') {
      actions = `<div class="alert alert-success" style="margin:0">✅ Approved by your supervisor.</div>`;
    }
  } else if (isReviewer) {
    if (['submitted', 'in-progress', 'returned'].includes(task.status)) {
      actions = `
      <div class="form-group mb-3"><label class="form-label">Feedback to student</label>
        <textarea class="form-textarea" id="tmFeedback" rows="2" placeholder="What's good, what needs fixing...">${escHtml(task.supervisorFeedback || '')}</textarea></div>
      <div class="form-group mb-3"><label class="form-label">Attach corrected file (optional)</label>
        <input type="file" id="tmFile" class="form-input"></div>
      <div class="flex gap-2">
        <button class="btn btn-success" onclick="reviewTaskWork('${task.id}','completed')">✅ Approve</button>
        <button class="btn btn-warning" onclick="reviewTaskWork('${task.id}','returned')">↩ Return for revision</button>
      </div>`;
    } else if (task.status === 'completed') {
      actions = `<div class="alert alert-success" style="margin:0">✅ Approved.</div>`;
    } else {
      actions = `<div class="text-sm text-muted">Waiting for the student to start/submit this task.</div>`;
    }
  }

  inner.innerHTML = `
  <button class="modal-close" onclick="document.getElementById('taskModal').remove()">✕</button>
  <div class="modal-title">${escHtml(task.title)}</div>
  <div class="modal-sub flex items-center gap-2" style="margin-bottom:12px;flex-wrap:wrap">
    ${statusBadge(task.status)}
    <span class="badge" style="background:${pc}22;color:${pc};border:1px solid ${pc}44">${(task.priority || 'medium').toUpperCase()}</span>
    <span class="text-sm" style="color:${od ? 'var(--danger)' : 'var(--text3)'}">📅 ${fmt(task.dueDate)}${od ? ' (overdue)' : ''}</span>
  </div>
  ${task.description ? `<div class="text-sm text-muted mb-3" style="line-height:1.6">${escHtml(task.description)}</div>` : ''}
  <div class="text-xs text-muted mb-3">📁 ${escHtml(task.projectTitle || '')} · 👤 ${escHtml(task.assigneeName || '')} · assigned by ${escHtml(task.assignedByName || 'Supervisor')}</div>

  ${task.studentNotes ? `<div class="mb-3" style="padding:10px 14px;background:var(--surface2);border-radius:10px"><div class="text-xs text-muted mb-1">📝 Student notes</div><div class="text-sm">${escHtml(task.studentNotes)}</div></div>` : ''}
  ${task.supervisorFeedback ? `<div class="mb-3" style="padding:10px 14px;background:var(--surface2);border-radius:10px;border-left:3px solid var(--accent)"><div class="text-xs text-muted mb-1">💬 Supervisor feedback</div><div class="text-sm">${escHtml(task.supervisorFeedback)}</div></div>` : ''}

  <div class="card-title" style="font-size:14px;margin:12px 0 4px">📎 Attachments</div>
  <div class="mb-3">${fileList}</div>

  <div class="card-title" style="font-size:14px;margin:12px 0 6px">⚙️ Actions</div>
  <div class="mb-4">${actions || '<div class="text-sm text-muted">No actions available.</div>'}</div>

  <div class="card-title" style="font-size:14px;margin:12px 0 6px">📋 History</div>
  <div class="audit-log-list" style="max-height:200px;overflow-y:auto">
    ${logs.length ? logs.map(renderAuditEntry).join('') : '<div class="text-sm text-muted">No activity yet.</div>'}
  </div>`;
}

// Refresh the list page behind the modal (without closing it).
function refreshTaskListBehind() {
  const activeNav = document.querySelector('.nav-item.active');
  if (activeNav && activeNav.id.startsWith('nav-')) navigate(activeNav.id.slice(4));
  updateNotifBadge();
}

async function uploadTaskFileIfAny(taskId, inputId) {
  const input = document.getElementById(inputId);
  const file = input && input.files && input.files[0];
  if (!file) return true;
  if (file.size > 200 * 1024 * 1024) { showToast('File exceeds 200MB limit.', 'error'); return false; }
  const fd = new FormData();
  fd.append('taskId', taskId);
  fd.append('file', file);
  const r = await DB.postForm('tasks/upload', fd);
  if (r.error) { showToast(r.error, 'error'); return false; }
  return true;
}

async function startTaskFromModal(id) {
  await DB.post('tasks/updateStatus', { id, status: 'in-progress' });
  await loadTaskModal(id);
  refreshTaskListBehind();
}

async function submitTaskWork(id) {
  const notes = document.getElementById('tmNotes')?.value.trim() || '';
  if (!(await uploadTaskFileIfAny(id, 'tmFile'))) return;
  const res = await DB.post('tasks/submit', { id, notes });
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('Submitted for review.', 'success');
  await loadTaskModal(id);
  refreshTaskListBehind();
}

async function reviewTaskWork(id, decision) {
  const feedback = document.getElementById('tmFeedback')?.value.trim() || '';
  if (decision === 'returned' && !feedback) { showToast('Please add feedback explaining what to fix.', 'error'); return; }
  if (!(await uploadTaskFileIfAny(id, 'tmFile'))) return;
  const res = await DB.post('tasks/review', { id, decision, feedback });
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast(decision === 'completed' ? 'Task approved.' : 'Returned for revision.', decision === 'completed' ? 'success' : 'info');
  await loadTaskModal(id);
  refreshTaskListBehind();
}

// ============================================================
//  ADMIN ANNOUNCEMENTS
// ============================================================
async function renderAdminAnnouncements() {
  const list = await DB.fetch('announcements', { role: 'admin' });
  const prBadge = { urgent: 'badge-red', important: 'badge-yellow', normal: 'badge-gray' };
  const targetLabel = { all: 'Everyone', student: 'Students', supervisor: 'Supervisors' };

  return `
  <div class="card mb-4">
    <div class="card-header"><div class="card-title">📢 Post Announcement</div></div>
    <div id="annAlert"></div>
    <div class="form-group mb-3"><label class="form-label">Title *</label>
      <input class="form-input" id="annTitle" placeholder="e.g., FYP-1 proposals due next week"></div>
    <div class="form-group mb-3"><label class="form-label">Message *</label>
      <textarea class="form-textarea" id="annBody" rows="3" placeholder="Write the announcement..."></textarea></div>
    <div class="form-grid mb-4">
      <div class="form-group"><label class="form-label">Audience</label>
        <select class="form-select" id="annTarget">
          <option value="all">Everyone</option><option value="student">Students only</option><option value="supervisor">Supervisors only</option>
        </select></div>
      <div class="form-group"><label class="form-label">Priority</label>
        <select class="form-select" id="annPriority">
          <option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option>
        </select></div>
    </div>
    <button class="btn btn-primary" onclick="postAnnouncement()">📢 Publish</button>
  </div>

  <div class="card">
    <div class="card-header"><div class="card-title">🗂️ Posted Announcements</div><span class="badge badge-blue">${list.length}</span></div>
    ${list.length ? list.map(a => `
      <div class="card mb-3" style="padding:16px 18px">
        <div class="flex items-center justify-between gap-3" style="flex-wrap:wrap">
          <div class="flex items-center gap-2" style="flex-wrap:wrap">
            <span class="semi">${escHtml(a.title)}</span>
            <span class="badge ${prBadge[a.priority] || 'badge-gray'}">${cap(a.priority)}</span>
            <span class="badge badge-blue">${targetLabel[a.targetRole] || 'Everyone'}</span>
          </div>
          <button class="btn btn-danger btn-xs" onclick="deleteAnnouncement('${a.id}')">🗑</button>
        </div>
        <div class="text-sm text-muted mt-2" style="line-height:1.6;white-space:pre-wrap">${escHtml(a.body)}</div>
        <div class="text-xs text-muted mt-2">By ${escHtml(a.authorName || 'Admin')} · ${fmtTime(a.createdAt)}</div>
      </div>`).join('')
      : '<div class="empty-state"><div class="empty-icon">📢</div><div class="empty-title">No Announcements</div><div class="empty-desc">Post the first announcement above.</div></div>'}
  </div>`;
}

async function postAnnouncement() {
  const alertEl = document.getElementById('annAlert');
  const title = document.getElementById('annTitle').value.trim();
  const body  = document.getElementById('annBody').value.trim();
  if (!title || !body) { alertEl.innerHTML = `<div class="alert alert-error">⚠️ Title and message are required.</div>`; return; }
  const res = await DB.post('announcements/create', {
    title, body,
    targetRole: document.getElementById('annTarget').value,
    priority: document.getElementById('annPriority').value,
  });
  if (res.error) { alertEl.innerHTML = `<div class="alert alert-error">⚠️ ${escHtml(res.error)}</div>`; return; }
  showToast('Announcement published.', 'success');
  navigate('admin-announcements');
}

async function deleteAnnouncement(id) {
  if (!confirm('Delete this announcement?')) return;
  const res = await DB.post('announcements/delete', { id });
  if (!res.error) { showToast('Announcement deleted.', 'info'); navigate('admin-announcements'); }
}

// Read-only announcements feed for students & supervisors.
async function renderUserAnnouncements() {
  const list = await DB.fetch('announcements', { role: currentRole });
  const prBadge = { urgent: 'badge-red', important: 'badge-yellow', normal: 'badge-gray' };
  const prIcon  = { urgent: '🔴', important: '🟡', normal: '📢' };
  return `
  <div class="card">
    <div class="card-header"><div class="card-title">📢 Announcements</div><span class="badge badge-blue">${list.length}</span></div>
    ${list.length ? list.map(a => `
      <div class="card mb-3" style="padding:16px 18px;${a.priority === 'urgent' ? 'border-left:3px solid var(--danger)' : a.priority === 'important' ? 'border-left:3px solid var(--warning)' : ''}">
        <div class="flex items-center gap-2 mb-1" style="flex-wrap:wrap">
          <span class="semi">${prIcon[a.priority] || '📢'} ${escHtml(a.title)}</span>
          <span class="badge ${prBadge[a.priority] || 'badge-gray'}">${cap(a.priority)}</span>
        </div>
        <div class="text-sm text-muted" style="line-height:1.6;white-space:pre-wrap">${escHtml(a.body)}</div>
        <div class="text-xs text-muted mt-2">By ${escHtml(a.authorName || 'Admin')} · ${timeAgo(a.createdAt)}</div>
      </div>`).join('')
      : '<div class="empty-state"><div class="empty-icon">📢</div><div class="empty-title">No Announcements</div><div class="empty-desc">Department announcements will appear here.</div></div>'}
  </div>`;
}

// ============================================================
//  STUDENT — FIND / REQUEST A SUPERVISOR
// ============================================================
async function renderStudentSupervisors() {
  const [users, requests] = await Promise.all([
    DB.fetch('users'),
    DB.fetch('supervisor_requests')
  ]);
  const supervisors = users.filter(u => u.role === 'supervisor');
  const reqBySup = {};
  requests.forEach(r => { reqBySup[r.supervisorId] = r; });

  return `
  <div class="card mb-4">
    <div class="card-header"><div class="card-title">🔎 Request a Supervisor</div></div>
    <div id="reqAlert"></div>
    <div class="text-sm text-muted mb-4">Send a supervision request with your proposed idea. Supervisors will accept or decline.</div>
    <div class="form-group mb-3"><label class="form-label">Supervisor *</label>
      <select class="form-select" id="reqSup">
        <option value="">Select a supervisor…</option>
        ${supervisors.map(s => `<option value="${s.id}">${escHtml(s.name)}${s.specialization ? ` — ${escHtml(s.specialization)}` : ''}</option>`).join('')}
      </select></div>
    <div class="form-group mb-3"><label class="form-label">Proposed Project Title</label><input class="form-input" id="reqTitle" placeholder="e.g., Smart Attendance System"></div>
    <div class="form-group mb-4"><label class="form-label">Brief Summary</label><textarea class="form-textarea" id="reqSummary" rows="3" placeholder="A few lines about your idea..."></textarea></div>
    <button class="btn btn-primary" onclick="requestSupervisor()">📨 Send Request</button>
  </div>

  <div class="card mb-4">
    <div class="card-header"><div class="card-title">📨 My Requests</div><span class="badge badge-blue">${requests.length}</span></div>
    ${requests.length ? requests.map(r => {
      const sup = supervisors.find(s => s.id === r.supervisorId) || {};
      return `<div class="card mb-3" style="padding:14px 16px">
        <div class="flex items-center justify-between gap-2" style="flex-wrap:wrap">
          <div class="semi">${escHtml(sup.name || 'Supervisor')}${r.proposalTitle ? ` · <span class="text-muted">${escHtml(r.proposalTitle)}</span>` : ''}</div>
          ${statusBadge(r.status)}
        </div>
        ${r.supervisorResponse ? `<div class="text-sm mt-2" style="padding:8px 12px;background:var(--surface2);border-radius:8px"><strong>Response:</strong> ${escHtml(r.supervisorResponse)}</div>` : ''}
        <div class="text-xs text-muted mt-1">Sent ${timeAgo(r.createdAt)}</div>
      </div>`;
    }).join('') : '<div class="text-sm text-muted">You haven\'t sent any requests yet.</div>'}
  </div>

  <div class="card">
    <div class="card-header"><div class="card-title">👨‍🏫 Available Supervisors</div><span class="badge badge-blue">${supervisors.length}</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Specialization</th><th>Department</th></tr></thead>
      <tbody>${supervisors.map(s => `<tr><td class="semi">${escHtml(s.name)}</td><td class="text-sm">${escHtml(s.specialization || '—')}</td><td class="text-sm text-muted">${escHtml(s.department || 'IT')}</td></tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

async function requestSupervisor() {
  const alertEl = document.getElementById('reqAlert');
  const supervisorId = document.getElementById('reqSup').value;
  if (!supervisorId) { alertEl.innerHTML = `<div class="alert alert-error">⚠️ Select a supervisor.</div>`; return; }
  const res = await DB.post('supervisor_requests/create', {
    supervisorId,
    proposalTitle: document.getElementById('reqTitle').value.trim(),
    proposalSummary: document.getElementById('reqSummary').value.trim(),
  });
  if (res.error) { alertEl.innerHTML = `<div class="alert alert-error">⚠️ ${escHtml(res.error)}</div>`; return; }
  showToast('Supervision request sent.', 'success');
  navigate('stu-supervisors');
}

// ============================================================
//  TOAST
// ============================================================
function showToast(msg, type = 'success') {
  const colors = { success: 'var(--success)', error: 'var(--danger)', info: 'var(--accent)', warning: 'var(--warning)' };
  const icons  = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast  = document.createElement('div');
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:var(--surface);border:1px solid var(--border);border-left:4px solid ${colors[type] || colors.info};padding:14px 20px;border-radius:12px;font-size:13px;font-weight:600;color:var(--text);z-index:9999;animation:slideIn .3s ease;box-shadow:0 8px 32px rgba(0,0,0,.4);display:flex;align-items:center;gap:10px;max-width:340px`;
  toast.innerHTML = `${icons[type] || '💬'} ${escHtml(msg)}`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all .3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============================================================
//  INIT
// ============================================================
console.log('FYP Management System — initialized');

// Require a fresh login every time the project is opened/reloaded.
// We intentionally do NOT auto-resume the server session here, so the user is
// always presented with the login screen and must enter their credentials again.
// Any lingering server session is cleared so it cannot be silently reused.
(async function requireFreshLogin() {
  try {
    await fetch(API_URL + '?action=logout', { method: 'POST', credentials: 'same-origin' });
  } catch (e) { /* offline or server down — landing page is shown anyway */ }
})();
