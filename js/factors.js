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
// Grid intensity is NOT here — read it via gridFactor(region, td) below so no
// two copies can drift (coherence checklist §8.1).
window.MMURR_BASES = {
  car:   0.17,    // kgCO2e/km  — UK average car, all fuels (Defra 2025)
  phone: 0.0082,  // kgCO2e     — one full smartphone charge (US-grid basis, US EPA equivalencies)
  // Per-token energy, API-METERED VIEW ONLY (Gemini basis, ported from the old
  // dashboard). Never multiply by the per-prompt Wh figures — the two bases are
  // alternatives, not factors of each other (handbook §3).
  whPer1kTok: 0.70,
  // Water (WUE) defaults live on the region profiles below (UK 0.5 / EU 0.6 /
  // US 1.9) so every page reads the same figure. 1.9 stays available as the
  // labelled "global evaporative average" scenario on the data-centres page.
};

// --- Grid carbon intensity + T&D losses (v2 §3) ------------------------------
// Only source-backed adders are listed; regions without one disable the T&D
// toggle on-page rather than guessing. UK: DESNZ 2025 (+0.0185 ≈ +10.5%).
window.MMURR_TD_ADDER = { UK: 0.0185, US: null, EU: null, FR: null };
// Hosting-only country intensities (selectable carbon bases, not full region
// profiles — no currency/seat pricing attached).
window.MMURR_CI_EXTRA = { FR: { grid: 0.05, label: 'France', note: 'French grid (RTE/EEA)', conf: 'SOURCED' } };
// THE grid accessor: every page reads intensity through this — never a local
// hard-code — so the calculator, data-centres page and handbook cannot disagree.
window.gridFactor = function(code, tdOn){
  const base = (window.MMURR_DATA && MMURR_DATA.regions[code]) ? MMURR_DATA.regions[code].grid
             : MMURR_CI_EXTRA[code] ? MMURR_CI_EXTRA[code].grid : null;
  if(base == null) return null;
  const adder = MMURR_TD_ADDER[code];
  return base + ((tdOn && adder) ? adder : 0);
};

// --- FX helpers (v2 §9) -------------------------------------------------------
// GBP per USD by month from js/data/fx-history.js. Historical $ points convert
// at FX[ym] (nearest prior month); current prices at the latest month (pass a
// far-future ym). Non-GBP regions keep their editable anchors (US 1.00;
// EU 0.92 — no EUR series yet).
window.fxAt = function(regionCode, ym){
  const R = MMURR_DATA.regions[regionCode];
  if(regionCode !== 'UK' || !window.MMURR_FX) return R ? R.fx : 1;
  const S = MMURR_FX.series;
  if(S[ym] != null) return S[ym];
  let v = null;
  for(const k of MMURR_FX.months){ if(k <= ym) v = S[k]; else break; }
  return v != null ? v : S[MMURR_FX.months[0]];
};
// Consumer VAT applied when DISPLAYING usd_fx subscriptions (billed USD + local
// VAT at checkout). Regional-list consumer prices already include VAT, so this
// makes the two modes like-for-like. US shows ex-sales-tax by convention.
// EU 0.20 is an approximation (rates vary 17–27% by state) — VERIFY.
window.MMURR_VAT = { UK: 0.20, US: 0, EU: 0.20 };
window.subVat = function(regionCode){ const v = MMURR_VAT[regionCode]; return 1 + (v == null ? 0 : v); };

// --- Traffic mix (input share) — shared slider state (v2 §2) -----------------
// One global input/output split for EVERY model and licence. Price maths only:
// energy/water are per-prompt figures and MUST NOT react to this (v2 §2.5).
window.MMURR_MIX = (function(){
  let s = 0.5; const listeners = [];
  const clamp = v => Math.min(0.9, Math.max(0.1, v));
  return {
    get: () => s,
    set(v){ v = clamp(v); if(v === s) return; s = v; listeners.forEach(f => f(s)); },
    onChange: f => listeners.push(f),
  };
})();
// Blended $/1M for a lineage step at input share s. Steps carrying an io pair
// re-blend with the slider; steps without one are MIX-LOCKED at their stored
// 50/50 blend and flag it in tooltips ("historical point, 50/50 only").
window.stepPrice  = function(step, s){ const io = step[4]; return io ? s*io[0] + (1-s)*io[1] : step[2]; };
window.stepLocked = function(step){ return !step[4]; };

// --- Facility build-out anchors (data-centres page) --------------------------
// Hardware embodied is anchored PER MW OF IT LOAD (CIBSE TM65-based assessment
// via ADW Developments: 750–1,500 tCO2e/MW, midpoint 1,100; AI-dense halls
// likely >1,500). The old servers/MW × per-server method is kept as a labelled
// alternative preset — AI-accelerator servers ≈1.8–3.3 t each (Google LCA 2025).
window.MMURR_FACILITY = {
  hwEmbodiedPerMw: 1100,      // tCO2e per MW IT (SOURCED — ADW/CIBSE TM65; range 750–1500)
  refreshYears: 4,            // hardware refresh cycle (3–5 yr literature range)
  legacy: { serversPerMw: 1000, serverEmbodiedKg: 2500 },  // 'AI-accelerator servers × mass (Google LCA)' preset
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

  // WUE defaults: UK/EU reflect EED-reported European averages (WRc/MOSL 2026
  // ≈0.58; CNDCP target 0.4 for new builds in cool climates → 0.5 midpoint;
  // EU 0.6). 1.8–1.9 L/kWh is the GLOBAL evaporative-cooling average (Green
  // Grid via EESI) and remains the US default. All editable.
  regions: {
    // UK fx comes from js/data/fx-history.js (ECB monthly series, committed by
    // a repo Action; loaded before this file). The 0.78 literal is ONLY an
    // emergency fallback for a file:// copy missing the generated data file.
    UK: { label:'UK — London', flag:'🇬🇧', cur:'GBP', sym:'£',
          fx:(window.MMURR_FX ? MMURR_FX.latest : 0.78),
          grid:0.177, wue:0.5, pue:1.0,
          gridNote:'UK location-based grid (DESNZ/Defra 2025)', gridConf:'SOURCED',
          wueNote:'EED-derived European average (WRc/MOSL 2026) / CNDCP 0.4 midpoint', wueConf:'SOURCED' },
    US: { label:'US', flag:'🇺🇸', cur:'USD', sym:'$', fx:1.00,
          grid:0.36, wue:1.9, pue:1.0,
          gridNote:'US national output rate (EPA eGRID 2023 Rev 2; 2024 prelim −1.8%)', gridConf:'SOURCED',
          wueNote:'global evaporative-cooling average (Green Grid via EESI)', wueConf:'VERIFY' },
    EU: { label:'EU', flag:'🇪🇺', cur:'EUR', sym:'€', fx:0.92,
          grid:0.19, wue:0.6, pue:1.0,
          gridNote:'EU average grid (EEA 2024 early estimate, −9% YoY)', gridConf:'SOURCED',
          wueNote:'EED-reported European average ≈0.58 (WRc/MOSL 2026)', wueConf:'SOURCED' },
  },

  // FX = local currency per 1 USD. GBP is the ECB reference-rate monthly series
  // (js/data/fx-history.js, committed by a monthly Action); EUR stays an
  // editable anchor until an EUR series exists. (v2 §9)
  fxNote: 'GBP/USD is the ECB reference rate (monthly series committed by a repo Action — the site itself makes no runtime network calls); EUR is an editable anchor.',

  // Seat prices: regional LIST per seat/month, in that region's own currency.
  // M365 Copilot enterprise add-on. NOT FX-converted between regions. (§7.2)
  seat: {
    list:        { UK:24.70, US:30.00, EU:28.10 },   // enterprise add-on, regional list
    business:    { UK:18.50, US:21.00, EU:21.50 },   // ≤300-employee SKU
    frontierE7:  { UK:78.00, US:99.00, EU:90.00 },   // E7 'Frontier Suite' (model-a-renewal)
    geminiEnt:   { UK:25.00, US:30.00, EU:28.00 },   // Gemini Enterprise list (since Oct 2025)
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

  // Licence types for the decision chart (js/pricelab.js) AND the Blended
  // Usage basket (js/prices.js). ONE list spans enterprise per-licence SKUs
  // and personal/team subscriptions:
  //   kind:'enterprise'   — regional list price per licence (reads the seat
  //                         table via seatKey); discount:true applies the
  //                         headcount EA discount model.
  //   kind:'subscription' — USD flat fee (vendors bill USD worldwide), FX-
  //                         converted. usd is a price HISTORY
  //                         [[month, USD/mo], ...] so fee changes plot over
  //                         time. windowMTok = est. million tokens usable per
  //                         rolling window at full throttle. ASSUMPTION —
  //                         vendors publish no exact token limits; editable.
  // lagDays: days after a model's release before this licence type receives it
  // (replaces the old early-access cohort dropdown). lineage: which models.axis
  // entry rides under the licence (markers, API line, footprint).
  // name/color: how the type appears as a Blended Usage card; basketDup marks
  // types already represented by an existing basket service (no extra card).
  licenceTypes: {
    // models: axis lineages ACCESSIBLE under this licence — the Main-model
    //   dropdown greys out everything else. (Copilot includes Anthropic
    //   options since Sep 2025 — Microsoft 365 blog.)
    // local: optional fee history in a region's OWN currency, used when the
    //   vendor genuinely bills local list there (Google UK — sourced; Mistral
    //   EU — VERIFY €). Absent region → USD × FX (Anthropic & xAI bill USD
    //   worldwide — checked claude.com/pricing, USD-only + tax at checkout).
    // provider: groups the Blended Usage cards.
    // pricing_mode: how the £/€ figure arises —
    //   'regional_list' = the vendor bills a per-market list price (a point);
    //   'usd_fx'        = billed USD worldwide, lands at card FX (+ VAT for
    //                     consumer plans) — display as a BAND, not a point;
    //   'usd_metered'   = USD per unit, metered (API tokens, credits).
    list:        { label:'M365 Copilot (E5 add-on) — enterprise list', name:'M365 Copilot', provider:'Microsoft', group:'Enterprise (per licence)',
                   kind:'enterprise', seatKey:'list', discount:true, lagDays:42, lineage:'oa:auto', basketDup:true, pricing_mode:'regional_list',
                   models:['oa:auto','oa:think','oa:mini','an:sonnet','an:opus'] },
    frontierE7:  { label:'E7 Frontier Suite — early access', name:'E7 Frontier Suite', provider:'Microsoft', color:'#f2d38c', group:'Enterprise (per licence)',
                   kind:'enterprise', seatKey:'frontierE7', lagDays:0, lineage:'oa:auto', pricing_mode:'regional_list',
                   models:['oa:auto','oa:think','oa:mini','an:sonnet','an:opus'] },
    business:    { label:'Business + Copilot — ≤300 employees', name:'Business + Copilot', provider:'Microsoft', color:'#c9973f', group:'Enterprise (per licence)',
                   kind:'enterprise', seatKey:'business', lagDays:42, lineage:'oa:auto', pricing_mode:'regional_list',
                   models:['oa:auto','oa:think','oa:mini','an:sonnet','an:opus'] },
    gemEnterprise:{ label:'Gemini Enterprise — per licence', name:'Gemini Enterprise', provider:'Google', group:'Enterprise (per licence)',
                   kind:'enterprise', seatKey:'geminiEnt', lagDays:0, lineage:'gm:flash', basketDup:true, pricing_mode:'regional_list',
                   models:['gm:flash','gm:pro'] },
    chatgptPlus: { label:'ChatGPT Plus — personal', name:'ChatGPT Plus', provider:'OpenAI', color:'#9fd0ff', group:'Personal & team subscriptions',
                   kind:'subscription', usd:[['2023-02',20]], lagDays:0, lineage:'oa:auto', windowMTok:0.5, pricing_mode:'regional_list',
                   local:{ UK:[['2023-02',20]] },                        // fixed ≈£20 incl VAT at UK checkout (SOURCED)
                   models:['oa:auto','oa:think','oa:mini'] },
    claudePro:   { label:'Claude Pro — personal', name:'Claude Pro', provider:'Anthropic', color:'#3fb489', group:'Personal & team subscriptions',
                   kind:'subscription', usd:[['2023-09',20]], lagDays:0, lineage:'an:sonnet', windowMTok:0.5, pricing_mode:'usd_fx',
                   models:['an:haiku','an:sonnet','an:opus','an:fable'] },
    claudeMax5:  { label:'Claude Max 5× — personal', name:'Claude Max 5×', provider:'Anthropic', color:'#8fe3c4', group:'Personal & team subscriptions',
                   kind:'subscription', usd:[['2025-04',100]], lagDays:0, lineage:'an:sonnet', windowMTok:2.5, pricing_mode:'usd_fx',
                   models:['an:haiku','an:sonnet','an:opus','an:fable'] },
    claudeMax20: { label:'Claude Max 20× — personal', name:'Claude Max 20×', provider:'Anthropic', color:'#2e8f6f', group:'Personal & team subscriptions',
                   kind:'subscription', usd:[['2025-04',200]], lagDays:0, lineage:'an:opus',  windowMTok:10, pricing_mode:'usd_fx',
                   models:['an:haiku','an:sonnet','an:opus','an:fable'] },
    geminiPro:   { label:'Google AI Pro — personal', name:'Google AI Pro', provider:'Google', color:'#d3b3ff', group:'Personal & team subscriptions',
                   kind:'subscription', usd:[['2024-02',19.99]], lagDays:0, lineage:'gm:pro', windowMTok:0.5, pricing_mode:'regional_list',
                   local:{ UK:[['2024-02',18.99]] },                     // gemini.google UK list (SOURCED Jul 2026)
                   models:['gm:flash','gm:pro'] },
                   // Google One AI Premium (Feb 2024) → renamed Google AI Pro (Apr 2026); price held
    geminiUltra: { label:'Google AI Ultra — personal', name:'Google AI Ultra', provider:'Google', color:'#9a6cf0', group:'Personal & team subscriptions',
                   kind:'subscription', usd:[['2025-05',249.99],['2026-05',200]], lagDays:0, lineage:'gm:pro', windowMTok:6, pricing_mode:'regional_list',
                   local:{ UK:[['2025-05',234.99],['2026-05',189.99]] },  // £189.99 now SOURCED; £234.99 launch VERIFY
                   models:['gm:flash','gm:pro'] },
                   // top tier shown; the 5× Ultra tier (£79.99/$100, May 2026) is not modelled
    grokSuper:   { label:'SuperGrok (xAI) — personal', name:'SuperGrok', provider:'xAI', color:'#e8e8e8', group:'Personal & team subscriptions',
                   kind:'subscription', usd:[['2025-02',30]], lagDays:0, lineage:'xa:grok', windowMTok:0.6, pricing_mode:'usd_fx',
                   models:['xa:grok'] },
    grokHeavy:   { label:'SuperGrok Heavy (xAI) — personal', name:'SuperGrok Heavy', provider:'xAI', color:'#9aa3b2', group:'Personal & team subscriptions',
                   kind:'subscription', usd:[['2025-07',300]], lagDays:0, lineage:'xa:grok', windowMTok:6, pricing_mode:'usd_fx',
                   models:['xa:grok'] },
    mistralPro:  { label:'Le Chat Pro (Mistral) — personal', name:'Le Chat Pro', provider:'Mistral', color:'#ff9d45', group:'Personal & team subscriptions',
                   kind:'subscription', usd:[['2025-02',14.99]], lagDays:0, lineage:'mi:large', windowMTok:0.4, pricing_mode:'usd_fx',
                   local:{ EU:[['2025-02',14.99]] },                     // EUR toggle on mistral.ai (VERIFY €)
                   models:['mi:large'] },
    mistralTeam: { label:'Le Chat Team (Mistral) — per user', name:'Le Chat Team', provider:'Mistral', color:'#ffbf80', group:'Personal & team subscriptions',
                   kind:'subscription', usd:[['2025-05',24.99]], lagDays:0, lineage:'mi:large', windowMTok:0.4, pricing_mode:'usd_fx',
                   local:{ EU:[['2025-05',24.99]] },                     // EUR toggle on mistral.ai (VERIFY €)
                   models:['mi:large'] },
  },

  // Subscription usage benchmark: 100% usage = exhausting windowMTok in EVERY
  // rolling window, restarting after the gap → floor(24/(window+gap)) maxed
  // windows a day (5h + 1h → 4/day). Editable anchors; weekly caps can bind
  // before this window maths does — flagged on-page in the Cost logic note.
  subscriptionWindows: { windowHours: 5, gapHours: 1 },

  // Model lineage for the price-page decision chart (js/pricelab.js).
  // The licence price barely moves while the model underneath is swapped — the
  // markers carry that story. Token $ are blended 50/50 in/out, USD per 1M.
  // Anthropic per-query Wh are ASSUMPTIONS (vendor publishes none). (§4.1-4.3, §7)
  models: {
    tokPerPrompt: 1500,                 // tokens per standard prompt (editable, §4.5)
    defaultPpd: 20,                     // prompts / user / day (a standard working day)
    // (early-access cohorts removed — release lag now lives on each licence type as lagDays)

    // Copilot/OpenAI backend that rides under the M365 licence (drives markers).
    // [date, label, blendedUSD/1M, Wh/prompt]
    // Step format: [date, label, blended50 USD/1M, Wh/prompt, io?] where
    // io = [inUSD/1M, outUSD/1M] backfilled from public price archives (v2 §2.3).
    // Steps WITHOUT an io pair are mix-locked: the traffic-mix slider cannot
    // re-blend them and they display "historical point, 50/50 only".
    backend: [
      ['2023-11','GPT-4 Turbo',20,3.0,[10,30]],['2024-05','GPT-4o',6.25,0.9,[2.5,10]],['2025-03','GPT-4.1',5.0,0.6,[2,8]],
      ['2025-08','GPT-5',5.6,0.34,[1.25,10]],['2025-12','GPT-5.2',7.9,0.31,[1.75,14]],['2026-03','GPT-5.4',8.75,0.55,[2.5,15]],
      // GPT-5.5 launched 23 Apr 2026 at $5/$30 — a straight 2× on GPT-5.4 ($2.50/$15).
      // GPT-5.6 (Sol/Terra/Luna) GA 9 Jul 2026; Sol is the flagship backend at the
      // same $5/$30. The feed never touches backend, so these anchors carry the price.
      ['2026-04','GPT-5.5',17.5,0.31,[5,30]],['2026-07','GPT-5.6 Sol',17.5,0.31,[5,30]],
    ],

    // Main-model axis: which lineage drives the API line + footprint overlay.
    // io=[inUSD/1M, outUSD/1M, current-model label]; steps=[date,label,blendedUSD/1M,Wh]
    defaultAxis: 'oa:auto',
    axis: {
      'oa:auto':  {group:'OpenAI', label:'Auto', conf:'SOURCED', io:[5,30,'GPT-5.6 Sol (Auto)'],
        steps:[['2024-05','GPT-4o',6.25,0.9,[2.5,10]],['2025-03','GPT-4.1',5.0,0.6,[2,8]],['2025-08','GPT-5',5.6,0.34,[1.25,10]],
               ['2025-12','GPT-5.2',7.9,0.31,[1.75,14]],['2026-03','GPT-5.4',8.75,0.55,[2.5,15]],['2026-04','GPT-5.5',17.5,0.31,[5,30]],
               ['2026-07','GPT-5.6 Sol',17.5,0.31,[5,30]]]},
      // GPT-5.x Thinking tiers are not separately priced API SKUs — those steps
      // stay mix-locked (no io pair); o1/o3 archive prices are public. GPT-5.6
      // Thinking (VERIFY) rides the Sol backend from Jul 2026.
      'oa:think': {group:'OpenAI', label:'Deep Thinking', conf:'SOURCED', io:[5,30,'GPT-5.6 Thinking'],
        steps:[['2024-12','o1',30,3.4,[15,60]],['2025-04','o3',20,3.0,[10,40]],['2025-08','GPT-5 Thinking',6.5,3.1],
               ['2025-12','GPT-5.2 Thinking',9,3.1],['2026-03','GPT-5.4 Thinking',9.5,5.5],['2026-05','GPT-5.5 Thinking',9.5,3.1],
               ['2026-07','GPT-5.6 Thinking',9.5,3.1]]},
      // Cheap tier: o3/o4-mini → GPT-5 mini → GPT-5.6 Luna ($0.20/$1.20 after the
      // 30 Jul 2026 −80% cut). Removed the duplicate 'GPT-5 mini' placeholder step.
      'oa:mini':  {group:'OpenAI', label:'Mini / Luna', conf:'VERIFY', io:[0.20,1.20,'GPT-5.6 Luna'],
        steps:[['2025-01','o3-mini',2.8,0.2,[1.1,4.4]],['2025-04','o4-mini',2.8,0.2,[1.1,4.4]],['2025-08','GPT-5 mini',1.1,0.15,[0.25,2]],['2026-07','GPT-5.6 Luna',0.70,0.12,[0.20,1.20]]]},
      // Flash moved fast: 2.5 Flash → 3.5 Flash ($1.50/$9, May 2026) → 3.6 Flash
      // ($1.50/$7.50, Aug 2026). Removed the duplicate '2.5 Flash' placeholder.
      'gm:flash': {group:'Google', label:'Gemini Flash', conf:'VERIFY', io:[1.50,7.50,'Gemini 3.6 Flash'],
        steps:[['2024-05','1.5 Flash',0.70,0.30,[0.35,1.05]],['2024-08','1.5 Flash-002',0.19,0.24,[0.075,0.30]],['2025-06','2.5 Flash',1.40,0.24,[0.30,2.50]],['2026-05','3.5 Flash',5.25,0.24,[1.50,9.00]],['2026-08','3.6 Flash',4.50,0.24,[1.50,7.50]]]},
      'gm:pro':   {group:'Google', label:'Gemini Pro', conf:'VERIFY', assumedWh:true, io:[2.00,12.00,'Gemini 3.1 Pro'],
        steps:[['2024-02','1.5 Pro',7.0,0.6,[3.5,10.5]],['2025-03','2.5 Pro',5.6,0.4,[1.25,10]],['2025-11','3 Pro',7.0,0.4,[2,12]],['2026-05','3.1 Pro',7.0,0.4,[2,12]]]},
      'xa:grok':  {group:'xAI', label:'Grok', conf:'VERIFY', assumedWh:true, io:[2.00,6.00,'Grok 4.5'],
        steps:[['2025-02','Grok 3',9.0,0.4,[3,15]],['2025-07','Grok 4',9.0,0.4,[3,15]],['2026-03','Grok 4.3',1.9,0.35,[1.25,2.5]],['2026-07','Grok 4.5',4.0,0.35,[2,6]]]},
      'mi:large': {group:'Mistral', label:'Large / Medium', conf:'VERIFY', assumedWh:true, io:[0.50,1.50,'Large 3'],
        // Large 3 (Dec 2025) lists $0.50/$1.50 — mistral.ai/pricing agrees with the
        // LiteLLM feed; the old 4.0 anchor carried Large 2's price forward.
        steps:[['2024-07','Large 2',4.0,0.3,[2,6]],['2025-05','Medium 3',1.2,0.25,[0.4,2]],['2025-12','Large 3',1.0,0.3,[0.5,1.5]]]},
      'an:haiku': {group:'Anthropic', label:'Haiku', conf:'SOURCED', assumedWh:true, io:[1,5,'Haiku 4.5'],
        steps:[['2024-03','Haiku 3',0.75,0.25,[0.25,1.25]],['2025-10','Haiku 4.5',3.0,0.3,[1,5]]]},
      // Sonnet held $3/$15 across 3.5 → 4.5 → 4.6 (the "price held while the model
      // was swapped" story — kept intentionally); Sonnet 5 (Jul 2026) cut it to
      // $2/$10 on intro pricing through 31 Aug 2026.
      'an:sonnet':{group:'Anthropic', label:'Sonnet', conf:'SOURCED', assumedWh:true, io:[2,10,'Sonnet 5'],
        steps:[['2024-06','Sonnet 3.5',9.0,0.34,[3,15]],['2025-09','Sonnet 4.5',9.0,0.34,[3,15]],['2026-01','Sonnet 4.6',9.0,0.34,[3,15]],['2026-07','Sonnet 5',6.0,0.34,[2,10]]]},
      'an:opus':  {group:'Anthropic', label:'Opus', conf:'SOURCED', assumedWh:true, io:[5,25,'Opus 4.8'],
        steps:[['2024-03','Opus 3',45,0.6,[15,75]],['2025-08','Opus 4.1',45,0.6,[15,75]],['2026-01','Opus 4.6',15,0.5,[5,25]],['2026-05','Opus 4.8',15,0.5,[5,25]]]},
      // Fable 5 (Jul 2026) — new Claude 5 flagship above Opus, $10/$50 (LiteLLM). Wh assumed.
      'an:fable': {group:'Anthropic', label:'Fable', conf:'SOURCED', assumedWh:true, io:[10,50,'Fable 5'],
        steps:[['2026-07','Fable 5',30,0.6,[10,50]]]},
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
      copilot:  { name:'M365 Copilot',       provider:'Microsoft', billing:'seat',    color:'#e0b341', lineage:'oa:auto',  seatRule:'regional', seatKey:'copilot',  defaultQty:1000, pricing_mode:'regional_list' },
      gemini:   { name:'Gemini (enterprise)',provider:'Google',    billing:'seat',    color:'#b98cff', lineage:'gm:flash', seatRule:'regional', seatKey:'gemini',   defaultQty:70, pricing_mode:'regional_list' },
      claude:   { name:'Claude (enterprise)',provider:'Anthropic', billing:'seat',    color:'#5bd1a6', lineage:'an:sonnet',seatRule:'fx',       seatKey:'claudeUsd',defaultQty:50, usageAddon:true, pricing_mode:'usd_fx' },
      snowflake:{ name:'Snowflake (Enterprise)', provider:'Snowflake', billing:'credits', color:'#7db7ff', defaultQty:5000, pricing_mode:'usd_metered' },
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

// --- Referenced current API prices (js/data/api-prices.js, optional) --------
// The lineage steps in models.axis are hand-set HISTORY; when the weekly-
// refreshed feed is present (script tag loaded before this file), overwrite
// each lineage's LATEST price point and the io[] display prices with the
// referenced values. Same 50/50 in/out blend basis. Feed absent → anchors
// stand unchanged (file:// safe).
(function(){
  const ref = window.MMURR_API_PRICES;
  if(!ref || !ref.models) return;
  for(const [k, p] of Object.entries(ref.models)){
    const ax = MMURR_DATA.models.axis[k]; if(!ax) continue;
    ax.io[0] = p.in; ax.io[1] = p.out;
    const last = ax.steps[ax.steps.length-1];
    last[2] = +((p.in + p.out)/2).toFixed(2);   // stored 50/50 blend (mix applied at read time)
    last[4] = [p.in, p.out];                    // io pair → the mix slider can re-blend it
  }
})();

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

// --- Adaptive-unit formatters (shared — moved from prices.js so every page
// reads the same units instead of each rolling its own). Small enough to
// live inline; kg/L pick t/kg/g and m³/L/mL so a small footprint never
// displays as a bare "0".
window.fmtEnergy = function(wh){
  if(wh>=1e6)  return (wh/1e6).toLocaleString(undefined,{maximumFractionDigits:1})+' MWh';
  if(wh>=1000) return (wh/1000).toLocaleString(undefined,{maximumFractionDigits:1})+' kWh';
  return Math.round(wh).toLocaleString()+' Wh';
};
window.fmtKg = function(kg){
  if(kg>=1000) return (kg/1000).toLocaleString(undefined,{maximumFractionDigits:2})+' t';
  if(kg>=1)    return kg.toLocaleString(undefined,{maximumFractionDigits:kg<10?1:0})+' kg';
  return Math.round(kg*1000).toLocaleString()+' g';
};
window.fmtL = function(L){
  if(L>=1000) return (L/1000).toLocaleString(undefined,{maximumFractionDigits:2})+' m³';
  if(L>=1)    return Math.round(L).toLocaleString()+' L';
  return Math.round(L*1000).toLocaleString()+' mL';
};

// ponytail: tiny self-check of the seat-discount math, runs only when opened
// locally (file:// or localhost), never in production.
if(['localhost','127.0.0.1',''].includes(location.hostname)){
  console.assert(Math.abs(seatDiscount(5000) - 0.20) < 1e-9, 'discount@5000 = 20%');
  console.assert(seatDiscount(1) === 0, 'no discount at the first anchor (1 licence)');
  console.assert(seatDiscount(50000) === 0.30, 'discount floors at max');
  console.assert(Math.abs(effectiveSeat('UK',5000,0) - 19.76) < 1e-9, 'UK 5k seat ≈ £19.76');
  console.assert(effectiveSeat('UK',5000,15.5) === 15.5, 'manual override wins');
  // licence→model compatibility map must reference real lineages
  for(const [k,t] of Object.entries(MMURR_DATA.licenceTypes)){
    console.assert(MMURR_DATA.models.axis[t.lineage], `licence ${k}: lineage exists in axis`);
    console.assert((t.models||[]).length>0 && t.models.every(m=>MMURR_DATA.models.axis[m]), `licence ${k}: models[] all exist in axis`);
    console.assert(t.models.includes(t.lineage), `licence ${k}: default lineage is allowed on the licence`);
  }
}
