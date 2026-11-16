/* ----------------------------------------------------------------------------
   mmurr.ai — "Run It Locally" page logic (local.html)

   Two views off js/data/local-models.js (MMURR_LOCAL):
     1. Fact strip + hardware-tier ladder — minimum hardware requirement
     2. Build or buy: the monthly cost of self-hosting (hardware recovered
        over its life + electricity) against buying the SAME model per token
        from hosting providers, expressed as a break-even volume and speed.
        Frontier models appear only as a reference for the capability gap.

   Hand-rolled SVG (no chart library), same conventions as js/costlab.js.
   GPU capex/wattage for the enterprise tiers (C/D/E) is READ from
   MMURR_COST (js/cost-model.js) rather than sourced twice; region FX and
   currency come from MMURR_DATA (js/factors.js) via the shared
   MMURR_REGION control. Hosted prices for the open models come from the
   weekly feed (MMURR_API_PRICES.open) with row.hosted as the fallback; the
   frontier reference reads MMURR_DATA.models.axis + stepPrice/MMURR_MIX.
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
  // What the SAME model costs per 1M tokens from hosting providers: the weekly
  // feed's median if present, else the dated anchor in local-models.js.
  function hostedFor(row){
    const feed = window.MMURR_API_PRICES && MMURR_API_PRICES.open && MMURR_API_PRICES.open[row.provider];
    const h = feed || row.hosted;
    return { ...h, usd: mix()*h.in + (1-mix())*h.out, fromFeed: !!feed };
  }
  // Frontier reference: latest list price of a lineage, blended at the site mix.
  function frontierUSD(key){
    const m=AX[key]; if(!m) return null;
    const step=m.steps[m.steps.length-1];
    return { name: m.io[2] || m.label, usd: window.stepPrice ? stepPrice(step, mix()) : step[2] };
  }

  // Default selection: NOT Kimi K3 — presenting a model that cannot be run
  // on ordinary hardware as the default would be a dead end. Gemma 4 (Mar 2026)
  // is the newest model here that still fits one consumer GPU (Phi-4, Dec 2024,
  // has a lower floor but is older).
  let provider = rowFor('Google') ? 'Google' : providers[0];
  let utilHours = 8;       // hours/day under load — Block D slider

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
    // Build or buy, without assuming a throughput: the self-hosting bill buys
    // N million tokens of the SAME model from a hosting provider. Self-hosting
    // only saves money if the hardware really produces more than N — i.e. a
    // sustained rate of breakEvenTps over the hours it runs.
    const hosted = hostedFor(row);
    const breakEvenMTok = totalMonthlyLocal / (hosted.usd * fx);
    const breakEvenTps = breakEvenMTok*1e6 / (utilHours*3600*30);
    // Reference speeds. Consumer tier: one user, memory-bandwidth bound —
    // each token reads every active weight once (Q4 ≈ 0.5 bytes/param).
    // Data-centre tiers: the Cost-of-Service model's tokens/s per GPU for a
    // busy, batched service (an ASSUMPTION there, labelled as such here).
    const singleUserTps = row.gpuVramGB<=48
      ? DATA.consumerGpu.bandwidthGBs*row.minGPUs / (row.activeB*0.5) : null;
    const busyTps = row.gpuVramGB<=48 ? null : (COST ? COST.YP[2026].r : 900) * row.minGPUs;
    return { capexLocal, capexPerMonth, opexLocal, totalMonthlyLocal, kWhPerMonth, lifeYears,
             hosted, breakEvenMTok, breakEvenTps, singleUserTps, busyTps };
  }

  // --- model select + fact strip -----------------------------------------------
  function buildModelSelect(){
    const sel=$('lm-model'); sel.innerHTML='';
    for(const r of DATA.rows){ const o=document.createElement('option'); o.value=r.provider;
      o.textContent=`${r.provider} — ${r.model}`; if(r.provider===provider) o.selected=true; sel.appendChild(o); }
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
    const E = economics(row, region);
    const fx = (window.MMURR_DATA && MMURR_DATA.regions[region] && MMURR_DATA.regions[region].fx) || 1;
    const money = v => sym + Math.round(v).toLocaleString();
    const mtok = v => v>=100 ? Math.round(v).toLocaleString() : v>=10 ? v.toFixed(0) : v.toFixed(1);
    const tps = v => v>=100 ? Math.round(v).toLocaleString() : v.toFixed(v>=10?0:1);
    const energyTxt = window.fmtEnergy ? window.fmtEnergy(E.kWhPerMonth*1000) : E.kWhPerMonth.toFixed(0)+' kWh';
    const gpus = row.minGPUs+' GPU'+(row.minGPUs>1?'s':'');
    const tiles=[
      ['Self-hosting, per month', money(E.totalMonthlyLocal),
       `${gpus} (${money(E.capexLocal)} up front, recovered over ${E.lifeYears} years) plus ${money(E.opexLocal)} of electricity (${energyTxt}) at ${utilHours} hours/day`],
      ['The same money, bought as a service', mtok(E.breakEvenMTok)+' million tokens / month',
       `${row.model} from hosting providers at $${E.hosted.in.toFixed(2)} in / $${E.hosted.out.toFixed(2)} out per million tokens (median of ${E.hosted.n} provider${E.hosted.n>1?'s':''})`],
      ['Break-even speed', tps(E.breakEvenTps)+' tokens / second',
       `what the hardware must average for every one of those ${utilHours} hours to beat buying the tokens`],
    ];
    $('lm-cost').innerHTML = tiles.map(([lab,big,sub])=>
      `<div class="stat"><div class="big" style="font-size:1.15rem">${big}</div><div class="lab">${lab}<br><span style="color:var(--faint)">${sub}</span></div></div>`).join('');

    // Reading the break-even against what the hardware can physically do.
    let read;
    if(E.singleUserTps != null){
      const ok = E.breakEvenTps <= E.singleUserTps;
      read = `One consumer GPU serving one person tops out at about ${tps(E.singleUserTps)} tokens/second for ${row.model} (memory bandwidth ÷ model size). ` +
        (ok ? `So it can break even, but only if it is generating for ${Math.round(E.breakEvenTps/E.singleUserTps*100)}% or more of those ${utilHours} hours.`
            : `That is below the break-even speed: at these prices this hardware cannot pay for itself on token volume, even flat out. The case for it is privacy or offline use, not cost.`);
    } else {
      const share = E.breakEvenTps / E.busyTps;
      read = `A data-centre server batching many requests at once is much faster than one user: the site's Cost-of-Service model assumes about ${tps(E.busyTps/row.minGPUs)} tokens/second per GPU for a busy service (an assumption, not a measurement). ` +
        (share <= 1 ? `On that basis this setup breaks even only if your own demand keeps it at least ${Math.max(1,Math.round(share*100))}% as busy as a commercial service, for ${utilHours} hours a day.`
                    : `Even that busy, it would not break even at ${utilHours} hours a day: hosting providers sell this model for less than it costs to run it yourself.`);
    }
    const refs = ['oa:auto','an:opus'].map(frontierUSD).filter(Boolean)
      .map(f => `${money(E.breakEvenMTok*f.usd*fx)} on ${f.name}`);
    if(refs.length) read += ` For reference, the same ${mtok(E.breakEvenMTok)} million tokens a month would cost ${refs.join(' or ')}, the price of frontier capability this model does not match.`;
    $('lm-api-note').textContent = read;
    $('lm-util-out').textContent = utilHours+' hours/day';
  }

  // --- bindings -------------------------------------------------------------
  function render(){
    const row = rowFor(provider);
    renderFactStrip(row); drawLadder(row); renderCost(row);
  }
  function init(){
    buildModelSelect();
    $('lm-model').addEventListener('change', e=>{ provider=e.target.value; render(); });
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
    console.assert(tierFor(k3)==='E', 'Kimi K3 (2.8T params, 21 data-centre GPUs) lands on tier E');
    console.assert(DATA.rows.length===10, 'exactly 10 provider rows');
    const e = economics(phi4,'UK');
    console.assert(e.capexLocal>0 && isFinite(e.capexLocal), 'capex is a positive finite number');
    console.assert(e.opexLocal>0 && isFinite(e.opexLocal), 'opex is a positive finite number');
  }
})();
