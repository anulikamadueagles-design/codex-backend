const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use(express.static(path.join(__dirname, 'public')));

// ADMIN_KEY: Anuli's own secret, used only to approve a submitted ad's Selar payment.
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-this-admin-key';
// COMPANY_EMAIL / COMPANY_PASSWORD: the one account that can list books and run ads.
// Set these in Render's environment variables - do not leave the defaults in place.
const COMPANY_EMAIL = (process.env.COMPANY_EMAIL || 'company@codex.local').toLowerCase();
const COMPANY_PASSWORD = process.env.COMPANY_PASSWORD || 'change-this-company-password';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DB_FILE = path.join(__dirname, 'data.json');
const CANCEL_WINDOW_MS = 15 * 60 * 1000;

// ---------- cookies (no extra dependency - parsed by hand) ----------
function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `codex_session=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}; SameSite=Lax`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'codex_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

// ---------- security headers ----------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  next();
});

// ---------- simple in-memory rate limiter ----------
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 60 * 1000;
  const max = 60;
  const entry = hits.get(ip) || [];
  const recent = entry.filter(t => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (recent.length > max) return res.status(429).json({ error: 'Too many requests, slow down.' });
  next();
}
app.use('/api', rateLimit);

function requireAdmin(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid admin key.' });
  next();
}

// ---------- sessions (any signed-in user: buyer or the company account) ----------
function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.codex_session;
  if (!token) return null;
  const db = loadDB();
  const session = db.sessions[token];
  if (!session || session.expires < Date.now()) return null;
  return session;
}
function requireAuth(req, res, next) {
  const session = getSessionUser(req);
  if (!session) return res.status(401).json({ error: 'Please sign in first.' });
  req.session = session;
  next();
}
function requireCompany(req, res, next) {
  const session = getSessionUser(req);
  if (!session || session.role !== 'company') return res.status(403).json({ error: 'Only the company account can do that.' });
  req.session = session;
  next();
}

function asyncRoute(fn) {
  return (req, res) => Promise.resolve(fn(req, res)).catch(err => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });
}

// ---------- file uploads ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype) || /^video\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image or video files are allowed.'));
  }
});
app.post('/api/upload', requireAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received.' });
    res.json({ url: '/uploads/' + req.file.filename });
  });
});

// ---------- database ----------
function seedDB() {
  const oldEnough = Date.now() - 20 * 24 * 60 * 60 * 1000;
  const db = {
    books: [
      { id: 1, title: "The Glass Horizon", author: "Nadia Ferro", description: "A shipbuilder's daughter chases a signal across a dying solar system.", price: 6500, category: "Sci-Fi & Fantasy", quantity: 12, cover: null, grad: "linear-gradient(135deg,#0f8a5f,#0b6b48)", accName: "Nadia Ferro", accNum: "0221394857", accType: "Kuda", phone: "08031234567", ad: { desc: "Fresh sci-fi drop this week, signed copies available.", rate: 350000, period: 'month', confirmed: true, videoUrl: null, proofUrl: null }, reviews: [{ name: "Tomiwa", stars: 5, comment: "Could not put it down.", date: "2026-08-02" }], createdAt: oldEnough },
      { id: 2, title: "Systems of Tomorrow", author: "D. Okonkwo", description: "A field guide to thinking in systems, written for builders.", price: 4200, category: "Business", quantity: 20, cover: null, grad: "linear-gradient(135deg,#b45309,#92400e)", accName: "D. Okonkwo", accNum: "3013948527", accType: "Bank transfer", phone: "08129876543", ad: null, reviews: [], createdAt: oldEnough },
      { id: 3, title: "Ashes of the Archive", author: "R. Bello", description: "A librarian uncovers a conspiracy buried in the stacks.", price: 5000, category: "Fiction", quantity: 8, cover: null, grad: "linear-gradient(135deg,#1f2937,#111827)", accName: "R. Bello", accNum: "7729384012", accType: "PalmPay", phone: "07056677889", ad: null, reviews: [{ name: "Chidera", stars: 4, comment: "Slow start, great payoff.", date: "2026-07-20" }], createdAt: oldEnough },
      { id: 4, title: "Quiet Capital", author: "T. Adeyemi", description: "How patient money actually gets made, told through ten founders.", price: 7800, category: "Business", quantity: 15, cover: null, grad: "linear-gradient(135deg,#0f766e,#115e59)", accName: "T. Adeyemi", accNum: "8843920156", accType: "Opay", phone: "09022334455", ad: null, reviews: [], createdAt: oldEnough },
      { id: 5, title: "Signal and Silence", author: "Nadia Ferro", description: "Book two of the Horizon series.", price: 3900, category: "Sci-Fi & Fantasy", quantity: 10, cover: null, grad: "linear-gradient(135deg,#374151,#1f2937)", accName: "Nadia Ferro", accNum: "0221394857", accType: "Kuda", phone: "08031234567", ad: { desc: "Signal and Silence: book two of the Horizon series, out now.", rate: 350000, period: 'month', confirmed: true, videoUrl: null, proofUrl: null }, reviews: [], createdAt: oldEnough },
      { id: 6, title: "Building with Bits", author: "K. Umeh", description: "Ship software fast without breaking things later.", price: 5600, category: "Software & Hardware", quantity: 18, cover: null, grad: "linear-gradient(135deg,#0e7490,#164e63)", accName: "K. Umeh", accNum: "5567788990", accType: "Opay", phone: "08155566778", ad: null, reviews: [{ name: "Uche", stars: 5, comment: "Practical and to the point.", date: "2026-06-11" }], createdAt: oldEnough }
    ],
    orders: [],
    complaints: [],
    coupons: [{ code: "WELCOME10", percent: 10 }, { code: "BOOKLOVER15", percent: 15 }],
    newsletter: [],
    users: [],
    sessions: {},
    nextBookId: 7
  };
  saveDB(db);
  return db;
}
function loadDB() {
  if (!fs.existsSync(DB_FILE)) return seedDB();
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.coupons) db.coupons = [{ code: "WELCOME10", percent: 10 }];
    if (!db.newsletter) db.newsletter = [];
    if (!db.users) db.users = [];
    if (!db.sessions) db.sessions = {};
    return db;
  } catch (e) { return seedDB(); }
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function genTracking() { return 'CDX-' + Math.floor(10000 + Math.random() * 89999); }
function genScratch() { return 'SC-' + Math.floor(1000 + Math.random() * 8999) + '-' + Math.floor(1000 + Math.random() * 8999); }

function bookOrderCounts(db) {
  const counts = {};
  db.orders.forEach(o => { if (o.bookId && !o.cancelled) counts[o.bookId] = (counts[o.bookId] || 0) + (o.qty || 1); });
  return counts;
}
function publicBooks(db) {
  const counts = bookOrderCounts(db);
  const now = Date.now();
  return db.books.map(b => ({
    ...b,
    outOfStock: b.quantity <= 0,
    lowStock: b.quantity > 0 && b.quantity <= 3,
    isNew: (now - (b.createdAt || 0)) < 3 * 24 * 60 * 60 * 1000,
    isBestseller: (counts[b.id] || 0) >= 2
  }));
}

// ---------- routes ----------
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Tells the frontend whether the real APK has been placed in public/downloads/codex.apk yet.
// Keeps the Download App button from ever pointing at a dead link.
const APK_PATH = path.join(__dirname, 'public', 'downloads', 'codex.apk');
app.get('/api/app/info', (req, res) => {
  const exists = fs.existsSync(APK_PATH);
  const size = exists ? fs.statSync(APK_PATH).size : 0;
  res.json({ available: exists, sizeMB: exists ? (size / (1024 * 1024)).toFixed(1) : null });
});

// ---------- auth: anyone must sign up or log in before using the site ----------
app.post('/api/auth/signup', asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const db = loadDB();
  if (email === COMPANY_EMAIL || db.users.find(u => u.email === email)) return res.status(409).json({ error: 'An account with that email already exists.' });
  const passwordHash = await bcrypt.hash(password, 10);
  db.users.push({ email, passwordHash, createdAt: Date.now() });
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = { email, role: 'buyer', expires: Date.now() + SESSION_MAX_AGE_MS };
  saveDB(db);
  setSessionCookie(res, token);
  res.json({ email, role: 'buyer' });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const db = loadDB();
  const user = db.users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Wrong email or password.' });
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = { email, role: 'buyer', expires: Date.now() + SESSION_MAX_AGE_MS };
  saveDB(db);
  setSessionCookie(res, token);
  res.json({ email, role: 'buyer' });
}));

app.post('/api/auth/company-login', asyncRoute((req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const emailOk = email === COMPANY_EMAIL;
  const passOk = password.length === COMPANY_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(password), Buffer.from(COMPANY_PASSWORD));
  if (!emailOk || !passOk) return res.status(401).json({ error: 'Wrong company email or password.' });
  const db = loadDB();
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = { email: COMPANY_EMAIL, role: 'company', expires: Date.now() + SESSION_MAX_AGE_MS };
  saveDB(db);
  setSessionCookie(res, token);
  res.json({ email: COMPANY_EMAIL, role: 'company' });
}));

app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.codex_session) {
    const db = loadDB();
    delete db.sessions[cookies.codex_session];
    saveDB(db);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const session = getSessionUser(req);
  if (!session) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ email: session.email, role: session.role });
});

app.get('/api/state', requireAuth, asyncRoute((req, res) => {
  const db = loadDB();
  res.json({ books: publicBooks(db), orders: db.orders });
}));

app.post('/api/books', requireCompany, asyncRoute((req, res) => {
  const db = loadDB();
  const b = req.body;
  if (!b.title || !b.author || !Number(b.price) || Number(b.price) <= 0) return res.status(400).json({ error: 'Title, author, and a price above 0 are required.' });
  if (!b.accName || !b.accNum || !b.accType || !b.phone) return res.status(400).json({ error: 'Full payout details are required.' });
  if (!/^[0-9]{10,11}$/.test(String(b.phone).replace(/\D/g, ''))) return res.status(400).json({ error: 'Phone number should be 10-11 digits.' });
  const dup = db.books.find(x => x.title.toLowerCase() === String(b.title).toLowerCase() && x.author.toLowerCase() === String(b.author).toLowerCase());
  if (dup) return res.status(409).json({ error: 'A listing with that title and author already exists.' });
  const grads = ["linear-gradient(135deg,#0f8a5f,#0b6b48)", "linear-gradient(135deg,#b45309,#92400e)", "linear-gradient(135deg,#1f2937,#111827)", "linear-gradient(135deg,#0f766e,#115e59)"];
  const book = {
    id: db.nextBookId++, title: String(b.title).slice(0, 120), author: String(b.author).slice(0, 80),
    description: String(b.description || '').slice(0, 600), price: Number(b.price),
    category: b.category || 'Fiction', quantity: Math.max(0, parseInt(b.quantity) || 10),
    cover: b.cover || null,
    grad: grads[Math.floor(Math.random() * grads.length)],
    accName: b.accName, accNum: b.accNum, accType: b.accType, phone: b.phone,
    ad: null, reviews: [], createdAt: Date.now(), notifyCount: 0
  };
  db.books.unshift(book);
  saveDB(db);
  res.json(book);
}));

app.post('/api/books/:id/stock', requireCompany, asyncRoute((req, res) => {
  const db = loadDB();
  const book = db.books.find(x => x.id === Number(req.params.id));
  if (!book) return res.status(404).json({ error: 'Listing not found.' });
  book.quantity = book.quantity > 0 ? 0 : 10;
  saveDB(db);
  res.json(book);
}));

const AD_RATE_NAIRA = 350000; // flat monthly ad fee, paid via Selar
const AD_PERIOD = 'month';

app.post('/api/books/:id/ad', requireCompany, asyncRoute((req, res) => {
  const db = loadDB();
  const book = db.books.find(x => x.id === Number(req.params.id));
  if (!book) return res.status(404).json({ error: 'Listing not found.' });
  if (!req.body.desc) return res.status(400).json({ error: 'Ad description is required.' });
  book.ad = { desc: String(req.body.desc).slice(0, 200), rate: AD_RATE_NAIRA, period: AD_PERIOD, confirmed: false, videoUrl: req.body.videoUrl || null, proofUrl: req.body.proofUrl || null };
  saveDB(db);
  res.json(book);
}));

app.post('/api/books/:id/ad/confirm', requireAdmin, asyncRoute((req, res) => {
  const db = loadDB();
  const book = db.books.find(x => x.id === Number(req.params.id));
  if (!book || !book.ad) return res.status(404).json({ error: 'No pending ad for this listing.' });
  book.ad.confirmed = true;
  saveDB(db);
  res.json(book);
}));

app.get('/api/coupons/:code', requireAuth, asyncRoute((req, res) => {
  const db = loadDB();
  const coupon = db.coupons.find(c => c.code.toUpperCase() === req.params.code.toUpperCase());
  if (!coupon) return res.status(404).json({ error: 'Coupon not found.' });
  res.json(coupon);
}));

app.post('/api/books/:id/reviews', requireAuth, asyncRoute((req, res) => {
  const db = loadDB();
  const book = db.books.find(x => x.id === Number(req.params.id));
  if (!book) return res.status(404).json({ error: 'Listing not found.' });
  const stars = parseInt(req.body.stars);
  if (!req.body.name || !req.body.comment || !(stars >= 1 && stars <= 5)) return res.status(400).json({ error: 'Name, a comment, and a 1-5 star rating are required.' });
  book.reviews.push({ name: String(req.body.name).slice(0, 60), stars, comment: String(req.body.comment).slice(0, 400), date: new Date().toISOString().slice(0, 10) });
  saveDB(db);
  res.json(book);
}));

app.post('/api/orders', requireAuth, asyncRoute((req, res) => {
  const db = loadDB();
  const book = db.books.find(x => x.id === Number(req.body.bookId));
  if (!book) return res.status(404).json({ error: 'Book not found.' });
  const qty = Math.max(1, parseInt(req.body.qty) || 1);
  if (book.quantity < qty) return res.status(400).json({ error: 'Not enough stock left.' });
  let unitPrice = book.price;
  let couponApplied = null;
  if (req.body.coupon) {
    const coupon = db.coupons.find(c => c.code.toUpperCase() === String(req.body.coupon).toUpperCase());
    if (coupon) { unitPrice = Math.round(book.price * (1 - coupon.percent / 100)); couponApplied = coupon.code; }
  }
  book.quantity -= qty;
  const order = {
    tracking: genTracking(), code: genScratch(), bookId: book.id, title: book.title, author: book.author,
    price: unitPrice * qty, qty, coupon: couponApplied, phone: book.phone, sellerPhone: book.phone,
    buyerContact: req.body.buyerContact || null, proofUrl: req.body.proofUrl || null,
    dispatched: false, cancelled: false, refunded: false, createdAt: Date.now()
  };
  db.orders.push(order);
  saveDB(db);
  res.json(order);
}));

app.post('/api/orders/external', requireCompany, asyncRoute((req, res) => {
  const db = loadDB();
  if (!req.body.title || !req.body.buyer) return res.status(400).json({ error: 'Item title and buyer name are required.' });
  const order = { tracking: genTracking(), code: genScratch(), title: String(req.body.title).slice(0, 120), price: Number(req.body.price) || 0, buyer: String(req.body.buyer).slice(0, 80), external: true, platform: req.body.platform || 'Other', dispatched: false, cancelled: false, refunded: false, createdAt: Date.now() };
  db.orders.push(order);
  saveDB(db);
  res.json(order);
}));

app.get('/api/orders/:tracking', requireAuth, asyncRoute((req, res) => {
  const db = loadDB();
  const order = db.orders.find(o => o.tracking === req.params.tracking.toUpperCase());
  if (!order) return res.status(404).json({ error: 'No order found with that tracking number.' });
  res.json(order);
}));

app.get('/api/orders', requireAuth, asyncRoute((req, res) => {
  const db = loadDB();
  const contact = String(req.query.contact || '').trim().toLowerCase();
  const phoneOnly = contact.replace(/\D/g, '');
  if (!contact) return res.status(400).json({ error: 'Provide a phone number or email.' });
  const matches = db.orders.filter(o => {
    const bc = String(o.buyerContact || '').toLowerCase();
    return bc === contact || (phoneOnly && bc.replace(/\D/g, '') === phoneOnly);
  });
  res.json(matches);
}));

app.post('/api/orders/:tracking/dispatch', requireCompany, asyncRoute((req, res) => {
  const db = loadDB();
  const order = db.orders.find(o => o.tracking === req.params.tracking);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  order.dispatched = true;
  saveDB(db);
  res.json(order);
}));

app.post('/api/orders/:tracking/cancel', requireAuth, asyncRoute((req, res) => {
  const db = loadDB();
  const order = db.orders.find(o => o.tracking === req.params.tracking);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.dispatched) return res.status(400).json({ error: 'This order has already been dispatched and can no longer be cancelled here.' });
  if (order.cancelled) return res.status(400).json({ error: 'This order is already cancelled.' });
  if (Date.now() - (order.createdAt || 0) > CANCEL_WINDOW_MS) return res.status(400).json({ error: 'The 15-minute cancellation window has passed.' });
  order.cancelled = true;
  if (order.bookId) {
    const book = db.books.find(x => x.id === order.bookId);
    if (book) book.quantity += (order.qty || 1);
  }
  saveDB(db);
  res.json(order);
}));

app.post('/api/orders/:tracking/refund', requireCompany, asyncRoute((req, res) => {
  const db = loadDB();
  const order = db.orders.find(o => o.tracking === req.params.tracking);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  order.refunded = true;
  saveDB(db);
  res.json(order);
}));

app.post('/api/complaints', requireAuth, asyncRoute((req, res) => {
  const db = loadDB();
  if (!req.body.tracking || !req.body.message) return res.status(400).json({ error: 'Order number and message are required.' });
  db.complaints.push({ tracking: req.body.tracking, message: String(req.body.message).slice(0, 500) });
  saveDB(db);
  res.json({ ok: true });
}));

app.post('/api/newsletter', requireAuth, asyncRoute((req, res) => {
  const db = loadDB();
  const email = String(req.body.email || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (!db.newsletter.includes(email)) db.newsletter.push(email);
  saveDB(db);
  res.json({ ok: true });
}));

app.post('/api/books/:id/notify', requireAuth, asyncRoute((req, res) => {
  const db = loadDB();
  const book = db.books.find(x => x.id === Number(req.params.id));
  if (!book) return res.status(404).json({ error: 'Listing not found.' });
  book.notifyCount = (book.notifyCount || 0) + 1;
  saveDB(db);
  res.json({ notifyCount: book.notifyCount });
}));

app.get('/api/orders/export.csv', requireCompany, asyncRoute((req, res) => {
  const db = loadDB();
  const rows = [['tracking', 'title', 'price', 'qty', 'buyer_contact', 'cancelled', 'refunded', 'dispatched', 'created']];
  db.orders.forEach(o => {
    rows.push([o.tracking, o.title, o.price, o.qty || 1, o.buyerContact || o.buyer || '', !!o.cancelled, !!o.refunded, !!o.dispatched, o.createdAt ? new Date(o.createdAt).toISOString() : '']);
  });
  const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="codex-orders.csv"');
  res.send(csv);
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route.' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Unexpected server error.' }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Codex server running on port ' + PORT));
