/* ----------------------------------------------------------------------------
   mmurr.ai — AI Price History · "Blended Usage" basket
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
const START='2024-01', END='2026-06';
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
    const usd = fill(MMURR_DATA.seat.series.claudeUsd), fx = MMURR_REGION.data().fx;
    return MONTHS.map(m => usd[m]==null ? null : usd[m]*fx);
  }
  const tbl = MMURR_DATA.seat.series[s.seatKey];
  const f = fill(tbl[region] || tbl.UK);
  return MONTHS.map(m => (f[m]==null || f[m]===0) ? null : f[m]);
}
// subscription fee history; null before the plan launched. Uses the vendor's
// LOCAL list history when one exists for this region (e.g. Google bills £ in
// the UK), otherwise USD × FX (Anthropic & xAI bill USD worldwide).
function subFill(s){
  const loc = s.lt.local && s.lt.local[MMURR_REGION.get()];
  const fx = MMURR_REGION.data().fx, f = fill(loc || s.lt.usd);
  return MONTHS.map(m => f[m]==null ? null : (loc ? f[m] : f[m]*fx));
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
  const ORDER=['Microsoft','Google','Anthropic','xAI','Mistral','Snowflake'];
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
function metricFromEnergyWh(wh, R){
  const kwh = wh/1000;
  if(metric==='energy') return wh;                 // Wh / month
  if(metric==='co2')    return kwh*R.pue*R.grid;    // kg CO₂e / month
  if(metric==='water')  return kwh*R.wue;           // L / month
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
        const rate = (MMURR_DATA.seat.credit[region] ?? MMURR_DATA.seat.credit.US) * R.fx;
        series = MONTHS.map((m,i)=> +(qtyAt(s,i)*rate).toFixed(2));
      } else {
        series = MONTHS.map((m,i)=>{ const p=rows[k][i]; if(p==null) return null;
          let c = qtyAt(s,i)*p;
          if(s.billing==='seat' && s.usage && s.usageAddon){ const Mt=promptsAt(s,i)*TPP/1e6; c += Mt*stepAt(s.lineage,TS[i])[2]*R.fx; }
          return +c.toFixed(2); });
      }
    } else { // environmental — prompt-driven services only
      if(s.billing==='credits'){ continue; }
      series = MONTHS.map((m,i)=>{ if(rows[k][i]==null) return null;
        const wh = promptsAt(s,i) * stepAt(lineageOf(s),TS[i])[3];
        return +metricFromEnergyWh(wh,R).toFixed(metric==='energy'?0:2); });
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
        c += promptsAt(s,i)*TPP/1e6 * stepAt(lineageOf(s),TS[i])[2] * R.fx; }
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
function renderSnapshot(){
  const host=document.getElementById('snap'); if(!host) return;
  const R=MMURR_REGION.data(), region=MMURR_REGION.get(), i=MONTHS.length-1, t=TS[i];
  let html='';
  for(const [k,s] of Object.entries(SVC)){
    if(!s.on) continue;
    let cost=null, wh=null;
    if(s.billing==='credits'){
      cost=qtyAt(s,i)*((MMURR_DATA.seat.credit[region]??MMURR_DATA.seat.credit.US)*R.fx);
    } else {
      const price=priceRow(s,region)[i];
      if(price!=null){
        cost=qtyAt(s,i)*price;
        if(s.billing==='seat' && s.usage && s.usageAddon){ const Mt=promptsAt(s,i)*TPP/1e6; cost+=Mt*stepAt(s.lineage,t)[2]*R.fx; }
        wh=promptsAt(s,i)*stepAt(lineageOf(s),t)[3];     // Wh / month
      }
    }
    const costTxt = cost==null ? '—' : R.sym+Math.round(cost).toLocaleString();
    let body;
    if(wh==null){
      body = `<div class="snap-note">Infrastructure credits — footprint depends on the workloads you run, not a per-prompt rate, so it isn't counted here.</div>`;
    } else {
      const kg = wh/1000*R.pue*R.grid, L = wh/1000*R.wue;   // CO₂e kg/mo · water L/mo
      body = `<div class="snap-fp">
        <div><span class="k"><i style="background:var(--accent)"></i>Energy</span><span class="v">${fmtEnergy(wh)}</span></div>
        <div><span class="k"><i style="background:#b18cff"></i>CO₂e</span><span class="v">${kg.toLocaleString(undefined,{maximumFractionDigits:kg<10?1:0})} kg</span></div>
        <div><span class="k"><i style="background:#54c8e8"></i>Water</span><span class="v">${Math.round(L).toLocaleString()} L</span></div>
      </div>`;
    }
    html += `<div class="snap-card">
      <div class="nm"><span class="dot" style="background:${s.color}"></span>${s.name}</div>
      <div class="cost">${costTxt} <small>/ month</small></div>
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
  const cop=(MMURR_DATA.seat.series.copilot[region]??MMURR_DATA.seat.series.copilot.UK)[0][1];
  const gem=(MMURR_DATA.seat.series.gemini[region]??MMURR_DATA.seat.series.gemini.UK);
  const gemNow=gem[gem.length-1][1];
  const cred=MMURR_DATA.seat.credit[region]??MMURR_DATA.seat.credit.US;
  const fxLine = region==='US' ? 'USD (no conversion)' : `USD × ${R.fx} FX → ${R.cur}`;
  const ref = window.MMURR_API_PRICES;
  const rows = [
    ['Pricing basis', `Microsoft, Google &amp; Snowflake enterprise licences are shown as <b>${R.label}</b> regional list/rate. Personal/team plans use the vendor's OWN local list where one is billed (Google UK £, Mistral EU €); Anthropic and xAI bill USD worldwide, so those convert at the FX anchor (${R.cur} ${R.fx}/USD).`, 'VERIFY', '(editable anchors)'],
    ['M365 Copilot licence', `${R.sym}${cop.toFixed(2)}/licence/mo (enterprise add-on, ${R.label} list); held since Nov 2023`, 'SOURCED', aLink(SRC.ms,'Microsoft pricing')],
    ['Copilot price changes', `≤300-licence Business SKU cut $30→$21 (1 Dec 2025); bundled into premium licences from Jul 2026`, 'SOURCED', aLink(SRC.ms,'Microsoft')],
    ['Gemini (enterprise) licence', `${R.sym}${gemNow}/licence/mo now (Gemini Enterprise, since 9 Oct 2025)`, 'VERIFY', aLink(SRC.geminiEnt,'Google Cloud')],
    ['Gemini price history', `$20/$30 Workspace add-on → discontinued &amp; folded into Workspace (Jan–Mar 2025) → relaunched as Gemini Enterprise $30/licence (Oct 2025). The discontinued period is shown as a REAL GAP in the chart.`, 'SOURCED', aLink(SRC.gemini,'Google')],
    ['Claude (enterprise) licence', `$20/licence/mo base + usage at API rates (shown ${fxLine}); was ≈$40–200 with bundled tokens before the Nov 2025 restructure`, 'SOURCED', aLink(SRC.anthropic,'Anthropic pricing')],
    ['Claude Pro / Max (personal)', `$${LT.claudePro.usd[0][1]} · $${LT.claudeMax5.usd[0][1]} · $${LT.claudeMax20.usd[0][1]} USD/mo flat (shown ${fxLine}); Pro since Sep 2023, Max tiers since Apr 2025`, 'SOURCED', aLink(SRC.anthropic,'Anthropic pricing')],
    ['Google AI Pro / Ultra (personal)', `AI Premium $19.99/mo (Feb 2024) → renamed Google AI Pro (Apr 2026, price held) · Ultra $249.99/mo (May 2025) → $200 (May 2026; the 5× Ultra tier is not modelled). UK shows Google's own £ list (Pro £18.99 · Ultra £189.99); other regions ${fxLine}`, 'SOURCED', aLink(SRC.googleOne,'Google')],
    ['SuperGrok / Heavy (personal)', `SuperGrok $30/mo (≈Feb 2025, with Grok 3) · Heavy $300/mo (9 Jul 2025). Shown ${fxLine}`, 'VERIFY', aLink(SRC.xai,'xAI')],
    ['Le Chat Pro / Team (Mistral)', `Pro $14.99/mo (Feb 2025) · Team $24.99/user/mo; Enterprise is custom-quoted. EU shows Mistral's € list (same digits, VERIFY); other regions ${fxLine}`, 'SOURCED', aLink(SRC.mistral,'Mistral pricing')],
    ['Plan token allowances', `est. M tokens per ${SW.windowHours}-hour window per plan (Claude Pro ${LT.claudePro.windowMTok} · Max 20× ${LT.claudeMax20.windowMTok} · AI Ultra ${LT.geminiUltra.windowMTok} · full list in factors.js), scaled ≈ with price. 100% usage = ${WPD} maxed windows/day (${SW.gapHours}h gap between windows); rolling/weekly caps can bind first`, 'ASSUMPTION', '(editable — vendors publish no exact limits)'],
    ['Snowflake credit', `≈$${cred.toFixed(2)}/credit (Enterprise, ${R.label} region) at FX; ≈$3.00 US · ≈$3.60 EU · ≈$3.90 UK; stable`, 'VERIFY', aLink(SRC.snow,'Snowflake')],
    ['Standardised prompt', `${TPP} tokens (≈300-token answer + context; editable). Same task for every model so cost &amp; footprint compare like-for-like.`, 'ASSUMPTION', '—'],
    ['API token $ (the "if billed on API" line)', `blended 50/50 in/out per model, USD/1M, shown ${fxLine}. `+(ref
        ? `<b>Current</b> prices are referenced from the LiteLLM community registry, fetched <b>${ref.fetched}</b> (auto-refreshed weekly by a repo Action); history steps are hand-set anchors.`
        : `Referenced price feed not loaded — hand-set anchors in use.`), 'SOURCED', aLink(SRC.litellm,'LiteLLM registry')+' · '+aLink(SRC.openai,'OpenAI')+' · '+aLink(SRC.anthropic,'Anthropic')+' · '+aLink(SRC.gemini,'Gemini')+' · '+aLink(SRC.xaiApi,'xAI')+' · '+aLink(SRC.mistral,'Mistral')],
    ['Copilot energy', `0.31 Wh / prompt`, 'SOURCED', 'Microsoft disclosure (2026)'],
    ['Gemini energy', `0.24 Wh / prompt (fleet median)`, 'SOURCED', aLink(SRC.gEnergy,'Google Cloud (2025)')],
    ['Anthropic / xAI / Mistral / Gemini-Pro energy', `per-query Wh not published — labelled assumptions`, 'ASSUMPTION', '(vendors publish none)'],
    ['Grid intensity', `${R.label} ≈ ${R.grid} kgCO₂e/kWh — ${R.gridNote}`, R.gridConf, aLink(SRC.grid,'DESNZ/Defra (2025)')],
  ];
  host.innerHTML = `
    <p class="sub" style="margin-top:0">These reflect the <b>${R.label}</b> selection above — switch region/currency and the
      prices, grid and FX here update too. Every value is flagged ${confTag('SOURCED')} ${confTag('VERIFY')} ${confTag('ASSUMPTION')} and links to its origin.
      EU figures are localised approximations (flagged VERIFY).</p>
    <table class="src"><thead><tr><th>Item</th><th>Value (this region)</th><th>Conf.</th><th>Source</th></tr></thead>
    <tbody>${rows.map(([k,v,c,s])=>`<tr><td>${k}</td><td>${v}</td><td>${confTag(c)}</td><td>${s}</td></tr>`).join('')}</tbody></table>
    <p class="foot">Prices are list/indicative — overwrite them with your own contract rates in the dataset. Token prices convert at an
      editable FX anchor; no network calls. Runs entirely in your browser.</p>`;
}

// --- Wire up --------------------------------------------------------------------
function init(){
  renderServices();
  renderSources();
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
