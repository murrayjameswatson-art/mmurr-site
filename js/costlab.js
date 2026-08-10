/* ----------------------------------------------------------------------------
   mmurr.ai — cost-of-service page logic (costmodel.html)

   Drives three views off the shared engine (js/cost-model.js, MMURR_COST):
     1. Cost-to-serve — the six-layer fully-loaded $/1M-token stack for a
        year+archetype, with a real model's API list price overlaid → margin.
     2. Cost over time — fully-loaded vs physical $/1M across 2023–26.
     3. Whole company / year — $/yr + CO2e + water for a lab, with the
        "estimates, not disclosures" caveat.

   Hand-rolled SVG (no chart lib), same conventions as js/pricelab.js. All USD:
   this is vendor economics, not a buyer's localised bill. Reads model API
   prices + the traffic-mix slider from js/factors.js (MMURR_DATA / MMURR_MIX).
---------------------------------------------------------------------------- */
(function(){
  const C = window.MMURR_COST; if(!C) return;
  const AX = (window.MMURR_DATA && MMURR_DATA.models && MMURR_DATA.models.axis) || {};

  // --- layers (draw order) + display meta -----------------------------------
  const LAYERS = [
    ['silicon','Silicon depreciation','cl-silicon','#7db7ff','phys'],
    ['facility','Facility / cooling','cl-facility','#5bd1a6','phys'],
    ['energy','Electricity','cl-energy','#54c8e8','phys'],
    ['network','Network / host','cl-network','#9aa3b2','phys'],
    ['training','Amortised training','cl-training','#e0b341','soft'],
    ['rnd','R&D / experiments','cl-rnd','#ff6b57','soft'],
  ];

  // --- state ----------------------------------------------------------------
  let year = 2026, arch = 'standard', model = C ? null : null;
  let servedLog = 14.9, rnd = 2.0;            // slider values (T_s = 10^servedLog)
  let elec = null, grid = null, util = null;  // advanced overrides (null → baseline)
  let company = 'openai';

  // --- helpers --------------------------------------------------------------
  const NS='http://www.w3.org/2000/svg';
  const el=(n,a)=>{const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);return e;};
  const txt=(cls,x,y,anchor,s)=>{const e=el('text',{class:cls,x,y});if(anchor)e.setAttribute('text-anchor',anchor);e.textContent=s;return e;};
  const $=id=>document.getElementById(id);
  const mix=()=>window.MMURR_MIX?MMURR_MIX.get():0.5;

  const usd=v=> v>=100 ? '$'+v.toLocaleString(undefined,{maximumFractionDigits:0})
              : v>=10  ? '$'+v.toFixed(1) : '$'+v.toFixed(2);
  const fmtBigTok=n=> n>=1e15?(n/1e15).toFixed(1)+' Q':n>=1e12?(n/1e12).toFixed(0)+' T':(n/1e9).toFixed(0)+' B';
  const fmtB=v=> v>=1e9?'$'+(v/1e9).toFixed(1)+'B':'$'+(v/1e6).toFixed(0)+'M';
  const fmtMt=t=> t>=1e6?(t/1e6).toFixed(2)+' Mt':Math.round(t).toLocaleString()+' t';
  const fmtGL=L=> L>=1e9?(L/1e9).toFixed(1)+' GL':L>=1e6?(L/1e6).toFixed(1)+' ML':Math.round(L).toLocaleString()+' L';

  // archetype guess when a model is picked (user can still override)
  function archFor(key){
    if(!key) return arch;
    const m=AX[key]; if(!m) return 'standard';
    const s=(m.label+' '+(m.io&&m.io[2]||'')+' '+key).toLowerCase();
    if(/think|reason/.test(s)) return 'reasoning';
    if(/flash|mini|haiku|luna|lite/.test(s)) return 'efficient';
    if(/opus|fable|ultra|large|grok|pro\b/.test(s)) return 'large';
    return 'standard';
  }
  // current model's blended API list price, USD/1M (latest step, at the mix)
  function priceOf(key){
    const m=AX[key]; if(!m) return null;
    const step=m.steps[m.steps.length-1];
    return window.stepPrice?stepPrice(step,mix()):step[2];
  }
  function currentParams(){
    const o={ served: Math.pow(10,servedLog), rnd };
    if(elec>0) o.elec=elec; if(grid>0) o.grid=grid; if(util>0) o.util=util;
    return C.params(year, arch, o);
  }

  // --- build controls -------------------------------------------------------
  function buildModelSelect(){
    const sel=$('cm-model'); sel.innerHTML='';
    const none=document.createElement('option'); none.value=''; none.textContent='— none (cost only) —'; sel.appendChild(none);
    let og=null,last=null;
    for(const k in AX){ const m=AX[k];
      if(m.group!==last){ og=document.createElement('optgroup'); og.label=m.group; sel.appendChild(og); last=m.group; }
      const o=document.createElement('option'); o.value=k;
      o.textContent=`${m.group} ${m.io[2]||m.label} — $${(m.io[0]).toFixed(2)}/$${(m.io[1]).toFixed(2)} per 1M`;
      if(k===model) o.selected=true; og.appendChild(o);
    }
  }
  function buildCompanies(){
    const host=$('cm-co'); host.innerHTML='';
    for(const k in C.CO){ const b=document.createElement('button'); b.dataset.c=k; b.textContent=C.CO[k].label;
      b.setAttribute('aria-pressed', k===company?'true':'false'); host.appendChild(b); }
  }
  // seed sliders/inputs to the current year+archetype baseline
  function seedInputs(){
    const base=C.params(year, arch);
    servedLog=Math.log10(base.served); $('cm-served').value=servedLog.toFixed(2);
    rnd=base.rnd; $('cm-rnd').value=rnd;
    elec=grid=util=null;
    $('cm-elec').placeholder=base.elec; $('cm-elec').value='';
    $('cm-grid').placeholder=base.grid; $('cm-grid').value='';
    $('cm-util').placeholder=base.util; $('cm-util').value='';
    syncSliderLabels();
  }
  function syncSliderLabels(){
    $('cm-servedOut').textContent = fmtBigTok(Math.pow(10,servedLog))+' tok';
    $('cm-rndOut').textContent = rnd.toFixed(1)+'×';
  }

  // --- draw: cost-to-serve stacked bar --------------------------------------
  function drawStack(r, price){
    const svg=$('cmStack'); svg.innerHTML='';
    const W=760,H=150,PL=44,PR=18,barY=40,barH=40,axisY=barY+barH+22;
    const maxX=Math.max(r.total, price||0)*1.14 || 1;
    const x=v=>PL+v/maxX*(W-PL-PR);
    // axis ticks + gridlines
    for(let i=0;i<=4;i++){ const v=maxX*i/4, xx=x(v);
      svg.appendChild(el('line',{class:'cm-gridline',x1:xx,x2:xx,y1:barY-8,y2:axisY-12}));
      svg.appendChild(txt('cm-axis',xx,axisY,'middle','$'+(+v.toFixed(v<10?1:0))));
    }
    svg.appendChild(txt('cm-axis',PL,barY-14,'start','fully-loaded $ / 1M tokens'));
    // stacked segments (cumulative)
    let acc=0;
    for(const [k,label,cls] of LAYERS){ const w=x(acc+r.L[k])-x(acc);
      if(w>0.02){ const rect=el('rect',{class:cls,x:x(acc),y:barY,width:w,height:barH});
        const t=el('title',{}); t.textContent=`${label}: ${usd(r.L[k])} / 1M`; rect.appendChild(t); svg.appendChild(rect); }
      acc+=r.L[k];
    }
    // total label
    svg.appendChild(txt('cm-total',x(r.total)+6,barY+barH/2+4,'start',usd(r.total)+' /1M'));
    // API price marker
    if(price!=null){ const xx=x(price);
      svg.appendChild(el('line',{class:'cm-priceline',x1:xx,x2:xx,y1:barY-10,y2:barY+barH+10}));
      svg.appendChild(txt('cm-pricelab',xx, barY-14,'middle','API '+usd(price)));
      // margin bracket under the bar
      const a=Math.min(xx,x(r.total)), b=Math.max(xx,x(r.total)), my=barY+barH+8;
      if(b-a>3){ svg.appendChild(el('line',{class:'cm-gridline',x1:a,x2:b,y1:my,y2:my}));
        const pos=price>=r.total;
        svg.appendChild(txt('cm-barlab',(a+b)/2,my+12,'middle',(pos?'margin ':'loss ')+usd(Math.abs(price-r.total)))); }
    }
  }

  // --- draw: cost over time (2023-26) ---------------------------------------
  function drawTrend(){
    const svg=$('cmTrend'); svg.innerHTML='';
    const W=760,H=240,PL=48,PR=18,PT=18,PB=34;
    const years=[2023,2024,2025,2026];
    const rows=years.map(y=>{ const p=C.params(y,arch,{rnd}); return C.unit(p); });
    const maxY=Math.max(...rows.map(r=>r.total))*1.12 || 1;
    const x=i=>PL+i*(W-PL-PR)/(years.length-1);
    const y=v=>H-PB-(v/maxY)*(H-PT-PB);
    for(let i=0;i<=4;i++){ const yy=PT+i*(H-PT-PB)/4;
      svg.appendChild(el('line',{class:'cm-gridline',x1:PL,x2:W-PR,y1:yy,y2:yy}));
      svg.appendChild(txt('cm-axis',PL-6,yy+3,'end','$'+(+(maxY*(1-i/4)).toFixed(1)))); }
    years.forEach((yr,i)=> svg.appendChild(txt('cm-axis',x(i),H-PB+16,'middle',yr)));
    const line=(sel,cls)=>{ let d=''; rows.forEach((r,i)=> d+=(i?'L':'M')+x(i)+' '+y(sel(r))); svg.appendChild(el('path',{class:'cm-serie '+cls,d})); };
    line(r=>r.physical,'cm-serie-phys'); line(r=>r.total,'cm-serie-total');
    rows.forEach((r,i)=>{
      svg.appendChild(el('circle',{class:'cm-dot',cx:x(i),cy:y(r.total),r:3.5,fill:'#e8eaed'}));
      svg.appendChild(el('circle',{class:'cm-dot',cx:x(i),cy:y(r.physical),r:3,fill:'#7db7ff'}));
      svg.appendChild(txt('cm-barlab',x(i),y(r.total)-9,'middle',usd(r.total)));
    });
  }

  // --- render readouts + env strip + disclosure -----------------------------
  function renderReadouts(r, price){
    $('cm-r-phys').textContent  = usd(r.physical);
    $('cm-r-soft').textContent  = usd(r.soft);
    $('cm-r-total').textContent = usd(r.total);
    $('cm-r-price').textContent = price==null?'—':usd(price);
    const mEl=$('cm-r-margin');
    if(price==null){ mEl.textContent='—'; mEl.className='cm-v'; }
    else { const m=price-r.total, pct=price>0?m/price*100:0;
      mEl.innerHTML = usd(Math.abs(m))+' <small>'+(m>=0?'+':'−')+Math.abs(pct).toFixed(0)+'%</small>';
      mEl.className='cm-v '+(m>=0?'pos':'neg'); }
  }
  function renderEnv(r){
    const perAnsWh=r.kWh*0.7;                    // 700-tok answer
    $('cm-env').innerHTML=`
      <div class="cell"><div class="k">Energy / 1M tok</div><div class="v">${r.kWh.toFixed(2)} kWh</div></div>
      <div class="cell"><div class="k">CO₂e / 1M tok</div><div class="v">${r.co2.toFixed(2)} kg</div></div>
      <div class="cell"><div class="k">Water / 1M tok</div><div class="v">${r.water.toFixed(1)} L</div></div>
      <div class="cell"><div class="k">Per 700-tok answer</div><div class="v">${perAnsWh.toFixed(2)} Wh</div></div>`;
  }
  function renderLegend(r){
    let html='<span class="grp">Physical serving (~±30%)</span>';
    for(const [k,label,,col,grp] of LAYERS){
      if(grp==='soft' && !html.includes('Soft')) html+='<span class="grp">Soft — estimated (±order of magnitude)</span>';
      html+=`<span><i style="background:${col}"></i>${label} · ${usd(r.L[k])}</span>`;
    }
    $('cm-legend').innerHTML=html;
  }
  // Only says what the readouts above don't already show — no restated
  // dollar figures, no jargon the sliders' own reference copy already covers.
  function renderDisc(r, price){
    let s=`At the <b>${year}</b> baseline.`;
    if(price!=null){ const m=price-r.total;
      s+= m>=0 ? ` The selected model's list price implies a <b>${usd(m)}</b> gross margin over fully-loaded cost `+
                  `(${(m/price*100).toFixed(0)}% of price).`
               : ` The selected model lists <b>${usd(-m)}</b> <b style="color:var(--hot)">below</b> fully-loaded cost — `+
                  `either loss-leading, or the cost inputs above are too high for this class.`;
    } else { s+=` Pick a model above to compare its API price against this cost.`; }
    s+=` Physical serving here is the same quantity as "token cost" on the <a href="prices.html">Impact Calculator</a>.`;
    $('cm-disc').innerHTML=s;
  }

  // --- render company view --------------------------------------------------
  function drawCompany(){
    const c=C.CO[company], p=C.YP[year], r=C.company(c,p);
    const disclosed = {openai:50, anthropic:15, xai:15, google:null, meta:null, mistral:null}[company];
    const tiles=[
      ['Cost of service / yr', fmtB(r.total), 'accrual, not cash capex'],
      ['CO₂e / yr', fmtMt(r.co2), (c.grid!=null?c.grid:p.grid)+' gCO₂e/kWh'],
      ['Water / yr', fmtGL(r.water), 'onsite + offsite'],
      ['Avg IT power', c.itMW.toLocaleString()+' MW', '× PUE '+p.pue+' at the wall'],
      ['Accelerators', (r.gpus/1e3).toFixed(0)+'k', 'implied fleet size'],
      ['Energy / yr', (r.kWhYr/1e9).toFixed(1)+' TWh', 'grid draw'],
    ];
    $('cm-cotiles').innerHTML = tiles.map(([lab,big,sub])=>
      `<div class="stat"><div class="big">${big}</div><div class="lab">${lab}<br><span style="color:var(--faint)">${sub}</span></div></div>`).join('');
    // implied per-1M reconciliation + cash gap
    let note=`<b>${c.label}</b> — ${c.anchor}. `;
    if(disclosed) note+=`Disclosed spend ≈ <b>$${disclosed}B</b> is mostly cash capex buying <em>new</em> capacity; `+
      `the accrual cost of running the fleet that exists is <b>${fmtB(r.total)}</b> — the gap is the buildout. `;
    note+=`These MW/R&D figures are order-of-magnitude estimates (see the caveat above); Google's cleaner grid correctly `+
      `yields lower CO₂ despite more power. Year baseline: <b>${year}</b>.`;
    $('cm-conote').innerHTML=note;
  }

  // --- sources table --------------------------------------------------------
  function renderSources(){
    const asof=C.DATA_AS_OF;
    document.querySelectorAll('.cm-asof').forEach(n=>{ if(n.id==='cm-asof') n.textContent=asof; });
    const conf=k=>`<span class="conf ${k.toLowerCase()}">${k}</span>`;
    const rows=[
      ['Physical chain', 'FLOP→GPU-seconds→energy→cost; validated against Google’s measured 0.24 Wh/prompt (arXiv 2508.15734)', 'SOURCED', 'Google 2025 inference-impact paper'],
      ['Cost split', 'HW 47–67%, R&D staff 29–49%, energy 2–6%; +2.4×/yr; +23% interconnect', 'SOURCED', 'Epoch AI, frontier training cost'],
      ['Grid intensity', 'year baselines 410→370 gCO₂e/kWh (global, −3%/yr); company presets use each lab’s siting', 'SOURCED', 'IEA Electricity 2025'],
      ['PUE / WUE', 'PUE 1.08–1.15; WUE 0.19–1.9 L/kWh; offsite water ~1.8 grid-avg (latent-heat derived)', 'SOURCED', 'Hyperscaler disclosures; steam tables'],
      ['Served tokens T_s', 'tokens served over model life — undisclosed; swings the $ total ~10× (a slider)', 'ASSUMPTION', '(editable)'],
      ['R&D multiple m', 'dark compute + salaries over the shipped run — undisclosed (a slider)', 'ASSUMPTION', '(editable)'],
      ['Company MW / R&D', 'order-of-magnitude, back-solved to disclosed capex (OpenAI ~$50B, Anthropic ~$15B/yr)', 'VERIFY', 'company capex disclosures'],
      ['API list prices', 'overlaid from the model lineages on the Impact Calculator (LiteLLM-referenced, 50/50 blend)', 'SOURCED', 'js/factors.js + LiteLLM'],
    ];
    $('cm-sources').innerHTML=`
      <p class="sub" style="margin:12px 0 0">Anchors as of <b>${asof}</b>. Physical inputs are firm; soft-cost and
        per-company inputs are explicitly estimates.</p>
      <table class="src"><thead><tr><th>Item</th><th>Basis</th><th>Conf.</th><th>Source</th></tr></thead>
      <tbody>${rows.map(([a,b,c,d])=>`<tr><td>${a}</td><td>${b}</td><td>${conf(c)}</td><td>${d}</td></tr>`).join('')}</tbody></table>`;
  }

  // --- master draw ----------------------------------------------------------
  function draw(){
    const p=currentParams(), r=C.unit(p);
    const price=priceOf(model);
    drawStack(r, price);
    renderLegend(r);
    renderReadouts(r, price);
    renderEnv(r);
    renderDisc(r, price);
    drawTrend();
  }

  // --- bindings -------------------------------------------------------------
  function segClick(id, attr, set){
    $(id).addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b)return;
      [...e.currentTarget.children].forEach(n=>n.classList.remove('on')); b.classList.add('on');
      set(b.dataset[attr]); });
  }
  function init(){
    buildModelSelect(); buildCompanies(); seedInputs(); renderSources();
    segClick('cm-year','y', v=>{ year=+v; seedInputs(); draw(); drawCompany(); });
    // Archetype isn't a user-facing control — it's auto-detected from the
    // overlaid model (archFor), 'standard' when none is picked. One less
    // decision the user has to make to get an accurate answer.
    $('cm-model').addEventListener('change',e=>{ model=e.target.value||null;
      arch = model ? archFor(model) : 'standard';
      seedInputs(); draw(); });
    $('cm-served').addEventListener('input',e=>{ servedLog=+e.target.value; syncSliderLabels(); draw(); });
    $('cm-rnd').addEventListener('input',e=>{ rnd=+e.target.value; syncSliderLabels(); draw(); });
    $('cm-elec').addEventListener('input',e=>{ elec=parseFloat(e.target.value)||null; draw(); });
    $('cm-grid').addEventListener('input',e=>{ grid=parseFloat(e.target.value)||null; draw(); });
    $('cm-util').addEventListener('input',e=>{ util=parseFloat(e.target.value)||null; draw(); });
    $('cm-co').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b)return;
      [...e.currentTarget.children].forEach(n=>n.setAttribute('aria-pressed','false'));
      b.setAttribute('aria-pressed','true'); company=b.dataset.c; drawCompany(); });
    if(window.MMURR_MIX) MMURR_MIX.onChange(draw);   // mix slider re-blends the overlaid API price
    draw(); drawCompany();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
