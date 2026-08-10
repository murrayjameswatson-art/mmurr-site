/* ----------------------------------------------------------------------------
   mmurr.ai — "Run It Locally" page logic (local.html)

   Two views off js/data/local-models.js (MMURR_LOCAL):
     1. Fact strip + hardware-tier ladder — minimum hardware requirement
     2. Capital cost (capex), operating cost (opex) and a hosted-API
        comparison, by region

   Hand-rolled SVG (no chart library), same conventions as js/costlab.js.
   GPU capex/wattage for the enterprise tiers (C/D/E) is READ from
   MMURR_COST (js/cost-model.js) rather than sourced twice; region FX and
   currency come from MMURR_DATA (js/factors.js) via the shared
   MMURR_REGION control. The hosted-model comparison reads
   MMURR_DATA.models.axis + stepPrice/MMURR_MIX — the same mechanism
   js/costlab.js uses to overlay a real model's API price.
---------------------------------------------------------------------------- */
(function(){
  const DATA = window.MMURR_LOCAL; if(!DATA) return;
  const COST = window.MMURR_COST;   // optional — falls back to a fixed anchor if absent
  const AX = (window.MMURR_DATA && MMURR_DATA.models && MMURR_DATA.models.axis) || {};

  const NS='http://www.w3.org/2000/svg';
  const el=(n,a)=>{const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);return e;};
  const txt=(cls,x,y,anchor,s)=>{const e=el('text',{class:cls,x,y});if(anchor)e.setAttribute('text-anchor',anchor);e.textContent=s;return e;};
  const $=id=>document.getElementById(id);
  const mix=()=>window.MMURR_MIX?MMURR_MIX.get():0.5;

  // --- hardware-tier ladder metadata -----------------------------------------
  const TIERS = [
    {k:'A', hw:'API only',              desc:'No local hardware — the request is sent to a cloud-hosted provider.'},
    {k:'B', hw:'1 consumer GPU',        desc:'One consumer graphics card, 24–48GB of VRAM.'},
    {k:'C', hw:'2–4 data-centre GPUs',  desc:'Two to four data-centre-grade accelerators.'},
    {k:'D', hw:'4–8 data-centre GPUs',  desc:'Four to eight data-centre-grade accelerators — a substantial local deployment.'},
    {k:'E', hw:'Multi-node cluster',    desc:'More than one physical server, networked together.'},
  ];

  // --- tier derivation — DERIVED, not enumerated ------------------------------
  // ponytail: a simple VRAM-class/GPU-count ladder, not a full roofline model.
  // A single server commonly holds up to eight accelerators in practice, so
  // Tier D (<=8) versus Tier E (>8, requiring multiple networked servers) is
  // the real hardware boundary — sufficient to place every row correctly
  // today. If a future model straddles a boundary, split by GPU generation
  // before adding a sixth tier.
  function tierFor(row){
    if(row.minGPUs<=1 && row.gpuVramGB<=48) return 'B';
    if(row.minGPUs<=4 && row.gpuVramGB<=80) return 'C';
    if(row.minGPUs<=8 && row.gpuVramGB<=80) return 'D';
    return 'E';
  }

  // --- data + comparison-model helpers ----------------------------------------
  const providers = DATA.rows.map(r=>r.provider);
  function rowFor(p){ return DATA.rows.find(r=>r.provider===p); }
  // Display label for a comparison option; empty key = the generic estimate.
  function compareLabel(key){
    if(!key) return 'Generic hosted-service average';
    const m=AX[key]; return m ? `${m.group} — ${m.io[2]||m.label}` : key;
  }
  // USD list price per 1,000,000 tokens for the chosen comparison, blended
  // at the site-wide input/output mix (defaults to 50/50 if never set).
  function comparePriceUSD(key){
    if(!key) return COST ? COST.unit(COST.params(2026,'standard')).total : null;
    const m=AX[key]; if(!m) return null;
    const step=m.steps[m.steps.length-1];
    return window.stepPrice ? stepPrice(step, mix()) : step[2];
  }

  // Default selection: NOT Kimi K3 — presenting a model that cannot be run
  // on ordinary hardware as the default would be a dead end. Phi-4 has the
  // smallest hardware floor of the set, so it is always runnable.
  let provider = rowFor('Microsoft') ? 'Microsoft' : providers[0];
  let utilHours = 8;       // hours/day under load — Block D slider
  let compareKey = '';     // '' = generic hosted-service estimate; else an AX lineage key

  // --- capex / opex / hosted comparison ---------------------------------------
  // Enterprise tiers reuse the cost-model's data-centre-GPU anchor instead of
  // sourcing a second GPU price; only the consumer card is new to this page.
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
    // Straight-line depreciation over the hardware's working life (consumer:
    // 4 years flat; enterprise: reuse MMURR_COST.YP's life so it is not
    // sourced twice). Electricity alone is never a fair comparison against a
    // metered hosted service — the capital cost must be recovered first.
    const lifeYears = row.gpuVramGB<=48 ? 4 : (COST ? COST.YP[2026].life : 5);
    const capexPerMonth = capexLocal/(lifeYears*12);
    const totalMonthlyLocal = capexPerMonth + opexLocal;
    // Hosted comparison: reuse the chosen model's real list price rather
    // than a second estimate. Token VOLUME is held constant between the two
    // options (this tier's throughput at the chosen utilisation) so the
    // comparison is "the same usage, two different ways to pay for it".
    // ponytail: throughput 'r' is MMURR_COST's "standard frontier model"
    // figure, applied uniformly regardless of the selected model's own
    // size — a stand-in for a representative request volume, not a
    // per-model inference-speed simulation.
    let apiEquivLocal = null;
    const priceUSD = comparePriceUSD(compareKey);
    if(priceUSD!=null && COST){
      const p = COST.params(2026,'standard');
      const tokPerMonth = p.r * row.minGPUs * 3600 * utilHours * 30;
      apiEquivLocal = tokPerMonth/1e6 * priceUSD * fx;
    }
    return { capexLocal, capexPerMonth, opexLocal, totalMonthlyLocal, apiEquivLocal, kWhPerMonth };
  }

  // --- model select + fact strip -----------------------------------------------
  function buildModelSelect(){
    const sel=$('lm-model'); sel.innerHTML='';
    for(const r of DATA.rows){ const o=document.createElement('option'); o.value=r.provider;
      o.textContent=`${r.provider} — ${r.model}`; if(r.provider===provider) o.selected=true; sel.appendChild(o); }
  }
  function buildCompareSelect(){
    const sel=$('lm-compare'); sel.innerHTML='';
    const generic=document.createElement('option'); generic.value=''; generic.textContent='Generic hosted-service average'; sel.appendChild(generic);
    let og=null,last=null;
    for(const k in AX){ const m=AX[k];
      if(m.group!==last){ og=document.createElement('optgroup'); og.label=m.group; sel.appendChild(og); last=m.group; }
      const o=document.createElement('option'); o.value=k;
      o.textContent=`${m.io[2]||m.label} — $${m.io[0].toFixed(2)}/$${m.io[1].toFixed(2)} per 1,000,000 tokens`;
      (og||sel).appendChild(o);
    }
  }
  function renderFactStrip(row){
    const cells=[
      ['Total parameters', row.totalB.toLocaleString()+' billion'],
      ['Active parameters', row.activeB.toLocaleString()+' billion'+(row.activeB<row.totalB?' (Mixture-of-Experts)':'')],
      ['Q4 weight size', row.quantGB.toLocaleString()+' GB'],
      ['Licence', row.licence],
      ['Released', row.date],
    ];
    $('lm-facts').innerHTML = cells.map(([k,v])=>
      `<div class="stat"><div class="big" style="font-size:1.05rem">${v}</div><div class="lab">${k}</div></div>`).join('');
    const src=$('lm-source');
    if(src) src.innerHTML = row.sourceUrl
      ? `Source: <a href="${row.sourceUrl}" target="_blank" rel="noopener">Hugging Face model card</a>`
      : '';
  }

  // --- hardware-tier ladder -----------------------------------------------------
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
      if(i===floorIdx) svg.appendChild(txt('lm-floor-lab',x+cw/2,16,'middle','Minimum — '+row.model));
    });
    $('lm-tier-desc').textContent = `Tier ${floor}. ${TIERS[floorIdx].desc} Tiers shown in grey to the left do not have enough graphics memory (VRAM) to load the model at all, even at reduced (Q4) precision.`;
  }

  // --- cost by region -------------------------------------------------------
  function renderCost(row){
    const region = window.MMURR_REGION ? MMURR_REGION.get() : 'UK';
    const sym = window.MMURR_REGION ? MMURR_REGION.data().sym : '£';
    const {capexLocal, capexPerMonth, opexLocal, totalMonthlyLocal, apiEquivLocal, kWhPerMonth} = economics(row, region);
    const energyTxt = window.fmtEnergy ? window.fmtEnergy(kWhPerMonth*1000) : kWhPerMonth.toFixed(0)+' kWh';
    const tiles=[
      ['Capital cost (hardware)', sym+Math.round(capexLocal).toLocaleString(), row.minGPUs+' GPU'+(row.minGPUs>1?'s':'')+', '+region+' pricing · approximately '+sym+capexPerMonth.toFixed(0)+'/month if depreciated evenly'],
      ['Operating cost (electricity)', sym+opexLocal.toFixed(0)+' / month', energyTxt+' / month at '+utilHours+' hours/day'],
      ['Cost via '+compareLabel(compareKey), apiEquivLocal==null?'—':sym+apiEquivLocal.toFixed(0)+' / month', 'same monthly token volume, purchased via a hosted API'],
    ];
    $('lm-cost').innerHTML = tiles.map(([lab,big,sub])=>
      `<div class="stat"><div class="big" style="font-size:1.15rem">${big}</div><div class="lab">${lab}<br><span style="color:var(--faint)">${sub}</span></div></div>`).join('');
    if(apiEquivLocal!=null){
      // The fair comparison is the hosted price against the TOTAL monthly
      // cost of self-hosting (capital cost recovered over its working life,
      // plus electricity) — not electricity alone.
      const cheaper = apiEquivLocal < totalMonthlyLocal;
      $('lm-api-note').textContent = cheaper
        ? `At ${utilHours} hours/day, the hosted option is less expensive than self-hosting once the recovery of capital cost is included (${sym}${totalMonthlyLocal.toFixed(0)}/month total, versus ${sym}${apiEquivLocal.toFixed(0)}/month hosted). Self-hosting becomes more economical at higher, sustained usage, or where data cannot leave the organisation's own premises.`
        : `At ${utilHours} hours/day, the total monthly cost of self-hosting (${sym}${totalMonthlyLocal.toFixed(0)}, comprising capital-cost recovery and electricity) is already lower than the equivalent hosted option (${sym}${apiEquivLocal.toFixed(0)}/month). Sustained usage at this tier favours owning the hardware.`;
    } else { $('lm-api-note').textContent=''; }
    $('lm-util-out').textContent = utilHours+' hours/day';
  }

  // --- bindings -------------------------------------------------------------
  function render(){
    const row = rowFor(provider);
    renderFactStrip(row); drawLadder(row); renderCost(row);
  }
  function init(){
    buildModelSelect(); buildCompareSelect();
    $('lm-model').addEventListener('change', e=>{ provider=e.target.value; render(); });
    $('lm-compare').addEventListener('change', e=>{ compareKey=e.target.value; renderCost(rowFor(provider)); });
    $('lm-util').addEventListener('input', e=>{ utilHours=+e.target.value; renderCost(rowFor(provider)); });
    document.querySelectorAll('.lm-asof').forEach(n=> n.textContent = DATA.asOf);
    if(window.MMURR_REGION) MMURR_REGION.onChange(()=>renderCost(rowFor(provider)));
    render();
  }
  document.addEventListener('DOMContentLoaded', init);

  // --- ponytail: self-check, local only (mirrors js/cost-model.js) -----------
  if(['localhost','127.0.0.1',''].includes(location.hostname)){
    const phi4 = rowFor('Microsoft'), k3 = rowFor('Moonshot AI');
    console.assert(tierFor(phi4)==='B', 'Phi-4 (1 consumer GPU) lands on tier B');
    console.assert(tierFor(k3)==='D', 'Kimi K3 (8x data-centre GPU, single server) lands on tier D');
    console.assert(DATA.rows.length===10, 'exactly 10 provider rows');
    const e = economics(phi4,'UK');
    console.assert(e.capexLocal>0 && isFinite(e.capexLocal), 'capex is a positive finite number');
    console.assert(e.opexLocal>0 && isFinite(e.opexLocal), 'opex is a positive finite number');
  }
})();
