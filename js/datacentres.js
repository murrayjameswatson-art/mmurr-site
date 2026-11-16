/* ----------------------------------------------------------------------------
   mmurr.ai — UK Data Centres
   Capacity timeline + build-out footprint calculator + cluster heat.
   The CO2/water bases match the usage dashboard (grid & car come from
   js/factors.js, loaded first) so site totals reconcile. Charts are plain SVG
   via js/svgchart.js (no libraries).
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
  MMURR_CHART.line($('capChart'), {
    label:'UK data-centre capacity, installed and announced, 2015 to 2037',
    labels:CAP_YEARS, yTitle:'Cumulative capacity', yFmt:v=>+v.toFixed(1)+' GW',
    series:[
      {name:'Installed / on-track', data:CAP_INSTALLED, color:'#5bd1a6', area:true, points:true, spanGaps:true},
      {name:'Full announced pipeline', data:CAP_PIPELINE, color:'#7db7ff', dash:true, points:true, spanGaps:true},
      {name:'Government 2030 target', data:CAP_YEARS.map(y=> y==='2030'?GOV_TARGET:null), color:'#e0b341', line:false, marker:'diamond'},
    ],
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
    `(${km>=1e9 ? (km/1e9).toFixed(1)+' billion' : (km/1e6).toFixed(0)+' million'} car-km), plus a one-off ${t(constructionT)} to build the shells. `+
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

// --- Demand vs supply: national picture (v2 §7.3) --------------------------
// Demand and capacity now come from ONE source, NESO, so the ratio between them
// means something. Demand: FES 2025 ten-year forecast, data workbook fig. 49 / ED1
// (7.4 TWh 2023 → 20.1 TWh 2030). Capacity: NESO's connected data-centre demand,
// 2.4 GW now (it pairs this with 7.6 TWh/yr, i.e. the 2024 level) and ~5.2 GW by
// 2030 (NESO evidence to the Environmental Audit Committee, 2026).
// NESO publishes no capacity figures for the years between, so the ceiling is
// drawn only between those two anchors — a straight line, not a modelled path.
// The previous version divided NESO demand (all connected data centres) by a
// Computer Weekly co-location fleet starting at 1.5 GW; the smaller base inflated
// the implied load factor to 0.40–0.55. On one basis it is ~0.37 now, ~0.44 in 2030.
// Connected capacity includes cooling overhead and headroom, so this is NOT IT
// utilisation. Per-site utilisation is not public and never synthesised.
const DEMAND_YEARS = ['2023','2024','2025','2026','2027','2028','2029','2030'];
const NESO_GW      = [null, 2.4, null, null, null, null, null, 5.2];  // NESO connected capacity: the two published anchors
const NESO_TWH     = [7.40, 7.74, 8.13, 8.93, 10.46, 13.11, 16.59, 20.10]; // NESO FES 2025 ten-year forecast (TWh), as published
function drawDemand(){
  const el = document.getElementById('demandChart'); if(!el) return;
  const ceiling = NESO_GW.map(gw => gw == null ? null : +(gw*8.76).toFixed(1));
  MMURR_CHART.line(el, {
    label:'NESO data-centre electricity demand against the ceiling of NESO connected capacity, 2023 to 2030',
    labels:DEMAND_YEARS, yTitle:'TWh / year', yFmt:v=>+v.toFixed(1)+' TWh',
    series:[
      {name:'Ceiling: NESO connected capacity × 8,760 h', data:ceiling, color:'#7db7ff', dash:true, points:true, spanGaps:true},
      {name:'NESO data-centre demand forecast', data:NESO_TWH, color:'#5bd1a6', points:true},
    ],
    tipExtra:i => NESO_GW[i] == null ? null
      : `${NESO_GW[i]} GW connected · implied load factor ${(NESO_TWH[i]/ceiling[i]).toFixed(2)}`,
  });
}

// --- Scope-2 gap: location- vs market-based paired bars (v2 §5) -------------
function drawScope2(){
  const S = window.MMURR_SCOPE2, el = document.getElementById('scope2Chart');
  if(!S || !el) return;
  MMURR_CHART.bars(el, {
    label:'Scope 2 emissions, location-based versus market-based, Microsoft and Google',
    labels:S.rows.map(r=>r.vendor), yTitle:'Scope 2, latest reporting year (Mt CO₂e)', yFmt:v=>+v.toFixed(1)+' Mt',
    series:[
      {name:'Location-based (grid average)', data:S.rows.map(r=>r.location), color:'#b18cff'},
      {name:'Market-based (after certificates)', data:S.rows.map(r=>r.market), color:'#5bd1a6'},
    ],
    tipExtra:i=>{ const r=S.rows[i]; return `${r.year} · certificates & PPAs net off ${(r.location-r.market).toFixed(1)} Mt`; },
    height:260,
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
