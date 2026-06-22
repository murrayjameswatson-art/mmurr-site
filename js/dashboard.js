/* ----------------------------------------------------------------------------
   mmurr.ai — AI Carbon Calculator
   Client-side only. Estimates GHG / energy / water from AI & data-platform use.
   Shared CO2 bases (grid, car, phone) come from js/factors.js (loaded first) so
   they reconcile with the data-centre page. Everything stays user-editable.

   Features:
   - Three input modes per service: Usage / Cost / Seats (gated by billing model)
   - Explicit metered vs licensed billing model
   - "Asset Manager" (Aviva) quick-fill profile
   - Sourced, editable default factors + a sources & methodology table
---------------------------------------------------------------------------- */

// --- Period scaling -------------------------------------------------------
const WORKDAYS = {day:1, week:5,  month:22, year:260}; // for per-seat usage
const MONTHS   = {day:1/30, week:7/30, month:1, year:12}; // for seat licence cost

// --- Default conversion factors (all editable in the UI) ------------------
// Per-unit energy defaults are all-in facility figures where a real measurement
// exists (Gemini), so PUE defaults to 1.0 to avoid double-counting.
const FACTORS = {
  grid:        {label:'UK grid (kgCO₂e/kWh)',        val:MMURR_BASES.grid, note:'UK location-based grid intensity (DESNZ/Defra 2025).'}, // shared base (§4)
  pue:         {label:'PUE (facility overhead)',      val:1.0,  note:'Facility energy ÷ IT energy. 1.0 here because the Gemini figure is already all-in.'},
  gemini_wh:   {label:'Gemini (Wh/prompt)',           val:0.24, note:'Median Gemini text prompt, all-in facility measurement (Google 2025).'},
  gemini_wh1k: {label:'Gemini (Wh/1k tokens)',        val:0.70, note:'Per-token LLM-inference basis, aligned to Gemini’s measured figure.'},
  copilot_wh:  {label:'Copilot (Wh/message)',         val:0.34, note:'OpenAI’s stated average query, used as a Copilot proxy (Microsoft publishes none).'},
  snow_wh:     {label:'Snowflake (Wh/credit)',        val:500,  note:'1 credit ≈ 1 node-hour of compute; mid-range server draw. Own estimate.'},
  cortex_wh1k: {label:'Cortex/Coco (Wh/1k tokens)',   val:0.70, note:'LLM-inference basis, aligned to Gemini per-token.'},
  pa_wh:       {label:'Power Automate (Wh/credit)',   val:10,   note:'Engineering estimate for an AI Builder / flow credit.'},
  water:       {label:'Cooling water (L/kWh)',        val:1.8,  note:'Typical on-site water-use effectiveness (WUE).'},
  embodied:    {label:'Embodied uplift (%)',          val:15,   note:'Scope-3 hardware manufacturing as a share of operational emissions (~10–25%).'},
  reasoningX:  {label:'Reasoning multiplier (×)',     val:10,   note:'Extra energy for reasoning models (o-series, Thinking, R1) vs a standard query.'},
};

// --- Default unit prices (GBP) & per-seat intensity -----------------------
const PRICES = {
  gemini_gbp_1m:  {label:'Gemini API (£/1M tokens)',   val:0.30,  note:'Blended input+output list price; varies by model and FX.'},
  snow_gbp_cr:    {label:'Snowflake (£/credit)',       val:2.30,  note:'List credit price; varies by edition, region and contract.'},
  cortex_gbp_1m:  {label:'Cortex/Coco (£/1M tokens)',  val:0.80,  note:'Token price for Cortex LLM functions.'},
  copilot_seat:   {label:'Copilot (£/seat/month)',     val:24.70, note:'M365 Copilot UK list, enterprise add-on. Used only for Cost→seats.'},
  copilot_mpd:    {label:'Copilot msgs/user/day',      val:20,    note:'Assumed active messages per licensed user per working day.'},
  gemini_seat:    {label:'Gemini (£/seat/month)',      val:21.00, note:'Gemini for Workspace seat list price.'},
  gemini_mpd:     {label:'Gemini msgs/user/day',       val:15,    note:'Assumed active prompts per licensed user per working day.'},
};

// --- Service config -------------------------------------------------------
// billing: 'metered' (cost→usage by price) | 'licensed' (seats→usage by intensity)
// modesAllowed controls which input modes a service exposes.
const SERVICES = {
  gemini: {
    name:'Gemini', billing:'licensed', modesAllowed:['usage','cost','seats'],
    usageLabel:'Total tokens (in + out)', usageHint:'Prompt + completion tokens across Gemini API / app usage.',
    badge:'API metered · seats licensed',
  },
  snowflake: {
    name:'Snowflake (incl. Coco / Cortex AI)', billing:'metered', modesAllowed:['usage','cost'],
    usageLabel:'Warehouse / compute credits', usageHint:'Compute credits. Cortex (Coco) LLM functions are billed separately in tokens.',
    second:{key:'cortex', label:'Cortex / Coco AI tokens'},
    badge:'metered',
  },
  copilot: {
    name:'Copilot (incl. Power Automate)', billing:'licensed', modesAllowed:['usage','cost','seats'],
    usageLabel:'Copilot messages / interactions', usageHint:'M365 Copilot chat. Seats are licensed per user — usage is estimated from messages/user/day.',
    second:{key:'pa', label:'Power Automate / AI Builder credits'},
    badge:'seats licensed · PA metered',
  },
};

// --- Live state -----------------------------------------------------------
const STATE = {
  period:'month',
  reasoning:false, lifecycle:false,
  // per-service: {mode, usage, cost, seats, second:{usage}}
  svc:{
    gemini:{mode:'usage', usage:0, cost:0, seats:0},
    snowflake:{mode:'usage', usage:0, cost:0, second:0},
    copilot:{mode:'usage', usage:0, cost:0, seats:0, second:0},
  },
  factors:Object.fromEntries(Object.entries(FACTORS).map(([k,v])=>[k,v.val])),
  prices:Object.fromEntries(Object.entries(PRICES).map(([k,v])=>[k,v.val])),
};

// --- Profiles -------------------------------------------------------------
// Asset Manager = Aviva-shaped: ~1000 Copilot seats, 50 Gemini seats,
// top-tier Snowflake credits + heavy Cortex usage. Illustrative & editable.
const PROFILES = {
  personal:   {gemini:{mode:'usage',usage:50000}, snowflake:{mode:'usage',usage:0,second:0}, copilot:{mode:'usage',usage:200,second:0}},
  developer:  {gemini:{mode:'usage',usage:2000000}, snowflake:{mode:'usage',usage:400,second:50000}, copilot:{mode:'usage',usage:1500,second:500}},
  team:       {gemini:{mode:'seats',seats:10}, snowflake:{mode:'usage',usage:4000,second:2000000}, copilot:{mode:'seats',seats:25}},
  enterprise: {gemini:{mode:'seats',seats:200}, snowflake:{mode:'usage',usage:25000,second:50000000}, copilot:{mode:'seats',seats:500}},
  asset:      {gemini:{mode:'seats',seats:50}, snowflake:{mode:'usage',usage:40000,second:200000000}, copilot:{mode:'seats',seats:1000}},
};

const $ = s=>document.querySelector(s);
const num = (id)=>{const v=parseFloat($(id)?.value);return isNaN(v)?0:v;};
// Generic count formatter — only for unitless tallies (tokens, prompts) where a
// k/M prefix reads naturally. NOT for physical units (use the named ones below).
const fmt = (n,u)=>{
  if(n>=1e6) return (n/1e6).toFixed(2)+' M'+u;
  if(n>=1e3) return (n/1e3).toFixed(2)+' k'+u;
  if(n>=1)   return n.toFixed(n<10?2:0)+' '+u;
  if(n>0)    return n.toFixed(3)+' '+u;
  return '0 '+u;
};

// Energy: common power-of-1000 names, value in kWh → Wh / kWh / MWh / GWh / TWh.
// No stacked prefixes ("kkWh" can't happen).
const fmtEnergy = (kWh)=>{
  for(const [u,d] of [['TWh',1e9],['GWh',1e6],['MWh',1e3],['kWh',1]])
    if(kWh>=d) return (kWh/d).toFixed(2)+' '+u;
  if(kWh>0) return (kWh*1000).toFixed(0)+' Wh';
  return '0 kWh';
};

// CO₂ mass: value in kg → g / kg / tonnes. Tonnes is the reporting unit and stays
// terminal — beyond 1000 t we switch to scientific-notation tonnes, never kilotonnes.
const fmtMass = (kg)=>{
  if(kg>=1e6) return (kg/1e3).toExponential(2)+' t';
  if(kg>=1e3) return (kg/1e3).toFixed(2)+' t';
  if(kg>=1)   return kg.toFixed(2)+' kg';
  if(kg>0)    return (kg*1e3).toFixed(0)+' g';
  return '0 kg';
};

// Water: value in litres → mL / L / m³. m³ is terminal (no larger unit).
const fmtWater = (L)=>{
  if(L>=1e3) return (L/1e3).toFixed(2)+' m³';
  if(L>=1)   return L.toFixed(L<10?2:0)+' L';
  if(L>0)    return (L*1000).toFixed(0)+' mL';
  return '0 L';
};

// ponytail: unit-formatter self-check, runs only when opened locally.
if(['localhost','127.0.0.1',''].includes(location.hostname)){
  console.assert(fmtEnergy(1500)==='1.50 MWh', 'energy MWh');
  console.assert(fmtEnergy(2.5e6)==='2.50 GWh', 'energy GWh');
  console.assert(fmtMass(1500)==='1.50 t', 'mass tonnes');
  console.assert(fmtMass(1.5e6)==='1.50e+3 t', 'mass sci-notation tonnes');
  console.assert(fmtMass(0.5)==='500 g', 'mass grams');
  console.assert(fmtWater(2500)==='2.50 m³', 'water m³');
}

// --- Build the service cards ---------------------------------------------
function renderServices(){
  const host = $('#services'); host.innerHTML='';
  for(const [key,cfg] of Object.entries(SERVICES)){
    const st = STATE.svc[key];
    const card = document.createElement('div'); card.className='svc';
    const billClass = cfg.billing==='licensed'?'licensed':'metered';
    card.innerHTML = `
      <div class="svc-head">
        <h3>${cfg.name}</h3>
        <span class="badge ${billClass}">${cfg.badge}</span>
      </div>
      <div class="modes" data-svc="${key}">
        ${cfg.modesAllowed.map(m=>`<button data-mode="${m}" class="${st.mode===m?'on':''}">${m[0].toUpperCase()+m.slice(1)}</button>`).join('')}
      </div>
      <div class="fields ${cfg.second?'':'one'}" id="fields-${key}"></div>
    `;
    host.appendChild(card);
    renderFields(key);
  }
}

function renderFields(key){
  const cfg = SERVICES[key], st = STATE.svc[key], box = $('#fields-'+key);
  let html='';
  if(st.mode==='usage'){
    html += field(`${key}-usage`, cfg.usageLabel, st.usage, cfg.usageHint);
  } else if(st.mode==='cost'){
    html += field(`${key}-cost`, `Spend this ${STATE.period} (£)`, st.cost,
      cfg.billing==='licensed'
        ? 'For licensed seats, spend ÷ seat price → seats → estimated messages.'
        : 'Spend ÷ unit price → usage.');
  } else if(st.mode==='seats'){
    html += field(`${key}-seats`, 'Licensed seats (users)', st.seats,
      'Active usage estimated as seats × messages/user/day × working days.');
  }
  // secondary metered input (Cortex tokens, PA credits) always shown as usage
  if(cfg.second){
    html += field(`${key}-second`, cfg.second.label, st.second||0,
      key==='snowflake'?'Cortex / Coco LLM tokens (metered separately).':'Power Automate / AI Builder credits.');
  }
  box.className = 'fields '+(cfg.second?'':'one');
  box.innerHTML = html + `<div class="derived" id="derived-${key}"></div>`;
}

function field(id,label,val,hint){
  return `<div><label class="f" for="${id}">${label}</label>
    <input type="number" id="${id}" min="0" step="any" value="${val||''}" placeholder="0">
    ${hint?`<div class="hint">${hint}</div>`:''}</div>`;
}

// --- Factors & prices panels ---------------------------------------------
function renderFactors(){
  $('#factorGrid').innerHTML = Object.entries(FACTORS).map(([k,v])=>
    `<div><label class="f" for="fac-${k}">${v.label}</label>
     <input type="number" id="fac-${k}" step="any" value="${STATE.factors[k]}">
     ${v.note?`<div class="hint">${v.note}</div>`:''}</div>`).join('');
  $('#priceGrid').innerHTML = Object.entries(PRICES).map(([k,v])=>
    `<div><label class="f" for="pri-${k}">${v.label}</label>
     <input type="number" id="pri-${k}" step="any" value="${STATE.prices[k]}">
     ${v.note?`<div class="hint">${v.note}</div>`:''}</div>`).join('');
}

// --- Resolve a service to active usage units ------------------------------
// returns {geminiTokens, geminiPrompts, copilotMsgs, credits, cortexTokens, paCredits}
function resolveUsage(key){
  const st=STATE.svc[key], P=STATE.prices;
  const out={geminiTokens:0, geminiPrompts:0, copilotMsgs:0, credits:0, cortexTokens:0, paCredits:0};

  if(key==='gemini'){
    if(st.mode==='usage') out.geminiTokens = st.usage;
    else if(st.mode==='cost') out.geminiTokens = P.gemini_gbp_1m>0 ? (st.cost/P.gemini_gbp_1m)*1e6 : 0;
    else if(st.mode==='seats') out.geminiPrompts = st.seats * P.gemini_mpd * WORKDAYS[STATE.period];
  }
  if(key==='snowflake'){
    if(st.mode==='usage') out.credits = st.usage;
    else if(st.mode==='cost') out.credits = P.snow_gbp_cr>0 ? st.cost/P.snow_gbp_cr : 0;
    out.cortexTokens = st.second||0; // Cortex always metered-token
  }
  if(key==='copilot'){
    if(st.mode==='usage') out.copilotMsgs = st.usage;
    else if(st.mode==='cost'){
      const seats = (P.copilot_seat*MONTHS[STATE.period])>0 ? st.cost/(P.copilot_seat*MONTHS[STATE.period]) : 0;
      out.copilotMsgs = seats * P.copilot_mpd * WORKDAYS[STATE.period];
    }
    else if(st.mode==='seats') out.copilotMsgs = st.seats * P.copilot_mpd * WORKDAYS[STATE.period];
    out.paCredits = st.second||0;
  }
  return out;
}

// --- Core calculation -----------------------------------------------------
function calculate(){
  const F=STATE.factors;
  const rx = STATE.reasoning ? F.reasoningX : 1;

  let g=resolveUsage('gemini'), s=resolveUsage('snowflake'), c=resolveUsage('copilot');

  // IT energy in Wh — reasoning multiplier applies to LLM token/message energy
  // but NOT to Snowflake compute credits (those are compute, not inference).
  let wh = 0;
  wh += (g.geminiTokens/1000)*F.gemini_wh1k*rx;
  wh += g.geminiPrompts*F.gemini_wh*rx;
  wh += s.credits*F.snow_wh;                       // compute — not reasoning-scaled
  wh += (s.cortexTokens/1000)*F.cortex_wh1k*rx;
  wh += c.copilotMsgs*F.copilot_wh*rx;
  wh += c.paCredits*F.pa_wh;

  const itKWh = wh/1000;
  const facilityKWh = itKWh * F.pue;
  const co2kg = facilityKWh * F.grid;              // operational
  const embodiedKg = co2kg * (F.embodied/100);
  const totalKg = co2kg + (STATE.lifecycle?embodiedKg:0);
  const waterL = STATE.lifecycle ? facilityKWh * F.water : 0;

  // comparisons — shared bases from factors.js (§4 reconciliation)
  const km = totalKg/MMURR_BASES.car;
  const charges = totalKg/MMURR_BASES.phone;

  // render
  $('#rEnergy').textContent = fmtEnergy(facilityKWh);
  $('#rCO2').textContent    = fmtMass(co2kg);
  $('#rTotal').textContent  = fmtMass(totalKg);
  $('#rPeriod').textContent = 'per '+STATE.period;
  $('#compare').innerHTML = totalKg>0
    ? `That's ≈ <b>${km.toFixed(km<10?1:0)} km</b> of average car driving, or <b>${Math.round(charges)}</b> smartphone charges, per ${STATE.period}.`
    : 'Enter some usage above, or pick a Quick fill profile.';

  $('#lifecycleBox').style.display = STATE.lifecycle?'grid':'none';
  if(STATE.lifecycle){
    $('#rWater').textContent = fmtWater(waterL);
    $('#rEmbodied').textContent = fmtMass(embodiedKg);
    $('#rKm').textContent = (km).toFixed(km<10?1:0)+' km';
  }

  // per-service derived readouts (show what cost/seats resolved to)
  setDerived('gemini', g.geminiTokens?`≈ ${fmt(g.geminiTokens,'tokens')}`:(g.geminiPrompts?`≈ ${Math.round(g.geminiPrompts).toLocaleString()} prompts`:''));
  setDerived('snowflake', s.credits?`≈ ${Math.round(s.credits).toLocaleString()} credits`:'');
  setDerived('copilot', c.copilotMsgs?`≈ ${Math.round(c.copilotMsgs).toLocaleString()} messages`:'');
}
function setDerived(key,txt){const el=$('#derived-'+key); if(el) el.textContent=txt;}

// --- Read all inputs into STATE ------------------------------------------
function syncFromInputs(){
  for(const key of Object.keys(SERVICES)){
    const st=STATE.svc[key];
    if(st.mode==='usage') st.usage=num('#'+key+'-usage');
    if(st.mode==='cost')  st.cost =num('#'+key+'-cost');
    if(st.mode==='seats') st.seats=num('#'+key+'-seats');
    if(SERVICES[key].second) st.second=num('#'+key+'-second');
  }
  for(const k of Object.keys(FACTORS)) STATE.factors[k]=num('#fac-'+k);
  for(const k of Object.keys(PRICES)) STATE.prices[k]=num('#pri-'+k);
  STATE.reasoning=$('#reasoning').checked;
  STATE.lifecycle=$('#lifecycle').checked;
}

// --- Apply a profile ------------------------------------------------------
function applyProfile(name){
  const p=PROFILES[name]; if(!p) return;
  for(const [key,vals] of Object.entries(p)){
    Object.assign(STATE.svc[key], {usage:0,cost:0,seats:0,second:0}, vals);
  }
  renderServices(); calculate();
}

// --- Shareable link (encode state in URL) --------------------------------
function shareLink(){
  syncFromInputs();
  const payload=btoa(encodeURIComponent(JSON.stringify({p:STATE.period,svc:STATE.svc,f:STATE.factors,r:STATE.reasoning,l:STATE.lifecycle})));
  const url=location.origin+location.pathname+'#s='+payload;
  navigator.clipboard?.writeText(url);
  $('#share').textContent='Link copied ✓';
  setTimeout(()=>$('#share').textContent='Copy shareable link',1800);
}
function loadFromHash(){
  if(!location.hash.startsWith('#s=')) return;
  try{
    const d=JSON.parse(decodeURIComponent(atob(location.hash.slice(3))));
    STATE.period=d.p||STATE.period; Object.assign(STATE.svc,d.svc||{});
    Object.assign(STATE.factors,d.f||{}); STATE.reasoning=!!d.r; STATE.lifecycle=!!d.l;
    $('#reasoning').checked=STATE.reasoning; $('#lifecycle').checked=STATE.lifecycle;
    [...$('#period').children].forEach(b=>b.classList.toggle('on',b.dataset.p===STATE.period));
  }catch(e){/* ignore bad hash */}
}

// --- Wire up --------------------------------------------------------------
function init(){
  renderServices(); renderFactors(); loadFromHash(); renderServices(); renderFactors();

  $('#period').addEventListener('click',e=>{
    if(e.target.dataset.p){[...$('#period').children].forEach(b=>b.classList.remove('on'));
      e.target.classList.add('on'); STATE.period=e.target.dataset.p; syncFromInputs(); calculate();}
  });
  $('#profiles').addEventListener('click',e=>{
    if(e.target.dataset.profile) applyProfile(e.target.dataset.profile);
  });
  document.addEventListener('click',e=>{
    const m=e.target.closest('.modes button'); if(!m) return;
    const key=m.parentElement.dataset.svc;
    syncFromInputs(); STATE.svc[key].mode=m.dataset.mode;
    [...m.parentElement.children].forEach(b=>b.classList.remove('on')); m.classList.add('on');
    renderFields(key); calculate();
  });
  document.addEventListener('input',e=>{
    if(e.target.matches('input[type=number]')){ syncFromInputs(); calculate(); }
  });
  $('#reasoning').addEventListener('change',()=>{syncFromInputs();calculate();});
  $('#lifecycle').addEventListener('change',()=>{syncFromInputs();calculate();});
  $('#calc').addEventListener('click',()=>{syncFromInputs();calculate();});
  $('#share').addEventListener('click',shareLink);

  calculate();
}
document.addEventListener('DOMContentLoaded',init);
