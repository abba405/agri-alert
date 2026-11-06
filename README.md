# Agri-Alert

Farm advisories, market prices and weather alerts for farmers in Kano State, delivered over USSD and SMS to any phone, with no internet needed. Operators run it from a web dashboard.

Built for the Africa's Talking Open Hackathon: Agriculture & Food Security (Kano, 31 Oct 2026).

**Current status:** USSD + SMS + dashboard are working. Airtime, Voice and Mobile Data are the next steps (see the roadmap in section 9).

---

## 1. What you need

- Node.js 22.13 or newer (check with `node -v`; version 24 is fine). The database is built into Node, so you do not need Visual Studio or any compiler.
- An Africa's Talking account (free sandbox is enough): https://account.africastalking.com
- ngrok (to let the AT simulator reach your laptop): https://ngrok.com/download
- A modern browser for the dashboard

## 2. Install (5 min)

```bash
cd agri-alert
npm install
```

Create your settings file:

```bash
# Mac / Linux
cp .env.example .env
# Windows (Command Prompt)
copy .env.example .env
```

Open `.env` and fill it in:

| Setting | What to put |
|---|---|
| `AT_USERNAME` | `sandbox` while testing |
| `AT_API_KEY` | Your sandbox API key (AT dashboard, Sandbox, Settings, API Key) |
| `AT_SENDER_ID` | Leave empty in the sandbox |
| `APP_NAME` | Name shown on the USSD menu, e.g. `AgriAlert` |
| `ADMIN_KEY` | A password for the dashboard. Change it from `change-me` |
| `PORT` | `3000` |
| `RAIN_THRESHOLD` | Rain chance (%) that triggers an alert, default `60` |
| `DB_PATH` | Leave as is |
| `VOICE_FROM` | Your AT voice number (needed from Step 3) |
| `MOBILE_DATA_PRODUCT` | Your AT Mobile Data product name (needed from Step 4) |

If `AT_API_KEY` is empty the app still runs. SMS messages are printed in your terminal instead of being sent ("dry-run"), which is useful for testing offline.

**Never share or upload your `.env` file.** If your API key leaks, regenerate it in the AT dashboard.

## 3. Step 0: check which AT APIs work for you (15 min)

Before building more, find out which APIs your sandbox really supports.

1. In the AT sandbox, open the **Simulator** and add a phone number (e.g. `+2348012345678`).
2. If the sandbox lets you, create a **Voice number** and a **Mobile Data product**, and put them in `.env`.
3. Run:

```bash
node smoke-test.js +2348012345678
```

Use your simulator number. You will see `PASS` or `FAIL` for Application balance, SMS, Airtime, Voice and Mobile Data. Keep the summary. Only claim in your pitch the APIs that show `PASS` and that you have seen working in the simulator.

## 4. Run the server (2 min)

```bash
npm start
```

You should see `AgriAlert listening on :3000`. Check http://localhost:3000/health shows `{"ok":true}`.

In a second terminal:

```bash
ngrok http 3000
```

Copy the `https://....ngrok-free.app` address. **It changes every time you restart ngrok**, so you must update the callback URL in the AT dashboard each time.

## 5. Connect the Africa's Talking sandbox (10 min)

Menu names in the AT dashboard may differ slightly from what is written here.

1. Sandbox, then **USSD**, then create a channel (a code such as `*384*1234#`).
2. Set the callback URL to `https://YOUR-NGROK-ADDRESS/ussd`.
3. Open the **Simulator**, choose your number, and dial the code.

## 6. Test the USSD flow

**First dial (not registered yet)** goes straight to registration:

1. Choose your LGA by number
2. Choose your main crop (1 Maize, 2 Rice, 3 Tomato)
3. Choose language (1 English, 2 Hausa)

You will see `Registered. You will get alerts for ...`.

**Dial again (registered)** and you get the main menu:

| Option | What it does |
|---|---|
| 1 | Update profile (re-register) |
| 2 | Today's prices (choose a market) |
| 3 | Weather and farm advice (advice also arrives by SMS) |
| 4 | Ask a question (type it; an expert replies by SMS) |
| 5 | Switch Hausa / English |

Each USSD screen is kept under about 180 characters so it displays on all phones.

## 7. Use the dashboard

1. Open `http://localhost:3000/admin` (or your ngrok address plus `/admin`).
2. Enter the `ADMIN_KEY` from your `.env`.

What you can do:

- **Stage demo:** pick an LGA and press **Force Weather Trigger** to send a rain alert to every farmer in that LGA. Use **Run real forecast check** to show the real forecast logic (it only sends if rain chance is above your threshold).
- **Update market price:** farmers see the new price on the next USSD lookup.
- **Farmer inquiries:** read questions from farmers and reply. Your reply goes out as an SMS.
- **LGA coverage, Market prices, Farmers, Alert log:** live tables that refresh every 10 seconds.

On a small laptop screen, press Ctrl and minus to zoom the browser to about 80% so everything fits.

## 8. Before you demo: replace the placeholders

Edit `data.js`:

- **Prices** in `SEED_PRICES` are placeholders. Replace them with current real prices, or update them from the dashboard.
- **Market names** and **LGA coordinates** are approximate. Check them.
- **Advice messages** have an empty `ha` (Hausa) field. Fill them in, otherwise English is sent.
- The Hausa menus in `server.js` (the `T.ha` block) are drafts. Have a native speaker review them.
- Have an extension officer review the advice content.

If you change `data.js` after farmers are registered, delete `agri.db` to start fresh.

## 9. Roadmap (follow in order)

Facilitator guidance: strong entries integrate 4 to 5 AT APIs, and judges test the solution in the simulator and on the dashboard.

- [x] USSD: registration, prices, advice, questions, language
- [x] SMS: advisories, rain alerts, expert replies
- [x] Dashboard (admin) with demo trigger
- [ ] **Step 0** Run `smoke-test.js` and record which APIs pass
- [ ] **Step 1** API activity log, plus LGAs and markets updated to match the design spec
- [ ] **Step 2** Airtime: farmers report a price and earn a small validated reward
- [ ] **Step 3** Voice: "Call me" menu option and voice calls on weather alerts
- [ ] **Step 4** Mobile Data: bundle reward after several validated reports (only if the sandbox supports it)
- [ ] **Step 5** Dashboard rebuilt to the master design prompt, with per-API counters
- [ ] **Step 6** Full rehearsal of the five-API demo, plus a backup screen recording
- [ ] **Step 7** Deploy to a stable URL, add a judge guide page, Dockerize, publish on the Marketplace

## 10. Demo checklist

- [ ] Server running, ngrok running, callback URL updated in the AT dashboard
- [ ] Simulator open with your test number registered
- [ ] Dashboard open on the projector, logged in
- [ ] Real prices entered
- [ ] One farmer already registered, plus a fresh number to register live
- [ ] Backup screen recording ready in case the network fails

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| `npm install` fails with `gyp` or Visual Studio errors | You have an old copy that still uses `better-sqlite3`. Use the latest zip, delete `node_modules` and `package-lock.json`, then run `npm install` again |
| `Cannot find module 'node:sqlite'` | Your Node is older than 22.13. Install the current LTS from nodejs.org |
| Terminal shows an "ExperimentalWarning: SQLite" message | Harmless. The app works normally |
| USSD in the simulator says the service is unavailable | ngrok restarted. Copy the new address into the AT callback URL |
| `Invalid choice` on every menu step | You typed a number that is not on the screen. Redial and follow the menu |
| No SMS arrives | Check `AT_API_KEY` in `.env`. Without it SMS is dry-run. In the sandbox, SMS only reaches numbers added in the simulator |
| Rain column shows "No forecast" | The weather service was unreachable. Check your internet and wait a minute |
| Dashboard says the key does not match | Use the `ADMIN_KEY` from `.env`. Restart the server after changing `.env` |
| Port already in use | Change `PORT` in `.env` and restart ngrok with the same port |
| Weather alert not sent by "real forecast check" | It is working as designed. Rain chance is below your threshold. Use Force Weather Trigger for the demo |

## 12. Files

| File | Purpose |
|---|---|
| `server.js` | Everything on the server: USSD menus, SMS, weather checks, dashboard API |
| `data.js` | LGAs, crops, markets, prices, seasonal advice |
| `admin.html` | Operator dashboard |
| `smoke-test.js` | Step 0 check of the AT APIs |
| `Dockerfile` | For the Marketplace packaging step |
| `.env.example` | Template for your settings |

## 13. Marketplace packaging (after today)

You have a grace period of 3 to 4 days from 31 Oct for submission. Aim to finish early.

```bash
docker build -t agri-alert .
docker run -p 3000:3000 --env-file .env agri-alert
```

Then follow the push steps from the AT Marketplace submission form. You will need a logo, name, slug, short and long descriptions, environment variables to expose (see the settings table), at least one pricing plan, and a category. The database is a file inside the container, so data is lost on redeploy. Declare a database or persistent storage for the Marketplace version.
