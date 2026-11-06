// Edit this file to match your real markets, crops, LGAs and advice.
// LGA coordinates are approximate (enough for a ~10km forecast grid) - check them.
const LGAS = [
  { id: 'kano-municipal', name: 'Kano Municipal', lat: 12.00, lon: 8.52 },
  { id: 'sumaila', name: 'Sumaila', lat: 11.54, lon: 9.36 },
  { id: 'bebeji', name: 'Bebeji', lat: 11.66, lon: 8.56 },
  { id: 'gezawa', name: 'Gezawa', lat: 12.13, lon: 8.73 },
  { id: 'dawakin-tofa', name: 'Dawakin Tofa', lat: 12.10, lon: 8.37 },
];

const CROPS = [
  { id: 'maize', en: 'Maize', ha: 'Masara' },
  { id: 'rice', en: 'Rice', ha: 'Shinkafa' },
  { id: 'tomato', en: 'Tomato', ha: 'Tumatir' },
];

const MARKETS = [
  { id: 'dawanau', name: 'Dawanau (grains)', crops: ['maize', 'rice'] },
  { id: 'singer', name: 'Singer (vegetables)', crops: ['tomato'] },
];

// PLACEHOLDER PRICES - replace with real, current prices before you demo
// (or update them live from the /admin page).
const SEED_PRICES = [
  { market: 'dawanau', crop: 'maize', price: 55000, unit: '100kg' },
  { market: 'dawanau', crop: 'rice', price: 100000, unit: '100kg' },
  { market: 'singer', crop: 'tomato', price: 30000, unit: 'basket' },
];

// Kano seasons: dry Nov-Mar, early rains Apr-May, rainy Jun-Sep, harvest Oct.
function seasonOf(date = new Date()) {
  const m = date.getMonth(); // 0 = Jan
  if (m >= 10 || m <= 2) return 'dry';
  if (m <= 4) return 'early';
  if (m <= 8) return 'rainy';
  return 'harvest';
}

// Have an extension officer review these. Add Hausa in `ha`; English is the fallback.
const ADVISORIES = {
  maize: {
    dry: { en: 'Dry season: prepare land and keep seed dry in a sealed container. Plant only when steady rains begin.', ha: '' },
    early: { en: 'Early rains: plant maize once rains are steady. Use certified seed and follow your extension agent on spacing.', ha: '' },
    rainy: { en: 'Weed 3 weeks after planting. Check leaves weekly for fall armyworm (holes, sawdust-like droppings) and report it.', ha: '' },
    harvest: { en: 'Harvest when husks are dry. Dry grain well before storage and keep bags off the floor to stop mould.', ha: '' },
  },
  rice: {
    dry: { en: 'Dry season: repair field bunds and plan your nursery. Buy seed early from a trusted dealer.', ha: '' },
    early: { en: 'Prepare nursery and level fields. Transplant when rains are reliable and keep water level steady.', ha: '' },
    rainy: { en: 'Control weeds early and keep a steady water level. Watch leaves for pests and disease.', ha: '' },
    harvest: { en: 'Harvest when most grains turn golden. Dry paddy well before milling or storage.', ha: '' },
  },
  tomato: {
    dry: { en: 'Irrigate early morning or evening. Mulch to save water and stake plants to keep fruit off the soil.', ha: '' },
    early: { en: 'Rain raises disease risk. Space plants for airflow and check leaves and fruit for spots and rot.', ha: '' },
    rainy: { en: 'Heavy rain spreads disease and cracks fruit. Drain beds and harvest ripe fruit early.', ha: '' },
    harvest: { en: 'Pick at the right stage and use crates instead of baskets to cut damage on the way to market.', ha: '' },
  },
};

module.exports = { LGAS, CROPS, MARKETS, SEED_PRICES, ADVISORIES, seasonOf };
