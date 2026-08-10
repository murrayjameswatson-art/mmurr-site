/* ----------------------------------------------------------------------------
   mmurr.ai — "Run It Locally" page logic (local.html)

   Three views off js/data/local-models.js (MMURR_LOCAL):
     1. Fact strip + tier ladder — "can I run it?" (Blocks B/C)
     2. Capex/opex/API-equivalent, by region — "what does it cost?" (Block D)
     3. Trend chart, Jan 2025 -> now — "how has this moved?" (Block F)

   Hand-rolled SVG (no chart lib), same conventions as js/costlab.js. GPU
   capex/wattage for the enterprise tiers (C/D/E) is READ from MMURR_COST
   (js/cost-model.js) rather than sourced twice; region FX/currency comes
   from MMURR_DATA (js/factors.js) via the shared MMURR_REGION control.
---------------------------------------------------------------------------- */
(function(){
  const DATA = window.MMURR_LOCAL; if(!DATA) return;
  const COST = window.MMURR_COST;   // optional — falls back to a fixed anchor if absent

  const NS='http://www.w3.org/2000/svg';
  const el=(n,a)=>{const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);return e;};
  const txt=(cls,x,y,anchor,s)=>{const e=el('text',{class:cls,x,y});if(anchor)e.setAttribute('text-anchor',anchor);e.textContent=s;return e;};
  const $=id=>document.getElementById(id);

  // --- tier ladder metadata (Block C, spec §4 table) --------------------------
  const TIERS = [
    {k:'A', hw:'API only',              desc:'No local GPU'},
    {k:'B', hw:'1× consumer 24–48GB',   desc:'Small / quantised models only'},
    {k:'C', hw:'2–4× A100/H100',        desc:'Mid-tier open weights'},
    {k:'D', hw:'4–8× H100 80GB',        desc:'Frontier load, limited concurrency'},
    {k:'E', hw:'Multi-node H100/H200',  desc:'Full-speed serving, long context'},
  ];

  // --- tier derivation — DERIVED, not enumerated (spec §2.1) ------------------
  // ponytail: a simple VRAM-class/GPU-count ladder, not a real roofline model.
  // A single node tops out around 8 accelerators in practice, so D (<=8) vs
  // E (>8, needs multi-node) is the real hardware boundary — good enough to
  // place every row correctly today. If a future row straddles a boundary,
  // split by GPU generation before adding a sixth band.
  function tierFor(row){
    if(row.minGPUs<=1 && row.gpuVramGB<=48) return 'B';
    if(row.minGPUs<=4 && row.gpuVramGB<=80) return 'C';
    if(row.minGPUs<=8 && row.gpuVramGB<=80) return 'D';
    return 'E';
  }

  // --- data helpers -------------------------------------------------------
  const flagRows = DATA.rows.filter(r=>r.flagship).sort((a,b)=>a.provider.localeCompare(b.provider));
  function flagshipFor(provider){ return DATA.rows.find(r=>r.provider===provider && r.flagship); }
  function rowsFor(provider){ return DATA.rows.filter(r=>r.provider===provider).sort((a,b)=> a.date<b.date?-1:1); }

  // Default selection: NOT Kimi K3 (spec §2.2 — a "can't run this" landing
  // state is a dead end). Phi-4 is the smallest floor, so it's always runnable.
  let provider = (flagshipFor('Microsoft')||flagRows[0]).provider;
  let utilHours = 8;          // hours/day under load, Block D slider
  let trendMetric = 'totalB'; // Block F radio: totalB | activeB | minGPUs | capexUSD

  // --- capex / opex / API-equivalent (Block D) --------------------------------
  // Enterprise tiers reuse the cost-model's H100-class anchor instead of a
  // second sourced GPU price; only the consumer card is new to this page.
  function gpuAnchor(row){
    if(row.gpuVramGB<=48) return { price:DATA.consumerGpu.priceUSD, watts:DATA.consumerGpu.watts };
    const yp = COST ? COST.YP[2026] : {cap:35000, gpuW:1000};
    return { price:yp.cap, watts:yp.gpuW };
  }
  function economics(row, regionCode){
    const RD = DATA.regions[regionCode] || DATA.regions.UK;
    const fx = (window.MMURR_DATA && MMURR_DATA.regions[regionCode] && MMURR_DATA.regions[regionCode].fx) || 1;
    const gpu = gpuAnchor(row);
    const capexLocal = row.minGPUs * gpu.price * RD.capexMult * fx;
    const kWhPerMonth = row.minGPUs * gpu.watts/1000 * utilHours * 30;
    const opexLocal = kWhPerMonth * RD.elecPrice;
    // Straight-line amortisation over the card's working life (consumer: 4yr
    // flat; enterprise: reuse MMURR_COST.YP's life so it isn't sourced twice).
    // Electricity alone is never a fair fight against a metered API — the
    // capex has to be paid back first, which is the whole "hosted is cheaper
    // until volume is high" point (spec §4D).
    const lifeYears = row.gpuVramGB<=48 ? 4 : (COST ? COST.YP[2026].life : 5);
    const capexPerMonth = capexLocal/(lifeYears*12);
    const totalMonthlyLocal = capexPerMonth + opexLocal;
    // API-equivalent: reuse MMURR_COST.unit() rather than a second $/token estimate.
    // ponytail: throughput 'r' is the engine's "standard frontier model" figure,
    // applied to every row regardless of its own size — a stand-in for "what a
    // comparable hosted request volume would cost", not a per-model inference
    // simulation. Good enough for the cheaper/pricier call; not a serving-speed claim.
    let apiEquivLocal = null;
    if(COST){
      const p = COST.params(2026,'standard');
      const tokPerMonth = p.r * row.minGPUs * 3600 * utilHours * 30; // tok/s/GPU x GPUs x seconds under load
      apiEquivLocal = tokPerMonth/1e6 * COST.unit(p).total * fx;
    }
    return { capexLocal, capexPerMonth, opexLocal, totalMonthlyLocal, apiEquivLocal, kWhPerMonth };
  }

  // --- Block B: model select + fact strip -------------------------------------
  function buildModelSelect(){
    const sel=$('lm-model'); sel.innerHTML='';
    for(const r of flagRows){ const o=document.createElement('option'); o.value=r.provider;
      o.textContent=`${r.provider} — ${r.model}`; if(r.provider===provider) o.selected=true; sel.appendChild(o); }
  }
  function renderFactStrip(row){
    const cells=[
      ['Total params', row.totalB.toLocaleString()+' B'],
      ['Active params', row.activeB.toLocaleString()+' B'+(row.activeB<row.totalB?' (MoE)':'')],
      ['Q4 weight size', row.quantGB.toLocaleString()+' GB'],
      ['Licence', row.licence],
      ['Released', row.date],
    ];
    // .stat/.big/.lab are the shared tile primitive from css/base.css — no new CSS needed.
    $('lm-facts').innerHTML = cells.map(([k,v])=>
      `<div class="stat"><div class="big" style="font-size:1.05rem">${v}</div><div class="lab">${k}</div></div>`).join('');
  }

  // --- Block C: tier ladder ----------------------------------------------------
  function drawLadder(row){
    const svg=$('lm-ladder'); svg.innerHTML='';
    const floor = tierFor(row), floorIdx = TIERS.findIndex(t=>t.k===floor);
    const W=760,H=92,PAD=6,gap=8,n=TIERS.length;
    const cw=(W-PAD*2-gap*(n-1))/n;
    TIERS.forEach((t,i)=>{
      const x=PAD+i*(cw+gap), capable=i>=floorIdx;
      svg.appendChild(el('rect',{x,y:26,width:cw,height:44,rx:8,class:'lm-tier '+(capable?'lm-on':'lm-off')}));
      svg.appendChild(txt('lm-tier-k',x+cw/2,44,'middle',t.k));
      svg.appendChild(txt('lm-tier-hw',x+cw/2,60,'middle',t.hw));
      if(i===floorIdx) svg.appendChild(txt('lm-floor-lab',x+cw/2,16,'middle','▼ floor — '+row.model));
    });
    $('lm-tier-desc').textContent = `Tier ${floor} — ${TIERS[floorIdx].desc}. Tiers to the left are greyed: not enough VRAM to load the weights at all, even quantised.`;
  }

  // --- Block D: cost by geography ----------------------------------------------
  function renderCost(row){
    const region = window.MMURR_REGION ? MMURR_REGION.get() : 'UK';
    const sym = window.MMURR_REGION ? MMURR_REGION.data().sym : '£';
    const {capexLocal, capexPerMonth, opexLocal, totalMonthlyLocal, apiEquivLocal, kWhPerMonth} = economics(row, region);
    const energyTxt = window.fmtEnergy ? window.fmtEnergy(kWhPerMonth*1000) : kWhPerMonth.toFixed(0)+' kWh';
    const tiles=[
      ['Capex — hardware', sym+Math.round(capexLocal).toLocaleString(), row.minGPUs+' GPU'+(row.minGPUs>1?'s':'')+', '+region+' · ≈'+sym+capexPerMonth.toFixed(0)+'/mo amortised'],
      ['Opex — electricity', sym+opexLocal.toFixed(0)+' / mo', energyTxt+' / month at '+utilHours+'h/day'],
      ['Hosted-API equivalent', apiEquivLocal==null?'—':sym+apiEquivLocal.toFixed(0)+' / mo', 'same token volume, via API'],
    ];
    $('lm-cost').innerHTML = tiles.map(([lab,big,sub])=>
      `<div class="stat"><div class="big" style="font-size:1.15rem">${big}</div><div class="lab">${lab}<br><span style="color:var(--faint)">${sub}</span></div></div>`).join('');
    if(apiEquivLocal!=null){
      // Fair comparison is hosted vs TOTAL self-host cost (amortised capex +
      // electricity), not electricity alone — capex has to be paid back first.
      const cheaper = apiEquivLocal < totalMonthlyLocal;
      $('lm-api-note').textContent = cheaper
        ? `At ${utilHours}h/day, hosted comes out cheaper than self-hosting once capex amortisation is included (${sym}${totalMonthlyLocal.toFixed(0)}/mo total vs ${sym}${apiEquivLocal.toFixed(0)}/mo hosted) — self-hosting only wins at higher, sustained volume, or for data that can't leave the building.`
        : `At ${utilHours}h/day, self-hosting's amortised total (${sym}${totalMonthlyLocal.toFixed(0)}/mo, capex + electricity) already undercuts the hosted-API equivalent (${sym}${apiEquivLocal.toFixed(0)}/mo) — sustained use at this tier favours owning the hardware.`;
    } else { $('lm-api-note').textContent=''; }
    $('lm-util-out').textContent = utilHours+' h/day';
  }

  // --- Block F: trend chart -----------------------------------------------------
  const LOG_METRICS = new Set(['totalB','activeB','capexUSD']);
  const METRIC_LABEL = {totalB:'Total parameters (B)', activeB:'Active parameters (B)', minGPUs:'Minimum GPUs to self-host', capexUSD:'Estimated capex at that floor (US$)'};
  function metricValue(row, metric){
    if(metric==='capexUSD') return economics(row,'US').capexLocal; // US baseline; region-agnostic reference line
    return row[metric];
  }
  function dateFrac(d){ const [y,m]=d.split('-').map(Number); return y + (m-1)/12; }

  function drawTrend(){
    const svg=$('lm-trend'); svg.innerHTML='';
    const W=760,H=260,PL=54,PR=110,PT=18,PB=30;
    const t0=dateFrac('2025-01'), t1=dateFrac(DATA.asOf);
    const providers=[...new Set(DATA.rows.map(r=>r.provider))];
    const log = LOG_METRICS.has(trendMetric);
    const vals=DATA.rows.map(r=>metricValue(r,trendMetric));
    const yv = v=> log ? Math.log10(Math.max(v,0.1)) : v;
    const minY=Math.min(...vals.map(yv)), maxY=Math.max(...vals.map(yv));
    const x=t=>PL+(t-t0)/(t1-t0||1)*(W-PL-PR);
    const y=v=>H-PB-(yv(v)-minY)/((maxY-minY)||1)*(H-PT-PB);

    // gridlines + y-axis ticks
    for(let i=0;i<=4;i++){ const yy=PT+i*(H-PT-PB)/4;
      svg.appendChild(el('line',{class:'lm-gridline',x1:PL,x2:W-PR,y1:yy,y2:yy}));
      const val = log ? Math.pow(10, maxY-(maxY-minY)*i/4) : maxY-(maxY-minY)*i/4;
      svg.appendChild(txt('lm-axis',PL-6,yy+3,'end', val>=100?Math.round(val).toLocaleString():val.toFixed(val<10?1:0)));
    }
    // x-axis: year ticks
    for(let yr=2025; yr<=Math.ceil(t1); yr++){ const xx=x(yr);
      if(xx>=PL && xx<=W-PR) svg.appendChild(txt('lm-axis',xx,H-PB+16,'middle',yr)); }
    svg.appendChild(txt('lm-axis',PL,PT-6,'start',METRIC_LABEL[trendMetric]));

    providers.forEach(p=>{
      const rows=rowsFor(p); if(!rows.length) return;
      const on = p===provider;
      let d=''; rows.forEach((r,i)=> d+=(i?'L':'M')+x(dateFrac(r.date))+' '+y(metricValue(r,trendMetric)));
      svg.appendChild(el('path',{class:'lm-serie '+(on?'lm-serie-on':'lm-serie-off'),d}));
      rows.forEach(r=> svg.appendChild(el('circle',{class:'lm-dot '+(on?'lm-dot-on':'lm-dot-off'),cx:x(dateFrac(r.date)),cy:y(metricValue(r,trendMetric)),r:on?3.5:2.5})));
      const last=rows[rows.length-1];
      svg.appendChild(txt('lm-serielab'+(on?' on':''), x(dateFrac(last.date))+6, y(metricValue(last,trendMetric))+3, 'start', p));
    });
  }

  // --- bindings -------------------------------------------------------------
  function render(){
    const row = flagshipFor(provider);
    renderFactStrip(row); drawLadder(row); renderCost(row); drawTrend();
  }
  function init(){
    buildModelSelect();
    $('lm-model').addEventListener('change', e=>{ provider=e.target.value; render(); });
    $('lm-util').addEventListener('input', e=>{ utilHours=+e.target.value; renderCost(flagshipFor(provider)); });
    $('lm-metric').addEventListener('change', e=>{ const b=e.target.closest('[data-metric]'); if(!b)return; trendMetric=b.dataset.metric; drawTrend(); });
    document.querySelectorAll('.lm-asof').forEach(n=> n.textContent = DATA.asOf);
    if(window.MMURR_REGION) MMURR_REGION.onChange(()=>renderCost(flagshipFor(provider)));
    render();
  }
  document.addEventListener('DOMContentLoaded', init);

  // --- ponytail: self-check, local only (mirrors js/cost-model.js) -----------
  if(['localhost','127.0.0.1',''].includes(location.hostname)){
    const phi4 = DATA.rows.find(r=>r.model==='Phi-4'), k3 = DATA.rows.find(r=>r.model==='Kimi K3');
    console.assert(tierFor(phi4)==='B', 'Phi-4 (1 consumer GPU) lands on tier B');
    console.assert(tierFor(k3)==='D', 'Kimi K3 (8x H100 80GB, single node) lands on tier D, the single-node ceiling');
    console.assert(flagRows.length===10, 'exactly 10 flagship rows, one per provider');
    const e = economics(phi4,'UK');
    console.assert(e.capexLocal>0 && isFinite(e.capexLocal), 'capex is a positive finite number');
    console.assert(e.opexLocal>0 && isFinite(e.opexLocal), 'opex is a positive finite number');
  }
})();
