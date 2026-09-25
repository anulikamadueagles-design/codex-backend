const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'data.json');

function seedDB() {
  const db = {
    books: [
      { id: 1, title: "The Glass Horizon", author: "Nadia Ferro", price: 6500, grad: "linear-gradient(155deg,#2a1f5e,#4ff0e0 130%)", accName: "Nadia Ferro", accNum: "0221394857", accType: "Kuda", phone: "08031234567", outOfStock: false, ad: { desc: "Fresh sci-fi drop this week, signed copies available.", rate: 3000, confirmed: true } },
      { id: 2, title: "Systems of Tomorrow", author: "D. Okonkwo", price: 4200, grad: "linear-gradient(155deg,#0e3a3a,#8c7cff 130%)", accName: "D. Okonkwo", accNum: "3013948527", accType: "Bank transfer", phone: "08129876543", outOfStock: false, ad: null },
      { id: 3, title: "Ashes of the Archive", author: "R. Bello", price: 5000, grad: "linear-gradient(155deg,#3a1030,#ffc163 140%)", accName: "R. Bello", accNum: "7729384012", accType: "PalmPay", phone: "07056677889", outOfStock: false, ad: null },
      { id: 4, title: "Quiet Capital", author: "T. Adeyemi", price: 7800, grad: "linear-gradient(155deg,#12203f,#4ff0e0 130%)", accName: "T. Adeyemi", accNum: "8843920156", accType: "Opay", phone: "09022334455", outOfStock: false, ad: null },
      { id: 5, title: "Signal and Silence", author: "Nadia Ferro", price: 3900, grad: "linear-gradient(155deg,#241238,#ff6c9c 130%)", accName: "Nadia Ferro", accNum: "0221394857", accType: "Kuda", phone: "08031234567", outOfStock: false, ad: { desc: "Signal and Silence: book two of the Horizon series, out now.", rate: 2500, confirmed: true } },
      { id: 6, title: "Building with Bits", author: "K. Umeh", price: 5600, grad: "linear-gradient(155deg,#0f2a24,#8c7cff 130%)", accName: "K. Umeh", accNum: "5567788990", accType: "Opay", phone: "08155566778", outOfStock: false, ad: null }
    ],
    orders: [],
    complaints: [],
    subscription: { history: [], lastPaid: null },
    nextBookId: 7
  };
  saveDB(db);
  return db;
}

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return seedDB();
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) { return seedDB(); }
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function genTracking() { return 'CDX-' + Math.floor(10000 + Math.random() * 89999); }
function genScratch() { return 'SC-' + Math.floor(1000 + Math.random() * 8999) + '-' + Math.floor(1000 + Math.random() * 8999); }
function genRef() { return 'SUB-' + Math.floor(100000 + Math.random() * 899999); }

app.get('/api/state', (req, res) => {
  const db = loadDB();
  res.json({ books: db.books, orders: db.orders, subscription: db.subscription });
});

app.post('/api/books', (req, res) => {
  const db = loadDB();
  const b = req.body;
  if (!b.title || !b.author || !b.price || !b.accName || !b.accNum || !b.accType || !b.phone) {
    return res.status(400).json({ error: 'missing required fields' });
  }
  const grads = ["linear-gradient(155deg,#2a1f5e,#4ff0e0 130%)", "linear-gradient(155deg,#0e3a3a,#8c7cff 130%)", "linear-gradient(155deg,#3a1030,#ffc163 140%)", "linear-gradient(155deg,#241238,#ff6c9c 130%)"];
  const book = {
    id: db.nextBookId++, title: b.title, author: b.author, price: Number(b.price),
    grad: grads[Math.floor(Math.random() * grads.length)],
    accName: b.accName, accNum: b.accNum, accType: b.accType, phone: b.phone,
    outOfStock: false, ad: null
  };
  db.books.unshift(book);
  saveDB(db);
  res.json(book);
});

app.post('/api/books/:id/stock', (req, res) => {
  const db = loadDB();
  const book = db.books.find(x => x.id === Number(req.params.id));
  if (!book) return res.status(404).json({ error: 'not found' });
  book.outOfStock = !book.outOfStock;
  saveDB(db);
  res.json(book);
});

app.post('/api/books/:id/ad', (req, res) => {
  const db = loadDB();
  const book = db.books.find(x => x.id === Number(req.params.id));
  if (!book) return res.status(404).json({ error: 'not found' });
  let rate = Number(req.body.rate) || 0;
  if (rate > 7000) rate = 7000;
  book.ad = { desc: req.body.desc, rate: rate, confirmed: false };
  saveDB(db);
  res.json(book);
});

app.post('/api/books/:id/ad/confirm', (req, res) => {
  const db = loadDB();
  const book = db.books.find(x => x.id === Number(req.params.id));
  if (!book || !book.ad) return res.status(404).json({ error: 'not found' });
  book.ad.confirmed = true;
  saveDB(db);
  res.json(book);
});

app.post('/api/orders', (req, res) => {
  const db = loadDB();
  const book = db.books.find(x => x.id === Number(req.body.bookId));
  if (!book) return res.status(404).json({ error: 'book not found' });
  if (book.outOfStock) return res.status(400).json({ error: 'out of stock' });
  const order = { tracking: genTracking(), code: genScratch(), title: book.title, author: book.author, price: book.price, phone: book.phone, dispatched: false };
  db.orders.push(order);
  saveDB(db);
  res.json(order);
});

app.post('/api/orders/external', (req, res) => {
  const db = loadDB();
  const order = { tracking: genTracking(), code: genScratch(), title: req.body.title, price: Number(req.body.price) || 0, buyer: req.body.buyer, external: true, platform: req.body.platform, dispatched: false };
  db.orders.push(order);
  saveDB(db);
  res.json(order);
});

app.get('/api/orders/:tracking', (req, res) => {
  const db = loadDB();
  const order = db.orders.find(o => o.tracking === req.params.tracking.toUpperCase());
  if (!order) return res.status(404).json({ error: 'not found' });
  res.json(order);
});

app.post('/api/orders/:tracking/dispatch', (req, res) => {
  const db = loadDB();
  const order = db.orders.find(o => o.tracking === req.params.tracking);
  if (!order) return res.status(404).json({ error: 'not found' });
  order.dispatched = true;
  saveDB(db);
  res.json(order);
});

app.post('/api/complaints', (req, res) => {
  const db = loadDB();
  db.complaints.push({ tracking: req.body.tracking, message: req.body.message });
  saveDB(db);
  res.json({ ok: true });
});

app.get('/api/subscription', (req, res) => {
  const db = loadDB();
  res.json(db.subscription);
});

app.post('/api/subscription/pay', (req, res) => {
  const db = loadDB();
  const ref = genRef();
  const now = new Date();
  db.subscription.history.unshift({ reference: ref, date: now.toDateString() });
  db.subscription.lastPaid = now.toISOString();
  saveDB(db);
  res.json(db.subscription);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Codex server running on port ' + PORT));
