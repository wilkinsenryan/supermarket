// =============================================
//  FRESHMART – script.js
// =============================================

// ===== CONFIG CHATBOT (Langflow API) =====
const API_URL   = 'http://localhost:7860/api/v1/run/88cfda7b-9c76-435d-878b-748509f7dd8b';
const API_KEY   = 'sk-0tagg3oaeaMCZkamiBfGMx_ivTxb4CpNg6kw8L-c25U';

// =============================================
//  FRESHMART AI PRODUCT ASSISTANT ENGINE
// =============================================

// ===== EKSTRAK DATA PRODUK DARI DOM =====
// Membaca langsung dari kartu produk di halaman — satu sumber kebenaran
function extractProductsFromDOM() {
  const cards = document.querySelectorAll('.produk-card');
  const products = [];

  cards.forEach((card, idx) => {
    const name     = card.querySelector('.produk-info h4')?.textContent.trim() || '';
    const category = card.querySelector('.kat-label')?.textContent.trim() || '';
    const imgEl    = card.querySelector('img');
    const imgSrc   = imgEl?.src || '';
    const imgAlt   = imgEl?.alt || '';

    // Ambil harga utama (hapus "Rp" dan titik ribuan → angka)
    const hargaEl  = card.querySelector('.harga');
    const hargaStr = hargaEl?.textContent.replace(/[^0-9]/g, '') || '0';
    const price    = parseInt(hargaStr, 10);

    // Harga coret (harga asal sebelum diskon)
    const hargaCoretEl  = card.querySelector('.harga-coret');
    const originalPrice = hargaCoretEl
      ? parseInt(hargaCoretEl.textContent.replace(/[^0-9]/g, ''), 10)
      : null;

    // Badge (Baru / Sale / Hot)
    const badge = card.querySelector('.badge-new, .badge-sale')?.textContent.trim() || '';

    // Rating
    const ratingEl = card.querySelector('.rating');
    const ratingText = ratingEl?.textContent.trim() || '';
    const reviewMatch = ratingText.match(/\((\d+)\)/);
    const reviewCount = reviewMatch ? parseInt(reviewMatch[1], 10) : 0;
    const starCount   = (ratingText.match(/⭐/g) || []).length;

    if (name) {
      products.push({ id: idx + 1, name, category, price, originalPrice, badge, starCount, reviewCount, imgSrc, imgAlt });
    }
  });

  return products;
}

// Cache produk — diisi setelah DOM siap
let PRODUCTS = [];

// ===== FORMAT HARGA =====
function formatRupiah(num) {
  return 'Rp ' + num.toLocaleString('id-ID');
}

// ===== RENDER KARTU PRODUK (TEKS) UNTUK CHATBOT =====
function renderProductCard(p) {
  const diskon = p.originalPrice
    ? ` ~~${formatRupiah(p.originalPrice)}~~`
    : '';
  const badge  = p.badge ? ` [${p.badge}]` : '';
  const stars  = '⭐'.repeat(p.starCount);
  return `📦 *${p.name}*${badge}\n   Kategori: ${p.category}\n   Harga: ${formatRupiah(p.price)}${diskon}\n   ${stars} (${p.reviewCount} ulasan)`;
}

// ===== PARSER HARGA DARI PERTANYAAN =====
// Contoh: "di bawah 20000", "kurang dari Rp 50.000", "di atas 30rb"
function parseHargaFilter(text) {
  const t = text.toLowerCase().replace(/[.,]/g, '').replace(/rp\s*/g, '').replace(/\s+/g, ' ');

  // Cari angka (termasuk satuan "rb" / "ribu" / "jt" / "juta")
  function toNumber(str) {
    if (!str) return null;
    let n = parseFloat(str.replace(/\s/g, ''));
    if (isNaN(n)) return null;
    // satuan sudah dihapus sebelumnya, tapi tangkap rb/ribu/jt/juta
    if (/rb|ribu/.test(text.toLowerCase())) n *= 1000;
    if (/jt|juta/.test(text.toLowerCase())) n *= 1_000_000;
    return n;
  }

  // Pola: "di bawah X", "kurang dari X", "di bawah X rb"
  let m = t.match(/(?:di bawah|kurang dari|lebih murah dari|max|maksimal|harga\s+\d)\s*(\d[\d\s]*)/);
  if (m) return { type: 'max', value: toNumber(m[1]) };

  // Pola: "di atas X", "lebih dari X", "minimal X"
  m = t.match(/(?:di atas|lebih dari|lebih mahal dari|min|minimal)\s*(\d[\d\s]*)/);
  if (m) return { type: 'min', value: toNumber(m[1]) };

  // Pola: "antara X dan Y"
  m = t.match(/antara\s*(\d[\d\s]*)\s*(?:dan|sampai|hingga|s\/d|-)\s*(\d[\d\s]*)/);
  if (m) return { type: 'range', min: toNumber(m[1]), max: toNumber(m[2]) };

  // Pola: "harga X" (tepat / sekitar)
  m = t.match(/(?:harga|seharga)\s*(\d[\d\s]*)/);
  if (m) {
    const v = toNumber(m[1]);
    // toleransi ±20%
    return { type: 'range', min: v * 0.8, max: v * 1.2 };
  }

  return null;
}

// ===== PARSER KATEGORI DARI PERTANYAAN =====
function parseCategoryFromText(text) {
  const t = text.toLowerCase();
  const categoryMap = {
    'sayur'    : 'Sayuran',
    'sayuran'  : 'Sayuran',
    'buah'     : 'Buah',
    'fruit'    : 'Buah',
    'daging'   : 'Daging',
    'meat'     : 'Daging',
    'seafood'  : 'Seafood',
    'ikan'     : 'Seafood',
    'udang'    : 'Seafood',
    'susu'     : 'Susu',
    'dairy'    : 'Susu',
    'roti'     : 'Roti',
    'kue'      : 'Roti',
    'minuman'  : 'Minuman',
    'minum'    : 'Minuman',
    'jus'      : 'Minuman',
    'drink'    : 'Minuman',
    'perawatan': 'Perawatan',
    'paket'    : 'Paket',
  };

  for (const [keyword, cat] of Object.entries(categoryMap)) {
    if (t.includes(keyword)) return cat;
  }
  return null;
}

// ===== INTENT CLASSIFIER =====
function classifyIntent(text) {
  const t = text.toLowerCase();

  const listAllPatterns = [
    'semua produk', 'seluruh produk', 'daftar produk', 'ada produk apa',
    'produk apa saja', 'apa saja produk', 'tampilkan produk', 'lihat katalog',
    'katalog produk', 'show produk', 'produk tersedia', 'list produk',
    'menu produk', 'ada apa saja', 'mau lihat', 'mau melihat katalog',
  ];
  if (listAllPatterns.some(p => t.includes(p))) return 'LIST_ALL';

  const hargaFilter = parseHargaFilter(text);
  if (hargaFilter) return 'FILTER_HARGA';

  const priceSortPatterns = [
    'paling murah', 'termurah', 'harga murah', 'paling mahal', 'termahal',
    'harga mahal', 'harga terjangkau', 'urutkan harga',
  ];
  if (priceSortPatterns.some(p => t.includes(p))) return 'SORT_HARGA';

  const catKeywords = [
    'sayur', 'buah', 'daging', 'seafood', 'ikan', 'udang',
    'susu', 'roti', 'kue', 'minuman', 'minum', 'jus', 'perawatan', 'paket',
  ];
  const catPatterns = ['kategori', 'tampilkan', 'cari', 'ada ', 'apa saja', 'produk '];
  const hasCatKeyword = catKeywords.some(k => t.includes(k));
  const hasCatPattern = catPatterns.some(p => t.includes(p));
  if (hasCatKeyword && (hasCatPattern || hasCatKeyword)) return 'FILTER_KATEGORI';

  // Pencarian nama produk spesifik
  const searchPatterns = ['cari', 'cek', 'ada ', 'apakah ada', 'stok', 'info produk'];
  if (searchPatterns.some(p => t.includes(p))) return 'SEARCH_PRODUK';

  return null; // bukan pertanyaan produk → teruskan ke API
}

// ===== FRESHMART PRODUCT AI HANDLER =====
function handleProductQuery(text) {
  if (!PRODUCTS.length) {
    return 'Maaf, data produk belum tersedia saat ini. Silakan refresh halaman terlebih dahulu. 🔄';
  }

  const intent = classifyIntent(text);

  // ----- LIST SEMUA PRODUK -----
  if (intent === 'LIST_ALL') {
    const lines = PRODUCTS.map(p => renderProductCard(p)).join('\n\n');
    return `Berikut ${PRODUCTS.length} produk yang tersedia di FreshMart:\n\n${lines}\n\n🛒 Ketik nama produk untuk info lebih lanjut, atau tanya berdasarkan kategori & harga!`;
  }

  // ----- FILTER BERDASARKAN HARGA -----
  if (intent === 'FILTER_HARGA') {
    const filter = parseHargaFilter(text);
    let hasil = PRODUCTS;

    if (filter.type === 'max') {
      hasil = PRODUCTS.filter(p => p.price <= filter.value);
      if (!hasil.length) {
        return `Tidak ada produk dengan harga di bawah ${formatRupiah(filter.value)}. Produk termurah kami adalah *${PRODUCTS.reduce((a,b) => a.price < b.price ? a : b).name}* seharga ${formatRupiah(Math.min(...PRODUCTS.map(p=>p.price)))}. 😊`;
      }
      const lines = hasil.map(p => renderProductCard(p)).join('\n\n');
      return `Produk dengan harga di bawah ${formatRupiah(filter.value)} (${hasil.length} produk):\n\n${lines}`;
    }

    if (filter.type === 'min') {
      hasil = PRODUCTS.filter(p => p.price >= filter.value);
      if (!hasil.length) {
        return `Tidak ada produk dengan harga di atas ${formatRupiah(filter.value)}.`;
      }
      const lines = hasil.map(p => renderProductCard(p)).join('\n\n');
      return `Produk dengan harga di atas ${formatRupiah(filter.value)} (${hasil.length} produk):\n\n${lines}`;
    }

    if (filter.type === 'range') {
      hasil = PRODUCTS.filter(p => p.price >= filter.min && p.price <= filter.max);
      if (!hasil.length) {
        return `Tidak ada produk dalam rentang harga ${formatRupiah(filter.min)} – ${formatRupiah(filter.max)}.`;
      }
      const lines = hasil.map(p => renderProductCard(p)).join('\n\n');
      return `Produk dalam rentang harga ${formatRupiah(filter.min)} – ${formatRupiah(filter.max)} (${hasil.length} produk):\n\n${lines}`;
    }
  }

  // ----- SORT BERDASARKAN HARGA -----
  if (intent === 'SORT_HARGA') {
    const t = text.toLowerCase();
    const isCheapest = t.includes('murah') || t.includes('terjangkau');
    const sorted = [...PRODUCTS].sort((a, b) => isCheapest ? a.price - b.price : b.price - a.price);
    const label  = isCheapest ? 'termurah' : 'termahal';
    const lines  = sorted.map((p, i) => `${i+1}. ${renderProductCard(p)}`).join('\n\n');
    return `Produk dari yang ${label}:\n\n${lines}`;
  }

  // ----- FILTER BERDASARKAN KATEGORI -----
  if (intent === 'FILTER_KATEGORI') {
    const cat = parseCategoryFromText(text);
    if (!cat) {
      // Tampilkan semua kategori yang ada
      const cats = [...new Set(PRODUCTS.map(p => p.category))];
      return `Kategori produk yang tersedia:\n${cats.map(c => '• ' + c).join('\n')}\n\nKetik nama kategori untuk melihat produknya!`;
    }

    const hasil = PRODUCTS.filter(p =>
      p.category.toLowerCase().includes(cat.toLowerCase()) ||
      cat.toLowerCase().includes(p.category.toLowerCase())
    );

    if (!hasil.length) {
      const cats = [...new Set(PRODUCTS.map(p => p.category))];
      return `Produk kategori *${cat}* belum tersedia saat ini.\n\nKategori yang ada: ${cats.join(', ')}. Mau lihat salah satunya? 😊`;
    }

    const lines = hasil.map(p => renderProductCard(p)).join('\n\n');
    return `Produk kategori *${cat}* (${hasil.length} produk):\n\n${lines}\n\n🛒 Mau tambahkan ke keranjang? Gulir ke halaman produk!`;
  }

  // ----- PENCARIAN NAMA PRODUK -----
  if (intent === 'SEARCH_PRODUK') {
    // Coba cocokkan kata kunci dari teks ke nama / kategori produk
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const hasil = PRODUCTS.filter(p => {
      const haystack = `${p.name} ${p.category}`.toLowerCase();
      return words.some(w => haystack.includes(w));
    });

    if (!hasil.length) {
      return `Produk yang kamu cari tidak ditemukan. Ketik "tampilkan semua produk" untuk melihat seluruh katalog. 🔍`;
    }

    const lines = hasil.map(p => renderProductCard(p)).join('\n\n');
    return `Hasil pencarian (${hasil.length} produk):\n\n${lines}`;
  }

  return null; // tidak dikenali sebagai query produk
}

// UUID generator (fallback jika browser tidak support crypto.randomUUID)
function generateUUID() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Session ID tetap selama satu sesi browser
const SESSION_ID = generateUUID();

// ===== NAVBAR SCROLL =====
window.addEventListener('scroll', () => {
  const navbar = document.querySelector('.navbar');
  navbar.style.boxShadow = window.scrollY > 20
    ? '0 4px 20px rgba(0,0,0,.12)'
    : '0 2px 16px rgba(0,0,0,.08)';
});

// ===== HAMBURGER MENU =====
document.getElementById('hamburger').addEventListener('click', () => {
  document.querySelector('.nav-links').classList.toggle('open');
});

// Tutup menu saat link diklik
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelector('.nav-links').classList.remove('open');
  });
});

// ===== KERANJANG BELANJA =====
let cartCount = 0;

function addToCart(btn) {
  cartCount++;
  document.querySelector('.cart-count').textContent = cartCount;

  // Animasi tombol
  btn.textContent = '✓ Ditambahkan!';
  btn.style.background = '#388e3c';
  btn.disabled = true;

  setTimeout(() => {
    btn.innerHTML = '<i class="fas fa-plus"></i> Tambah';
    btn.style.background = '';
    btn.disabled = false;
  }, 1500);

  showToast('Produk berhasil ditambahkan ke keranjang 🛒');
}

// ===== TOAST NOTIFICATION =====
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

// ===== CHATBOT TOGGLE =====
let chatOpen = false;

function toggleChat() {
  chatOpen = !chatOpen;
  const widget  = document.getElementById('chatWidget');
  const icon    = document.getElementById('chatIcon');
  const notif   = document.querySelector('.chat-notif');

  widget.classList.toggle('open', chatOpen);
  icon.className = chatOpen ? 'fas fa-times' : 'fas fa-comment-dots';
  if (notif) notif.classList.add('hidden');
}

document.getElementById('chatClose').addEventListener('click', () => {
  chatOpen = true;
  toggleChat();
});

// ===== KIRIM PESAN =====
async function sendMessage() {
  const input   = document.getElementById('chatInput');
  const btnSend = document.getElementById('btnSend');
  const text    = input.value.trim();
  if (!text) return;

  appendMessage('user', text);
  input.value = '';
  btnSend.disabled = true;

  const typingId = showTyping();

  try {
    // ── 1. Coba jawab dengan Product AI Engine lokal terlebih dahulu ──
    const localReply = handleProductQuery(text);
    if (localReply !== null) {
      // Tambahkan sedikit delay agar terasa natural
      await new Promise(r => setTimeout(r, 600));
      removeTyping(typingId);
      appendMessage('bot', localReply);
      btnSend.disabled = false;
      input.focus();
      return;
    }

    // ── 2. Fallback ke Langflow API untuk pertanyaan non-produk ──
    const payload = {
      output_type : 'chat',
      input_type  : 'chat',
      input_value : text,
      session_id  : SESSION_ID
    };

    const response = await fetch(API_URL, {
      method  : 'POST',
      headers : {
        'Content-Type': 'application/json',
        'x-api-key'   : API_KEY
      },
      body: JSON.stringify(payload)
    });

    removeTyping(typingId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const reply = extractReply(data);
    appendMessage('bot', reply);

  } catch (err) {
    removeTyping(typingId);
    console.error('Chatbot error:', err);
    appendMessage('bot', 'Maaf, saya sedang mengalami gangguan. Silakan coba lagi atau hubungi kami di cs@freshmart.id 🙏');
  } finally {
    btnSend.disabled = false;
    input.focus();
  }
}

// Quick reply shortcut
function sendQuickReply(text) {
  document.getElementById('chatInput').value = text;
  sendMessage();
}

// Enter key
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ===== HELPER: Extract reply dari respons Langflow =====
function extractReply(data) {
  try {
    // Struktur Langflow: data.outputs[0].outputs[0].results.message.text
    return data.outputs[0].outputs[0].results.message.text
      || data.outputs[0].outputs[0].messages[0].message
      || 'Maaf, saya tidak mendapatkan respons.';
  } catch {
    // Fallback berbagai struktur
    if (data?.result) return data.result;
    if (typeof data === 'string') return data;
    return 'Maaf, respons tidak dikenali.';
  }
}

// ===== HELPER: Render pesan ke chat body =====
function appendMessage(role, text) {
  const body = document.getElementById('chatBody');
  const now  = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const msg = document.createElement('div');
  msg.className = `msg ${role}`;
  msg.innerHTML = `
    <div class="bubble">${escapeHtml(text)}</div>
    <div class="msg-time">${now}</div>
  `;
  body.appendChild(msg);
  scrollToBottom();
}

// ===== HELPER: Typing indicator =====
function showTyping() {
  const body = document.getElementById('chatBody');
  const id   = 'typing-' + Date.now();
  const el   = document.createElement('div');
  el.className = 'msg bot';
  el.id = id;
  el.innerHTML = `<div class="bubble typing-bubble"><span></span><span></span><span></span></div>`;
  body.appendChild(el);
  scrollToBottom();
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollToBottom() {
  const body = document.getElementById('chatBody');
  body.scrollTop = body.scrollHeight;
}

// XSS prevention + render markdown sederhana untuk chatbot
function escapeHtml(str) {
  // 1. Escape karakter berbahaya
  let s = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // 2. Render markdown sederhana
  s = s
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // **bold**
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')      // *bold*
    .replace(/~~(.*?)~~/g, '<s>$1</s>')               // ~~coret~~
    .replace(/\n/g, '<br/>');                          // newline

  return s;
}

// ===== ACTIVE NAV LINK SAAT SCROLL =====
const sections = document.querySelectorAll('section[id], footer[id]');
const navLinks = document.querySelectorAll('.nav-links a');

window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(sec => {
    if (window.scrollY >= sec.offsetTop - 100) current = sec.id;
  });
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === '#' + current) link.classList.add('active');
  });
});

// ===== SCROLL REVEAL ANIMASI SEDERHANA =====
const revealEls = document.querySelectorAll('.produk-card, .fitur-card, .kat-card, .promo-card');

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.animation = 'fadeInUp .5s ease forwards';
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

revealEls.forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  observer.observe(el);
});

// Injeksi keyframe animasi
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeInUp {
    to { opacity: 1; transform: translateY(0); }
  }
`;
document.head.appendChild(style);

// =============================================
//  INISIALISASI PRODUCT AI ENGINE
// =============================================

// Jalankan setelah seluruh DOM selesai dirender
window.addEventListener('DOMContentLoaded', () => {
  PRODUCTS = extractProductsFromDOM();
  console.log(`[FreshMart AI] ${PRODUCTS.length} produk berhasil dimuat dari halaman.`);

  // Tambah quick reply produk di welcome message chatbot
  const qr = document.querySelector('.quick-replies');
  if (qr) {
    const productButtons = [
      { label: '🛍️ Semua Produk', msg: 'Tampilkan semua produk' },
      { label: '💰 Produk Murah', msg: 'Tampilkan produk paling murah' },
      { label: '🥦 Sayuran',      msg: 'Ada produk sayuran apa saja?' },
      { label: '🍎 Buah',         msg: 'Tampilkan semua buah-buahan' },
      { label: '🥛 Susu',         msg: 'Ada produk susu apa saja?' },
      { label: '🧃 Minuman',      msg: 'Apa saja produk minuman?' },
    ];

    productButtons.forEach(({ label, msg }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.onclick = () => sendQuickReply(msg);
      qr.appendChild(btn);
    });
  }
});
