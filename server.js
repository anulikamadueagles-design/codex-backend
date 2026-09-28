const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(express.json());

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_KEY = process.env.ADMIN_KEY || 'change-this-admin-key';
const DB_FILE = path.join(__dirname, 'data.json');
const CANCEL_WINDOW_MS = 15 * 60 * 1000;

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
app.post('/api/upload', (req, res) => {
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
      { id: 1, title: "The Glass Horizon", author: "Nadia Ferro", description: "A shipbuilder's daughter chases a signal across a dying solar system.", price: 6500, category: "Sci-Fi & Fantasy", quantity: 12, cover: null, grad: "linear-gradient(155deg,#1f3d1a,#39ff8f 130%)", accName: "Nadia Ferro", accNum: "0221394857", accType: "Kuda", phone: "08031234567", ad: { desc: "Fresh sci-fi drop this week, signed copies available.", rate: 3000, confirmed: true, videoUrl: null, proofUrl: null }, reviews: [{ name: "Tomiwa", stars: 5, comment: "Could not put it down.", date: "2026-08-02" }], createdAt: oldEnough },
      { id: 2, title: "Systems of Tomorrow", author: "D. Okonkwo", description: "A field guide to thinking in systems, written for builders.", price: 4200, category: "Business", quantity: 20, cover: null, grad: "linear-gradient(155deg,#1a2e12,#ffd54a 130%)", accName: "D. Okonkwo", accNum: "3013948527", accType: "Bank transfer", phone: "08129876543", ad: null, reviews: [], createdAt: oldEnough },
      { id: 3, title: "Ashes of the Archive", author: "R. Bello", description: "A librarian uncovers a conspiracy buried in the stacks.", price: 5000, category: "Fiction", quantity: 8, cover: null, grad: "linear-gradient(155deg,#2b1a08,#ffd54a 140%)", accName: "R. Bello", accNum: "7729384012", accType: "PalmPay", phone: "07056677889", ad: null, reviews: [{ name: "Chidera", stars: 4, comment: "Slow start, great payoff.", date: "2026-07-20" }], createdAt: oldEnough },
      { id: 4, title: "Quiet Capital", author: "T. Adeyemi", description: "How patient money actually gets made, told through ten founders.", price: 7800, category: "Business", quantity: 15, cover: null, grad: "linear-gradient(155deg,#0f2a1c,#39ff8f 130%)", accName: "T. Adeyemi", accNum: "8843920156", accType: "Opay", phone: "09022334455", ad: null, reviews: [], createdAt: oldEnough },
      { id: 5, title: "Signal and Silence", author: "Nadia Ferro", description: "Book two of the Horizon series.", price: 3900, category: "Sci-Fi & Fantasy", quantity: 10, cover: null, grad: "linear-gradient(155deg,#241a08,#ffd54a 130%)", accName: "Nadia Ferro", accNum: "0221394857", accType: "Kuda", phone: "08031234567", ad: { desc: "Signal and Silence: book two of the Horizon series, out now.", rate: 2500, confirmed: true, videoUrl: null, proofUrl: null }, reviews: [], createdAt: oldEnough },
      { id: 6, title: "Building with Bits", author: "K. Umeh", description: "Ship software fast without breaking things later.", price: 5600, category: "Software & Hardware", quantity: 18, cover: null, grad: "linear-gradient(155deg,#122a1a,#39ff8f 130%)", accName: "K. Umeh", accNum: "5567788990", accType: "Opay", phone: "08155566778", ad: null, reviews: [{ name: "Uche", stars: 5, comment: "Practical and to the point.", date: "2026-06-11" }], createdAt: oldEnough }
    ],
    orders: [],
    complaints: [],
    subscription: { history: [], lastPaid: null, pending: null },
    coupons: [{ code: "WELCOME10", percent: 10 }, { code: "BOOKLOVER15", percent: 15 }],
    newsletter: [],
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
    if (db.subscription && db.subscription.pending === undefined) db.subscription.pending = null;
    return db;
  } catch (e) { return seedDB(); }
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function genTracking() { return 'CDX-' + Math.floor(10000 + Math.random() * 89999); }
function genScratch() { return 'SC-' + Math.floor(1000 + Math.random() * 8999) + '-' + Math.floor(1000 + Math.random() * 8999); }
function genRef() { return 'SUB-' + Math.floor(100000 + Math.random() * 899999); }

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

app.get('/api/state', asyncRoute((req, res) => {
  const db = loadDB();
  res.json({ books: publicBooks(db), orders: db.orders, subscription: db.subscription });
}));

app.post('/api/books', asyncRoute((req, res) => {
  const db = loadDB();
  const b = req.body;
  if (!b.title || !b.author || !Number(b.price) || Number(b.price) <= 0) return res.status(400).json({ error: 'Title, author, and a price above 0 are required.' });
  if (!b.accName || !b.accNum || !b.accType || !b.phone) return res.status(400).json({ error: 'Full payout details are required.' });
  if (!/^[0-9]{10,11}$/.test(String(b.phone).replace(/\D/g, ''))) return res.status(400).json({ error: 'Phone number should be 10-11 digits.' });
  const grads = ["linear-gradient(155deg,#1f3d1a,#39ff8f 130%)", "linear-gradient(155deg,#1a2e12,#ffd54a 130%)", "linear-gradient(155deg,#2b1a08,#ffd54a 140%)", "linear-gradient(155deg,#0f2a1c,#39ff8f 130%)"];
  const book = {
    id: db.nextBookId++, title: String(b.title).slice(0, 120), author: String(b.author).slice(0, 80),
    description: String(b.description || '').slice(0, 600), price: Number(b.price),
    category: b.category || 'Fiction', quantity: Math.max(0, parseInt(b.quantity) || 10),
    cover: b.cover || null,
    grad: grads[Math.floor(Math.random() * grads.length)],
    accName: b.accName, accNum: b.accNum, accType: b.accType, phone: b.phone,
    ad: null, reviews: [], createdAt: Date.now()
  };
  db.books.unshift(book);
  saveDB(db);
  res.json(book);
}));

app.post('/api/books/:id/stock', asyncRoute((req, res) => {
  const db = loadDB();
  const book = db.books.find(x => x.id === Number(req.params.id));
  if (!book) return res.status(404).json({ error: 'Listing not found.' });
  book.quantity = book.quantity > 0 ? 0 : 10;
  saveDB(db);
  res.json(book);
}));

app.post('/api/books/:id/ad', asyncRoute((req, res) => {
  const db = loadDB();
  const book = db.books.find(x => x.id === Number(req.params.id));
  if (!book) return res.status(404).json({ error: 'Listing not found.' });
  if (!req.body.desc || !req.body.rate) return res.status(400).json({ error: 'Ad description and rate are required.' });
  let rate = Number(req.body.rate) || 0;
  if (rate > 7000) rate = 7000;
  if (rate <= 0) return res.status(400).json({ error: 'Rate must be greater than 0.' });
  book.ad = { desc: String(req.body.desc).slice(0, 200), rate, confirmed: false, videoUrl: req.body.videoUrl || null, proofUrl: req.body.proofUrl || null };
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

app.get('/api/coupons/:code', asyncRoute((req, res) => {
  const db = loadDB();
  const coupon = db.coupons.find(c => c.code.toUpperCase() === req.params.code.toUpperCase());
  if (!coupon) return res.status(404).json({ error: 'Coupon not found.' });
  res.json(coupon);
}));

app.post('/api/books/:id/reviews', asyncRoute((req, res) => {
  const db = loadDB();
  const book = db.books.find(x => x.id === Number(req.params.id));
  if (!book) return res.status(404).json({ error: 'Listing not found.' });
  const stars = parseInt(req.body.stars);
  if (!req.body.name || !req.body.comment || !(stars >= 1 && stars <= 5)) return res.status(400).json({ error: 'Name, a comment, and a 1-5 star rating are required.' });
  book.reviews.push({ name: String(req.body.name).slice(0, 60), stars, comment: String(req.body.comment).slice(0, 400), date: new Date().toISOString().slice(0, 10) });
  saveDB(db);
  res.json(book);
}));

app.post('/api/orders', asyncRoute((req, res) => {
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

app.post('/api/orders/external', asyncRoute((req, res) => {
  const db = loadDB();
  if (!req.body.title || !req.body.buyer) return res.status(400).json({ error: 'Item title and buyer name are required.' });
  const order = { tracking: genTracking(), code: genScratch(), title: String(req.body.title).slice(0, 120), price: Number(req.body.price) || 0, buyer: String(req.body.buyer).slice(0, 80), external: true, platform: req.body.platform || 'Other', dispatched: false, cancelled: false, refunded: false, createdAt: Date.now() };
  db.orders.push(order);
  saveDB(db);
  res.json(order);
}));

app.get('/api/orders/:tracking', asyncRoute((req, res) => {
  const db = loadDB();
  const order = db.orders.find(o => o.tracking === req.params.tracking.toUpperCase());
  if (!order) return res.status(404).json({ error: 'No order found with that tracking number.' });
  res.json(order);
}));

app.get('/api/orders', asyncRoute((req, res) => {
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

app.post('/api/orders/:tracking/dispatch', asyncRoute((req, res) => {
  const db = loadDB();
  const order = db.orders.find(o => o.tracking === req.params.tracking);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  order.dispatched = true;
  saveDB(db);
  res.json(order);
}));

app.post('/api/orders/:tracking/cancel', asyncRoute((req, res) => {
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

app.post('/api/orders/:tracking/refund', asyncRoute((req, res) => {
  const db = loadDB();
  const order = db.orders.find(o => o.tracking === req.params.tracking);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  order.refunded = true;
  saveDB(db);
  res.json(order);
}));

app.post('/api/complaints', asyncRoute((req, res) => {
  const db = loadDB();
  if (!req.body.tracking || !req.body.message) return res.status(400).json({ error: 'Order number and message are required.' });
  db.complaints.push({ tracking: req.body.tracking, message: String(req.body.message).slice(0, 500) });
  saveDB(db);
  res.json({ ok: true });
}));

app.post('/api/newsletter', asyncRoute((req, res) => {
  const db = loadDB();
  const email = String(req.body.email || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (!db.newsletter.includes(email)) db.newsletter.push(email);
  saveDB(db);
  res.json({ ok: true });
}));

app.get('/api/subscription', asyncRoute((req, res) => res.json(loadDB().subscription)));

app.post('/api/subscription/submit', asyncRoute((req, res) => {
  const db = loadDB();
  if (!req.body.proofUrl) return res.status(400).json({ error: 'Proof of payment is required.' });
  db.subscription.pending = { proofUrl: req.body.proofUrl, submittedAt: Date.now() };
  saveDB(db);
  res.json(db.subscription);
}));

app.post('/api/subscription/confirm', requireAdmin, asyncRoute((req, res) => {
  const db = loadDB();
  if (!db.subscription.pending) return res.status(400).json({ error: 'No pending subscription payment to confirm.' });
  const ref = genRef();
  const now = new Date();
  db.subscription.history.unshift({ reference: ref, date: now.toDateString(), proofUrl: db.subscription.pending.proofUrl });
  db.subscription.lastPaid = now.toISOString();
  db.subscription.pending = null;
  saveDB(db);
  res.json(db.subscription);
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route.' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Unexpected server error.' }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Codex server running on port ' + PORT));
