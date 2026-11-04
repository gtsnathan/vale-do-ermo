// Servidor da Fazenda dos Sonhos: cria cobranças, confirma pagamentos e diz ao jogo o que entregar.
// Regra central: só o Mercado Pago confirma pagamento. O aviso (webhook) serve apenas para o servidor ir perguntar.

// Preços valem aqui. O jogo apenas os exibe, então alterar o jogo no navegador não muda o valor cobrado.
const PACKS = {
  p20: { gems: 20, amount: 4.9, price: 'R$ 4,90' },
  p60: { gems: 60, amount: 9.9, price: 'R$ 9,90' },
  p150: { gems: 150, amount: 19.9, price: 'R$ 19,90' },
};
const PID = /^[a-f0-9]{32}$/;
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const mpBase = (env) => env.MP_API_BASE || 'https://api.mercadopago.com';

async function mp(env, path, init = {}) {
  const r = await fetch(mpBase(env) + path, { ...init, headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`Mercado Pago respondeu ${r.status} em ${path}`);
  return r.json();
}

async function checkout(req, env, origin) {
  const { pack, pid } = await req.json().catch(() => ({}));
  const p = Object.hasOwn(PACKS, pack || '') ? PACKS[pack] : null;
  if (!p || !PID.test(pid || '')) return json({ error: 'Pedido inválido.' }, 400);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO orders (id,pid,pack,gems,amount,created_at) VALUES (?,?,?,?,?,?)').bind(id, pid, pack, p.gems, p.amount, Date.now()).run();
  const back = `${origin}/jogar/?compra=${id}`;
  const pref = await mp(env, '/checkout/preferences', {
    method: 'POST',
    headers: { 'x-idempotency-key': id },
    body: JSON.stringify({
      items: [{ id: pack, title: `${p.gems} diamantes - Fazenda dos Sonhos`, quantity: 1, currency_id: 'BRL', unit_price: p.amount }],
      external_reference: id,
      notification_url: `${origin}/api/webhook`,
      back_urls: { success: back, pending: back, failure: back },
      auto_return: 'approved',
    }),
  });
  const useSandbox = env.MP_SANDBOX === '1';
  return json({ order: id, url: useSandbox ? pref.sandbox_init_point || pref.init_point : pref.init_point });
}

// Aplica ao pedido o estado real do pagamento. Pode rodar várias vezes sem creditar em dobro.
async function applyPayment(env, pay) {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(String(pay.external_reference || '')).first();
  if (!order) return;
  if (pay.status === 'approved') {
    const right = pay.currency_id === 'BRL' && Math.abs(Number(pay.transaction_amount) - order.amount) < 0.005;
    if (!right) { console.error('Valor divergente', order.id, pay.id); return; }
    await env.DB.prepare("UPDATE orders SET status='paid',payment_id=?,paid_at=? WHERE id=? AND status='pending'").bind(String(pay.id), Date.now(), order.id).run();
  } else if (pay.status === 'refunded' || pay.status === 'charged_back') {
    await env.DB.prepare("UPDATE orders SET status=? WHERE id=?").bind(pay.status, order.id).run();
  }
}

async function validSignature(req, env, dataId) {
  if (!env.MP_WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries((req.headers.get('x-signature') || '').split(',').map((s) => s.trim().split('=')));
  if (!parts.ts || !parts.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifest = `id:${id};request-id:${req.headers.get('x-request-id') || ''};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.MP_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

async function webhook(req, env, url) {
  const body = await req.json().catch(() => ({}));
  const type = url.searchParams.get('type') || body.type;
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('id') || body?.data?.id;
  if (type !== 'payment' || !dataId) return json({ ignored: true });
  if (!(await validSignature(req, env, String(dataId)))) return json({ error: 'assinatura inválida' }, 401);
  await applyPayment(env, await mp(env, `/v1/payments/${encodeURIComponent(dataId)}`));
  return json({ ok: true });
}

// Rede de segurança: se o aviso se perder, pergunta direto ao Mercado Pago, no máximo a cada 20 segundos por pedido.
async function reconcile(env, pid) {
  const now = Date.now();
  const { results } = await env.DB.prepare("SELECT id FROM orders WHERE pid=? AND status='pending' AND created_at>? AND (checked_at IS NULL OR checked_at<?) ORDER BY created_at DESC LIMIT 3").bind(pid, now - 864e5, now - 2e4).all();
  for (const o of results) {
    await env.DB.prepare('UPDATE orders SET checked_at=? WHERE id=?').bind(now, o.id).run();
    try {
      const found = await mp(env, `/v1/payments/search?external_reference=${o.id}`);
      for (const pay of found.results || []) await applyPayment(env, pay);
    } catch (e) { console.error(e.message); }
  }
}

async function orders(req, env) {
  const { pid } = await req.json().catch(() => ({}));
  if (!PID.test(pid || '')) return json({ error: 'Jogador inválido.' }, 400);
  await reconcile(env, pid);
  const { results } = await env.DB.prepare("SELECT id,gems FROM orders WHERE pid=? AND status='paid' AND acked_at IS NULL").bind(pid).all();
  return json({ orders: results });
}

// O jogo confirma aqui depois de guardar os diamantes. Se a internet cair antes, o pedido é reenviado, e o jogo ignora o que já recebeu.
async function ack(req, env) {
  const { pid, ids } = await req.json().catch(() => ({}));
  if (!PID.test(pid || '') || !Array.isArray(ids)) return json({ error: 'Pedido inválido.' }, 400);
  for (const id of ids.slice(0, 20)) await env.DB.prepare("UPDATE orders SET acked_at=? WHERE id=? AND pid=? AND status='paid'").bind(Date.now(), String(id), pid).run();
  return json({ ok: true });
}

// ---- Competição semanal: a semana vira na segunda, às 00:00 de Brasília.
const WEEK = 7 * 864e5, BRT = 3 * 36e5, MONDAY = 4 * 864e5;
const weekOf = (t) => Math.floor((t - BRT - MONDAY) / WEEK);
const weekEnd = (w) => (w + 1) * WEEK + BRT + MONDAY;
const RATE = 2, MAX_STEP = 20000; // limite de pontos por segundo, para barrar números absurdos
const PRIZES = [20, 10, 5];
const prizeFor = (r) => PRIZES[r - 1] || (r <= 10 ? 2 : 0);
const BLOCKED = ['porra', 'caralho', 'merda', 'buceta', 'foder', 'puta', 'viado', 'cuzao', 'arrombado', 'nazi', 'hitler', 'admin', 'moderador', 'anthropic'];
function cleanName(raw) {
  const n = String(raw || '').normalize('NFC').replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (n.length < 3) return null;
  const plain = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return BLOCKED.some((b) => plain.includes(b)) ? null : n;
}
async function rankOf(env, week, row) {
  const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM rank_scores WHERE week=? AND (score>? OR (score=? AND updated_at<?))').bind(week, row.score, row.score, row.updated_at).first();
  return c.n + 1;
}
async function rank(req, env) {
  const body = await req.json().catch(() => ({}));
  const { pid } = body, total = Number(body.total), lvl = Math.min(999, Math.max(1, Number(body.lvl) || 1));
  if (!PID.test(pid || '') || !Number.isSafeInteger(total) || total < 0) return json({ error: 'Dados inválidos.' }, 400);
  const name = cleanName(body.name), now = Date.now(), week = weekOf(now);
  if (!name) return json({ error: 'Escolha outro apelido, com 3 a 16 letras ou números.' }, 400);
  const pl = await env.DB.prepare('SELECT * FROM rank_players WHERE pid=?').bind(pid).first();
  let add = 0;
  if (!pl) {
    await env.DB.prepare('INSERT INTO rank_players (pid,name,last_total,updated_at) VALUES (?,?,?,?)').bind(pid, name, total, now).run();
  } else {
    const elapsed = now - pl.updated_at;
    if (elapsed >= 15000) {
      add = Math.min(Math.max(0, total - pl.last_total), Math.min(elapsed / 1000 * RATE, MAX_STEP)) | 0;
      await env.DB.prepare('UPDATE rank_players SET name=?,last_total=?,updated_at=? WHERE pid=?').bind(name, total, now, pid).run();
    } else if (pl.name !== name) await env.DB.prepare('UPDATE rank_players SET name=? WHERE pid=?').bind(name, pid).run();
  }
  await env.DB.prepare('INSERT INTO rank_scores (week,pid,score,lvl,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(week,pid) DO UPDATE SET score=score+excluded.score,lvl=excluded.lvl,updated_at=CASE WHEN excluded.score>0 THEN excluded.updated_at ELSE updated_at END').bind(week, pid, add, lvl, now).run();
  const { results } = await env.DB.prepare('SELECT s.pid,p.name,s.score,s.lvl FROM rank_scores s JOIN rank_players p ON p.pid=s.pid WHERE s.week=? ORDER BY s.score DESC,s.updated_at ASC LIMIT 20').bind(week).all();
  const mine = await env.DB.prepare('SELECT * FROM rank_scores WHERE week=? AND pid=?').bind(week, pid).first();
  const players = await env.DB.prepare('SELECT COUNT(*) AS n FROM rank_scores WHERE week=?').bind(week).first();
  let prize = null;
  const old = await env.DB.prepare('SELECT * FROM rank_scores WHERE week<? AND pid=? AND acked=0 AND score>0 ORDER BY week DESC LIMIT 1').bind(week, pid).first();
  if (old) {
    const r = await rankOf(env, old.week, old), gems = prizeFor(r);
    if (gems) prize = { week: old.week, rank: r, gems };
    else await env.DB.prepare('UPDATE rank_scores SET acked=1 WHERE week=? AND pid=?').bind(old.week, pid).run();
  }
  return json({ week, endsAt: weekEnd(week), players: players.n, me: { rank: await rankOf(env, week, mine), score: mine.score }, prize,
    top: results.map((x, i) => ({ r: i + 1, name: x.name, score: x.score, lvl: x.lvl, me: x.pid === pid })) });
}
async function rankAck(req, env) {
  const { pid, week } = await req.json().catch(() => ({}));
  if (!PID.test(pid || '') || !Number.isInteger(week)) return json({ error: 'Dados inválidos.' }, 400);
  await env.DB.prepare('UPDATE rank_scores SET acked=1 WHERE week=? AND pid=?').bind(week, pid).run();
  return json({ ok: true });
}

// ---- Contas: e-mail, senha e fazenda salva no servidor.
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const randHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async (t) => hex(await crypto.subtle.digest('SHA-256', enc.encode(t)));
async function hashPass(pass, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256));
}
function same(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const cleanEmail = (e) => String(e || '').trim().toLowerCase();
const COOKIE = 'fds_sess', DAYS30 = 30 * 864e5;
const recoveryCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(12)); const s = [...r].map((x) => A[x % A.length]).join(''); return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`; };
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function cookieHeader(url, token, maxAge) { return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${url.protocol === 'https:' ? '; Secure' : ''}`; }
function withCookie(res, c) { res.headers.append('set-cookie', c); return res; }
async function newSession(env, url, userId, data) {
  const token = randHex(32), now = Date.now();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now).run();
  await env.DB.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await sha(token), userId, now + DAYS30).run();
  return withCookie(json(data), cookieHeader(url, token, 2592000));
}
async function currentUser(req, env) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  if (!m) return null;
  const tok = await sha(m[1]);
  const u = await env.DB.prepare('SELECT u.id,u.email,u.save_v,u.pass_hash,u.salt FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(tok, Date.now()).first();
  return u ? { ...u, tok } : null;
}
async function register(req, env, url) {
  const b = await req.json().catch(() => ({})), email = cleanEmail(b.email), pass = String(b.password || '');
  if (!EMAIL.test(email)) return json({ error: 'Digite um e-mail válido.' }, 400);
  if (pass.length < 8 || pass.length > 200) return json({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400);
  if (!b.terms) return json({ error: 'Aceite os termos para criar a conta.' }, 400);
  if (await env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first()) return json({ error: 'Este e-mail já tem conta. Tente entrar.' }, 409);
  const id = crypto.randomUUID(), salt = randHex(16), code = recoveryCode();
  await env.DB.prepare('INSERT INTO users (id,email,pass_hash,salt,recovery_hash,created_at) VALUES (?,?,?,?,?,?)').bind(id, email, await hashPass(pass, salt), salt, await sha(normCode(code)), Date.now()).run();
  return newSession(env, url, id, { email, recovery: code });
}
async function login(req, env, url) {
  const b = await req.json().catch(() => ({})), email = cleanEmail(b.email), now = Date.now();
  const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  if (u && u.fail_until > now) return json({ error: 'Muitas tentativas. Espere 15 minutos e tente de novo.' }, 429);
  const salt = u ? u.salt : 'sem-conta', h = await hashPass(String(b.password || '').slice(0, 200), salt);
  if (!u || !same(h, u.pass_hash)) {
    if (u) { const n = u.fail_count + 1; await env.DB.prepare('UPDATE users SET fail_count=?,fail_until=? WHERE id=?').bind(n >= 5 ? 0 : n, n >= 5 ? now + 9e5 : 0, u.id).run(); }
    return json({ error: 'E-mail ou senha incorretos.' }, 401);
  }
  await env.DB.prepare('UPDATE users SET fail_count=0,fail_until=0 WHERE id=?').bind(u.id).run();
  return newSession(env, url, u.id, { email });
}
async function resetPass(req, env, url) {
  const b = await req.json().catch(() => ({})), email = cleanEmail(b.email), pass = String(b.password || ''), now = Date.now();
  if (pass.length < 8 || pass.length > 200) return json({ error: 'A nova senha precisa ter pelo menos 8 caracteres.' }, 400);
  const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  if (u && u.fail_until > now) return json({ error: 'Muitas tentativas. Espere 15 minutos e tente de novo.' }, 429);
  if (!u || !same(await sha(normCode(b.code)), u.recovery_hash)) {
    if (u) { const n = u.fail_count + 1; await env.DB.prepare('UPDATE users SET fail_count=?,fail_until=? WHERE id=?').bind(n >= 5 ? 0 : n, n >= 5 ? now + 9e5 : 0, u.id).run(); }
    return json({ error: 'E-mail ou código de recuperação incorretos.' }, 401);
  }
  const salt = randHex(16), code = recoveryCode();
  await env.DB.prepare('UPDATE users SET pass_hash=?,salt=?,recovery_hash=?,fail_count=0,fail_until=0 WHERE id=?').bind(await hashPass(pass, salt), salt, await sha(normCode(code)), u.id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id).run();
  return newSession(env, url, u.id, { email, recovery: code });
}
async function logout(req, env, url) {
  const u = await currentUser(req, env);
  if (u) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(u.tok).run();
  return withCookie(json({ ok: true }), cookieHeader(url, '', 0));
}
async function deleteAccount(req, env, url) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'Entre na conta primeiro.' }, 401);
  const b = await req.json().catch(() => ({}));
  if (!same(await hashPass(String(b.password || '').slice(0, 200), u.salt), u.pass_hash)) return json({ error: 'Senha incorreta.' }, 401);
  await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id).run();
  await env.DB.prepare('DELETE FROM users WHERE id=?').bind(u.id).run();
  return withCookie(json({ ok: true }), cookieHeader(url, '', 0));
}
const MAX_SAVE = 400000;
async function getSave(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'Entre na conta primeiro.' }, 401);
  const r = await env.DB.prepare('SELECT save,save_v FROM users WHERE id=?').bind(u.id).first();
  return json({ save: r.save ? JSON.parse(r.save) : null, version: r.save_v });
}
async function putSave(req, env) {
  const u = await currentUser(req, env);
  if (!u) return json({ error: 'Entre na conta primeiro.' }, 401);
  const text = await req.text();
  if (text.length > MAX_SAVE) return json({ error: 'Fazenda grande demais para salvar.' }, 413);
  let b; try { b = JSON.parse(text); } catch { return json({ error: 'Dados inválidos.' }, 400); }
  const s = b.save;
  if (!s || typeof s !== 'object' || !Array.isArray(s.builds) || !Array.isArray(s.ground) || !Number.isInteger(b.version)) return json({ error: 'Dados inválidos.' }, 400);
  const res = await env.DB.prepare('UPDATE users SET save=?,save_v=save_v+1,save_at=? WHERE id=? AND save_v=?').bind(JSON.stringify(s), Date.now(), u.id, b.version).run();
  if (!res.meta.changes) { const r = await env.DB.prepare('SELECT save_v FROM users WHERE id=?').bind(u.id).first(); return json({ error: 'Conflito', version: r.save_v }, 409); }
  return json({ version: b.version + 1 });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), r = `${req.method} ${url.pathname}`;
    try {
      // Bloqueia envios feitos por outros sites com a sessão do jogador.
      const sensitive = url.pathname.startsWith('/api/auth/') || url.pathname === '/api/save';
      const origin = req.headers.get('origin');
      if (sensitive && req.method !== 'GET' && origin && origin !== url.origin) return json({ error: 'Origem não permitida.' }, 403);
      if (r === 'GET /api/auth/me') { const u = await currentUser(req, env); return json({ user: u ? { email: u.email } : null }); }
      if (r === 'POST /api/auth/register') return await register(req, env, url);
      if (r === 'POST /api/auth/login') return await login(req, env, url);
      if (r === 'POST /api/auth/reset') return await resetPass(req, env, url);
      if (r === 'POST /api/auth/logout') return await logout(req, env, url);
      if (r === 'POST /api/auth/delete') return await deleteAccount(req, env, url);
      if (r === 'GET /api/save') return await getSave(req, env);
      if (r === 'PUT /api/save') return await putSave(req, env);
      if (r === 'GET /api/config') {
        const ready = Boolean(env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET);
        return json({ ok: ready, rank: true, auth: true, packs: Object.entries(PACKS).map(([id, p]) => ({ id, gems: p.gems, price: p.price })) });
      }
      if (r === 'POST /api/checkout') return await checkout(req, env, url.origin);
      if (r === 'POST /api/webhook') return await webhook(req, env, url);
      if (r === 'POST /api/orders') return await orders(req, env);
      if (r === 'POST /api/ack') return await ack(req, env);
      if (r === 'POST /api/rank') return await rank(req, env);
      if (r === 'POST /api/rank/ack') return await rankAck(req, env);
      return json({ error: 'Não encontrado.' }, 404);
    } catch (e) {
      console.error(e.message);
      return json({ error: 'Falha temporária. Tente de novo.' }, 502);
    }
  },
};
