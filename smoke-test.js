// Step 0: checks which Africa's Talking APIs actually work with YOUR sandbox account.
// Usage:  node smoke-test.js +2348012345678
// Use a phone number you have added in the AT Sandbox simulator.
// Optional .env values: VOICE_FROM (your AT voice number), MOBILE_DATA_PRODUCT (payment product name)
require('dotenv').config();

const SKIP = 'SKIP';
const okCodes = [100, 101, 102]; // processed, sent, queued
const none = e => !e || String(e).toLowerCase() === 'none';

// Each judge reads the API's reply and decides PASS or FAIL. Returns [ok, note].
const judge = {
  application: r => [!!(r && r.UserData), r && r.UserData ? `balance: ${r.UserData.balance}` : 'no UserData in reply'],
  sms: r => {
    const rec = (((r || {}).SMSMessageData || {}).Recipients) || [];
    const ok = rec.some(x => okCodes.includes(Number(x.statusCode)));
    return [ok, ok ? `status: ${rec[0].status}` : `no recipient accepted. Reply: ${JSON.stringify(r).slice(0, 200)}`];
  },
  airtime: r => {
    const ok = !!r && Number(r.numSent) > 0 && none(r.errorMessage);
    return [ok, ok ? `sent ${r.totalAmount}` : `nothing sent. errorMessage="${r && r.errorMessage}", numSent=${r && r.numSent}`];
  },
  voice: r => {
    const entries = (r && r.entries) || [];
    const ok = entries.length > 0 && none(r.errorMessage) && !/fail|reject/i.test(String(entries[0].status));
    return [ok, ok ? `call ${entries[0].status}` : `call not placed. Reply: ${JSON.stringify(r).slice(0, 200)}`];
  },
  mobileData: r => {
    const entries = (r && r.entries) || [];
    const ok = entries.length > 0 && !/fail/i.test(String(entries[0].status));
    return [ok, ok ? `bundle ${entries[0].status}` : `bundle not sent. Reply: ${JSON.stringify(r).slice(0, 200)}`];
  },
};
module.exports = { judge };

// Talks to Africa's Talking directly (no SDK) so we can see the real HTTP status and message.
async function rawCheck(username, apiKey) {
  const base = username === 'sandbox' ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
  try {
    const r = await fetch(`${base}/version1/user?username=${encodeURIComponent(username)}`,
      { headers: { apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const body = (await r.text()).slice(0, 200).replace(/\s+/g, ' ');
    console.log(`Raw login check: HTTP ${r.status} from ${base}\n      ${body}\n`);
  } catch (e) {
    const why = e.cause ? (e.cause.code || e.cause.message) : e.message;
    console.log(`Raw login check: could not connect to ${base}\n      ${why}\n      That is a network problem (VPN, firewall, antivirus HTTPS scanning or a weak connection), not your key.\n`);
  }
}

if (require.main === module) (async () => {
  const phone = process.argv[2];
  const username = process.env.AT_USERNAME || 'sandbox';
  const apiKey = process.env.AT_API_KEY || '';
  if (!apiKey || !phone) {
    console.log('Set AT_USERNAME and AT_API_KEY in .env, then run: node smoke-test.js +234XXXXXXXXXX');
    process.exit(1);
  }
  console.log(`Using username "${username}" and an API key of ${apiKey.length} characters starting "${apiKey.slice(0, 4)}"\n`);
  await rawCheck(username, apiKey);
  const at = require('africastalking')({ apiKey, username });

  const tests = [
    ['Application (balance)', judge.application, () => at.APPLICATION.fetchApplicationData()],
    ['SMS', judge.sms, () => at.SMS.send({ to: [phone], message: 'Agri-Alert smoke test' })],
    ['Airtime', judge.airtime, () => at.AIRTIME.send({ recipients: [{ phoneNumber: phone, currencyCode: 'NGN', amount: 10 + Math.floor(Math.random() * 40) }] })],
    ['Voice (outbound call)', judge.voice, () => {
      if (!process.env.VOICE_FROM) throw SKIP;
      return at.VOICE.call({ callFrom: process.env.VOICE_FROM, callTo: [phone] });
    }],
    ['Mobile Data', judge.mobileData, () => {
      if (!process.env.MOBILE_DATA_PRODUCT) throw SKIP;
      return at.MOBILE_DATA.send({ productName: process.env.MOBILE_DATA_PRODUCT,
        recipients: [{ phoneNumber: phone, quantity: 50, unit: 'MB', validity: 'Day', metadata: { reason: 'smoke-test' } }] });
    }],
  ];

  const summary = [];
  for (const [name, judgeFn, run] of tests) {
    try {
      const [ok, note] = judgeFn(await run());
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${note}\n`);
      summary.push([ok ? 'PASS' : 'FAIL', name]);
    } catch (e) {
      if (e === SKIP) { console.log(`SKIP  ${name}\n      not configured in .env, so it was not tried\n`); summary.push(['SKIP', name]); continue; }
      const body = e && e.response && e.response.data ? ' | server said: ' + (typeof e.response.data === 'string' ? e.response.data : JSON.stringify(e.response.data)) : '';
      const msg = (String((e && (e.message || JSON.stringify(e))) || e) + body).slice(0, 350);
      const hint = /401/.test(msg) ? '\n      401 means Africa\'s Talking rejected your username/API key. Regenerate the key in your SANDBOX app and use AT_USERNAME=sandbox.' : '';
      console.log(`FAIL  ${name}\n      ${msg}${hint}\n`);
      summary.push(['FAIL', name]);
    }
  }
  console.log('Summary:'); summary.forEach(([s, n]) => console.log(`  ${s}  ${n}`));
})();
