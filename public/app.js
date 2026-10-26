const socket = io();
const API = ''; 

const MEMBERS = ['محمد', 'مؤمن'];
let currentUser = null;

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const mainScreen = document.getElementById('main-screen');
const userBadge = document.getElementById('user-badge');
const statsGrid = document.getElementById('stats-grid');
const turnTitle = document.getElementById('turn-title');
const nextPerson = document.getElementById('next-person');
const logsList = document.getElementById('logs-list');

const userControls = document.getElementById('user-controls');
const adminControls = document.getElementById('admin-controls');
const adminMemberSelect = document.getElementById('admin-member-select');

const soundSuccess = document.getElementById('sound-success');
const soundError = document.getElementById('sound-error');

// Auth logic
async function handleLogin() {
    const name = document.getElementById('login-name').value;
    const password = document.getElementById('login-pass').value;
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password })
        });
        const data = await res.json();
        if (data.token) {
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            initApp();
        } else {
            alert(data.error);
            soundError.play();
        }
    } catch (e) { alert('خطأ في الاتصال بالسيرفر'); }
}

async function handleSignup() {
    const name = document.getElementById('signup-name').value;
    const password = document.getElementById('signup-pass').value;
    try {
        const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password })
        });
        const data = await res.json();
        if (data.ok) {
            alert('تم إنشاء الحساب! يمكنك الآن تسجيل الدخول.');
            switchTab('login');
        } else {
            alert(data.error);
            soundError.play();
        }
    } catch (e) { alert('خطأ في الاتصال بالسيرفر'); }
}

async function handleLogout() {
    await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    localStorage.removeItem('token');
    location.reload();
}

// App Core
async function initApp() {
    authScreen.style.display = 'none';
    mainScreen.style.display = 'block';
    userBadge.textContent = currentUser.name;
    userBadge.classList.toggle('admin', currentUser.role === 'admin');
    
    if (currentUser.role === 'admin') {
        userControls.style.display = 'none';
        adminControls.style.display = 'block';
    } else {
        userControls.style.display = 'block';
        adminControls.style.display = 'none';
    }
    
    loadLogs();
}

async function loadLogs() {
    try {
        const res = await fetch('/api/logs', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const logs = await res.json();
        updateUI(logs);
    } catch (e) { console.error(e); }
}

function updateUI(logs) {
    // Update Stats
    const counts = { 'محمد': 0, 'مؤمن': 0, 'Total': logs.length };
    logs.forEach(l => { if (counts.hasOwnProperty(l.user_name)) counts[l.user_name]++; });
    
    statsGrid.innerHTML = `
        <div class="stat-box"><div class="val">${counts['محمد']}</div><div class="lbl">محمد</div></div>
        <div class="stat-box"><div class="val">${counts['مؤمن']}</div><div class="lbl">مؤمن</div></div>
        <div class="stat-box"><div class="val">${counts['Total']}</div><div class="lbl">الإجمالي</div></div>
    `;

    // Update Turn
    turnTitle.textContent = "الدور على...";
    if (logs.length === 0) {
        nextPerson.textContent = "محمد أو مؤمن";
    } else {
        const last = logs[0].user_name;
        nextPerson.textContent = last === 'محمد' ? 'مؤمن' : 'محمد';
    }

    // Update Logs
    if (logs.length === 0) {
        logsList.innerHTML = '<div class="empty">لا يوجد سجلات حتى الآن.</div>';
    } else {
        logsList.innerHTML = logs.map(l => `
            <div class="log-item">
                <span class="log-who">${l.user_name}</span>
                <span class="log-when">${l.created_at}</span>
            </div>
        `).join('');
    }
}

// Real-time sync
socket.on('logs_updated', (logs) => {
    updateUI(logs);
    soundSuccess.play();
});

// Actions
async function logMe() {
    try {
        await fetch('/api/logs', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ user_name: currentUser.name })
        });
    } catch (e) { alert('فشل التسجيل'); }
}

async function adminLog() {
    const name = adminMemberSelect.value;
    try {
        await fetch('/api/logs', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ user_name: name })
        });
    } catch (e) { alert('فشل الإضافة'); }
}

async function undo() {
    try {
        const logs = await fetch('/api/logs', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }).then(r => r.json());
        if (logs.length === 0) return;
        await fetch(`/api/logs/${logs[0].id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
    } catch (e) { alert('فشل التراجع'); }
}

async function clearAll() {
    if (!confirm('هل أنت متأكدة من مسح كل السجلات؟')) return;
    try {
        await fetch('/api/logs', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
    } catch (e) { alert('فشل المسح'); }
}

// UI Helpers
function switchTab(tab) {
    document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('signup-form').style.display = tab === 'signup' ? 'block' : 'none';
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
}

async function checkSession() {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            initApp();
        } else {
            localStorage.removeItem('token');
        }
    } catch (e) { console.log("Session error"); }
}

window.onload = checkSession;
