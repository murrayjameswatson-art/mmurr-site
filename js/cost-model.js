/* ----------------------------------------------------------------------------
   mmurr.ai — AI cost-of-service engine (window.MMURR_COST)

   Ported from the first-principles working model (ai-cost-model.md §4). Answers
   two questions off ONE physical quantity — accelerator-seconds per token:
     unit(p)      → fully-loaded $/1M tokens for one model (6 cost layers)
                    + energy (kWh), carbon (kg), water (L) per 1M tokens
     company(c,p) → whole-company annual $ + tonnes CO2e + litres water

   Pure functions, no DOM, no deps — same static/global pattern as factors.js
   (NOT an ES module, so it works opened as a file:// and on GitHub Pages).

   Load order on costmodel.html: this file, then js/costlab.js (the page UI).

   THE TWO LOAD-BEARING, UNDISCLOSED INPUTS (both are sliders in the UI):
     served  (T_s)  tokens served over a model's life — swings the $ answer ~10x
     rnd     (m)    R&D multiple over the shipped training run
   Physical serving cost (silicon+facility+energy+network) is firmer (~+-30%);
   the dollar TOTAL is +-order-of-magnitude on those two. Environmental answers
   are governed by geography (grid/water), not engineering.

   Every value below is an editable anchor. Verify before load-bearing use.
--------------------------------------------------------------------------- */
(function(){
  // when the YP/CO anchors below were last checked against disclosures
  const DATA_AS_OF = '2026-08';

  // ---- year baselines: a standard frontier chat model, served at scale ------
  // r tok/s/GPU · gpuW · cap $ · pue · elec $/kWh · grid gCO2/kWh · wue onsite
  // L/kWh · wcf offsite L/kWh · train $ · served tokens · host overhead · life
  // yr · util · rnd multiple · dcW $/W shell. (md §3.5)
  const YP = {
    2023:{r:120, gpuW:400, cap:20000, pue:1.15, elec:.075, grid:410, wue:.80, wcf:2.0, train:40e6,  served:3e13, host:.70, life:4, util:.50, rnd:2.0, dcW:9},
    2024:{r:300, gpuW:700, cap:30000, pue:1.12, elec:.075, grid:400, wue:.55, wcf:1.9, train:80e6,  served:1e14, host:.65, life:4, util:.55, rnd:2.0, dcW:10},
    2025:{r:550, gpuW:700, cap:32000, pue:1.11, elec:.078, grid:385, wue:.45, wcf:1.85,train:150e6, served:3e14, host:.62, life:4, util:.60, rnd:2.0, dcW:11},
    2026:{r:900, gpuW:1000,cap:35000, pue:1.10, elec:.080, grid:370, wue:.40, wcf:1.8, train:300e6, served:8e14, host:.60, life:5, util:.65, rnd:2.0, dcW:12},
  };

  // ---- model archetypes: multipliers on the year baseline (md §3.5) ---------
  const ARCH = {
    standard: {r:1,   train:1,   served:1},
    reasoning:{r:.55, train:1.2, served:.7},
    efficient:{r:3,   train:.25, served:1.5},
    large:    {r:.5,  train:3,   served:.8},
  };

  // ---- company presets: avg IT power MW + R&D $B/yr (+ grid/wue override) ----
  // ORDER-OF-MAGNITUDE estimates back-solved against disclosed capex — labelled
  // as such in the UI. grid/wue null → use the year baseline. (md §3.5)
  const CO = {
    openai:   {label:'OpenAI',        itMW:1500, rndB:10, grid:null, wue:null, anchor:'~$50B compute 2026; ~$20B ARR end-25'},
    anthropic:{label:'Anthropic',     itMW:900,  rndB:5,  grid:null, wue:null, anchor:'~$15B/yr compute'},
    xai:      {label:'xAI (Grok)',    itMW:1300, rndB:4,  grid:400,  wue:.6,   anchor:'Colossus Memphis ~1GW+, gas-heavy interim'},
    google:   {label:'Google (Gemini)',itMW:2500,rndB:8,  grid:120,  wue:.25,  anchor:'part of $600B+ hyperscaler capex; clean grid'},
    meta:     {label:'Meta (Llama)',  itMW:2000, rndB:6,  grid:300,  wue:.35,  anchor:'open-weight; large owned fleet'},
    mistral:  {label:'Mistral',       itMW:70,   rndB:.5, grid:60,   wue:.3,   anchor:'EU lab, small fleet, low-carbon FR grid'},
  };

  // ---- per-model unit economics: $ / 1e6 tokens (md §3.2, eq 10.1) ----------
  function unit(p){
    const g   = 1e6 / p.r / 3600;                        // GPU-hours per 1M tokens
    const kSi = p.cap / (p.life*8760*p.util);            // silicon $/GPU-hr
    const facW= p.gpuW*(1+p.host)*p.pue;                 // grid W per GPU under load
    const kDc = (p.dcW*facW) / (12*8760*p.util);         // DC shell $/GPU-hr (12-yr life)
    const kWh = g * p.gpuW/1000 * (1+p.host) * p.pue;    // grid kWh per 1M tokens
    const L = {
      silicon:  g*kSi,
      facility: g*kDc,
      energy:   kWh*p.elec,
      network:  0,
      training: p.train/p.served*1e6,
      rnd:      0,
    };
    L.network = 0.10*(L.silicon+L.facility+L.energy);
    L.rnd     = L.training*p.rnd;
    const total = Object.values(L).reduce((a,b)=>a+b,0);
    // physical serving cost = the layers that match the site's existing "token
    // cost" (silicon+facility+energy+network); soft = training+rnd
    const physical = L.silicon+L.facility+L.energy+L.network;
    return { L, total, physical, soft: total-physical,
             kWh, co2: kWh*p.grid/1000, water: kWh*(p.wue+p.wcf), gpuHr:g };
  }

  // ---- whole-company annual: $ / yr, tonnes CO2/yr, litres/yr (md §3.4) -----
  function company(c, p){
    const gridMW = c.itMW*p.pue;
    const kWhYr  = gridMW*1000*8760;                     // avg power -> kWh/yr
    const itPerGpuKW = p.gpuW*(1+p.host)/1000;
    const gpus   = (c.itMW*1000)/itPerGpuKW;
    const grid = (c.grid!=null) ? c.grid : p.grid;
    const wue  = (c.wue!=null)  ? c.wue  : p.wue;
    const L = {
      silicon:  gpus*p.cap/p.life,
      facility: gridMW*1e6*p.dcW/12,
      energy:   kWhYr*p.elec,
      network:  0,
      rnd:      c.rndB*1e9,                              // training folded in
    };
    L.network = 0.10*(L.silicon+L.facility+L.energy);
    const total = Object.values(L).reduce((a,b)=>a+b,0);
    return { L, total, kWhYr, co2: kWhYr*grid/1000/1000, water: kWhYr*(wue+p.wcf), gpus, gridMW };
  }

  // ---- effective params after year + archetype (+ user overrides) -----------
  function params(year, arch, overrides){
    const b = Object.assign({}, YP[year]);
    if (arch){ const a = ARCH[arch]; b.r*=a.r; b.train*=a.train; b.served*=a.served; }
    return Object.assign(b, overrides || {});
  }

  window.MMURR_COST = { YP, ARCH, CO, unit, company, params, DATA_AS_OF };

  // ---- ponytail: one runnable self-check, local only (md §4) ----------------
  // Validates the physical chain against independent published anchors — it is
  // checked against them, not tuned to them.
  if(['localhost','127.0.0.1',''].includes(location.hostname)){
    const p = params(2026, 'standard'), r = unit(p);
    const perAnswerWh = r.kWh/1e6*700*1000;              // Wh per 700-tok answer
    console.assert(r.kWh>0.1 && r.kWh<3,            'energy/1M in 0.1–3 kWh');
    console.assert(perAnswerWh>0.05 && perAnswerWh<1.5,'per-answer Wh within ~3x of Google 0.24');
    console.assert(r.total>0.3 && r.total<8,       'unit total $0.3–8 /1M');
    console.assert(Math.abs(Object.values(r.L).reduce((a,b)=>a+b,0)-r.total)<1e-9, 'layers sum to total');
    console.assert(Math.abs(r.physical+r.soft-r.total)<1e-9, 'physical + soft = total');
    const oa = company(CO.openai, YP[2026]);
    console.assert(oa.total>5e9 && oa.total<40e9,  'OpenAI $5–40B/yr');
    console.assert(oa.co2>1e6 && oa.co2<15e6,      'OpenAI CO2 1–15 Mt/yr');
  }
})();
