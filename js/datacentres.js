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
function calc(){
  const GW=n('gw'), MW=GW*1000;
  const load=n('load'), con=n('con'), spm=n('spm'), sec=n('sec'), ref=n('ref'),
        pue=n('pue'), grid=n('grid'), wue=n('wue');

  const constructionT = MW*con;                              // one-time, tCO2e
  const hardwareT = ref>0 ? MW*spm*(sec/1000)/ref : 0;       // tCO2e / year (amortised)
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
function applyRegion(){
  const R = MMURR_REGION.data();
  $('grid').value = R.grid;
  $('wue').value  = R.wue;
  calc();
}

// --- Wire -----------------------------------------------------------------
function init(){
  drawCap();
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
}
document.addEventListener('DOMContentLoaded',init);
