/* ---------------------------------------------------------------------------
   mmurr.ai — shared data module (single source of truth)

   Two things live here and ONLY here, so every page agrees:
     1. MMURR_BASES  — environmental bases (grid/car/phone) used by the carbon
        dashboard and the data-centre page to reconcile CO2/water.
     2. MMURR_DATA   — region/currency profiles, FX anchors, regional seat
        prices + the headcount→EA-discount model. The region/currency selector
        (js/region.js) reads these; the price page and dashboard consume them.

   Loaded BEFORE js/region.js and each page's own script. Pages read these as
   defaults; the user can still override any value in that page's own inputs.

   Every value is editable here. Confidence: SOURCED = first-party/strong
   secondary · VERIFY = credible anchor to re-check (fast-moving). No network
   calls are made anywhere — FX and grid figures are static, editable anchors.
--------------------------------------------------------------------------- */

// --- Environmental bases (unchanged single source for CO2/water) -----------
window.MMURR_BASES = {
  grid:  0.177,   // kgCO2e/kWh — UK location-based grid intensity (DESNZ/Defra 2025)
  car:   0.17,    // kgCO2e/km  — UK average car, all fuels (Defra 2025)
  phone: 0.0082,  // kgCO2e     — one full smartphone charge (US EPA equivalencies)
  // Water (WUE) is page-specific by design and documented inline where used:
  //   dashboard  = 1.8 L/kWh (on-site cooling WUE)
  //   datacentres = 1.9 L/kWh (fleet-average WUE)
};

// --- Region / currency profiles --------------------------------------------
// A region changes THREE independent things (stated to the user in region.js):
//   1. seat prices  -> regional LIST price (not an FX conversion)
//   2. token/API    -> USD list, FX-converted at `fx` (editable anchor)
//   3. grid + water -> the region's defaults (carbon is where compute runs)
//
// PUE is held at 1.0 on purpose: the per-prompt Wh figures used across the site
// are all-in facility measurements (Google's Gemini figure), so multiplying by a
// PUE>1 would double-count. Raise it only alongside an IT-only energy basis.
window.MMURR_DATA = {
  defaultRegion: 'UK',

  regions: {
    UK: { label:'UK — London', flag:'🇬🇧', cur:'GBP', sym:'£', fx:0.78,
          grid:0.177, wue:1.9, pue:1.0,
          gridNote:'UK location-based grid (DESNZ/Defra 2025)', gridConf:'SOURCED' },
    US: { label:'US', flag:'🇺🇸', cur:'USD', sym:'$', fx:1.00,
          grid:0.37, wue:1.9, pue:1.0,
          gridNote:'US mixed/Azure-East grid average', gridConf:'VERIFY' },
    EU: { label:'EU', flag:'🇪🇺', cur:'EUR', sym:'€', fx:0.92,
          grid:0.23, wue:1.9, pue:1.0,
          gridNote:'EU average grid', gridConf:'VERIFY' },
    // Custom inherits UK's numbers as a starting point; every field is editable.
    Custom: { label:'Custom', flag:'🌐', cur:'', sym:'¤', fx:1.00,
          grid:0.177, wue:1.9, pue:1.0,
          gridNote:'User-set — your own contract / location figures', gridConf:'USER' },
  },

  // FX = local currency per 1 USD. Editable anchors, NOT a live feed. (§7.5)
  fxNote: 'Editable anchor, not a live feed — this site makes no network calls.',

  // Seat prices: regional LIST per seat/month, in that region's own currency.
  // M365 Copilot enterprise add-on. NOT FX-converted between regions. (§7.2)
  seat: {
    list:        { UK:24.70, US:30.00, EU:28.10 },   // enterprise add-on, regional list
    business:    { UK:18.50, US:21.00, EU:21.50 },   // ≤300-employee SKU
    frontierE7:  { UK:78.00, US:99.00, EU:90.00 },   // E7 'Frontier Suite' (model-a-renewal)
    businessCap: 300,                                // employee cap on Business SKU
    // Expected EA discount by company headcount. Microsoft discounts ~15-30%
    // on 5,000+ seat enterprise agreements; anchors are editable. (§4.2)
    // [headcount, fraction off list]. Linear-interpolated between anchors.
    discountAnchors: [ [1, 0], [1000, 0.10], [5000, 0.20], [10000, 0.30] ],
    discountMax: 0.30,
  },

  // Front-page "what this costs to run" figures (§7.6). Editable & sourced.
  // domain is a USD/yr range (FX-shown per region); claude is the owner's real
  // GBP figure (shown verbatim under UK, FX-converted elsewhere).
  running: {
    domainUsdPerYear: [75, 100],     // .ai domain — wholesale +$10/yr from Mar 2026 (SOURCED)
    claudeGbpPerMonth: 20,           // Claude Pro — owner's actual (SOURCED)
    ghPagesLimits: '1 GB storage · 100 GB/mo bandwidth',
  },
};

// --- Seat-price helpers -----------------------------------------------------
// Expected EA discount fraction (0..discountMax) for a given headcount.
window.seatDiscount = function(headcount){
  const a = MMURR_DATA.seat.discountAnchors, max = MMURR_DATA.seat.discountMax;
  if(!(headcount > 0)) return 0;
  if(headcount <= a[0][0]) return a[0][1];
  for(let i=1;i<a.length;i++){
    if(headcount <= a[i][0]){
      const [x0,y0]=a[i-1],[x1,y1]=a[i];
      return y0 + (y1-y0)*(headcount-x0)/(x1-x0);   // linear interpolation
    }
  }
  return max;                                       // beyond top anchor → floor at max
};

// Effective seat price in the region's currency.
//   override>0 → use it verbatim (your real contract rate, wins over everything)
//   else       → regional list × (1 − expected EA discount for this headcount)
window.effectiveSeat = function(region, headcount, override){
  if(override > 0) return override;
  const list = MMURR_DATA.seat.list[region] ?? MMURR_DATA.seat.list.UK;
  return list * (1 - seatDiscount(headcount));
};

// ponytail: tiny self-check of the seat-discount math, runs only when opened
// locally (file:// or localhost), never in production.
if(['localhost','127.0.0.1',''].includes(location.hostname)){
  console.assert(Math.abs(seatDiscount(5000) - 0.20) < 1e-9, 'discount@5000 = 20%');
  console.assert(seatDiscount(50) === 0, 'no discount below first anchor');
  console.assert(seatDiscount(50000) === 0.30, 'discount floors at max');
  console.assert(Math.abs(effectiveSeat('UK',5000,0) - 19.76) < 1e-9, 'UK 5k seat ≈ £19.76');
  console.assert(effectiveSeat('UK',5000,15.5) === 15.5, 'manual override wins');
}
