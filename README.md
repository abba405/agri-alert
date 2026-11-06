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

You now have two similar files in the project folder:

- `.env.example` is the blank template. Leave it as it is.
- `.env` is the copy you just made. This is the one the app reads, so **open `.env`, not `.env.example`**, and fill it in.

To open it, click `.env` in VS Code, or run `notepad .env` in Command Prompt. File Explorer may hide files that start with a dot, so use one of those two ways. Fill in these settings:

| Setting | What to put |
|---|---|
| `AT_USERNAME` | `sandbox` while testing |
| `AT_API_KEY` | Your sandbox API key (AT dashboard, Sandbox, Settings, API Key) |
| `AT_SENDER_ID` | Leave empty in the sandbox |
| `APP_NAME` | Name shown on the USSD menu, e.g. `AgriAlert` |
| `ADMIN_KEY` | A password for the dashboard. Change it from `change-me` |
| `PORT` | `3000` |
| `RAIN_THRESHOLD` | Rain chance (%) that triggers an alert, default `60` |
| `REWARD_NGN`, `REWARD_KES` | Airtime paid for an accepted price report (default 100 NGN, 20 KES) |
| `VOICE_FROM`, `MOBILE_DATA_PRODUCT` | See above. Empty means Voice / Mobile Data run in simulated mode |
| `VOICE_ALERTS`, `DATA_BUNDLE_EVERY`, `DATA_BUNDLE_MB` | Optional tuning (defaults: on, 3, 50) |
| `SANDBOX_AIRTIME_PHONE` | Sandbox only: a +254 test number that receives reward airtime. Leave empty in production |
| `DB_PATH` | Leave as is |
| `VOICE_FROM` | Your Africa's Talking voice number, e.g. `+234...`. This is a phone number you request from AT, not an API key (see below). Needed from Step 3. Leave empty until you have one |
| `MOBILE_DATA_PRODUCT` | The name of the payment product in your AT account that funds data bundles (see below). Needed from Step 4. Leave empty until you have one |

### Where to get these values

- **`AT_USERNAME` and `AT_API_KEY`:** in your Africa's Talking account, switch to the Sandbox app and open its settings. The username is always `sandbox`. Generate the API key there.
- **`VOICE_FROM`:** Africa's Talking issues voice numbers on request. Their help article gives two routes: Applications, then Voice, then the Phone Numbers Request Form, or Applications, then Product Requests, then Submit Request, then choose Voice. Menu names may differ. Approval may take time and may need a live (not sandbox) application, so it might not arrive today. At the hackathon, ask an AT mentor to help, or email voice@africastalking.com.
- **`MOBILE_DATA_PRODUCT`:** this is the name of a payment product you create in your AT account (the Payments section). The SDK sends it as `productName`. I could not confirm that the sandbox supports Mobile Data, which is why Step 0 exists.
- **If you cannot get `VOICE_FROM` or `MOBILE_DATA_PRODUCT` today:** leave them empty. The app still runs, and the smoke test will show FAIL for those two APIs. We then build only what passes.

If `AT_API_KEY` is empty the app still runs. SMS messages are printed in your terminal instead of being sent ("dry-run"), which is useful for testing offline.

**Never share or upload your `.env` file.** If your API key leaks, regenerate it in the AT dashboard.

## 3. Step 0: check which AT APIs work for you (15 min)

Before building more, find out which APIs your sandbox really supports.

1. In the AT sandbox, open the **Simulator** and add a phone number (e.g. `+2348012345678`).
2. **Optional.** If you already have a Voice number and a Mobile Data product, put them in `.env` as `VOICE_FROM` and `MOBILE_DATA_PRODUCT`. Section 2 above explains where to get them. If you do not have them yet, skip this step. The smoke test will simply show FAIL for Voice and Mobile Data, and that is fine.
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
| 6 | Report a price and earn airtime |
| 7 | Call me with advice (a voice call) |

**How price reports and rewards work**

- Pick a market, a crop, then type today's price. The price must be within 30% of the recent median price, otherwise it is saved for an operator to review and no airtime is paid.
- One report per phone, per crop, per day. At most 3 airtime rewards per phone per day.
- Accepted reports appear on the "Today's prices" screen as the farmers' average, so other farmers see crowd-sourced prices.
- Each payout uses an idempotency key, so a retry can never pay the same report twice.
- The currency comes from the phone's country code: +234 pays NGN, +254 pays KES, +256 UGX, +255 TZS. Reward sizes are set by `REWARD_NGN` and `REWARD_KES` in `.env`.

**Voice and Mobile Data (simulated until provisioned)**

- **Voice:** option 7 places a call that reads out the farmer's advice. Forcing a weather alert also calls up to 20 farmers in that LGA (set `VOICE_ALERTS=off` to disable). Africa's Talking fetches the call script from `POST /voice` on your server, so set that URL as the callback on your voice number.
- **Mobile Data:** every 3rd accepted price report earns a 50 MB, 1-day data bundle (`DATA_BUNDLE_EVERY`, `DATA_BUNDLE_MB`).
- **Real or simulated:** with `VOICE_FROM` / `MOBILE_DATA_PRODUCT` set in `.env`, these call the real Africa's Talking APIs. Without them they run in **simulated** mode: nothing is sent, every log entry says "(simulated)", and the dashboard labels them "simulated" and leaves them out of the success rate. The real-API paths are written against the SDK but have **not** been run against Africa's Talking, because no voice number or data product was available.

**Testing Airtime in the sandbox**

Your tests showed the sandbox accepts airtime for Kenyan (+254) numbers but fails for Nigerian (+234) numbers ("Internal Gateway Error"), while the USSD simulator worked with a Nigerian number. To demo the full loop:

1. Add this line to your `.env`: `SANDBOX_AIRTIME_PHONE=+254711000001`
2. Restart the server.
3. Use your Nigerian simulator number as the farmer (register, then option 6).

Rewards are then sent to the Kenyan test number, and the logs label them "sandbox redirect". This applies only when `AT_USERNAME=sandbox`. When you present, say so plainly: the Airtime API is integrated and delivering in the sandbox, and in production the reward goes to the farmer's own number in naira. Leave `SANDBOX_AIRTIME_PHONE` empty in production.

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

If you change `data.js` after farmers are registered (for example the LGA or market list), stop the server, delete `agri.db`, and start again so old records do not point at removed names.

## 9. Roadmap (follow in order)

Facilitator guidance: strong entries integrate 4 to 5 AT APIs, and judges test the solution in the simulator and on the dashboard.

- [x] USSD: registration, prices, advice, questions, language
- [x] SMS: advisories, rain alerts, expert replies
- [x] Dashboard (admin) with demo trigger
- [x] **Step 0** Smoke test run: login and SMS pass. Airtime fails with "Internal Gateway Error" (investigate with `airtime-debug.js`). Voice and Mobile Data not configured yet
- [x] **Step 1** API activity log (`/api/activity`) and gateway status (`/api/gateway`); LGAs are now Sumaila, Kano Municipal, Dambatta, Bichi, Rano; markets are Dawanau and Yankaba
- [x] **Step 2** Airtime: farmers report a price (USSD option 6) and earn a validated reward. In the sandbox, rewards go to a +254 test number via `SANDBOX_AIRTIME_PHONE` because +234 sandbox airtime fails
- [x] **Step 3** Voice: USSD option 7 and voice calls on weather alerts. Simulated until a voice number exists; real-API path untested
- [x] **Step 4** Mobile Data: a bundle on every 3rd accepted report. Simulated until a data product exists; real-API path untested
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
| `airtime-debug.js` | Tries a few Airtime variants to see what the sandbox accepts |
| `Dockerfile` | For the Marketplace packaging step |
| `.env.example` | Template for your settings |

## 13. Marketplace packaging (after today)

You have a grace period of 3 to 4 days from 31 Oct for submission. Aim to finish early.

```bash
docker build -t agri-alert .
docker run -p 3000:3000 --env-file .env agri-alert
```

Then follow the push steps from the AT Marketplace submission form. You will need a logo, name, slug, short and long descriptions, environment variables to expose (see the settings table), at least one pricing plan, and a category. The database is a file inside the container, so data is lost on redeploy. Declare a database or persistent storage for the Marketplace version.

## 14. Hosting on Render (or any host)

1. Push the project to GitHub. Never commit `.env` or `docker.env`.
2. On Render, create a Web Service from the repo, using the Dockerfile.
3. Under **Environment**, add `AT_USERNAME`, `AT_API_KEY`, `ADMIN_KEY` (a strong one), `APP_NAME`, `PUBLIC_USSD_CODE` (for the home page), and `SANDBOX_AIRTIME_PHONE` if you are still on the sandbox. Set each value without quote marks.
4. On a hosted server the default `ADMIN_KEY` (`change-me`) is refused, so the dashboard stays locked until you set a real one.
5. In Africa's Talking, set your USSD channel callback to `https://YOUR-APP.onrender.com/ussd`, and a voice number's callback to `https://YOUR-APP.onrender.com/voice`.
6. Free Render services sleep after about 15 minutes without traffic, and their disk is erased on restart. Use a free uptime monitor to request `/health` every 5 minutes, and expect farmer data to reset when the service restarts.
