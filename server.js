const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

// Supabase config (set these in Render Environment Variables)
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

async function sbFetch(table, opts = {}) {
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL not set');
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  if (opts.select) url.searchParams.set('select', opts.select);
  if (opts.eq) url.searchParams.set('id', `eq.${opts.eq}`);
  if (opts.limit) url.searchParams.set('limit', String(opts.limit));
  if (opts.order) url.searchParams.set('order', opts.order);

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': opts.prefer || 'return=representation'
  };

  const res = await fetch(url.toString(), {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('Supabase error:', errText);
    throw new Error(errText);
  }
  if (res.status === 204) return null;
  return res.json();
}

const sessions = new Map();

// Middleware
const auth = async (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Unauthorized' });
  req.user = sessions.get(token);
  next();
};

// Auth Routes
app.post('/api/auth/signup', async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'Missing credentials' });
  try {
    await sbFetch('users', {
      method: 'POST',
      body: { name, password, role: 'user' },
      prefer: 'return=minimal'
    });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: 'Username exists' }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { name, password } = req.body;
  try {
    const users = await sbFetch('users', {
      select: '*',
      method: 'GET',
      filter: `name=eq.${name}`
    });
    // Note: simple filter above; for simplicity check result length
    const user = users?.find ? users.find(u => u.name === name && u.password === password) : null;
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { id: user.id, name: user.name, role: user.role });
    res.json({ token, user: { name: user.name, role: user.role } });
  } catch (e) {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: { name: req.user.name, role: req.user.role } });
});

// Data Routes
app.get('/api/logs', auth, async (req, res) => {
  try {
    const logs = await sbFetch('logs', {
      select: '*',
      order: 'id.desc',
      limit: '100'
    });
    res.json(logs || []);
  } catch (e) { res.status(500).json({ error: 'Failed to fetch logs' }); }
});

app.post('/api/logs', auth, async (req, res) => {
  const { user_name } = req.body;
  if (!user_name) return res.status(400).json({ error: 'Missing user_name' });
  try {
    await sbFetch('logs', {
      method: 'POST',
      body: { user_name, created_at: new Date().toLocaleString('ar-SA') },
      prefer: 'return=minimal'
    });
    io.emit('logs_updated');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/logs/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    await sbFetch('logs', {
      method: 'DELETE',
      eq: req.params.id,
      prefer: 'return=minimal'
    });
    io.emit('logs_updated');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/logs', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    await sbFetch('logs', {
      method: 'DELETE',
      select: '*',
      prefer: 'return=minimal'
    });
    io.emit('logs_updated');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Pro Server running on port ${PORT}`));
