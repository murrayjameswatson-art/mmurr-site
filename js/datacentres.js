/* ----------------------------------------------------------------------------
   mmurr.ai — UK Data Centres
   Capacity timeline + build-out footprint calculator + cluster heat.
   The CO2/water bases match the usage dashboard (grid & car come from
   js/factors.js, loaded first) so site totals reconcile. Chart.js from cdnjs.
---------------------------------------------------------------------------- */

// Cumulative UK capacity (GW), approximate. Installed/likely vs full pipeline.
const CAP_YEARS = ['2015','2018','2020','2022','2024','2026','2028','2030','2033','2037'];
const CAP_INSTALLED = [0.8, 1.0, 1.2, 1.4, 1.6, 2.0, 3.0, 4.9, null, null];     // operational / planning-approved
const CAP_PIPELINE  = [null, null, null, null, 1.6, 2.6, 4.2, 6.5, 7.6, 8.1];   // full announced pipeline
const GOV_TARGET = 6.0; // GW AI-capable by 2030

// Current operational capacity by cluster (MW)
const CLUSTERS_NOW = [
  ['London & M4 corridor', 850],
  ['M62 (Manchester–Leeds–Hull)', 471],
  ['Wales (Newport / Cardiff)', 150],
  ['Scotland', 50],
  ['North East England', 50],
];
// Largest single planned builds (MW)
const CLUSTERS_PLAN = [
  ['Elsham (Humber)', 1000],
  ['East Havering (London)', 600],
  ['Ravenscraig (Scotland)', 550],
  ['Blyth (North East)', 500],
  ['Humber Tech Park', 384],
];

const $ = s=>document.getElementById(s);
const n = id=>{const v=parseFloat($(id).value);return isNaN(v)?0:v;};
const t = x=> x>=1e6 ? (x/1e6).toFixed(2)+' Mt' : x>=1e3 ? (x/1e3).toFixed(1)+' kt' : Math.round(x).toLocaleString()+' t';
const L = x=> x>=1e9 ? (x/1e9).toFixed(2)+' bn L' : x>=1e6 ? (x/1e6).toFixed(1)+' ML' : Math.round(x).toLocaleString()+' L';

// --- Capacity chart -------------------------------------------------------
function drawCap(){
  new Chart($('capChart'),{
    type:'line',
    data:{labels:CAP_YEARS, datasets:[
      {label:'Installed / on-track (GW)', data:CAP_INSTALLED, borderColor:'#5bd1a6',
       backgroundColor:'#5bd1a655', fill:true, tension:.25, pointRadius:3, spanGaps:true, borderWidth:2},
      {label:'Full announced pipeline (GW)', data:CAP_PIPELINE, borderColor:'#7db7ff',
       backgroundColor:'transparent', fill:false, borderDash:[5,4], tension:.25, pointRadius:3, spanGaps:true, borderWidth:2},
      {label:'Gov 2030 target (6 GW)', data:CAP_YEARS.map(y=> y==='2030'?GOV_TARGET:null),
       borderColor:'#e0b341', backgroundColor:'#e0b341', pointRadius:6, pointStyle:'rectRot', showLine:false},
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:'#9aa3b2',boxWidth:12,font:{size:11}}},
        tooltip:{callbacks:{label:c=> c.parsed.y==null?null:` ${c.dataset.label}: ${c.parsed.y} GW`}}},
      scales:{x:{ticks:{color:'#6b7280',font:{size:10}},grid:{color:'#222732'}},
        y:{ticks:{color:'#6b7280',callback:v=>v+' GW',font:{size:10}},grid:{color:'#222732'},
           title:{display:true,text:'Cumulative capacity',color:'#9aa3b2',font:{size:11}}}}},
  });
}

// --- Footprint calculator -------------------------------------------------
// Hardware embodied: default anchors PER MW OF IT LOAD (1,100 tCO2e/MW,
// CIBSE TM65-based via ADW, range 750–1,500); the old servers/MW × per-server
// mass method (Google LCA) stays available as the labelled alternative preset.
function hwMode(){ const b=document.querySelector('#hwMethod .on'); return b ? b.dataset.hw : 'permw'; }
function calc(){
  const GW=n('gw'), MW=GW*1000;
  const load=n('load'), con=n('con'), spm=n('spm'), sec=n('sec'), ref=n('ref'),
        pue=n('pue'), grid=n('grid'), wue=n('wue');

  const constructionT = MW*con;                              // one-time, tCO2e
  const hwYearT = hwMode()==='permw' ? MW*n('hpm') : MW*spm*(sec/1000);
  const hardwareT = ref>0 ? hwYearT/ref : 0;                 // tCO2e / year (amortised)
  const annual_kWh = MW*1000 * 8760 * load;                  // kWh / year
  const facility_kWh = annual_kWh * pue;
  const operationalT = facility_kWh * grid / 1000;           // tCO2e / year
  const waterLyr = facility_kWh * wue;                       // L / year
  const annualT = hardwareT + operationalT;

  const km = annualT*1000/MMURR_BASES.car;                   // car-km equivalent (shared base, §4)
  $('out').innerHTML = `
    <div class="outrow"><span class="k">Construction embodied (one-time)</span><span class="v">${t(constructionT)}</span></div>
    <div class="outrow"><span class="k">Hardware embodied (per year, amortised)</span><span class="v">${t(hardwareT)}</span></div>
    <div class="outrow"><span class="k">Operational (per year)</span><span class="v">${t(operationalT)}</span></div>
    <div class="outrow"><span class="k">Total annual CO₂e</span><span class="v" style="color:var(--warn)">${t(annualT)}</span></div>
    <div class="outrow"><span class="k">Water (per year)</span><span class="v" style="color:var(--link)">${L(waterLyr)}</span></div>`;
  $('ctx').textContent =
    `At ${GW} GW and ${(load*100).toFixed(0)}% load, annual running emissions ≈ ${t(annualT)} CO₂e `+
    `(${(km/1e6).toFixed(1)} million car-km), plus a one-off ${t(constructionT)} to build the shells. `+
    `Hardware embodied is ${operationalT>0?Math.round(hardwareT/operationalT*100):0}% of operational here — it rises as the grid decarbonises.`;
}

// --- Cluster heat bars ----------------------------------------------------
function heat(el, rows, color){
  const max=Math.max(...rows.map(r=>r[1]));
  $(el).innerHTML = rows.map(([name,mw])=>`
    <div class="heatrow">
      <span>${name}</span>
      <span class="bar"><span style="width:${(mw/max*100).toFixed(1)}%;background:${color}"></span></span>
      <span class="mw">${mw} MW</span>
    </div>`).join('');
}

// Grid + water default to the selected region (§6); both remain editable.
// Grid is read through the shared gridFactor() (never hard-coded here) and
// carries the T&D toggle — enabled only where a source-backed adder exists (UK).
let TD = false;
function applyRegion(){
  const R = MMURR_REGION.data(), code = MMURR_REGION.get();
  const box = $('tdToggle'), wrap = $('tdWrap');
  const ok = MMURR_TD_ADDER[code] != null;
  if(!ok) TD = false;
  if(box){
    box.disabled = !ok; box.checked = TD;
    wrap.title = ok ? 'Adds the sourced T&D adder to the grid factor (UK +0.0185 kgCO₂e/kWh, DESNZ 2025)'
                    : 'No source-backed T&D adder for this region — only the UK has one (DESNZ 2025)';
    wrap.style.opacity = ok ? '' : '.45';
  }
  $('grid').value = gridFactor(code, TD);
  $('wue').value  = R.wue;
  syncWuePreset(R.wue);
  calc();
}
// Highlight the matching WUE preset chip (UK/EU average vs global evaporative).
function syncWuePreset(v){
  const box = $('wuePreset'); if(!box) return;
  [...box.children].forEach(b=>b.classList.toggle('on', parseFloat(b.dataset.wue)===v));
}

// --- Demand vs supply: national band chart (v2 §7.3) ------------------------
// NESO estimates (~5 TWh 2023 → ~20 TWh 2030; ~5.2 GW connected by 2030)
// against the theoretical ceiling of the operational fleet (GW × 8.76 TWh/GW).
// The implied fleet-average load factor is the 0.4–0.55 band — strictly a
// NATIONAL figure; per-site utilisation is not public and never synthesised.
const DEMAND_YEARS = ['2023','2024','2025','2026','2027','2028','2029','2030'];
const FLEET_GW     = [1.5, 1.6, 1.8, 2.0, 2.5, 3.0, 4.0, 5.2];   // operational trajectory (CW basis → NESO 5.2 by 2030)
const NESO_TWH     = [5.0, 6.0, 7.5, 9.0, 11.0, 13.5, 16.5, 20.0]; // NESO demand estimate, interpolated between anchors
function drawDemand(){
  const el = document.getElementById('demandChart'); if(!el) return;
  const ceiling = FLEET_GW.map(gw => +(gw*8.76).toFixed(1));
  new Chart(el,{
    type:'line',
    data:{ labels:DEMAND_YEARS, datasets:[
      {label:'Theoretical ceiling (operational GW × 8,760 h)', data:ceiling, borderColor:'#7db7ff',
       backgroundColor:'transparent', borderDash:[5,4], tension:.25, pointRadius:0, borderWidth:2},
      {label:'Ceiling × 0.55 load factor', data:ceiling.map(v=>+(v*0.55).toFixed(1)), borderColor:'transparent',
       backgroundColor:'#e0b34122', fill:'+1', tension:.25, pointRadius:0},
      {label:'Ceiling × 0.40 load factor', data:ceiling.map(v=>+(v*0.40).toFixed(1)), borderColor:'transparent',
       backgroundColor:'transparent', tension:.25, pointRadius:0},
      {label:'NESO data-centre demand estimate (TWh)', data:NESO_TWH, borderColor:'#5bd1a6',
       backgroundColor:'transparent', tension:.25, pointRadius:3, borderWidth:2},
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:'#9aa3b2',boxWidth:12,font:{size:11},
          filter:i=>!i.text.startsWith('Ceiling ×')}},
        tooltip:{callbacks:{label:c=> c.dataset.label.startsWith('Ceiling ×')?null:` ${c.dataset.label}: ${c.parsed.y} TWh`}}},
      scales:{x:{ticks:{color:'#6b7280',font:{size:10}},grid:{color:'#222732'}},
        y:{beginAtZero:true,ticks:{color:'#6b7280',callback:v=>v+' TWh',font:{size:10}},grid:{color:'#222732'},
           title:{display:true,text:'TWh / year',color:'#9aa3b2',font:{size:11}}}}},
  });
}

// --- Scope-2 gap: location- vs market-based paired bars (v2 §5) -------------
function drawScope2(){
  const S = window.MMURR_SCOPE2, el = document.getElementById('scope2Chart');
  if(!S || !el) return;
  new Chart(el,{
    type:'bar',
    data:{ labels:S.rows.map(r=>r.vendor), datasets:[
      {label:'Location-based estimate', data:S.rows.map(r=>r.location), backgroundColor:'#b18cff'},
      {label:'Market-based, reported',  data:S.rows.map(r=>r.market),   backgroundColor:'#5bd1a6'},
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#9aa3b2',boxWidth:12,font:{size:11}}},
        tooltip:{callbacks:{
          label:c=>` ${c.dataset.label}: ${c.parsed.y} Mt CO₂e (${S.rows[c.dataIndex].year})`,
          footer:items=>{const r=S.rows[items[0].dataIndex];
            return `certificates & PPAs: ${(r.location-r.market).toFixed(1)} Mt`;}}}},
      scales:{x:{ticks:{color:'#6b7280',font:{size:10}},grid:{color:'#222732'}},
        y:{beginAtZero:true,ticks:{color:'#6b7280',callback:v=>v+' Mt',font:{size:10}},grid:{color:'#222732'},
           title:{display:true,text:'Scope 2, 2024 (Mt CO₂e)',color:'#9aa3b2',font:{size:11}}}}},
  });
}

// --- Wire -----------------------------------------------------------------
function init(){
  drawCap();
  drawDemand();
  drawScope2();
  heat('heatNow', CLUSTERS_NOW, '#5bd1a6');
  heat('heatPlan', CLUSTERS_PLAN, '#ff6b57');
  applyRegion();                        // sets grid/water from region, then calc()
  MMURR_REGION.onChange(applyRegion);
  document.querySelectorAll('.calc input').forEach(i=>i.addEventListener('input',calc));
  $('scenario').addEventListener('click',e=>{
    if(!e.target.dataset.gw) return;
    [...e.currentTarget.children].forEach(b=>b.classList.remove('on'));
    e.target.classList.add('on'); $('gw').value=e.target.dataset.gw; calc();
  });
  const wp=$('wuePreset');
  if(wp) wp.addEventListener('click',e=>{
    if(!e.target.dataset.wue) return;
    $('wue').value=e.target.dataset.wue; syncWuePreset(parseFloat(e.target.dataset.wue)); calc();
  });
  $('tdToggle').addEventListener('change',e=>{ TD = e.target.checked; applyRegion(); });
  $('hwMethod').addEventListener('click',e=>{
    if(!e.target.dataset.hw) return;
    [...e.currentTarget.children].forEach(b=>b.classList.remove('on'));
    e.target.classList.add('on');
    const servers = e.target.dataset.hw==='servers';
    $('hwPermw').hidden = servers;
    document.querySelectorAll('.hw-servers').forEach(d=>d.hidden=!servers);
    calc();
  });
}
document.addEventListener('DOMContentLoaded',init);
