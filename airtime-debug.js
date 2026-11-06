// Finds out what the sandbox accepts for Airtime. Usage: node airtime-debug.js +2348012345678
require('dotenv').config();
const crypto = require('crypto');
const phone = process.argv[2];
if (!process.env.AT_API_KEY || !phone) { console.log('Usage: node airtime-debug.js +234XXXXXXXXXX (needs AT_API_KEY in .env)'); process.exit(1); }
const at = require('africastalking')({ apiKey: process.env.AT_API_KEY, username: process.env.AT_USERNAME || 'sandbox' });
const tries = [
  ['NGN 100 to your number', phone, 'NGN', 100],
  ['NGN 50 to your number', phone, 'NGN', 50],
  ['KES 100 to a Kenyan test number', '+254711000000', 'KES', 100],
];
(async () => {
  for (const [label, p, cur, amt] of tries) {
    try {
      const r = await at.AIRTIME.send({ recipients: [{ phoneNumber: p, currencyCode: cur, amount: amt }], idempotencyKey: crypto.randomUUID() });
      console.log(label, '\n   ', JSON.stringify(r), '\n');
    } catch (e) {
      const body = e && e.response && e.response.data ? ' | server said: ' + JSON.stringify(e.response.data) : '';
      console.log(label, '\n    ERROR:', (e.message || e) + body, '\n');
    }
  }
})();
