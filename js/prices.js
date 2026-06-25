/* ----------------------------------------------------------------------------
   mmurr.ai — AI Price History
   Fixed-basket cost over time. Filter tracks, set usage, see stacked total.
   Hold a company's usage and watch the monthly bill move since 2023, even as
   the model behind each product (Copilot, Snowflake Cortex, Gemini) was swapped
   underneath. Client-side only except Chart.js (loaded from cdnjs).
---------------------------------------------------------------------------- */

// Price points are (month, unitPrice). Prices hold (step) until the next point.
// Token prices = blended 50/50 input/output, USD per 1M tokens.
// usageStart = usage at adoption start (pilot); usage = current usage. Ramp between them.
const TRACKS = {
  copilot: {
    name:'M365 Copilot', billing:'licensed', unit:'seats', usageLabel:'Seats',
    color:'#e0b341', usageStart:50, usage:1000, on:true, curRule:'seat', // regional list, not FX
    points:[ ['2023-11',30], ['2024-01',30], ['2025-01',30], ['2026-01',30] ], // per seat / month
    cost:(price,usage)=> price*usage,
  },
  snowflake: {
    name:'Snowflake (Enterprise)', billing:'metered', unit:'credits/mo', usageLabel:'Credits / month',
    color:'#7db7ff', usageStart:500, usage:5000, on:true,
    points:[ ['2023-03',3], ['2024-01',3], ['2025-01',3], ['2026-01',3] ], // per credit
    cost:(price,usage)=> price*usage,
  },
  openai: {
    name:'OpenAI default (Copilot backend)', billing:'metered', unit:'M tokens/mo', usageLabel:'Million tokens / month',
    color:'#5bd1a6', usageStart:5, usage:50, on:true,
    points:[ ['2023-03',45], ['2023-11',20], ['2024-05',10], ['2024-08',6.25], ['2025-04',5], ['2025-08',8.75] ],
    cost:(price,usage)=> price*usage, // $/1M × Mtokens
  },
  geminiFlash: {
    name:'Gemini Flash API', billing:'metered', unit:'M tokens/mo', usageLabel:'Million tokens / month',
    color:'#b98cff', usageStart:10, usage:200, on:true,
    points:[ ['2024-05',0.70], ['2024-08',0.19], ['2025-06',1.40], ['2026-05',5.25] ],
    cost:(price,usage)=> price*usage,
  },
  geminiPro: {
    name:'Gemini Pro API', billing:'metered', unit:'M tokens/mo', usageLabel:'Million tokens / month',
    color:'#ff8fa3', usageStart:0, usage:0, on:false,
    points:[ ['2024-05',7], ['2024-10',3.13], ['2025-06',5.63], ['2025-11',7] ],
    cost:(price,usage)=> price*usage,
  },
};

// Global adoption ramp: usage grows from usageStart (at ADOPTION.start) to current usage (at latest month).
const ADOPTION = { curve:'linear', start:'2023-06' };  // curve: 'flat' | 'linear' | 'exp'
function rampUsage(t, monthIdx){
  if(ADOPTION.curve==='flat') return t.usage;
  const startIdx = Math.max(0, MONTHS.indexOf(ADOPTION.start));
  const endIdx = MONTHS.length-1;
  if(monthIdx < startIdx) return 0;                       // not adopted yet
  if(endIdx<=startIdx) return t.usage;
  const p = (monthIdx-startIdx)/(endIdx-startIdx);        // 0..1
  const a = t.usageStart||0, b = t.usage;
  if(ADOPTION.curve==='exp'){
    const a0 = a>0?a:Math.max(b*0.01,1);                  // floor so geometric ramp works from ~0
    return a0 * Math.pow(b/a0, p);
  }
  return a + (b-a)*p;                                     // linear
}

// --- Timeline helpers -----------------------------------------------------
function monthList(start, end){
  const out=[]; let [y,m]=start.split('-').map(Number); const [ey,em]=end.split('-').map(Number);
  while(y<ey || (y===ey && m<=em)){ out.push(`${y}-${String(m).padStart(2,'0')}`); m++; if(m>12){m=1;y++;} }
  return out;
}
const START='2023-03', END='2026-06';
const MONTHS = monthList(START,END);

// forward-fill a track's unit price across every month
function fillPrices(points){
  const map={}; let last=null, pi=0;
  for(const mth of MONTHS){
    while(pi<points.length && points[pi][0]<=mth){ last=points[pi][1]; pi++; }
    map[mth]=last; // null before first point
  }
  return map;
}

// --- Render the track cards ----------------------------------------------
function renderTracks(){
  const host=document.getElementById('tracks'); host.innerHTML='';
  for(const [key,t] of Object.entries(TRACKS)){
    const div=document.createElement('div'); div.className='track'+(t.on?'':' off'); div.dataset.key=key;
    div.innerHTML=`
      <div class="thead">
        <input type="checkbox" ${t.on?'checked':''} data-on="${key}" aria-label="Include ${t.name}">
        <span class="dot" style="background:${t.color}"></span>
        <span class="nm">${t.name}</span>
        <span class="badge ${t.billing}">${t.billing}</span>
      </div>
      <div class="meta">${t.unit}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><label class="f" for="us-${key}">Start (pilot)</label>
          <input type="number" id="us-${key}" min="0" step="any" value="${t.usageStart}"></div>
        <div><label class="f" for="u-${key}">Now</label>
          <input type="number" id="u-${key}" min="0" step="any" value="${t.usage}"></div>
      </div>`;
    host.appendChild(div);
  }
}

// --- Build datasets & compute ---------------------------------------------
let chart;
function compute(){
  // Region rules: 'seat' tracks render the regional LIST price (not FX-converted);
  // everything else is USD list converted at the editable FX anchor. (§2.1)
  const R = MMURR_REGION.data(), region = MMURR_REGION.get();
  const seatList = MMURR_DATA.seat.list[region] ?? MMURR_DATA.seat.list.UK;
  const datasets=[]; const totals=MONTHS.map(()=>0);
  for(const [key,t] of Object.entries(TRACKS)){
    if(!t.on || (!t.usage && !t.usageStart)) continue;
    const pf=fillPrices(t.points);
    const conv = p => t.curRule==='seat' ? seatList : p*R.fx;
    const series=MONTHS.map((m,i)=> pf[m]==null ? null : +t.cost(conv(pf[m]), rampUsage(t,i)).toFixed(2));
    series.forEach((v,i)=>{ if(v!=null) totals[i]+=v; });
    datasets.push({
      label:t.name, data:series, borderColor:t.color,
      backgroundColor:t.color+'55', fill:CHART_TYPE==='area', stack:'basket',
      tension:.15, pointRadius:0, borderWidth:2, spanGaps:true,
    });
  }
  if(document.getElementById('showTotal').checked && datasets.length){
    datasets.push({
      label:'Total', data:totals.map(v=>+v.toFixed(2)), borderColor:'#ffffff',
      backgroundColor:'transparent', fill:false, stack:'total',
      borderDash:[5,4], borderWidth:2, pointRadius:0, tension:.15,
    });
  }
  return {datasets, totals};
}

// --- Stats ----------------------------------------------------------------
function setStats(totals){
  const valid=totals.map((v,i)=>[MONTHS[i],v]).filter(([,v])=>v>0);
  if(!valid.length){ ['sStart','sNow','sChange'].forEach(id=>document.getElementById(id).textContent='—'); return; }
  const [d0,v0]=valid[0], [,vN]=valid[valid.length-1];
  const sym=MMURR_REGION.data().sym;
  const cur=n=> sym+Math.round(n).toLocaleString();
  document.getElementById('sStart').textContent=cur(v0);
  document.getElementById('sStartDate').textContent=d0;
  document.getElementById('sNow').textContent=cur(vN);
  const pct=v0? ((vN-v0)/v0*100):0;
  document.getElementById('sChange').textContent=(pct>=0?'+':'')+pct.toFixed(0)+'%';
  document.getElementById('sChange').style.color = pct<=0?'var(--accent)':'var(--warn)';
}

// --- Draw -----------------------------------------------------------------
let CHART_TYPE='area';
function draw(){
  const R=MMURR_REGION.data();
  const {datasets,totals}=compute();
  setStats(totals);
  const cfg={
    type:'line',
    data:{labels:MONTHS, datasets},
    options:{
      responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{labels:{color:'#9aa3b2',boxWidth:12,font:{size:11}}},
        tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${R.sym}${Math.round(c.parsed.y).toLocaleString()}`}},
      },
      scales:{
        x:{ticks:{color:'#6b7280',maxTicksLimit:10,font:{size:10}},grid:{color:'#222732'}},
        y:{stacked:CHART_TYPE==='area', ticks:{color:'#6b7280',callback:v=>R.sym+(v/1000)+'k',font:{size:10}},
           grid:{color:'#222732'},title:{display:true,text:`Monthly cost (${R.cur||'local'})`,color:'#9aa3b2',font:{size:11}}},
      },
    },
  };
  if(chart) chart.destroy();
  chart=new Chart(document.getElementById('chart'),cfg);
}

// --- Wire up --------------------------------------------------------------
function init(){
  renderTracks();
  document.getElementById('tracks').addEventListener('change',e=>{
    const key=e.target.dataset.on;
    if(key){ TRACKS[key].on=e.target.checked;
      e.target.closest('.track').classList.toggle('off',!e.target.checked); draw(); }
  });
  document.getElementById('tracks').addEventListener('input',e=>{
    if(e.target.id?.startsWith('u-')){ const k=e.target.id.slice(2);
      TRACKS[k].usage=parseFloat(e.target.value)||0; draw(); }
    if(e.target.id?.startsWith('us-')){ const k=e.target.id.slice(3);
      TRACKS[k].usageStart=parseFloat(e.target.value)||0; draw(); }
  });
  document.getElementById('adoptCurve').addEventListener('click',e=>{
    if(!e.target.dataset.c) return;
    [...e.currentTarget.children].forEach(b=>b.classList.remove('on'));
    e.target.classList.add('on'); ADOPTION.curve=e.target.dataset.c; draw();
  });
  document.getElementById('adoptStart').addEventListener('change',e=>{
    ADOPTION.start=e.target.value; draw();
  });
  document.getElementById('chartType').addEventListener('click',e=>{
    if(!e.target.dataset.t) return;
    [...e.currentTarget.children].forEach(b=>b.classList.remove('on'));
    e.target.classList.add('on'); CHART_TYPE=e.target.dataset.t; draw();
  });
  document.getElementById('showTotal').addEventListener('change',draw);
  MMURR_REGION.onChange(draw);   // re-price the basket when region/currency changes
  draw();
}
document.addEventListener('DOMContentLoaded',init);
