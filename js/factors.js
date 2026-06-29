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

    // Seat price OVER TIME, per region (basket chart). Regional list in the
    // region's own currency for Microsoft & Google (they price per market);
    // Claude is USD-only and FX-converted (Anthropic bills USD worldwide).
    // Points hold until the next; a value of 0 = "not sold standalone" (gap).
    // [month, price]
    series: {
      copilot: { US:[['2023-11',30.00]], UK:[['2023-11',24.70]], EU:[['2023-11',28.10]] },
      gemini:  { US:[['2024-02',30],['2025-02',0],['2025-10',30]],   // add-on → discontinued → Gemini Enterprise
                 UK:[['2024-02',25],['2025-02',0],['2025-10',25]],
                 EU:[['2024-02',28],['2025-02',0],['2025-10',28]] },
      claudeUsd:[['2024-09',50],['2025-11',20]],                     // USD; enterprise w/ bundled tokens → flat seat + usage
    },
    // Snowflake Enterprise credit, billed in USD by deployment region. Stable.
    credit: { US:3.00, EU:3.60, UK:3.90 },
  },

  // Model lineage for the price-page decision chart (js/pricelab.js).
  // The licence price barely moves while the model underneath is swapped — the
  // markers carry that story. Token $ are blended 50/50 in/out, USD per 1M.
  // Anthropic per-query Wh are ASSUMPTIONS (vendor publishes none). (§4.1-4.3, §7)
  models: {
    tokPerPrompt: 1500,                 // tokens per standard prompt (editable, §4.5)
    defaultPpd: 20,                     // prompts / user / day (a standard working day)
    tierLagDays: [0, 18, 42, 210],      // Frontier program / priority / standard / premium (§4.2)
    cohorts: ['Frontier program (early)', 'Priority access', 'Standard access', 'M365 Premium (consumer)'],

    // Copilot/OpenAI backend that rides under the M365 licence (drives markers).
    // [date, label, blendedUSD/1M, Wh/prompt]
    backend: [
      ['2023-11','GPT-4 Turbo',20,3.0],['2024-05','GPT-4o',6.25,0.9],['2025-03','GPT-4.1',5.0,0.6],
      ['2025-08','GPT-5',5.6,0.34],['2025-12','GPT-5.2',7.9,0.31],['2026-03','GPT-5.4',8.75,0.55],
      ['2026-05','GPT-5.5',8.75,0.31],
    ],

    // Main-model axis: which lineage drives the API line + footprint overlay.
    // io=[inUSD/1M, outUSD/1M, current-model label]; steps=[date,label,blendedUSD/1M,Wh]
    defaultAxis: 'oa:auto',
    axis: {
      'oa:auto':  {group:'OpenAI', label:'Auto', conf:'SOURCED', io:[1.25,10,'GPT-5.5 (Auto)'],
        steps:[['2024-05','GPT-4o',6.25,0.9],['2025-03','GPT-4.1',5.0,0.6],['2025-08','GPT-5',5.6,0.34],
               ['2025-12','GPT-5.2',7.9,0.31],['2026-03','GPT-5.4',8.75,0.55],['2026-05','GPT-5.5',8.75,0.31]]},
      'oa:think': {group:'OpenAI', label:'Deep Thinking', conf:'SOURCED', io:[1.25,10,'GPT-5.5 Thinking'],
        steps:[['2024-12','o1',30,3.4],['2025-04','o3',20,3.0],['2025-08','GPT-5 Thinking',6.5,3.1],
               ['2025-12','GPT-5.2 Thinking',9,3.1],['2026-03','GPT-5.4 Thinking',9.5,5.5],['2026-05','GPT-5.5 Thinking',9.5,3.1]]},
      'oa:mini':  {group:'OpenAI', label:'Mini / o4', conf:'VERIFY', io:[0.25,2,'o4 / GPT-5 mini'],
        steps:[['2025-01','o3-mini',2.8,0.2],['2025-04','o4-mini',2.8,0.2],['2025-08','GPT-5 mini',1.1,0.15],['2026-03','GPT-5 mini',1.1,0.15]]},
      'gm:flash': {group:'Google', label:'Gemini Flash', conf:'VERIFY', io:[0.30,2.50,'Gemini 2.5 Flash'],
        steps:[['2024-05','1.5 Flash',0.70,0.30],['2024-08','1.5 Flash-002',0.19,0.24],['2025-06','2.5 Flash',1.40,0.24],['2026-05','2.5 Flash',5.25,0.24]]},
      'an:haiku': {group:'Anthropic', label:'Haiku', conf:'SOURCED', assumedWh:true, io:[1,5,'Haiku 4.5'],
        steps:[['2024-03','Haiku 3',0.75,0.25],['2025-10','Haiku 4.5',3.0,0.3]]},
      'an:sonnet':{group:'Anthropic', label:'Sonnet', conf:'SOURCED', assumedWh:true, io:[3,15,'Sonnet 4.6'],
        steps:[['2024-06','Sonnet 3.5',9.0,0.34],['2025-09','Sonnet 4.5',9.0,0.34],['2026-01','Sonnet 4.6',9.0,0.34]]},
      'an:opus':  {group:'Anthropic', label:'Opus', conf:'SOURCED', assumedWh:true, io:[5,25,'Opus 4.8'],
        steps:[['2024-03','Opus 3',45,0.6],['2025-08','Opus 4.1',45,0.6],['2026-01','Opus 4.6',15,0.5],['2026-05','Opus 4.8',15,0.5]]},
    },

    // Power Automate -> Copilot Credits transition (used in Phase 6). (§7.7)
    credits: { dualMode:['2025-11','2026-11'], unitUsd:0.01 },
  },

  // "Choose your stack" basket (js/prices.js). Every service is sized by SEATS
  // and a shared headline of average prompts/user/day. One standardised prompt
  // is assumed for every model so the same task can be priced and footprinted as
  // the engine under each licence changes — that drives the "cost if billed on
  // raw API" comparison line and the optional environmental view.
  basket: {
    workdaysPerMonth: 22,            // working days used to turn prompts/day into prompts/month
    ppdDefault: 20,                  // headline average prompts / user / day (shared across services)
    // billing: 'seat' = seats × regional seat price; 'credits' = qty × regional credit rate.
    // seatRule: 'regional' = region's own-currency list; 'fx' = USD list × FX anchor.
    // lineage: which models.axis entry prices the "same task on raw API" line + footprint.
    services: {
      copilot:  { name:'M365 Copilot',       billing:'seat',    color:'#e0b341', lineage:'oa:auto',  seatRule:'regional', seatKey:'copilot',  defaultQty:1000 },
      gemini:   { name:'Gemini (enterprise)',billing:'seat',    color:'#b98cff', lineage:'gm:flash', seatRule:'regional', seatKey:'gemini',   defaultQty:70, history:true },
      claude:   { name:'Claude (enterprise)',billing:'seat',    color:'#5bd1a6', lineage:'an:sonnet',seatRule:'fx',       seatKey:'claudeUsd',defaultQty:50, usageAddon:true },
      snowflake:{ name:'Snowflake (Enterprise)', billing:'credits', color:'#7db7ff', defaultQty:5000 },
    },
    // Single-sourced "what changed over time" copy, surfaced in the page dropdowns + sources.
    notes: {
      copilot:'Microsoft prices Copilot per market (US $30 · UK £24.70 · EU €28.10 list, enterprise add-on) and has held it since Nov 2023. The ≤300-seat Business SKU was cut $30→$21 on 1 Dec 2025; from Jul 2026 Copilot bundles into premium licences.',
      gemini:'Google’s seat price has churned: a $20/$30 Workspace add-on (2024) → folded into Workspace and the standalone add-on discontinued (Jan–Mar 2025, base plans +~17%) → relaunched as Gemini Enterprise at $30/seat (US; ~£25 UK · ~€28 EU) on 9 Oct 2025.',
      claude:'Anthropic prices in USD worldwide — a UK/EU card converts at transaction time, so Claude is shown FX-converted. Enterprise moved from high seat fees with bundled tokens (≈$40–200/seat) to a flat $20/seat + usage at API rates (renewals from Nov 2025; default for new agreements by Feb 2026).',
      snowflake:'Snowflake Enterprise credits are billed in USD by deployment region — ≈$3.00 (US-East) · ≈$3.60 (EU/Frankfurt) · ≈$3.90 (UK/London). Rates have held steady across the period.',
      prompt:'One standardised business prompt is assumed for every model (≈300-token answer + context ≈ 1,500 tokens). Cost = tokens × the model’s $/token; energy uses vendor per-prompt disclosures (Gemini 0.24 Wh, Copilot/GPT backend 0.31 Wh; Anthropic per-query Wh is a labelled assumption). The same task lets you compare model efficiency as the engine under each licence changes.',
    },
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
