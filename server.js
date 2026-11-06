require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cron = require('node-cron');
const { DatabaseSync } = require('node:sqlite'); // built into Node 22.13+, no compiler needed
const AfricasTalking = require('africastalking');
const { LGAS, CROPS, MARKETS, SEED_PRICES, ADVISORIES, seasonOf } = require('./data');

const PORT = process.env.PORT || 3000;
const BUILD = 'voice+data, menu has 7 options';
const APP_NAME = process.env.APP_NAME || 'AgriAlert';
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-me';
const RAIN_THRESHOLD = Number(process.env.RAIN_THRESHOLD || 60);

/* ---------- Database ---------- */
const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, 'agri.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS farmers(phone TEXT PRIMARY KEY, lga TEXT NOT NULL, crop TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'en', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS prices(id INTEGER PRIMARY KEY AUTOINCREMENT, market TEXT, crop TEXT, price INTEGER, unit TEXT, date TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT, text TEXT, status TEXT DEFAULT 'open', answer TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS api_log(id INTEGER PRIMARY KEY AUTOINCREMENT, api TEXT, action TEXT, ok INTEGER, detail TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT, market TEXT, crop TEXT, price INTEGER, status TEXT, reward_status TEXT DEFAULT 'none', reward_note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS alert_log(id INTEGER PRIMARY KEY AUTOINCREMENT, lga TEXT, type TEXT, note TEXT, recipients INTEGER, sent_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
if (db.prepare('SELECT COUNT(*) n FROM prices').get().n === 0) {
  const ins = db.prepare('INSERT INTO prices(market,crop,price,unit) VALUES (?,?,?,?)');
  SEED_PRICES.forEach(p => ins.run(p.market, p.crop, p.price, p.unit));
}

/* ---------- API activity log (feeds the dashboard) ---------- */
const logApi = (api, action, ok, detail = '') => {
  try { db.prepare('INSERT INTO api_log(api,action,ok,detail) VALUES (?,?,?,?)').run(api, action, ok ? 1 : 0, String(detail).slice(0, 200)); }
  catch (e) { console.error('logApi failed', e.message); }
};

/* ---------- SMS (dry-run if no API key) ---------- */
const at = process.env.AT_API_KEY
  ? AfricasTalking({ apiKey: process.env.AT_API_KEY, username: process.env.AT_USERNAME || 'sandbox' })
  : null;

async function sendSms(to, message) {
  if (!to.length) return;
  if (!at) { console.log('[SMS dry-run]', to.join(','), '|', message); logApi('sms', 'send (dry-run)', true, `${to.length} recipient(s)`); return; }
  const opts = { to, message };
  if (process.env.AT_SENDER_ID) opts.from = process.env.AT_SENDER_ID;
  try {
    const r = await at.SMS.send(opts);
    console.log('[SMS]', JSON.stringify(r));
    const rec = ((r.SMSMessageData || {}).Recipients) || [];
    const accepted = rec.filter(x => [100, 101, 102].includes(Number(x.statusCode))).length;
    logApi('sms', 'send', accepted > 0, `${accepted}/${to.length} accepted`);
    return r;
  } catch (e) { logApi('sms', 'send', false, e.message); throw e; }
}

/* ---------- Text (English + Hausa DRAFTS - have a native speaker review) ---------- */
const T = {
  en: {
    menu: "1. Update profile\n2. Today's prices\n3. Weather & farm advice\n4. Ask a question\n5. Hausa/English\n6. Report a price, earn airtime\n7. Call me with advice",
    selectLga: 'Select your LGA:', selectCrop: 'Select your main crop:',
    langPick: 'Language / Harshe:\n1. English\n2. Hausa',
    registered: 'Registered. You will get alerts for {lga}.',
    selectMarket: 'Select market:', pricesHeader: '{market} prices:',
    askPrompt: 'Type your question:', thanks: 'Thank you. An expert will reply by SMS.',
    adviceSent: 'Advice sent to your phone by SMS.', rainChance: 'Rain chance (2 days): {p}%',
    langSaved: 'Language saved.', invalid: 'Invalid choice.', error: 'Service error. Please try again.',
    rainAlert: 'Rain likely in {lga} in the next 2 days. If your {crop} is ready, harvest early and cover stored produce.',
    reportCrop: 'Select crop:', reportPrompt: "Enter today's price in N per {unit}:",
    invalidPrice: 'Enter the price as a number, for example 55000.',
    reportAccepted: 'Thank you. Your price is accepted. {currency} {amount} airtime is on its way.',
    reportNoReward: 'Thank you. Your price is saved. No reward is due for this report.',
    reportReview: "Thank you. This price is far from today's range, so an operator will review it.",
    callMe: 'A voice call with your farm advice is on its way.', reportBonus: 'Bonus: {mb} MB data is on its way.', farmersAvg: 'Farmers', reportDuplicate: 'Thank you. You already reported this crop today.',
  },
  ha: {
    menu: "1. Gyara bayanai\n2. Farashin yau\n3. Yanayi da shawarar noma\n4. Yi tambaya\n5. Hausa/English\n6. Kai rahoton farashi\n7. A kira ni",
    selectLga: 'Zabi karamar hukumarka:', selectCrop: 'Zabi babban amfanin gonarka:',
    langPick: 'Language / Harshe:\n1. English\n2. Hausa',
    registered: 'An yi rajista. Za ka samu sakonni game da {lga}.',
    selectMarket: 'Zabi kasuwa:', pricesHeader: 'Farashin {market}:',
    askPrompt: 'Rubuta tambayarka:', thanks: 'Mun gode. Za a amsa maka ta SMS.',
    adviceSent: 'An aika maka shawara ta SMS.', rainChance: 'Yiwuwar ruwan sama (kwana 2): {p}%',
    langSaved: 'An adana harshe.', invalid: 'Zabin bai dace ba.', error: 'Matsala ta faru. A sake gwadawa.',
    rainAlert: 'Ana sa ran ruwan sama a {lga} cikin kwana 2 masu zuwa. Idan {crop} naka ya isa girbi, ka girbe da wuri.',
    reportCrop: 'Zabi amfanin gona:', reportPrompt: 'Rubuta farashin yau a N na {unit}:',
    invalidPrice: 'Rubuta farashin a lamba, misali 55000.',
    reportAccepted: 'Mun gode. An karbi farashin. Za a aika maka airtime na {currency} {amount}.',
    reportNoReward: 'Mun gode. An adana farashin. Babu kyauta a wannan rahoton.',
    reportReview: 'Mun gode. Wannan farashi ya yi nesa da farashin yau, don haka za a duba shi.',
    callMe: 'Ana kiran ka da shawarar noma yanzu.', reportBonus: 'Kyauta: ana aika maka {mb} MB na data.', farmersAvg: 'Manoma', reportDuplicate: 'Mun gode. Ka riga ka kai rahoton wannan amfanin gona yau.',
  },
};
const t = (lang, key, v = {}) =>
  String((T[lang] || {})[key] ?? T.en[key]).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const clip = s => (s.length > 182 ? s.slice(0, 179) + '...' : s);
const naira = n => 'N' + Number(n).toLocaleString('en-US');
const cropName = (id, lang) => { const c = CROPS.find(x => x.id === id); return c ? c[lang] || c.en : id; };

/* ---------- Weather (Open-Meteo, no key needed) ---------- */
const forecastCache = {};
async function getRainProbability(lga) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lga.lat}&longitude=${lga.lon}&daily=precipitation_probability_max&forecast_days=3&timezone=Africa%2FLagos`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('weather ' + r.status);
  const j = await r.json();
  const prob = Math.max(...(j.daily.precipitation_probability_max || [0]).slice(0, 2).map(p => p ?? 0));
  forecastCache[lga.id] = { prob, at: Date.now() };
  return prob;
}
const cachedProb = id => {
  const c = forecastCache[id];
  return c && Date.now() - c.at < 12 * 3600e3 ? c.prob : null;
};

/* ---------- Alerts ---------- */
async function runRainAlert(lga, { force = false } = {}) {
  let prob = null;
  if (!force) {
    try { prob = await getRainProbability(lga); } catch { return { sent: 0, reason: 'weather service unavailable' }; }
    if (prob < RAIN_THRESHOLD) return { sent: 0, reason: `rain chance ${prob}% is below ${RAIN_THRESHOLD}%` };
    const recent = db.prepare("SELECT 1 FROM alert_log WHERE lga=? AND type='rain' AND sent_at > datetime('now','-24 hours')").get(lga.id);
    if (recent) return { sent: 0, reason: 'alert already sent in the last 24h' };
  }
  const farmers = db.prepare('SELECT * FROM farmers WHERE lga=?').all(lga.id);
  const groups = {};
  for (const f of farmers) (groups[f.crop + '|' + f.language] ||= []).push(f.phone);
  for (const [key, phones] of Object.entries(groups)) {
    const [crop, lang] = key.split('|');
    await sendSms(phones, t(lang, 'rainAlert', { lga: lga.name, crop: cropName(crop, lang) }));
  }
  if (VOICE_ALERTS) for (const f of farmers.slice(0, 20))   // at most 20 calls per alert
    await placeCall(f.phone, `Rain is likely in ${lga.name} in the next two days. If your ${cropName(f.crop, 'en')} is ready, harvest early and cover stored produce.`);
  const note = force ? 'demo (forced)' : `rain chance ${prob}%`;
  db.prepare('INSERT INTO alert_log(lga,type,note,recipients) VALUES (?,?,?,?)').run(lga.id, 'rain', note, farmers.length);
  return { sent: farmers.length, reason: note };
}

/* ---------- USSD ---------- */
const getFarmer = phone => db.prepare('SELECT * FROM farmers WHERE phone=?').get(phone);

function registerFlow(parts, phone, lang) {
  if (parts.length === 0)
    return 'CON ' + t(lang, 'selectLga') + '\n' + LGAS.map((l, i) => `${i + 1}. ${l.name}`).join('\n');
  const lga = LGAS[parts[0] - 1];
  if (!lga) return 'END ' + t(lang, 'invalid');
  if (parts.length === 1)
    return 'CON ' + t(lang, 'selectCrop') + '\n' + CROPS.map((c, i) => `${i + 1}. ${c[lang] || c.en}`).join('\n');
  const crop = CROPS[parts[1] - 1];
  if (!crop) return 'END ' + t(lang, 'invalid');
  if (parts.length === 2) return 'CON ' + t(lang, 'langPick');
  if (!['1', '2'].includes(parts[2])) return 'END ' + t(lang, 'invalid');
  const newLang = parts[2] === '2' ? 'ha' : 'en';
  db.prepare(`INSERT INTO farmers(phone,lga,crop,language) VALUES (?,?,?,?)
    ON CONFLICT(phone) DO UPDATE SET lga=excluded.lga, crop=excluded.crop, language=excluded.language`)
    .run(phone, lga.id, crop.id, newLang);
  getRainProbability(lga).catch(() => {}); // warm the forecast cache
  return 'END ' + t(newLang, 'registered', { lga: lga.name });
}

function pricesFlow(parts, lang) {
  if (parts.length === 0)
    return 'CON ' + t(lang, 'selectMarket') + '\n' + MARKETS.map((m, i) => `${i + 1}. ${m.name}`).join('\n');
  const market = MARKETS[parts[0] - 1];
  if (!market) return 'END ' + t(lang, 'invalid');
  const rows = db.prepare(`SELECT crop, price, unit, date FROM prices WHERE market=?
    AND id IN (SELECT MAX(id) FROM prices WHERE market=? GROUP BY crop)`).all(market.id, market.id);
  const reps = Object.fromEntries(db.prepare(`SELECT crop, CAST(AVG(price) AS INTEGER) avg, COUNT(*) n FROM reports
    WHERE market=? AND status='accepted' AND date(created_at)=date('now') GROUP BY crop`).all(market.id).map(r => [r.crop, r]));
  const lines = rows.map(r => `${cropName(r.crop, lang)}: ${naira(r.price)}/${r.unit}` +
    (reps[r.crop] ? `\n ${t(lang, 'farmersAvg')}: ${naira(reps[r.crop].avg)} (${reps[r.crop].n})` : ''));
  const date = rows[0] ? String(rows[0].date).slice(0, 10) : '';
  return 'END ' + t(lang, 'pricesHeader', { market: market.name }) + '\n' + lines.join('\n') + (date ? `\n(${date})` : '');
}

/* ---------- Voice and Mobile Data ----------
   With VOICE_FROM / MOBILE_DATA_PRODUCT set (and a real AT_API_KEY) these call the real Africa's Talking APIs.
   Without them they run in SIMULATED mode: nothing is sent, and every log entry is labelled "(simulated)". */
const VOICE_FROM = process.env.VOICE_FROM || '';
const MOBILE_DATA_PRODUCT = process.env.MOBILE_DATA_PRODUCT || '';
const VOICE_ALERTS = (process.env.VOICE_ALERTS || 'on') !== 'off';
const DATA_EVERY = Number(process.env.DATA_BUNDLE_EVERY || 3);   // a data bundle on every 3rd accepted price report
const DATA_MB = Number(process.env.DATA_BUNDLE_MB || 50);
const voiceScripts = new Map();                                  // phone -> script the /voice callback will read out

function farmerAdvice(f) {
  const a = (ADVISORIES[f.crop] || {})[seasonOf()] || {};
  const p = cachedProb(f.lga);
  return `${cropName(f.crop, 'en')} advice. ${a.en || ''}` + (p !== null ? ` Rain chance in the next two days is ${p} percent.` : '');
}

async function placeCall(phone, script) {
  voiceScripts.set(phone, { script, at: Date.now() });
  const says = 'Says: ' + script.slice(0, 90);
  if (!at || !VOICE_FROM) { logApi('voice', 'call (simulated)', true, says); return { ok: true, simulated: true }; }
  try {
    const r = await at.VOICE.call({ callFrom: VOICE_FROM, callTo: [phone] });
    const e = (r.entries || [])[0];
    const ok = !!e && (!r.errorMessage || r.errorMessage === 'None') && !/fail|reject/i.test(String(e.status));
    logApi('voice', 'call', ok, ok ? `${e.status}. ${says}` : (r.errorMessage || 'call not placed'));
    return { ok };
  } catch (e) { logApi('voice', 'call', false, e.message); return { ok: false }; }
}

async function sendBundle(phone) {
  const label = `${DATA_MB} MB for 1 day`;
  if (!at || !MOBILE_DATA_PRODUCT) { logApi('data', 'bundle (simulated)', true, label); return { ok: true, simulated: true }; }
  try {
    const r = await at.MOBILE_DATA.send({ productName: MOBILE_DATA_PRODUCT,
      recipients: [{ phoneNumber: phone, quantity: DATA_MB, unit: 'MB', validity: 'Day', metadata: { reason: 'price-reports' } }] });
    const e = (r.entries || [])[0];
    const ok = !!e && !/fail/i.test(String(e.status));
    logApi('data', 'bundle', ok, ok ? `${label}: ${e.status}` : JSON.stringify(r).slice(0, 120));
    return { ok };
  } catch (e) { logApi('data', 'bundle', false, e.message); return { ok: false }; }
}

function callMeFlow(farmer) {
  placeCall(farmer.phone, farmerAdvice(farmer)).catch(console.error);
  return 'END ' + t(farmer.language, 'callMe');
}

/* ---------- Airtime rewards for price reports ---------- */
const REWARDS = [
  { prefix: '+234', currency: 'NGN', amount: Number(process.env.REWARD_NGN || 100) },
  { prefix: '+254', currency: 'KES', amount: Number(process.env.REWARD_KES || 20) },
  { prefix: '+256', currency: 'UGX', amount: Number(process.env.REWARD_UGX || 500) },
  { prefix: '+255', currency: 'TZS', amount: Number(process.env.REWARD_TZS || 500) },
];
// Sandbox only: Africa's Talking's sandbox delivered airtime to +254 numbers but not +234 ones in our tests.
// If SANDBOX_AIRTIME_PHONE is set (and AT_USERNAME is "sandbox"), rewards are sent to that test number
// instead of the farmer's phone. It is labelled "sandbox redirect" in the logs. Leave it empty in production.
const SANDBOX_REDIRECT = (process.env.AT_USERNAME || 'sandbox') === 'sandbox' ? (process.env.SANDBOX_AIRTIME_PHONE || '') : '';
const rewardFor = phone => REWARDS.find(r => String(phone).startsWith(r.prefix));
const MAX_REWARDS_PER_DAY = 3;   // per phone
const PRICE_BAND = 0.30;         // a report must be within 30% of the recent median price

async function sendAirtime(phone, reward, key, redirected = false) {
  const label = `${reward.currency} ${reward.amount}` + (redirected ? ' (sandbox redirect)' : '');
  if (!at) { console.log('[Airtime dry-run]', phone, label); logApi('airtime', 'reward (dry-run)', true, label); return { ok: true, note: 'dry-run' }; }
  try {
    const r = await at.AIRTIME.send({ recipients: [{ phoneNumber: phone, currencyCode: reward.currency, amount: reward.amount }], idempotencyKey: key });
    const ok = Number(r.numSent) > 0 && (!r.errorMessage || r.errorMessage === 'None');
    const note = ok ? (redirected ? 'sent (sandbox redirect)' : 'sent') : (r.errorMessage || 'not sent');
    logApi('airtime', 'reward', ok, ok ? `${label} sent` : note);
    return { ok, note };
  } catch (e) { logApi('airtime', 'reward', false, e.message); return { ok: false, note: e.message }; }
}

function referencePrice(market, crop) {
  const p = db.prepare('SELECT price FROM prices WHERE market=? AND crop=? ORDER BY id DESC LIMIT 5').all(market, crop).map(r => r.price).sort((a, b) => a - b);
  return p.length ? p[Math.floor(p.length / 2)] : null;
}

function reportFlow(parts, farmer) {
  const lang = farmer.language;
  if (parts.length === 0)
    return 'CON ' + t(lang, 'selectMarket') + '\n' + MARKETS.map((m, i) => `${i + 1}. ${m.name}`).join('\n');
  const market = MARKETS[parts[0] - 1];
  if (!market) return 'END ' + t(lang, 'invalid');
  if (parts.length === 1)
    return 'CON ' + t(lang, 'reportCrop') + '\n' + market.crops.map((id, i) => `${i + 1}. ${cropName(id, lang)}`).join('\n');
  const cropId = market.crops[parts[1] - 1];
  if (!cropId) return 'END ' + t(lang, 'invalid');
  const unit = (db.prepare('SELECT unit FROM prices WHERE market=? AND crop=? ORDER BY id DESC LIMIT 1').get(market.id, cropId) || {}).unit || '100kg';
  if (parts.length === 2) return 'CON ' + t(lang, 'reportPrompt', { unit });

  const price = Number(parts.slice(2).join('').replace(/[^\d]/g, ''));
  if (!(price > 0 && price <= 10000000)) return 'END ' + t(lang, 'invalidPrice');

  const insert = db.prepare('INSERT INTO reports(phone,market,crop,price,status,reward_status) VALUES (?,?,?,?,?,?)');
  const ref = referencePrice(market.id, cropId);
  if (!ref || Math.abs(price - ref) / ref > PRICE_BAND) {
    insert.run(farmer.phone, market.id, cropId, price, 'review', 'none');
    return 'END ' + t(lang, 'reportReview');
  }
  const redirect = SANDBOX_REDIRECT && rewardFor(SANDBOX_REDIRECT) ? SANDBOX_REDIRECT : null;
  const reward = rewardFor(redirect || farmer.phone);
  const paidToday = db.prepare("SELECT COUNT(*) n FROM reports WHERE phone=? AND reward_status IN ('sent','pending') AND date(created_at)=date('now')").get(farmer.phone).n;
  const sameToday = db.prepare("SELECT COUNT(*) n FROM reports WHERE phone=? AND market=? AND crop=? AND status='accepted' AND date(created_at)=date('now')").get(farmer.phone, market.id, cropId).n;
  if (sameToday > 0) {   // one report per phone per crop per day, so one person cannot skew the average
    insert.run(farmer.phone, market.id, cropId, price, 'duplicate', 'none');
    return 'END ' + t(lang, 'reportDuplicate');
  }
  const eligible = !!reward && paidToday < MAX_REWARDS_PER_DAY;
  const id = Number(insert.run(farmer.phone, market.id, cropId, price, 'accepted', eligible ? 'pending' : 'none').lastInsertRowid);
  const accepted = db.prepare("SELECT COUNT(*) n FROM reports WHERE phone=? AND status='accepted'").get(farmer.phone).n;
  const bonus = DATA_EVERY > 0 && accepted % DATA_EVERY === 0;
  if (bonus) sendBundle(farmer.phone).catch(console.error);
  const extra = bonus ? ' ' + t(lang, 'reportBonus', { mb: DATA_MB }) : '';
  if (!eligible) return 'END ' + t(lang, 'reportNoReward') + extra;
  sendAirtime(redirect || farmer.phone, reward, `report-${id}`, !!redirect)
    .then(r => db.prepare('UPDATE reports SET reward_status=?, reward_note=? WHERE id=?').run(r.ok ? 'sent' : 'failed', String(r.note).slice(0, 200), id))
    .catch(console.error);
  return 'END ' + t(lang, 'reportAccepted', { currency: reward.currency, amount: reward.amount }) + extra;
}

function adviceFlow(farmer) {
  const lang = farmer.language;
  const a = (ADVISORIES[farmer.crop] || {})[seasonOf()] || {};
  const advice = (lang === 'ha' && a.ha) || a.en || '';
  sendSms([farmer.phone], `${cropName(farmer.crop, lang)}: ${advice}`).catch(console.error);
  const p = cachedProb(farmer.lga);
  return 'END ' + (p !== null ? t(lang, 'rainChance', { p }) + '\n' : '') + t(lang, 'adviceSent');
}

function askFlow(parts, farmer) {
  if (parts.length === 0) return 'CON ' + t(farmer.language, 'askPrompt');
  db.prepare('INSERT INTO questions(phone,text) VALUES (?,?)').run(farmer.phone, parts.join('*').slice(0, 300));
  return 'END ' + t(farmer.language, 'thanks');
}

function langFlow(parts, farmer) {
  if (parts.length === 0) return 'CON ' + t(farmer.language, 'langPick');
  if (!['1', '2'].includes(parts[0])) return 'END ' + t(farmer.language, 'invalid');
  const lang = parts[0] === '2' ? 'ha' : 'en';
  db.prepare('UPDATE farmers SET language=? WHERE phone=?').run(lang, farmer.phone);
  return 'END ' + t(lang, 'langSaved');
}

function ussd(phone, text) {
  const parts = text ? text.split('*') : [];
  const farmer = getFarmer(phone);
  if (!farmer) return registerFlow(parts, phone, 'en'); // first dial = registration
  const lang = farmer.language;
  if (parts.length === 0) return 'CON ' + APP_NAME + '\n' + t(lang, 'menu');
  const [choice, ...rest] = parts;
  switch (choice) {
    case '1': return registerFlow(rest, phone, lang);
    case '2': return pricesFlow(rest, lang);
    case '3': return adviceFlow(farmer);
    case '4': return askFlow(rest, farmer);
    case '5': return langFlow(rest, farmer);
    case '6': return reportFlow(rest, farmer);
    case '7': return callMeFlow(farmer);
    default: return 'END ' + t(lang, 'invalid');
  }
}

/* ---------- Web server ---------- */
const app = express();
app.set('trust proxy', 1); // so failed-login limits work per real visitor behind ngrok or a host
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.post('/ussd', (req, res) => {
  const { phoneNumber, text } = req.body || {};
  let out;
  try { out = ussd(phoneNumber, (text || '').trim()); logApi('ussd', 'session', true, `step ${text ? String(text).split('*').length : 0}`); }
  catch (e) { console.error(e); logApi('ussd', 'session', false, e.message); out = 'END ' + T.en.error; }
  res.type('text/plain').send(clip(out));
});

const xmlEsc = x => String(x).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
app.post('/voice', (req, res) => {
  const b = req.body || {};
  if (String(b.isActive) === '0') return res.type('text/plain').send('');
  const phones = [b.callerNumber, b.destinationNumber, b.clientDialedNumber].filter(Boolean);
  let script = '';
  for (const p of phones) { const v = voiceScripts.get(p); if (v) { script = v.script; break; } }
  if (!script) { const f = phones.map(getFarmer).find(Boolean); script = f ? farmerAdvice(f) : 'Welcome to Agri-Alert. Register by USSD to get farm advice, market prices and weather alerts.'; }
  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="woman" playBeep="false">${xmlEsc(script)}</Say></Response>`);
});

const sha = v => crypto.createHash('sha256').update(String(v)).digest();
const fails = new Map(); // ip -> { n, t }: after 20 wrong keys in 10 minutes, that visitor is locked out
const auth = (req, res, next) => {
  const ip = req.ip, rec = fails.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - rec.t > 10 * 60e3) { rec.n = 0; rec.t = Date.now(); }
  if (rec.n >= 20) return res.status(429).json({ error: 'too many attempts' });
  if (crypto.timingSafeEqual(sha(req.get('x-admin-key') || ''), sha(ADMIN_KEY))) { fails.delete(ip); return next(); }
  rec.n++; fails.set(ip, rec);
  res.status(401).json({ error: 'unauthorized' });
};

app.get('/health', (req, res) => res.json({ ok: true, build: BUILD }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.get('/api/summary', auth, (req, res) => {
  const byLga = LGAS.map(l => ({
    id: l.id, name: l.name, rain: cachedProb(l.id),
    count: db.prepare('SELECT COUNT(*) n FROM farmers WHERE lga=?').get(l.id).n,
  }));
  res.json({
    farmers: byLga.reduce((s, x) => s + x.count, 0), byLga,
    openQuestions: db.prepare("SELECT COUNT(*) n FROM questions WHERE status='open'").get().n,
    alerts24h: db.prepare("SELECT COALESCE(SUM(recipients),0) n FROM alert_log WHERE sent_at > datetime('now','-24 hours')").get().n,
    smsMode: at ? 'live' : 'dry-run', rainThreshold: RAIN_THRESHOLD, appName: APP_NAME, uptimeSec: Math.round(process.uptime()),
    lgas: LGAS.map(({ id, name }) => ({ id, name })), markets: MARKETS.map(({ id, name }) => ({ id, name })),
    crops: CROPS.map(({ id, en }) => ({ id, name: en })),
  });
});
app.get('/api/activity', auth, (req, res) => res.json({
  counts: db.prepare(`SELECT api, COUNT(*) total, SUM(ok) ok, SUM(CASE WHEN action LIKE '%simulated%' OR action LIKE '%dry-run%' THEN 1 ELSE 0 END) sim, MAX(created_at) last FROM api_log GROUP BY api`).all(),
  recent: db.prepare('SELECT api, action, ok, detail, created_at FROM api_log ORDER BY id DESC LIMIT 30').all(),
}));
let gateway = { at: 0, data: null };
app.get('/api/gateway', auth, async (req, res) => {
  const mode = (process.env.AT_USERNAME || 'sandbox') === 'sandbox' ? 'sandbox' : 'live';
  if (!at) return res.json({ mode: 'dry-run', ok: false, balance: null });
  if (Date.now() - gateway.at > 60000) {
    try { const r = await at.APPLICATION.fetchApplicationData(); gateway = { at: Date.now(), data: { mode, ok: true, balance: r.UserData.balance } }; }
    catch (e) { gateway = { at: Date.now(), data: { mode, ok: false, balance: null, error: e.message } }; }
  }
  res.json(gateway.data);
});
app.get('/api/reports', auth, (req, res) =>
  res.json(db.prepare('SELECT id, phone, market, crop, price, status, reward_status, reward_note, created_at FROM reports ORDER BY id DESC LIMIT 30').all()));
app.get('/api/timeline', auth, (req, res) =>
  res.json(db.prepare("SELECT strftime('%Y-%m-%d %H:00', created_at) h, api, COUNT(*) n FROM api_log WHERE created_at > datetime('now','-24 hours') GROUP BY h, api").all()));
app.get('/api/farmers', auth, (req, res) =>
  res.json(db.prepare('SELECT phone, lga, crop, language, created_at FROM farmers ORDER BY created_at DESC LIMIT 100').all()));
app.get('/api/prices', auth, (req, res) =>
  res.json(db.prepare('SELECT market, crop, price, unit, date FROM prices WHERE id IN (SELECT MAX(id) FROM prices GROUP BY market, crop) ORDER BY market, crop').all()));
app.get('/api/alerts', auth, (req, res) =>
  res.json(db.prepare('SELECT lga, type, note, recipients, sent_at FROM alert_log ORDER BY id DESC LIMIT 8').all()));
app.get('/api/questions', auth, (req, res) =>
  res.json(db.prepare("SELECT * FROM questions WHERE status='open' ORDER BY id DESC").all()));
app.post('/api/answer', auth, async (req, res) => {
  const q = db.prepare('SELECT * FROM questions WHERE id=?').get(req.body.id);
  if (!q || !req.body.answer) return res.status(400).json({ error: 'bad request' });
  await sendSms([q.phone], req.body.answer).catch(console.error);
  db.prepare("UPDATE questions SET status='answered', answer=? WHERE id=?").run(req.body.answer, q.id);
  res.json({ ok: true });
});
app.post('/api/alert', auth, async (req, res) => {
  const lga = LGAS.find(l => l.id === req.body.lga);
  if (!lga) return res.status(400).json({ error: 'unknown LGA' });
  res.json(await runRainAlert(lga, { force: !!req.body.force }));
});
app.post('/api/price', auth, (req, res) => {
  const { market, crop, price, unit } = req.body;
  if (!MARKETS.some(m => m.id === market) || !CROPS.some(c => c.id === crop) || !(Number(price) > 0))
    return res.status(400).json({ error: 'bad request' });
  const last = db.prepare('SELECT unit FROM prices WHERE market=? AND crop=? ORDER BY id DESC LIMIT 1').get(market, crop);
  db.prepare('INSERT INTO prices(market,crop,price,unit) VALUES (?,?,?,?)').run(market, crop, Math.round(price), String(unit || (last && last.unit) || '100kg').slice(0, 20));
  res.json({ ok: true });
});

// Check forecasts every 6 hours and alert LGAs where rain is likely.
cron.schedule('0 */6 * * *', async () => {
  for (const lga of LGAS) await runRainAlert(lga).catch(console.error);
});
LGAS.forEach(l => getRainProbability(l).catch(() => {}));

if (ADMIN_KEY === 'change-me') console.warn('WARNING: ADMIN_KEY is still the default. Set a strong ADMIN_KEY in .env before sharing the dashboard.');
app.listen(PORT, () => console.log(`${APP_NAME} [${BUILD}] listening on :${PORT}${at ? '' : ' (SMS dry-run: no AT_API_KEY)'}`));
