// =============================================
//  FRESHMART – script.js
// =============================================

// ===== CONFIG CHATBOT (Langflow API) =====
const API_URL   = 'http://localhost:7860/api/v1/run/88cfda7b-9c76-435d-878b-748509f7dd8b';
const API_KEY   = 'sk-0tagg3oaeaMCZkamiBfGMx_ivTxb4CpNg6kw8L-c25U';

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

    // Ambil teks balasan dari struktur Langflow
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

// XSS prevention
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br/>');
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
