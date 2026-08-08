/* ----------------------------------------------------------------------------
   mmurr.ai — AI Impact Calculator · "Blended Usage" basket
   Build a stack from ANY licence type on the page — the enterprise per-licence
   services AND the personal/team subscriptions from the decision chart above.
   Cards are collapsed expandables to keep the page uncluttered. Every service
   carries its OWN usage control, matching the chart's logic: enterprise cards
   meter prompts/user/day; subscription cards meter % of the plan's estimated
   capacity (windowMTok × maxed rolling windows). Client-side except Chart.js.
---------------------------------------------------------------------------- */

// --- Timeline (matched to the decision chart above) -------------------------
function monthList(start, end){
  const out=[]; let [y,m]=start.split('-').map(Number); const [ey,em]=end.split('-').map(Number);
  while(y<ey || (y===ey && m<=em)){ out.push(`${y}-${String(m).padStart(2,'0')}`); m++; if(m>12){m=1;y++;} }
  return out;
}
const START='2024-01', END='2026-08';
const MONTHS = monthList(START,END);
const D = s => { const [y,m]=s.split('-').map(Number); return new Date(y,m-1,1).getTime(); };
const TS = MONTHS.map(D);

const B   = MMURR_DATA.basket;
const M   = MMURR_DATA.models;
const LT  = MMURR_DATA.licenceTypes;
const SW  = MMURR_DATA.subscriptionWindows;
const WPD = Math.floor(24/(SW.windowHours+SW.gapHours));   // maxed windows / day
const WD  = B.workdaysPerMonth;
const TPP = M.tokPerPrompt;

// --- Shared state ------------------------------------------------------------
let metric = 'cost';                          // cost | energy | co2 | water
let showApi = false;                          // "cost if billed on raw API" line

// --- Per-service state ---------------------------------------------------------
// Existing basket services (licences default to 1; Snowflake keeps its credits)
const SVC = {};
for(const [k,c] of Object.entries(B.services)){
  SVC[k] = {
    // Snowflake stays available but out of the default stack — 5,000 credits
    // (~£15k/mo) would flatten every 1-licence line to the x-axis.
    ...c, key:k, on: c.billing==='seat',
    qty: c.billing==='seat' ? 1 : c.defaultQty,
    ppd: B.ppdDefault,        // per-service prompts/user/day (enterprise cards)
    basis:'prompts', tokensMo:0, usage:false,
    ro:{on:false, q0:0, q1:0, m0:START, m1:END},
  };
}
// Every other licence type from the decision chart becomes a selectable card
// (basketDup types are already represented by a card above).
for(const [k,t] of Object.entries(LT)){
  if(t.basketDup) continue;
  const key = 'lt:'+k;
  if(t.kind==='subscription'){
    SVC[key] = { key, name:t.name, color:t.color, provider:t.provider, billing:'sub', lt:t,
      on:false, qty:1, pct:50, ro:{on:false,q0:0,q1:0,m0:START,m1:END} };
  } else {
    SVC[key] = { key, name:t.name, color:t.color, provider:t.provider, billing:'seat',
      seatFlat:t.seatKey, lineage:t.lineage,
      on:false, qty:1, ppd:B.ppdDefault, basis:'prompts', tokensMo:0, usage:false,
      ro:{on:false,q0:0,q1:0,m0:START,m1:END} };
  }
}
const maxPpdSub = s => s.lt.windowMTok*1e6/TPP*WPD;                 // 100% usage, prompts/day
const lineageOf = s => s.billing==='sub' ? s.lt.lineage : s.lineage;

// Pricing-mode chip (§0.3): how the local price arises — regional list price,
// USD billed worldwide landing at card FX (a band, not a point), or metered USD.
function modeChip(mode){
  if(!mode) return '';
  const M = {
    regional_list:['regional list','The vendor bills a per-market list price — a point, not an FX conversion.'],
    usd_fx:      ['USD×FX','Billed USD worldwide; the local price lands at card FX (+VAT for consumer plans) — a band, not a point.'],
    usd_metered: ['USD metered','Metered in USD per unit (tokens/credits), converted for display.'],
  }[mode];
  return M ? `<span class="badge mode-${mode}" title="${M[1]}">${M[0]}</span>` : '';
}
window.MMURR_MODE_CHIP = modeChip;   // reused by the decision chart (pricelab.js)

// --- Calculator-wide environmental state (v2 §3+§4) ---------------------------
// hosting: where the prompt is served (the carbon basis) — vendor fleet by
// default, or a country grid via gridFactor(), or a custom intensity.
// td: T&D losses toggle — only applied where a source-backed adder exists (UK),
// so it is only enabled for country bases that have one.
window.MMURR_ENV = (function(){
  let hosting = 'vendor', custom = gridFactor('UK', false), td = false;
  const listeners = [];
  const notify = () => listeners.forEach(f => f());
  return {
    get hosting(){ return hosting; }, get td(){ return td; }, get custom(){ return custom; },
    setHosting(v){ hosting = v; if(!this.tdAllowed()) td = false; notify(); },
    setCustom(v){ custom = v; notify(); },
    setTd(v){ td = !!v && this.tdAllowed(); notify(); },
    onChange: f => listeners.push(f),
    tdAllowed(){ return hosting !== 'vendor' && hosting !== 'custom' && MMURR_TD_ADDER[hosting] != null; },
    // carbon intensity (kgCO2e/kWh) for a provider under the current settings
    ci(provider){
      if(hosting === 'vendor') return MMURR_HOSTING.ciFor(provider);
      if(hosting === 'custom') return custom;
      return gridFactor(hosting, td);
    },
    basisLabel(provider){
      if(hosting === 'custom') return `custom ${custom} kgCO₂e/kWh`;
      if(hosting === 'vendor'){
        const v = MMURR_HOSTING.vendors[provider];
        return (v && v.fleet_ci != null)
          ? `${provider} fleet ≈${v.fleet_ci} (${v.confidence}, as of ${v.as_of})`
          : `${MMURR_HOSTING.fallback.ci} — ${MMURR_HOSTING.fallback.note}`;
      }
      const lab = MMURR_DATA.regions[hosting] ? MMURR_DATA.regions[hosting].label : MMURR_CI_EXTRA[hosting].label;
      return `${lab} grid ${gridFactor(hosting, td)}${td && MMURR_TD_ADDER[hosting] ? ' (incl. T&D)' : ''}`;
    },
  };
})();

// Read the shareable state from the URL hash (#mix=70) before first draw.
(function(){
  const m = /(?:^|[#&;])mix=(\d+)/.exec(location.hash || '');
  if(m) MMURR_MIX.set(parseInt(m[1], 10) / 100);
})();

// --- Series helpers -----------------------------------------------------------
// forward-fill [ [month,val], ... ] across every month; null before first point.
function fill(points){
  const out={}; let last=null, pi=0;
  for(const mth of MONTHS){ while(pi<points.length && points[pi][0]<=mth){ last=points[pi][1]; pi++; } out[mth]=last; }
  return out;
}
// per-licence price (region currency) each month. 0 in the data = "not sold" →
// null, so discontinued periods (e.g. Gemini Feb–Sep 2025) show as REAL GAPS.
function seatFill(s, region){
  if(s.seatFlat){   // renewal-model SKUs (E7, Business, Gemini Ent): current list, held flat
    const tbl = MMURR_DATA.seat[s.seatFlat]; const p = tbl[region] ?? tbl.UK;
    return MONTHS.map(()=>p);
  }
  if(s.seatRule==='fx'){
    // Enterprise seats billed USD: each month converts at ITS OWN ECB monthly
    // rate (v2 §9.2). B2B prices stay ex-VAT.
    const usd = fill(MMURR_DATA.seat.series.claudeUsd);
    return MONTHS.map(m => usd[m]==null ? null : usd[m]*fxAt(region,m));
  }
  const tbl = MMURR_DATA.seat.series[s.seatKey];
  const f = fill(tbl[region] || tbl.UK);
  return MONTHS.map(m => (f[m]==null || f[m]===0) ? null : f[m]);
}
// subscription fee history; null before the plan launched. Uses the vendor's
// LOCAL list history when one exists for this region (e.g. Google bills £ in
// the UK), otherwise USD × the month's OWN ECB FX (v2 §9.2) — plus consumer
// VAT for usd_fx plans (billed USD + tax at checkout; regional consumer lists
// already include it), so the two pricing modes compare like-for-like (§9.4).
function subFill(s){
  const region = MMURR_REGION.get();
  const loc = s.lt.local && s.lt.local[region];
  const f = fill(loc || s.lt.usd);
  const vat = (!loc && s.lt.pricing_mode==='usd_fx') ? subVat(region) : 1;
  return MONTHS.map(m => f[m]==null ? null : (loc ? f[m] : f[m]*fxAt(region,m)*vat));
}
// latest lineage step ≤ t (clamped to first). [date,label,blended$/1M,Wh/prompt]
function stepAt(key, t){ const st=M.axis[key].steps; let c=st[0]; for(const s of st){ if(D(s[0])<=t) c=s; } return c; }

// quantity (licences/credits) at month index i — flat, or a linear rollout ramp.
function qtyAt(s, i){
  if(!s.ro.on) return s.qty;
  const a=Math.max(0,MONTHS.indexOf(s.ro.m0)), b=Math.max(a,MONTHS.indexOf(s.ro.m1));
  if(i<a) return 0;
  if(i>=b) return s.ro.q1;
  return s.ro.q0 + (s.ro.q1-s.ro.q0)*(i-a)/(b-a||1);
}
// prompts / month at month index i. Subscriptions run the window logic on
// calendar days (the rolling windows don't stop at weekends); enterprise
// licences use workdays, as before.
function promptsAt(s, i){
  if(s.billing==='sub') return qtyAt(s,i) * (s.pct/100*maxPpdSub(s)) * 30;
  if(s.basis==='tokens') return s.tokensMo*1e6 / TPP;
  return qtyAt(s,i) * s.ppd * WD;
}

// --- Render the service cards (collapsed expandables) ------------------------
function renderServices(){
  const host=document.getElementById('tracks'); host.innerHTML='';
  // cards grouped by provider, matching the colour families
  const ORDER=['Microsoft','OpenAI','Google','Anthropic','xAI','Mistral','Snowflake'];
  const groups={}; for(const [k,s] of Object.entries(SVC)) (groups[s.provider||'Other'] ??= []).push([k,s]);
  for(const prov of [...ORDER, ...Object.keys(groups).filter(p=>!ORDER.includes(p))]){
    if(!groups[prov]) continue;
    const gh=document.createElement('div'); gh.className='trk-group'; gh.textContent=prov; host.appendChild(gh);
    for(const [k,s] of groups[prov]){
    const kind = s.billing;   // 'seat' | 'sub' | 'credits'
    const qtyLabel = kind==='credits' ? 'Credits / month' : 'Licences';
    const slider = kind==='seat' ? `
        <label class="f" for="sl-${k}">Prompts / user / day <output id="slo-${k}">${s.ppd}</output></label>
        <input type="range" id="sl-${k}" min="2" max="120" value="${s.ppd}" class="svc-range">`
      : kind==='sub' ? `
        <label class="f" for="sl-${k}">Usage — % of plan capacity <output id="slo-${k}">${s.pct}% ≈ ${Math.round(s.pct/100*maxPpdSub(s)).toLocaleString()}/day</output></label>
        <input type="range" id="sl-${k}" min="0" max="100" value="${s.pct}" class="svc-range">`
      : '';
    const d=document.createElement('details'); d.className='svc'+(s.on?'':' off'); d.dataset.key=k;
    d.innerHTML = `
      <summary class="thead">
        <span class="dot" style="background:${s.color}"></span>
        <span class="nm">${s.name}</span>
        <span class="badge ${kind==='credits'?'metered':'licensed'}">${kind==='sub'?'personal':kind==='credits'?'credits':'licence'}</span>
        <span class="inflag" id="in-${k}" title="in the basket">${s.on?'✓':''}</span>
      </summary>
      <div class="svc-inner">
        <label class="chk"><input type="checkbox" ${s.on?'checked':''} data-on="${k}" aria-label="Include ${s.name}"> Include in basket</label>
        <label class="f" for="q-${k}">${qtyLabel}</label>
        <input type="number" id="q-${k}" min="0" step="any" value="${s.qty}">
        ${slider}
        <button type="button" class="more" data-more="${k}" aria-expanded="false">More detail ▾</button>
        <div class="more-body" id="more-${k}" hidden>
          ${kind==='seat' ? `
          <label class="f" for="basis-${k}">Usage basis</label>
          <select id="basis-${k}" class="svc-sel">
            <option value="prompts" selected>Prompts (licences × slider/day)</option>
            <option value="tokens">Direct — million tokens / month</option>
          </select>
          <div id="tokwrap-${k}" hidden><label class="f" for="tok-${k}">Million tokens / month</label>
            <input type="number" id="tok-${k}" min="0" step="any" value="0"></div>
          ${s.usageAddon ? `<label class="chk"><input type="checkbox" id="use-${k}"> Bill usage at API rates <em>on top</em> of the licence</label>` : ''}
          ` : ''}
          <label class="chk"><input type="checkbox" id="ro-${k}"> Specify rollout (start → end)</label>
          <div id="rowrap-${k}" class="ro-grid" hidden>
            <div><label class="f">Start ${kind==='credits'?'credits':'licences'}</label><input type="number" id="ro-q0-${k}" min="0" step="any" value="0"></div>
            <div><label class="f">End ${kind==='credits'?'credits':'licences'}</label><input type="number" id="ro-q1-${k}" min="0" step="any" value="${s.qty}"></div>
            <div><label class="f">Start month</label><input type="month" id="ro-m0-${k}" min="${START}" max="${END}" value="${START}"></div>
            <div><label class="f">End month</label><input type="month" id="ro-m1-${k}" min="${START}" max="${END}" value="${END}"></div>
          </div>
        </div>
      </div>`;
      host.appendChild(d);
    }
  }
}

// --- Compute series -----------------------------------------------------------
// Carbon uses the served-from basis (MMURR_ENV.ci — vendor fleet / country grid
// / custom, T&D-aware); energy & water stay per-prompt × region WUE and MUST
// NOT react to the traffic-mix slider (v2 §2.5).
function metricFromEnergyWh(wh, R, provider){
  const kwh = wh/1000;
  if(metric==='energy') return wh;                            // Wh / month
  if(metric==='co2')    return kwh*R.pue*MMURR_ENV.ci(provider); // kg CO₂e / month
  if(metric==='water')  return kwh*R.wue;                     // L / month
  return 0;
}
// per-licence price row for a service (null months = not sold / not launched)
function priceRow(s, region){
  if(s.billing==='credits') return null;
  return s.billing==='sub' ? subFill(s) : seatFill(s, region);
}
function compute(){
  const R=MMURR_REGION.data(), region=MMURR_REGION.get();
  const datasets=[]; const totals=MONTHS.map(()=>0);
  const rows={}; for(const [k,s] of Object.entries(SVC)) rows[k]=priceRow(s,region);
  let apiSeries=null;

  for(const [k,s] of Object.entries(SVC)){
    if(!s.on) continue;
    let series;
    if(metric==='cost'){
      if(s.billing==='credits'){
        const rateUsd = MMURR_DATA.seat.credit[region] ?? MMURR_DATA.seat.credit.US;
        series = MONTHS.map((m,i)=> +(qtyAt(s,i)*rateUsd*fxAt(region,m)).toFixed(2));
      } else {
        series = MONTHS.map((m,i)=>{ const p=rows[k][i]; if(p==null) return null;
          let c = qtyAt(s,i)*p;
          if(s.billing==='seat' && s.usage && s.usageAddon){ const Mt=promptsAt(s,i)*TPP/1e6; c += Mt*stepPrice(stepAt(s.lineage,TS[i]),MMURR_MIX.get())*fxAt(region,m); }
          return +c.toFixed(2); });
      }
    } else { // environmental — prompt-driven services only
      if(s.billing==='credits'){ continue; }
      series = MONTHS.map((m,i)=>{ if(rows[k][i]==null) return null;
        const wh = promptsAt(s,i) * stepAt(lineageOf(s),TS[i])[3];
        return +metricFromEnergyWh(wh,R,s.provider).toFixed(metric==='energy'?0:2); });
    }
    series.forEach((v,i)=>{ if(v!=null) totals[i]+=v; });
    datasets.push({ label:s.name, data:series, borderColor:s.color, backgroundColor:s.color+'55',
      fill:false, stack:'basket', tension:.15, pointRadius:0, borderWidth:2, spanGaps:false });
  }

  // "cost if billed on raw API" — the same prompt volume metered, vs the licences.
  if(metric==='cost' && showApi){
    apiSeries = MONTHS.map((m,i)=>{ let c=0, any=false;
      for(const [k,s] of Object.entries(SVC)){ if(!s.on || s.billing==='credits') continue;
        if(rows[k][i]==null) continue; any=true;
        c += promptsAt(s,i)*TPP/1e6 * stepPrice(stepAt(lineageOf(s),TS[i]),MMURR_MIX.get()) * fxAt(region,m); }
      return any ? +c.toFixed(2) : null; });
    datasets.push({ label:'Cost if billed on raw API', data:apiSeries, borderColor:'#7db7ff',
      backgroundColor:'transparent', fill:false, stack:'api', borderDash:[6,4], borderWidth:2, pointRadius:0, tension:.15 });
  }

  if(document.getElementById('showTotal').checked && datasets.some(d=>d.stack==='basket')){
    datasets.push({ label:'Total', data:totals.map(v=>+v.toFixed(2)), borderColor:'#ffffff',
      backgroundColor:'transparent', fill:false, stack:'total', borderDash:[5,4], borderWidth:2, pointRadius:0, tension:.15 });
  }
  return {datasets, totals};
}

// --- Stats + axis labelling ----------------------------------------------------
function fmtVal(v){
  const R=MMURR_REGION.data();
  if(metric==='cost')  return R.sym+Math.round(v).toLocaleString();
  if(metric==='energy')return Math.round(v).toLocaleString()+' Wh';
  if(metric==='co2')   return v.toLocaleString(undefined,{maximumFractionDigits:1})+' kg';
  return v.toLocaleString(undefined,{maximumFractionDigits:0})+' L';
}
function yLabel(){
  const R=MMURR_REGION.data();
  return metric==='cost' ? `Monthly cost (${R.cur||'local'})`
       : metric==='energy'? 'Energy — Wh / month'
       : metric==='co2'  ? 'CO₂e — kg / month'
       :                    'Water — L / month';
}
function setStats(totals, labels){
  const lab = metric==='cost'?'cost':metric==='energy'?'energy':metric==='co2'?'CO₂e':'water';
  document.getElementById('sStartLab').textContent = `Monthly ${lab} — `;
  document.getElementById('sNowLab').textContent   = `Monthly ${lab} — now`;
  const valid=totals.map((v,i)=>[labels[i],v]).filter(([,v])=>v>0);
  if(!valid.length){ ['sStart','sNow','sChange'].forEach(id=>document.getElementById(id).textContent='—'); return; }
  const [d0,v0]=valid[0], [,vN]=valid[valid.length-1];
  document.getElementById('sStart').textContent=fmtVal(v0);
  document.getElementById('sStartDate').textContent=d0;
  document.getElementById('sNow').textContent=fmtVal(vN);
  const pct=v0? ((vN-v0)/v0*100):0;
  document.getElementById('sChange').textContent=(pct>=0?'+':'')+pct.toFixed(0)+'%';
  document.getElementById('sChange').style.color = pct<=0?'var(--accent)':'var(--warn)';
}

// --- Draw ----------------------------------------------------------------------
let chart;
function draw(){
  const R=MMURR_REGION.data();
  const {datasets,totals}=compute();
  // scaling x-axis: trim leading months where NO enabled service has data yet,
  // so a stack of late-launching plans fills the chart instead of leaving dead
  // space. Totals (and the "start" stat) follow the trimmed range.
  let first=MONTHS.length-1;
  for(const d of datasets){ if(d.stack!=='basket') continue;
    const i=d.data.findIndex(v=>v!=null); if(i>=0 && i<first) first=i; }
  if(!datasets.some(d=>d.stack==='basket')) first=0;
  const labels=MONTHS.slice(first);
  for(const d of datasets) d.data=d.data.slice(first);
  const totalsT=totals.slice(first);
  setStats(totalsT, labels);
  const cfg={
    type:'line', data:{labels, datasets},
    options:{
      responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{labels:{color:'#9aa3b2',boxWidth:12,font:{size:11}}},
        tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmtVal(c.parsed.y)}`}},
      },
      scales:{
        x:{ticks:{color:'#6b7280',maxTicksLimit:10,font:{size:10}},grid:{color:'#222732'}},
        y:{stacked:false, beginAtZero:true, ticks:{color:'#6b7280',font:{size:10},
             callback:v=> metric==='cost' ? R.sym+(v>=1000?(+(v/1000).toFixed(1))+'k':v) : v.toLocaleString()},
           grid:{color:'#222732'},title:{display:true,text:yLabel(),color:'#9aa3b2',font:{size:11}}},
      },
    },
  };
  if(chart) chart.destroy();
  chart=new Chart(document.getElementById('chart'),cfg);
  renderSnapshot();   // keep the per-service cost/footprint cards in sync with the chart
}

// --- Per-service snapshot: cost vs footprint for every model, at "now" --------
function fmtEnergy(wh){
  if(wh>=1e6)  return (wh/1e6).toLocaleString(undefined,{maximumFractionDigits:1})+' MWh';
  if(wh>=1000) return (wh/1000).toLocaleString(undefined,{maximumFractionDigits:1})+' kWh';
  return Math.round(wh).toLocaleString()+' Wh';
}
// adaptive units so small footprints never display as a bare "0"
function fmtKg(kg){
  if(kg>=1000) return (kg/1000).toLocaleString(undefined,{maximumFractionDigits:2})+' t';
  if(kg>=1)    return kg.toLocaleString(undefined,{maximumFractionDigits:kg<10?1:0})+' kg';
  return Math.round(kg*1000).toLocaleString()+' g';
}
function fmtL(L){
  if(L>=1000) return (L/1000).toLocaleString(undefined,{maximumFractionDigits:2})+' m³';
  if(L>=1)    return Math.round(L).toLocaleString()+' L';
  return Math.round(L*1000).toLocaleString()+' mL';
}
function renderSnapshot(){
  const host=document.getElementById('snap'); if(!host) return;
  const R=MMURR_REGION.data(), region=MMURR_REGION.get(), i=MONTHS.length-1, t=TS[i];
  let html='';
  for(const [k,s] of Object.entries(SVC)){
    if(!s.on) continue;
    let cost=null, wh=null;
    if(s.billing==='credits'){
      cost=qtyAt(s,i)*((MMURR_DATA.seat.credit[region]??MMURR_DATA.seat.credit.US)*fxAt(region,MONTHS[i]));
    } else {
      const price=priceRow(s,region)[i];
      if(price!=null){
        cost=qtyAt(s,i)*price;
        if(s.billing==='seat' && s.usage && s.usageAddon){ const Mt=promptsAt(s,i)*TPP/1e6; cost+=Mt*stepPrice(stepAt(s.lineage,t),MMURR_MIX.get())*fxAt(region,MONTHS[i]); }
        wh=promptsAt(s,i)*stepAt(lineageOf(s),t)[3];     // Wh / month
      }
    }
    const costTxt = cost==null ? '—' : R.sym+Math.round(cost).toLocaleString();
    let body;
    if(wh==null){
      body = `<div class="snap-note">Infrastructure credits — footprint depends on the workloads you run, not a per-prompt rate, so it isn't counted here.</div>`;
    } else {
      const kg = wh/1000*R.pue*MMURR_ENV.ci(s.provider), L = wh/1000*R.wue;   // CO₂e kg/mo · water L/mo
      body = `<div class="snap-fp">
        <div><span class="k"><i style="background:var(--accent)"></i>Energy</span><span class="v">${fmtEnergy(wh)}</span></div>
        <div><span class="k"><i style="background:#b18cff"></i>CO₂e</span><span class="v">${fmtKg(kg)}</span></div>
        <div><span class="k"><i style="background:#54c8e8"></i>Water</span><span class="v">${fmtL(L)}</span></div>
      </div>`;
    }
    html += `<div class="snap-card">
      <div class="nm"><span class="dot" style="background:${s.color}"></span>${s.name}</div>
      <div class="cost">${costTxt} <small>/ month</small> ${modeChip(s.billing==='sub' ? s.lt.pricing_mode : s.pricing_mode)}</div>
      ${body}</div>`;
  }
  host.innerHTML = html || `<p class="sub" style="margin:0">No services selected — open a card above and tick “Include in basket”.</p>`;
}

// --- Region-aware sources & assumptions (covers BOTH charts) -------------------
const SRC = {
  litellm:'https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json',
  openai:'https://openai.com/api/pricing/',
  gemini:'https://ai.google.dev/gemini-api/docs/pricing',
  geminiEnt:'https://cloud.google.com/blog/products/ai-machine-learning/gemini-enterprise-launch',
  googleOne:'https://blog.google/products-and-platforms/products/google-one/google-ai-subscriptions/',
  anthropic:'https://claude.com/pricing',
  xai:'https://x.ai/grok',
  xaiApi:'https://docs.x.ai/docs/models',
  mistral:'https://mistral.ai/pricing/',
  ms:'https://www.microsoft.com/en-gb/microsoft-365-copilot/pricing',
  snow:'https://www.snowflake.com/en/data-cloud/pricing-options/',
  gEnergy:'https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference/',
  grid:'https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025',
};
const aLink = (href,text)=>`<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
const confTag = kind=>`<span class="conf ${kind.toLowerCase()}">${kind}</span>`;

function renderSources(){
  const host=document.getElementById('sourcesPanel'); if(!host) return;
  const R=MMURR_REGION.data(), region=MMURR_REGION.get();
  const mixIn=Math.round(MMURR_MIX.get()*100), mixOut=100-mixIn;
  const cop=(MMURR_DATA.seat.series.copilot[region]??MMURR_DATA.seat.series.copilot.UK)[0][1];
  const gem=(MMURR_DATA.seat.series.gemini[region]??MMURR_DATA.seat.series.gemini.UK);
  const gemNow=gem[gem.length-1][1];
  const cred=MMURR_DATA.seat.credit[region]??MMURR_DATA.seat.credit.US;
  const fxNow = fxAt(region,'9999-12');
  const fxLine = region==='US' ? 'USD (no conversion)'
    : region==='UK' ? `USD × ECB monthly FX (latest ${fxNow}) → GBP`
    : `USD × ${fxNow} FX anchor → ${R.cur}`;
  const ref = window.MMURR_API_PRICES;
  const F = window.MMURR_FX;
  const rows = [
    ['Pricing basis', `Microsoft, Google &amp; Snowflake enterprise licences are shown as <b>${R.label}</b> regional list/rate. Personal/team plans use the vendor's OWN local list where one is billed (ChatGPT Plus &amp; Google UK £, Mistral EU €); Anthropic and xAI bill USD worldwide, so those convert per month (${fxLine}) plus consumer VAT — shown as a band, not a point.`, 'VERIFY', '(mode chips on each card)'],
    ['FX (GBP/USD)', F
        ? `ECB reference rates via frankfurter.dev — monthly means, ${F.months[0]} → ${F.months[F.months.length-1]}, committed by a monthly repo Action (updated ${F.updated}; latest ${F.latest}). Historical $ points convert at their own month's rate; usd_fx consumer plans add UK/EU VAT ×1.20 (EU rate approximate). EUR remains an editable anchor (${MMURR_DATA.regions.EU.fx}/USD).`
        : `fx-history.js not loaded — emergency 0.78 anchor in use.`, 'SOURCED', '<a href="https://api.frankfurter.dev/v1/latest?base=USD&symbols=GBP" target="_blank" rel="noopener">frankfurter.dev (ECB)</a>'],
    ['M365 Copilot licence', `${R.sym}${cop.toFixed(2)}/licence/mo (enterprise add-on, ${R.label} list); held since Nov 2023`, 'SOURCED', aLink(SRC.ms,'Microsoft pricing')],
    ['Copilot price changes', `≤300-licence Business SKU cut $30→$21 (1 Dec 2025; an $18 promo runs to late 2026); bundled into premium licences from Jul 2026`, 'SOURCED', aLink(SRC.ms,'Microsoft')],
    ['Gemini (enterprise) licence', `${R.sym}${gemNow}/licence/mo now (Gemini Enterprise, since 9 Oct 2025)`, 'VERIFY', aLink(SRC.geminiEnt,'Google Cloud')],
    ['Gemini price history', `$20/$30 Workspace add-on → discontinued &amp; folded into Workspace (Jan–Mar 2025) → relaunched as Gemini Enterprise $30/licence (Oct 2025). The discontinued period is shown as a REAL GAP in the chart.`, 'SOURCED', aLink(SRC.gemini,'Google')],
    ['Claude (enterprise) licence', `$20/licence/mo base + usage at API rates (shown ${fxLine}); was ≈$40–200 with bundled tokens before the Nov 2025 restructure`, 'SOURCED', aLink(SRC.anthropic,'Anthropic pricing')],
    ['ChatGPT Plus (personal)', `$20 USD/mo since Feb 2023; the UK checkout price is a fixed ≈£20 incl VAT — a regional list price, not an FX conversion`, 'SOURCED', aLink(SRC.openai,'OpenAI')],
    ['Claude Pro / Max (personal)', `$${LT.claudePro.usd[0][1]} · $${LT.claudeMax5.usd[0][1]} · $${LT.claudeMax20.usd[0][1]} USD/mo flat (shown ${fxLine}); Pro since Sep 2023, Max tiers since Apr 2025`, 'SOURCED', aLink(SRC.anthropic,'Anthropic pricing')],
    ['Google AI Pro / Ultra (personal)', `AI Premium $19.99/mo (Feb 2024) → renamed Google AI Pro (Apr 2026, price held) · Ultra $249.99/mo (May 2025) → $200 (May 2026; the 5× Ultra tier is not modelled). UK shows Google's own £ list (Pro £18.99 · Ultra £189.99); other regions ${fxLine}`, 'SOURCED', aLink(SRC.googleOne,'Google')],
    ['SuperGrok / Heavy (personal)', `SuperGrok $30/mo (≈Feb 2025, with Grok 3) · Heavy $300/mo (9 Jul 2025). Shown ${fxLine}`, 'VERIFY', aLink(SRC.xai,'xAI')],
    ['Le Chat Pro / Team (Mistral)', `Pro $14.99/mo (Feb 2025) · Team $24.99/user/mo; Enterprise is custom-quoted. EU shows Mistral's € list (same digits, VERIFY); other regions ${fxLine}`, 'SOURCED', aLink(SRC.mistral,'Mistral pricing')],
    ['Plan token allowances', `est. M tokens per ${SW.windowHours}-hour window per plan (Claude Pro ${LT.claudePro.windowMTok} · Max 20× ${LT.claudeMax20.windowMTok} · AI Ultra ${LT.geminiUltra.windowMTok} · full list in factors.js), scaled ≈ with price. 100% usage = ${WPD} maxed windows/day (${SW.gapHours}h gap between windows); rolling/weekly caps can bind first`, 'ASSUMPTION', '(editable — vendors publish no exact limits)'],
    ['Snowflake credit', `≈$${cred.toFixed(2)}/credit (Enterprise, ${R.label} region) at FX; ≈$3.00 US · ≈$3.60 EU · ≈$3.90 UK; stable`, 'VERIFY', aLink(SRC.snow,'Snowflake')],
    ['Standardised prompt', `${TPP} tokens (≈300-token answer + context; editable). Same task for every model so cost &amp; footprint compare like-for-like.`, 'ASSUMPTION', '—'],
    ['Input / output ratio', `Prices blended at <b>${mixIn}/${mixOut}</b> input/output (the ratio control at the top; default 50/50). Historical steps without a sourced in/out pair are locked at 50/50 and flagged in tooltips. Energy &amp; water are per-prompt figures and do not react to the ratio.`, 'SOURCED', '(your setting)'],
    ['API token $ (the "if billed on API" line)', `blended <b>${mixIn}/${mixOut}</b> in/out per model, USD/1M, shown ${fxLine}. `+(ref
        ? `<b>Current</b> prices are referenced from the LiteLLM community registry, fetched <b>${ref.fetched}</b> (auto-refreshed weekly by a repo Action); history steps are hand-set anchors.`
        : `Referenced price feed not loaded — hand-set anchors in use.`), 'SOURCED', aLink(SRC.litellm,'LiteLLM registry')+' · '+aLink(SRC.openai,'OpenAI')+' · '+aLink(SRC.anthropic,'Anthropic')+' · '+aLink(SRC.gemini,'Gemini')+' · '+aLink(SRC.xaiApi,'xAI')+' · '+aLink(SRC.mistral,'Mistral')],
    ['Copilot energy', `0.31 Wh / prompt (median; range 0.16–0.60; per-query water &lt;0.5 mL)`, 'SOURCED', 'Microsoft production disclosure (Jun 2026)'],
    ['Gemini energy', `0.24 Wh / prompt (fleet median)`, 'SOURCED', aLink(SRC.gEnergy,'Google Cloud (2025)')],
    ['Anthropic / xAI / Mistral / Gemini-Pro energy', `per-query Wh not published — labelled assumptions`, 'ASSUMPTION', '(vendors publish none)'],
    ['Serving location (carbon basis)', `${MMURR_ENV.hosting==='vendor'
        ? `<b>Vendor fleet</b> — each model's CO₂e uses its vendor's fleet intensity where gradable (e.g. ${MMURR_ENV.basisLabel('Mistral')}; ${MMURR_ENV.basisLabel('xAI')}), else the ${MMURR_HOSTING.fallback.ci} US/EU-weighted assumption. Routing is not publicly disclosed — these are fleet-weighted estimates, not measurements. Data as of ${MMURR_HOSTING.as_of}.`
        : `<b>${MMURR_ENV.basisLabel()}</b> kgCO₂e/kWh applied to every model. Location-based throughout.`}`,
      MMURR_ENV.hosting==='vendor' ? 'ASSUMPTION' : (MMURR_ENV.hosting==='custom' ? 'ASSUMPTION' : 'SOURCED'), '(selector at the top)'],
    ['T&amp;D losses', MMURR_ENV.tdAllowed()
        ? (MMURR_ENV.td ? `ON — +${MMURR_TD_ADDER[MMURR_ENV.hosting]} kgCO₂e/kWh (≈+10.5% UK, DESNZ 2025)` : `off (toggle available for this basis: +${MMURR_TD_ADDER[MMURR_ENV.hosting]} UK, DESNZ 2025)`)
        : `not applicable — no source-backed adder for the current carbon basis (only the UK has one: +0.0185, DESNZ 2025)`, 'SOURCED', aLink(SRC.grid,'DESNZ/Defra (2025)')],
    ['Grid intensity (region defaults)', `UK ${gridFactor('UK',false)} (DESNZ 2025) · US ${gridFactor('US',false)} (EPA eGRID 2023 Rev 2) · EU ${gridFactor('EU',false)} (EEA 2024 early est.) · France ${gridFactor('FR',false)} (RTE/EEA) — read via the shared gridFactor() so no page can disagree`, 'SOURCED', aLink(SRC.grid,'DESNZ/Defra (2025)')],
    ['Equivalences', `car ${MMURR_BASES.car} kgCO₂e/km (Defra 2025) · smartphone charge ${MMURR_BASES.phone} kgCO₂e (US-grid basis, EPA; ≈half on the UK grid)`, 'SOURCED', aLink(SRC.grid,'Defra')+' · <a href="https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator" target="_blank" rel="noopener">US EPA</a>'],
    ['Per-token energy (API-metered view only)', `${MMURR_BASES.whPer1kTok} Wh / 1k tokens (Gemini basis) — an alternative basis to the per-prompt figures above, never multiplied with them`, 'ASSUMPTION', 'derived from Google (2025)'],
  ];
  host.innerHTML = `
    <p class="sub" style="margin-top:0">These reflect the <b>${R.label}</b> selection above — switch region/currency and the
      prices, grid and FX here update too. Every value is flagged ${confTag('SOURCED')} ${confTag('VERIFY')} ${confTag('ASSUMPTION')} and links to its origin.
      EU figures are localised approximations (flagged VERIFY).</p>
    <table class="src"><thead><tr><th>Item</th><th>Value (this region)</th><th>Conf.</th><th>Source</th></tr></thead>
    <tbody>${rows.map(([k,v,c,s])=>`<tr><td>${k}</td><td>${v}</td><td>${confTag(c)}</td><td>${s}</td></tr>`).join('')}</tbody></table>
    <p class="foot">Prices are list/indicative — overwrite them with your own contract rates in the dataset. GBP conversion uses the
      committed ECB monthly series (no runtime network calls); EUR is an editable anchor. Runs entirely in your browser.</p>`;
}

// --- Per-prompt impact strip (v2 §1.4) ----------------------------------------
// The environmental readouts that justified the old dashboard: per-prompt
// energy / CO₂e / water at the CURRENT settings (selected main model on the
// decision chart, served-from carbon basis, region WUE). Reuses factors.js
// only — no duplicated constants. Mix-independent by construction (§2.5).
window.renderEnvStrip = function(){
  const host = document.getElementById('envStrip'); if(!host) return;
  const R = MMURR_REGION.data();
  const sel = window.__lab ? __lab.get() : null;
  const key = sel ? sel.mainModel : M.defaultAxis;
  const ax  = M.axis[key];
  const last = ax.steps[ax.steps.length-1];
  const wh = last[3];                                  // Wh / prompt
  const ci = MMURR_ENV.ci(ax.group);
  const g  = wh/1000 * R.pue * ci * 1000;              // g CO₂e / prompt
  const mL = wh/1000 * R.wue * 1000;                   // mL / prompt
  const kgPer1k = g;                                   // g/prompt × 1000 prompts ÷ 1000 g/kg
  host.innerHTML = `
    <div class="cell"><div class="k">Model</div><div class="v">${ax.group} ${last[1]}</div></div>
    <div class="cell"><div class="k">Energy / prompt</div><div class="v">${wh.toFixed(2)} Wh</div></div>
    <div class="cell"><div class="k">CO₂e / prompt</div><div class="v">${g.toFixed(3)} g</div></div>
    <div class="cell"><div class="k">Water / prompt</div><div class="v">${mL.toFixed(2)} mL</div></div>
    <div class="cell"><div class="k">1,000 prompts ≈</div><div class="v">${kgPer1k.toFixed(2)} kg CO₂e</div></div>`;
  const note = document.getElementById('envNote');
  if(note) note.innerHTML =
    `1,000 prompts ≈ <b>${Math.round(kgPer1k/MMURR_BASES.phone).toLocaleString()}</b> smartphone charges (US-grid basis) `+
    `or <b>${(kgPer1k/MMURR_BASES.car).toFixed(1)} km</b> of average car driving. `+
    `Carbon basis: ${MMURR_ENV.basisLabel(ax.group)}; water at ${R.label} WUE ${R.wue} L/kWh`+
    `${ax.assumedWh?' — this vendor publishes no per-query Wh, so the energy figure is a labelled assumption':''}. `+
    `Per-prompt figures: the input/output ratio never moves these. Alternative API-metered basis: `+
    `${MMURR_BASES.whPer1kTok} Wh/1k tokens ≈ ${(MMURR_BASES.whPer1kTok*TPP/1000).toFixed(2)} Wh per standardised prompt (kept separate, never blended).`;
};

// --- Wire up --------------------------------------------------------------------
function init(){
  renderServices();
  renderSources();

  // Global assumption controls: input/output ratio (§2), served-from (§4), T&D (§3)
  const mixPreset=document.getElementById('mixPreset');
  function syncMixUI(){
    const v=Math.round(MMURR_MIX.get()*100);
    if(mixPreset) [...mixPreset.children].forEach(b=>b.classList.toggle('on', +b.dataset.mix===v));
    const mn=document.getElementById('mixNote');
    if(mn) mn.textContent=`Prices blended at ${v}/${100-v} input/output. Historical points without a sourced in/out split stay at 50/50 (flagged in tooltips). Energy & water never react to this ratio.`;
    history.replaceState(null,'',`#mix=${v}`);   // shareable state (v2 §2.6)
  }
  if(mixPreset) mixPreset.addEventListener('click',e=>{ if(e.target.dataset.mix) MMURR_MIX.set((+e.target.dataset.mix)/100); });
  const hostSel=document.getElementById('hosting'), hostCustom=document.getElementById('hostCustom'),
        hostWrap=document.getElementById('hostCustomWrap'), tdBox=document.getElementById('tdToggle'),
        tdWrap=document.getElementById('tdWrap');
  // Option labels carry the factor, matching the Main-model dropdown's style;
  // values come from gridFactor so nothing here can drift from factors.js.
  if(hostSel){
    const opts = [
      ['vendor', `Vendor fleet (default) — each vendor's own serving grid`],
      ...['UK','EU','US','FR'].map(c=>{
        const lab = MMURR_DATA.regions[c] ? MMURR_DATA.regions[c].label : MMURR_CI_EXTRA[c].label;
        return [c, `${lab} grid — ${gridFactor(c,false)} kgCO₂e/kWh`];
      }),
      ['custom', 'Custom kgCO₂e/kWh'],
    ];
    hostSel.innerHTML = opts.map(([v,l])=>`<option value="${v}"${v==='vendor'?' selected':''}>${l}</option>`).join('');
  }
  function syncEnvUI(){
    if(hostWrap) hostWrap.hidden = MMURR_ENV.hosting!=='custom';
    if(hostCustom && hostCustom.value==='') hostCustom.value = MMURR_ENV.custom;   // seed from gridFactor, not a hard-code
    if(tdBox){
      const ok=MMURR_ENV.tdAllowed();
      tdBox.disabled=!ok; tdBox.checked=ok && MMURR_ENV.td;
      tdWrap.setAttribute('aria-disabled', ok?'false':'true');
      tdWrap.title = ok ? 'Adds the sourced T&D adder to the grid factor (UK +0.0185 kgCO₂e/kWh, DESNZ 2025)'
                        : 'Only source-backed T&D adders are applied — pick a country basis with one (UK) to enable';
    }
    const hn=document.getElementById('hostNote');
    if(hn) hn.innerHTML = MMURR_ENV.hosting==='vendor'
      ? `<b>Vendor fleet</b> = the average grid intensity where that vendor actually serves prompts, so each model's `+
        `CO₂e uses its own vendor's estimate: sourced where a first-party figure exists (Mistral serves from France, `+
        `≈${MMURR_HOSTING.vendors.Mistral.fleet_ci} kgCO₂e/kWh), inferred from disclosed siting elsewhere (e.g. xAI's `+
        `gas-heavy Memphis campus ≈${MMURR_HOSTING.vendors.xAI.fleet_ci}), and a labelled US/EU-weighted assumption `+
        `(${MMURR_HOSTING.fallback.ci}) where nothing usable is disclosed. No vendor reveals which region served your `+
        `prompt — these are fleet-weighted estimates, graded per vendor in the sources panel (data as of ${MMURR_HOSTING.as_of}).`
      : `All models' CO₂e uses <b>${MMURR_ENV.basisLabel()}</b> kgCO₂e/kWh. Pick “Vendor fleet” to give each model its own vendor's serving-grid estimate.`;
  }
  if(hostSel){
    hostSel.addEventListener('change',e=>MMURR_ENV.setHosting(e.target.value));
    hostCustom.addEventListener('input',e=>MMURR_ENV.setCustom(parseFloat(e.target.value)||0));
    tdBox.addEventListener('change',e=>MMURR_ENV.setTd(e.target.checked));
  }
  MMURR_MIX.onChange(()=>{ syncMixUI(); draw(); renderSources(); });
  MMURR_ENV.onChange(()=>{ syncEnvUI(); draw(); renderSources(); });
  syncMixUI(); syncEnvUI();

  const tracks=document.getElementById('tracks');

  tracks.addEventListener('change',e=>{
    const t=e.target;
    if(t.dataset.on){ const k=t.dataset.on; SVC[k].on=t.checked;
      const card=t.closest('.svc'); card.classList.toggle('off',!t.checked);
      const flag=document.getElementById('in-'+k); if(flag) flag.textContent=t.checked?'✓':'';
      draw(); return; }
    const id=t.id||'';
    if(id.startsWith('basis-')){ const k=id.slice(6); SVC[k].basis=t.value;
      document.getElementById('tokwrap-'+k).hidden = t.value!=='tokens'; draw(); return; }
    if(id.startsWith('use-')){ SVC[id.slice(4)].usage=t.checked; draw(); return; }
    if(id.startsWith('ro-')&&!id.includes('-q')&&!id.includes('-m')){ const k=id.slice(3);
      SVC[k].ro.on=t.checked; document.getElementById('rowrap-'+k).hidden=!t.checked; draw(); return; }
  });
  tracks.addEventListener('input',e=>{
    const t=e.target, id=t.id||'', v=parseFloat(t.value)||0;
    if(id.startsWith('q-')){ SVC[id.slice(2)].qty=v; draw(); }
    else if(id.startsWith('sl-')){ const k=id.slice(3), s=SVC[k];
      if(s.billing==='sub'){ s.pct=v;
        document.getElementById('slo-'+k).textContent = `${v}% ≈ ${Math.round(v/100*maxPpdSub(s)).toLocaleString()}/day`; }
      else { s.ppd=v; document.getElementById('slo-'+k).textContent=v; }
      draw(); }
    else if(id.startsWith('tok-')){ SVC[id.slice(4)].tokensMo=v; draw(); }
    else if(id.startsWith('ro-q0-')){ SVC[id.slice(6)].ro.q0=v; draw(); }
    else if(id.startsWith('ro-q1-')){ SVC[id.slice(6)].ro.q1=v; draw(); }
    else if(id.startsWith('ro-m0-')){ SVC[id.slice(6)].ro.m0=t.value; draw(); }
    else if(id.startsWith('ro-m1-')){ SVC[id.slice(6)].ro.m1=t.value; draw(); }
  });
  tracks.addEventListener('click',e=>{
    const b=e.target.closest('.more'); if(!b) return;
    const body=document.getElementById('more-'+b.dataset.more), open=body.hidden;
    body.hidden=!open; b.setAttribute('aria-expanded',open); b.textContent='More detail '+(open?'▴':'▾');
  });

  document.getElementById('metric').addEventListener('click',e=>{
    if(!e.target.dataset.m) return;
    [...e.currentTarget.children].forEach(b=>b.classList.remove('on'));
    e.target.classList.add('on'); metric=e.target.dataset.m;
    document.getElementById('apiWrap').style.display = metric==='cost'?'':'none';
    draw();
  });
  document.getElementById('showTotal').addEventListener('change',draw);
  document.getElementById('showApi').addEventListener('change',e=>{ showApi=e.target.checked; draw(); });
  // Chart.js can't size a canvas inside a closed <details> — redraw on open.
  const blended=document.getElementById('blended');
  if(blended) blended.addEventListener('toggle',()=>{ if(blended.open) draw(); });

  MMURR_REGION.onChange(()=>{ draw(); renderSources(); });
  draw();
}
document.addEventListener('DOMContentLoaded',init);
