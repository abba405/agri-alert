# Agri-Alert: Marketplace submission pack

Copy each field into the submission form at marketplace.africastalking.dev (Create Your Own Plugin). Items marked CHECK need your decision or confirmation.

## 1. Basic plugin info

| Field | Value |
|---|---|
| Name | Agri-Alert |
| Slug | agri-alert |
| Logo | `logo.png` (512 x 512). A missing logo blocks submission. `logo.svg` is the source |

**Short description**

Farm advice, market prices and weather alerts for farmers by USSD and SMS, with airtime rewards for price reports. No internet or smartphone needed.

**Long description**

Agri-Alert gives smallholder farmers timely, local information on any phone, without internet access.

Farmers dial one USSD code to register their local government area, main crop and language (English or Hausa). They can then check market prices, receive seasonal farming advice by SMS, and ask questions that an operator answers by SMS.

The platform checks the weather forecast every 6 hours and sends an SMS alert to farmers in any area where heavy rain is likely, so they can harvest early and protect stored produce.

Farmers can also report the price they see at their market. Reports that fall within a sensible range of recent prices earn a small airtime reward, which builds a crowd-sourced price picture for everyone. Limits stop one phone from claiming repeated rewards.

Farmers can also request a voice call with advice, and earn a data bundle for regular price reports (both simulated until the account has a voice number and data product).

Operators get a web dashboard with live farmer counts, a question queue, market prices, price reports, a per-API activity log and a one-click weather alert.

Built for cooperatives, agribusinesses, input suppliers and NGOs working with farmers in Northern Nigeria. Each deployment is an isolated instance with its own farmers, prices and settings.

## 2. Technical details

| Field | Value |
|---|---|
| Image URL | The AT-Container registry address shown in the form after you push |
| Git repo (optional) | Your GitHub repository |
| Port | 3000 |
| Database | CHECK: the app stores data in an SQLite file inside the container. Data is lost when the instance is redeployed. Declare a database if the form offers persistent storage, otherwise choose none and mention this in the long description |

## 3. Environment variables to expose

| Variable | Purpose | Required |
|---|---|---|
| `AT_USERNAME` | The customer's Africa's Talking username | Yes |
| `AT_API_KEY` | The customer's Africa's Talking API key | Yes |
| `AT_SENDER_ID` | Approved SMS sender ID | No |
| `ADMIN_KEY` | Password for the operator dashboard | Yes |
| `APP_NAME` | Name shown on the USSD menu | No |
| `RAIN_THRESHOLD` | Rain chance (%) that triggers an alert, default 60 | No |
| `REWARD_NGN` | Airtime reward for an accepted price report in naira, default 100 | No |
| `REWARD_KES` | Same, in Kenyan shillings, default 20 | No |
| `VOICE_FROM` | Your Africa's Talking voice number. Empty means voice runs in simulated mode | No |
| `MOBILE_DATA_PRODUCT` | Your Mobile Data payment product name. Empty means data bundles run in simulated mode | No |
| `VOICE_ALERTS` | `off` stops weather alerts placing voice calls, default on | No |
| `DATA_BUNDLE_EVERY`, `DATA_BUNDLE_MB` | Data bundle every N accepted reports (default 3) and its size in MB (default 50) | No |

Do not expose `SANDBOX_AIRTIME_PHONE`. It is only for testing.

## 4. Categorization

- Africa's Talking products: USSD, SMS (alerts go out to many recipients at once), Airtime, Voice, Mobile Data (the last two run in simulated mode until credentials are set)
- Industry: Other (agriculture is not in the list)

## 5. Pricing plan (at least one required)

CHECK: the amounts are suggestions. This is your business decision. Africa's Talking charges the customer separately for SMS and airtime through their own account.

| Field | Suggested value |
|---|---|
| Plan name | Cooperative |
| Currency | NGN |
| Amount | 15000 |
| Billing frequency | Monthly |
| Description | One isolated deployment for a cooperative or business: USSD registration, prices, advice, farmer questions, weather alerts, price-report rewards and the operator dashboard. SMS and airtime costs are billed by Africa's Talking to your own account. |

## 6. Terms

Tick the Terms of Service and Privacy Policy boxes. Note that the app stores farmers' phone numbers, locations and questions. Make sure each customer knows they are responsible for that data.

## 7. Notes for reviewers (paste into the description or share with the facilitator)

1. Open the Africa's Talking simulator and enter a Nigerian test number.
2. Dial the USSD code for this deployment. Register by choosing an LGA, a crop and a language.
3. Dial again to see the menu: prices, advice, questions, language, and "Report a price, earn airtime".
4. Open the dashboard at the instance URL followed by `/admin`, and enter the ADMIN_KEY.
5. Press Force Weather Trigger to send a rain alert to farmers in the chosen LGA.
6. In the sandbox, airtime is delivered to a Kenyan test number because the sandbox did not deliver to Nigerian numbers when we tested. In production the reward goes to the farmer's own number.
7. Voice (USSD option 7, and calls on weather alerts) and Mobile Data (a bundle on every 3rd accepted price report) are implemented but run in clearly labelled simulated mode, because no voice number or data product was provisioned for this account. The dashboard labels these entries "simulated". Setting VOICE_FROM and MOBILE_DATA_PRODUCT switches them to the real APIs. Set the voice number's callback URL to the instance URL followed by /voice.
