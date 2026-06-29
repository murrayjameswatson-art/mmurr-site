/* ----------------------------------------------------------------------------
   mmurr.ai — AI Price History · "Choose your stack" basket
   Size each service by SEATS (or credits) and one shared headline of average
   prompts/user/day. Every model is assumed to answer the SAME standardised
   prompt, so the same task can be priced and footprinted as the engine under
   each licence changes. Seat fees are flat per user; prompts drive the optional
   "cost if billed on raw API" line, the environmental view, and Claude's
   optional metered usage — never the per-seat bill. Client-side except Chart.js.
---------------------------------------------------------------------------- */

// --- Timeline -------------------------------------------------------------
function monthList(start, end){
  const out=[]; let [y,m]=start.split('-').map(Number); const [ey,em]=end.split('-').map(Number);
  while(y<ey || (y===ey && m<=em)){ out.push(`${y}-${String(m).padStart(2,'0')}`); m++; if(m>12){m=1;y++;} }
  return out;
}
const START='2023-03', END='2026-06';
const MONTHS = monthList(START,END);
const D = s => { const [y,m]=s.split('-').map(Number); return new Date(y,m-1,1).getTime(); };
const TS = MONTHS.map(D);

const B   = MMURR_DATA.basket;
const M   = MMURR_DATA.models;
const WD  = B.workdaysPerMonth;
const TPP = M.tokPerPrompt;

// --- Shared + per-service state ------------------------------------------
let ppd = B.ppdDefault;                       // headline average prompts/user/day
let metric = 'cost';                          // cost | energy | co2 | water
let showApi = false;                          // "cost if billed on raw API" line
let showGemHist = false;                      // overlay Gemini's seat-price history

// Build editable service state from the single-sourced config.
const SVC = {};
for(const [k,c] of Object.entries(B.services)){
  SVC[k] = {
    ...c, key:k, on:true, qty:c.defaultQty,
    basis:'prompts',          // seat services: 'prompts' (seats×ppd) | 'tokens' (direct Mtokens/mo)
    ppdOverride:0,            // 0 = use the shared headline
    tokensMo:0,              // used when basis==='tokens'
    usage:false,             // Claude: bill metered usage at API rates on top
    ro:{on:false, q0:0, q1:0, m0:START, m1:END},   // rollout ramp
  };
}

// --- Series helpers -------------------------------------------------------
// forward-fill [ [month,val], ... ] across every month; null before first point.
function fill(points){
  const out={}; let last=null, pi=0;
  for(const mth of MONTHS){ while(pi<points.length && points[pi][0]<=mth){ last=points[pi][1]; pi++; } out[mth]=last; }
  return out;
}
// seat price (region currency) at each month for a service. 0 in the data = gap → null.
function seatFill(s, region){
  let pts;
  if(s.seatRule==='fx'){
    const usd = fill(MMURR_DATA.seat.series.claudeUsd), fx = MMURR_REGION.data().fx;
    return MONTHS.map(m => usd[m]==null ? null : usd[m]*fx);
  }
  const tbl = MMURR_DATA.seat.series[s.seatKey];
  pts = (tbl[region] || tbl.UK);
  if(s.key==='gemini' && !showGemHist){ const cur = pts[pts.length-1][1]; pts=[[pts[0][0], cur]]; }  // flatten history
  const f = fill(pts);
  return MONTHS.map(m => (f[m]==null || f[m]===0) ? null : f[m]);
}
// latest lineage step ≤ t (clamped to first). [date,label,blended$/1M,Wh/prompt]
function stepAt(key, t){ const st=M.axis[key].steps; let c=st[0]; for(const s of st){ if(D(s[0])<=t) c=s; } return c; }

// quantity (seats/credits) at month index i — flat, or a linear rollout ramp.
function qtyAt(s, i){
  if(!s.ro.on) return s.qty;
  const a=Math.max(0,MONTHS.indexOf(s.ro.m0)), b=Math.max(a,MONTHS.indexOf(s.ro.m1));
  if(i<a) return 0;
  if(i>=b) return s.ro.q1;
  return s.ro.q0 + (s.ro.q1-s.ro.q0)*(i-a)/(b-a||1);
}
// prompts / month for a seat service at month index i (for API line, footprint, usage).
function promptsAt(s, i, t){
  if(s.basis==='tokens') return s.tokensMo*1e6 / TPP;
  const p = s.ppdOverride>0 ? s.ppdOverride : ppd;
  return qtyAt(s,i) * p * WD;
}

// --- Render the service cards --------------------------------------------
function renderServices(){
  const host=document.getElementById('tracks'); host.innerHTML='';
  for(const [k,s] of Object.entries(SVC)){
    const seat = s.billing==='seat';
    const qtyLabel = seat ? 'Seats' : 'Credits / month';
    const div=document.createElement('div'); div.className='svc'+(s.on?'':' off'); div.dataset.key=k;
    div.innerHTML = `
      <div class="thead">
        <input type="checkbox" ${s.on?'checked':''} data-on="${k}" aria-label="Include ${s.name}">
        <span class="dot" style="background:${s.color}"></span>
        <span class="nm">${s.name}</span>
        <span class="badge ${seat?'licensed':'metered'}">${seat?'seat':'credits'}</span>
      </div>
      <label class="f" for="q-${k}">${qtyLabel}</label>
      <input type="number" id="q-${k}" min="0" step="any" value="${s.qty}">
      <button type="button" class="more" data-more="${k}" aria-expanded="false">More detail ▾</button>
      <div class="more-body" id="more-${k}" hidden>
        ${seat ? `
        <label class="f" for="basis-${k}">Usage basis</label>
        <select id="basis-${k}" class="svc-sel">
          <option value="prompts" selected>Prompts (seats × headline/day)</option>
          <option value="tokens">Direct — million tokens / month</option>
        </select>
        <div id="ppdwrap-${k}"><label class="f" for="ppd-${k}">Prompts / user / day override</label>
          <input type="number" id="ppd-${k}" min="0" step="any" placeholder="${ppd} (headline)"></div>
        <div id="tokwrap-${k}" hidden><label class="f" for="tok-${k}">Million tokens / month</label>
          <input type="number" id="tok-${k}" min="0" step="any" value="0"></div>
        ${s.usageAddon ? `<label class="chk"><input type="checkbox" id="use-${k}"> Bill usage at API rates <em>on top</em> of the seat</label>` : ''}
        ` : ''}
        <label class="chk"><input type="checkbox" id="ro-${k}"> Specify rollout (start → end)</label>
        <div id="rowrap-${k}" class="ro-grid" hidden>
          <div><label class="f">Start ${seat?'seats':'credits'}</label><input type="number" id="ro-q0-${k}" min="0" step="any" value="0"></div>
          <div><label class="f">End ${seat?'seats':'credits'}</label><input type="number" id="ro-q1-${k}" min="0" step="any" value="${s.qty}"></div>
          <div><label class="f">Start month</label><input type="month" id="ro-m0-${k}" min="${START}" max="${END}" value="2024-01"></div>
          <div><label class="f">End month</label><input type="month" id="ro-m1-${k}" min="${START}" max="${END}" value="${END}"></div>
        </div>
      </div>`;
    host.appendChild(div);
  }
}

// --- Compute series -------------------------------------------------------
function metricFromEnergyWh(wh, R){
  const kwh = wh/1000;
  if(metric==='energy') return wh;                 // Wh / month
  if(metric==='co2')    return kwh*R.pue*R.grid;    // kg / month
  if(metric==='water')  return kwh*R.wue;           // L  / month
  return 0;
}
function compute(){
  const R=MMURR_REGION.data(), region=MMURR_REGION.get();
  const datasets=[]; const totals=MONTHS.map(()=>0);
  let apiSeries=null;

  for(const [k,s] of Object.entries(SVC)){
    if(!s.on) continue;
    let series;
    if(metric==='cost'){
      if(s.billing==='seat'){
        const price = seatFill(s, region);
        series = MONTHS.map((m,i)=>{ const p=price[i]; if(p==null) return null;
          let c = qtyAt(s,i)*p;
          if(s.usage && s.usageAddon){ const Mt=promptsAt(s,i,TS[i])*TPP/1e6; c += Mt*stepAt(s.lineage,TS[i])[2]*R.fx; }
          return +c.toFixed(2); });
      } else { // credits — USD regional rate, shown at the FX anchor
        const rate = (MMURR_DATA.seat.credit[region] ?? MMURR_DATA.seat.credit.US) * R.fx;
        series = MONTHS.map((m,i)=> +(qtyAt(s,i)*rate).toFixed(2));
      }
    } else { // environmental — prompt-driven seat services only
      if(s.billing!=='seat'){ continue; }
      series = MONTHS.map((m,i)=>{ const price=seatFill(s,region)[i]; if(price==null) return null;
        const wh = promptsAt(s,i,TS[i]) * stepAt(s.lineage,TS[i])[3];
        return +metricFromEnergyWh(wh,R).toFixed(metric==='energy'?0:2); });
    }
    series.forEach((v,i)=>{ if(v!=null) totals[i]+=v; });
    datasets.push({ label:s.name, data:series, borderColor:s.color, backgroundColor:s.color+'55',
      fill:true, stack:'basket', tension:.15, pointRadius:0, borderWidth:2, spanGaps:false });
  }

  // "cost if billed on raw API" — the same prompt volume metered, vs paying per seat.
  if(metric==='cost' && showApi){
    apiSeries = MONTHS.map((m,i)=>{ let c=0, any=false;
      for(const s of Object.values(SVC)){ if(!s.on || s.billing!=='seat') continue;
        if(seatFill(s,region)[i]==null) continue; any=true;
        c += promptsAt(s,i,TS[i])*TPP/1e6 * stepAt(s.lineage,TS[i])[2] * R.fx; }
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

// --- Stats + axis labelling ----------------------------------------------
const UNIT = { cost:r=>r.sym, energy:()=>'', co2:()=>'', water:()=>'' };
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
       : metric==='co2'  ? 'CO₂ — kg / month'
       :                    'Water — L / month';
}
function setStats(totals){
  const lab = metric==='cost'?'cost':metric==='energy'?'energy':metric==='co2'?'CO₂':'water';
  document.getElementById('sStartLab').textContent = `Monthly ${lab} — `;
  document.getElementById('sNowLab').textContent   = `Monthly ${lab} — now`;
  const valid=totals.map((v,i)=>[MONTHS[i],v]).filter(([,v])=>v>0);
  if(!valid.length){ ['sStart','sNow','sChange'].forEach(id=>document.getElementById(id).textContent='—'); return; }
  const [d0,v0]=valid[0], [,vN]=valid[valid.length-1];
  document.getElementById('sStart').textContent=fmtVal(v0);
  document.getElementById('sStartDate').textContent=d0;
  document.getElementById('sNow').textContent=fmtVal(vN);
  const pct=v0? ((vN-v0)/v0*100):0;
  document.getElementById('sChange').textContent=(pct>=0?'+':'')+pct.toFixed(0)+'%';
  document.getElementById('sChange').style.color = pct<=0?'var(--accent)':'var(--warn)';
}

// --- Draw (stacked area only) --------------------------------------------
let chart;
function draw(){
  const R=MMURR_REGION.data();
  const {datasets,totals}=compute();
  setStats(totals);
  const cfg={
    type:'line', data:{labels:MONTHS, datasets},
    options:{
      responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{labels:{color:'#9aa3b2',boxWidth:12,font:{size:11}}},
        tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmtVal(c.parsed.y)}`}},
      },
      scales:{
        x:{ticks:{color:'#6b7280',maxTicksLimit:10,font:{size:10}},grid:{color:'#222732'}},
        y:{stacked:true, ticks:{color:'#6b7280',font:{size:10},
             callback:v=> metric==='cost' ? R.sym+(v>=1000?(v/1000)+'k':v) : v.toLocaleString()},
           grid:{color:'#222732'},title:{display:true,text:yLabel(),color:'#9aa3b2',font:{size:11}}},
      },
    },
  };
  if(chart) chart.destroy();
  chart=new Chart(document.getElementById('chart'),cfg);
}

// --- Region-aware sources & assumptions (covers BOTH charts) --------------
const SRC = {
  openai:'https://openai.com/api/pricing/',
  gemini:'https://ai.google.dev/gemini-api/docs/pricing',
  geminiEnt:'https://cloud.google.com/blog/products/ai-machine-learning/gemini-enterprise-launch',
  anthropic:'https://claude.com/pricing',
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
  const rows = [
    ['Pricing basis', `Microsoft, Google &amp; Snowflake are shown as <b>${R.label}</b> regional list/rate; Claude is USD list at the FX anchor (${R.cur} ${R.fx}/USD) because Anthropic bills USD worldwide.`, 'VERIFY', '(editable anchor — no live feed)'],
    ['M365 Copilot seat', `${R.sym}${cop.toFixed(2)}/seat/mo (enterprise add-on, ${R.label} list); held since Nov 2023`, 'SOURCED', aLink(SRC.ms,'Microsoft pricing')],
    ['Copilot price changes', `≤300-seat Business SKU cut $30→$21 (1 Dec 2025); bundled into premium licences from Jul 2026`, 'SOURCED', aLink(SRC.ms,'Microsoft')],
    ['Gemini (enterprise) seat', `${R.sym}${gemNow}/seat/mo now (Gemini Enterprise, since 9 Oct 2025)`, 'VERIFY', aLink(SRC.geminiEnt,'Google Cloud')],
    ['Gemini price history', `$20/$30 Workspace add-on → discontinued &amp; folded into Workspace (Jan–Mar 2025) → relaunched as Gemini Enterprise $30/seat (Oct 2025)`, 'SOURCED', aLink(SRC.gemini,'Google')],
    ['Claude (enterprise) seat', `$20/seat/mo base + usage at API rates (shown ${fxLine}); was ≈$40–200 with bundled tokens before the Nov 2025 restructure`, 'SOURCED', aLink(SRC.anthropic,'Anthropic pricing')],
    ['Snowflake credit', `≈$${cred.toFixed(2)}/credit (Enterprise, ${R.label} region) at FX; ≈$3.00 US · ≈$3.60 EU · ≈$3.90 UK; stable`, 'VERIFY', aLink(SRC.snow,'Snowflake')],
    ['Standardised prompt', `${TPP} tokens (≈300-token answer + context; editable). Same task for every model so cost &amp; footprint compare like-for-like.`, 'ASSUMPTION', '—'],
    ['API token $ (the "if billed on API" line)', `blended 50/50 in/out per model, USD/1M, shown ${fxLine}`, 'SOURCED', aLink(SRC.openai,'OpenAI')+' · '+aLink(SRC.anthropic,'Anthropic')+' · '+aLink(SRC.gemini,'Gemini')],
    ['Copilot energy', `0.31 Wh / prompt`, 'SOURCED', 'Microsoft disclosure (2026)'],
    ['Gemini energy', `0.24 Wh / prompt`, 'SOURCED', aLink(SRC.gEnergy,'Google Cloud (2025)')],
    ['Anthropic energy', `per-query Wh not published — labelled assumption`, 'ASSUMPTION', '(vendor publishes none)'],
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

// --- Wire up --------------------------------------------------------------
function init(){
  renderServices();
  renderSources();
  const tracks=document.getElementById('tracks');

  tracks.addEventListener('change',e=>{
    const t=e.target;
    if(t.dataset.on){ const k=t.dataset.on; SVC[k].on=t.checked;
      t.closest('.svc').classList.toggle('off',!t.checked); draw(); return; }
    const id=t.id||'';
    if(id.startsWith('basis-')){ const k=id.slice(6); SVC[k].basis=t.value;
      document.getElementById('ppdwrap-'+k).hidden = t.value!=='prompts';
      document.getElementById('tokwrap-'+k).hidden = t.value!=='tokens'; draw(); return; }
    if(id.startsWith('use-')){ SVC[id.slice(4)].usage=t.checked; draw(); return; }
    if(id.startsWith('ro-')&&!id.includes('-q')&&!id.includes('-m')){ const k=id.slice(3);
      SVC[k].ro.on=t.checked; document.getElementById('rowrap-'+k).hidden=!t.checked; draw(); return; }
  });
  tracks.addEventListener('input',e=>{
    const t=e.target, id=t.id||'', v=parseFloat(t.value)||0;
    if(id.startsWith('q-')){ SVC[id.slice(2)].qty=v; draw(); }
    else if(id.startsWith('ppd-')){ SVC[id.slice(4)].ppdOverride=v; draw(); }
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

  document.getElementById('ppd').addEventListener('input',e=>{
    ppd=+e.target.value; document.getElementById('ppdOut').textContent=ppd;
    document.querySelectorAll('[id^="ppd-"]').forEach(el=>el.placeholder=ppd+' (headline)'); draw();
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
  document.getElementById('showGemHist').addEventListener('change',e=>{ showGemHist=e.target.checked; draw(); });

  MMURR_REGION.onChange(()=>{ draw(); renderSources(); });
  draw();
}
document.addEventListener('DOMContentLoaded',init);
