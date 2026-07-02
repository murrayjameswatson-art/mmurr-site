/* ----------------------------------------------------------------------------
   mmurr.ai — price-page decision chart ("licence vs the model underneath")

   A second, distinct chart from the Blended Usage basket above (js/prices.js).
   It tells a different story: the licence price is flat, but the model riding
   under it is swapped repeatedly — the markers carry that. Hand-rolled SVG (no
   extra dependency); reads licence types + model lineage + region data from
   js/factors.js.

   Built up across phases:
     P3 (here)  — controls, flat licence line, backend markers, volume discount
     P4 (added) — energy / CO2e / water footprint overlay + reconciliation check
     P5/P6      — same-workload-on-API line + break-even
     (rework)   — header + cost notes moved into Licence/Cost-logic dropdowns
     (rework 2) — one "Licence type" dropdown spans enterprise SKUs AND personal
                  subscriptions; lag folded into the type; dual-mode slider
     (rework 3) — licence→model compatibility greys out the Main-model options;
                  x-axis scales to the licence's lifetime (no pre-launch API or
                  footprint correlations); break-even shaded zones; regional
                  local list prices where the vendor bills them; current API
                  $/token referenced weekly from LiteLLM (js/data/api-prices.js)
---------------------------------------------------------------------------- */
(function(){
  const svg = document.getElementById('labChart');
  if(!svg) return;                       // not on this page
  const M  = MMURR_DATA.models;
  const LT = MMURR_DATA.licenceTypes;
  const tip = document.getElementById('labTip');

  // --- state (region comes from MMURR_REGION) ------------------------------
  let type = 'list', licences = 1, override = 0, mainModel = M.defaultAxis;
  let ppd = M.defaultPpd;               // enterprise: prompts / user / day
  let usagePct = 50;                    // subscription: % of plan capacity
  const tokPerPrompt = M.tokPerPrompt;
  const on = { api:false, energy:false, co2:false, water:false };   // overlays
  let ctx = null;   // last-drawn context, read by the hover handler

  const isSub = () => LT[type].kind === 'subscription';

  // Subscription benchmark: 100% usage = exhausting the plan's estimated
  // tokens in EVERY rolling window, restarting after the gap → 4 maxed
  // windows/day at 5h + 1h. windowMTok per plan is an editable ASSUMPTION
  // anchor in factors.js (vendors publish no exact token limits).
  const SW = MMURR_DATA.subscriptionWindows;
  const windowsPerDay = Math.floor(24 / (SW.windowHours + SW.gapHours));
  const maxPpdSub = () => LT[type].windowMTok*1e6 / tokPerPrompt * windowsPerDay;
  // prompts/day per licence — the single number both slider modes resolve to
  const promptsDay = () => isSub() ? usagePct/100 * maxPpdSub() : ppd;

  // Footprint per user per day for a given per-prompt Wh, in the region's
  // grid/PUE/WUE. Same basis as the carbon dashboard so the two reconcile (§4.4).
  // PUE is the region's all-in 1.0 — NOT a >1 multiplier (that would double-count).
  function footprint(wh, R){
    const energyWh = promptsDay() * wh;              // Wh / user / day
    return {
      energy: energyWh,
      co2:   energyWh/1000 * R.pue * R.grid * 1000,  // g CO2e / user / day
      water: energyWh/1000 * R.wue * 1000,           // mL / user / day
    };
  }

  // --- date + scale helpers ------------------------------------------------
  const D = s => { const [y,m] = s.split('-'); return new Date(+y, +m-1, 1).getTime(); };
  const addDays = (t,d) => t + d*864e5;
  const T0 = D('2024-01'), T1 = D('2026-06');   // matched to the Blended Usage chart
  const NS = 'http://www.w3.org/2000/svg';
  const W=760, H=320, PL=52, PR=46, PT=22, PB=34;
  const el = (n,a) => { const e=document.createElementNS(NS,n); for(const k in a) e.setAttribute(k,a[k]); return e; };
  const txt = (cls,x,y,anchor,s) => { const e=el('text',{class:cls,x,y}); if(anchor) e.setAttribute('text-anchor',anchor); e.textContent=s; return e; };
  // latest lineage step at time t, shifted by this licence type's release lag
  const stepAt = (steps,t) => { let c=steps[0]; for(const s of steps){ if(addDays(D(s[0]),LT[type].lagDays)<=t) c=s; } return c; };
  const fmtMonth = t => new Date(t).toLocaleDateString('en-GB',{month:'short',year:'numeric'});

  // --- licence price --------------------------------------------------------
  // Enterprise types read the SKU's regional LIST price ('list' also gets the
  // volume EA discount). Subscriptions use the vendor's LOCAL list history for
  // the region when one exists (t.local — e.g. Google bills £ in the UK);
  // otherwise the USD fee history × the FX anchor (Anthropic & xAI bill USD
  // worldwide). A manual override beats everything.
  const usdAt = (series, tt) => { let v=null; for(const [m,p] of series){ if(D(m)<=tt) v=p; } return v; };
  const feeSeries = t => (t.local && t.local[MMURR_REGION.get()]) || t.usd;
  const feeIsLocal = t => !!(t.local && t.local[MMURR_REGION.get()]);
  function licencePrice(tt = T1){
    const t = LT[type];
    if(override > 0) return override;
    if(t.kind === 'subscription'){
      const u = usdAt(feeSeries(t), tt);
      if(u == null) return null;
      return feeIsLocal(t) ? u : u * MMURR_REGION.data().fx;
    }
    const tbl = MMURR_DATA.seat[t.seatKey] || MMURR_DATA.seat.list;
    const base = tbl[MMURR_REGION.get()] ?? tbl.UK;
    return t.discount ? base*(1 - seatDiscount(licences)) : base;
  }

  // --- selects + slider -----------------------------------------------------
  function buildTypeSelect(){
    const sel = document.getElementById('lab-type'); sel.innerHTML='';
    let og=null, lastG=null;
    for(const k in LT){ const t=LT[k];
      if(t.group!==lastG){ og=document.createElement('optgroup'); og.label=t.group; sel.appendChild(og); lastG=t.group; }
      const o=document.createElement('option'); o.value=k; o.textContent=t.label;
      if(k===type) o.selected=true; og.appendChild(o);
    }
  }
  // Models NOT accessible under the selected licence are greyed out (disabled),
  // so the API/footprint comparison always pairs a licence with a model it can
  // actually run.
  function buildModelSelect(){
    const sel = document.getElementById('lab-model'); const R = MMURR_REGION.data();
    const allowed = LT[type].models;
    sel.innerHTML=''; let og=null, lastG=null;
    for(const k in M.axis){ const m=M.axis[k];
      if(m.group!==lastG){ og=document.createElement('optgroup'); og.label=m.group; sel.appendChild(og); lastG=m.group; }
      const o=document.createElement('option'); o.value=k;
      o.textContent=`${m.label} — ${m.io[2]} (${R.sym}${(m.io[0]*R.fx).toFixed(2)}/${R.sym}${(m.io[1]*R.fx).toFixed(2)} per 1M)`;
      if(!allowed.includes(k)){ o.disabled=true; o.title='Not available on this licence'; }
      if(k===mainModel) o.selected=true; og.appendChild(o);
    }
  }
  // One slider, two meanings: prompts/user/day for enterprise licences,
  // % of plan capacity for subscriptions (with the implied prompts/day shown
  // alongside so both quantities stay visible).
  function syncSlider(){
    const s   = document.getElementById('lab-ppd');
    const lab = document.getElementById('lab-ppdLab');
    const out = document.getElementById('lab-ppdOut');
    if(isSub()){
      s.min=0; s.max=100; s.step=1; s.value=usagePct;
      lab.textContent = 'Usage — % of plan capacity';
      out.textContent = `${usagePct}% ≈ ${Math.round(promptsDay()).toLocaleString()} prompts/day`;
    } else {
      s.min=2; s.max=120; s.step=1; s.value=ppd;
      lab.textContent = 'Prompts / user / day';
      out.textContent = ppd;
    }
  }

  // --- draw ----------------------------------------------------------------
  function draw(){
    const R = MMURR_REGION.data();
    const t = LT[type];
    const am = M.axis[mainModel];
    const mdlAt = tt => stepAt(am.steps, tt);
    // markers show the lineage riding under THIS licence: the Copilot/GPT
    // backend for enterprise types, the plan's own model line for subscriptions
    const markers = isSub() ? M.axis[t.lineage].steps : M.backend;
    svg.innerHTML='';

    // Scaling x-axis: the domain starts where the licence's data starts, so a
    // late-launching plan (e.g. SuperGrok Heavy, Jul 2025) fills the chart
    // instead of leaving dead space — and the API/footprint lines can't show
    // correlations for months when the licence didn't exist.
    const t0 = isSub() ? Math.max(T0, D(feeSeries(t)[0][0])) : T0;
    const x = tt => PL + (tt-t0)/(T1-t0)*(W-PL-PR);
    const PTS = (()=>{ const a=[]; for(let tt=t0;tt<=T1;tt=addDays(tt,30)) a.push(tt); return a; })();

    const price = licencePrice();          // at T1, for the readouts
    const lic = licences * price;
    const licAt = tt => { const p = licencePrice(tt); return p==null ? null : licences*p; };
    const licSeries = PTS.map(licAt);

    // same workload metered on the raw API, per month, in region currency (§4.5)
    const apiAt = tt => licences * promptsDay() * 30 * tokPerPrompt/1e6 * mdlAt(tt)[2] * R.fx;
    const apiSeries = PTS.map(apiAt);

    // Cost-axis anchor: enterprise anchors to the LICENCE (fixed) so the flat
    // line never moves as the slider slides; subscriptions anchor to the API
    // value at 100% usage (also a fixed reference) because that line can dwarf
    // the small fee. Clamp so a line above the top rides the edge.
    let maxCost = (lic * 2.6) || 1;
    if(isSub()){
      const maxRate = Math.max(...am.steps.map(s=>s[2]));
      maxCost = Math.max(maxCost, licences * maxPpdSub() * 30 * tokPerPrompt/1e6 * maxRate * R.fx * 1.15) || 1;
    }
    const clampY = y => Math.max(PT, Math.min(H-PB, y));
    const yC = v => clampY(H-PB - (v/maxCost)*(H-PT-PB));

    // gridlines + cost axis (region currency)
    for(let i=0;i<=4;i++){ const yy=PT+i*(H-PT-PB)/4;
      svg.appendChild(el('line',{class:'lab-gridline',x1:PL,x2:W-PR,y1:yy,y2:yy}));
      svg.appendChild(txt('lab-axis',PL-6,yy+3,'end', R.sym+Math.round(maxCost*(1-i/4)).toLocaleString())); }
    // x ticks: years for long spans, quarters when the domain is short
    const spanMonths = (T1-t0)/2592e6;
    if(spanMonths >= 20){
      for(const yr of ['2024','2025','2026']){ const tt=D(yr+'-01');
        if(tt>=t0 && tt<=T1) svg.appendChild(txt('lab-axis',x(tt),H-PB+16,'middle',yr)); }
    } else {
      const d=new Date(t0);
      while(d.getTime()<=T1){
        if([0,3,6,9].includes(d.getMonth()))
          svg.appendChild(txt('lab-axis',x(d.getTime()),H-PB+16,'middle',
            d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'})));
        d.setMonth(d.getMonth()+1);
      }
    }

    // break-even shaded zones (behind everything): where the metered API is
    // cheaper than the licence vs where the licence wins
    if(on.api){
      const sign = i => { const l=licSeries[i]; return l==null ? 0 : (apiSeries[i]<l ? -1 : 1); };
      const zones=[]; let runStart=0, cur=sign(0);
      for(let i=1;i<=PTS.length;i++){
        const s = i<PTS.length ? sign(i) : NaN;
        if(s!==cur){ if(cur!==0 && i-1>runStart-0) zones.push([runStart,i-1,cur]); runStart=i; cur=s; }
      }
      for(const [a,b,sg] of zones){
        const x1=x(PTS[a]), x2=x(PTS[b]);
        if(x2-x1 < 2) continue;
        svg.appendChild(el('rect',{class: sg<0?'lab-zone-api':'lab-zone-lic', x:x1, y:PT, width:x2-x1, height:H-PT-PB}));
      }
      const widest = sg => zones.filter(z=>z[2]===sg)
        .sort((p,q)=>(x(PTS[q[1]])-x(PTS[q[0]]))-(x(PTS[p[1]])-x(PTS[p[0]])))[0];
      const za=widest(-1), zl=widest(1);
      if(za && x(PTS[za[1]])-x(PTS[za[0]]) > 80)
        svg.appendChild(txt('lab-zonelab zapi',(x(PTS[za[0]])+x(PTS[za[1]]))/2,H-PB-8,'middle','raw API cheaper'));
      if(zl && x(PTS[zl[1]])-x(PTS[zl[0]]) > 80)
        svg.appendChild(txt('lab-zonelab zlic',(x(PTS[zl[0]])+x(PTS[zl[1]]))/2,PT+12,'middle','licence wins'));
    }

    // footprint overlay (secondary scale, drawn behind the cost lines). Wh/prompt
    // steps at the MAIN MODEL's own dates (§4.4) — switching model moves it.
    const fpAt = tt => footprint(mdlAt(tt)[3], R);
    const series = { energy:PTS.map(tt=>fpAt(tt).energy), co2:PTS.map(tt=>fpAt(tt).co2), water:PTS.map(tt=>fpAt(tt).water) };
    const shown = ['energy','co2','water'].filter(k=>on[k]);
    // Anchor the footprint axis to a FIXED usage reference (slider max: 120
    // prompts/day for enterprise, 100% of plan capacity for subscriptions) so
    // the lines visibly climb as you slide usage up, instead of the axis
    // rescaling and the line staying put.
    const PPD_REF = isSub() ? maxPpdSub() : 120;
    const refE = PPD_REF*Math.max(...am.steps.map(s=>s[3]));
    const refByK = { energy:refE, co2:refE/1000*R.pue*R.grid*1000, water:refE/1000*R.wue*1000 };
    const maxFp = Math.max(1, ...shown.map(k=>refByK[k])) * 1.1;
    const yF = v => clampY(H-PB - (v/maxFp)*(H-PT-PB));
    const path = (arr,cls,yfn) => { let d=''; PTS.forEach((tt,i)=> d+=(i?'L':'M')+x(tt)+' '+yfn(arr[i])); svg.appendChild(el('path',{class:cls,d})); };
    if(on.energy) path(series.energy,'ser-energy',yF);
    if(on.co2)    path(series.co2,'ser-co2',yF);
    if(on.water)  path(series.water,'ser-water',yF);

    // raw-API cost line + break-even (the headline business view: where metering
    // overtakes the flat licence)
    if(on.api){
      path(apiSeries,'ser-api',yC);
      for(let i=1;i<apiSeries.length;i++){
        const l0=licSeries[i-1], l1=licSeries[i];
        if(l0==null || l1==null) continue;
        if((apiSeries[i-1]-l0)*(apiSeries[i]-l1)<0){ const xx=x(PTS[i]);
          svg.appendChild(el('line',{class:'lab-be',x1:xx,x2:xx,y1:PT,y2:H-PB}));
          svg.appendChild(txt('lab-belab',xx+4,PT+10,null,'break-even')); break; }
      }
    }

    // licence fee line — flat for enterprise; subscriptions start at launch and
    // step where the fee changed (the fee history in factors.js)
    { let d='';
      PTS.forEach((tt,i)=>{ const v=licSeries[i]; if(v==null) return; d += (d?'L':'M')+x(tt)+' '+yC(v); });
      if(d) svg.appendChild(el('path',{class:'ser-lic',d}));
    }

    // model-transition markers on the licence line
    markers.forEach(m=>{
      const tt = addDays(D(m[0]), t.lagDays);
      if(tt<t0 || tt>T1) return;
      const licHere = licAt(tt);
      if(licHere==null) return;            // before the subscription launched
      const xx=x(tt), yy=yC(licHere), g=el('g',{}); g.style.cursor='pointer';
      g.appendChild(el('circle',{class:'lab-mk',cx:xx,cy:yy,r:5}));
      g.appendChild(txt('lab-mklab',xx,yy-11,'middle',m[1]));
      const reach = fmtMonth(tt);
      g.addEventListener('mouseenter',()=>{
        tip.innerHTML = `<b>${isSub()?'Model under the plan':'Copilot backend'}: ${m[1]}</b><br>reaches this licence ≈ ${reach}<br>${m[3]} Wh / prompt · $${m[2]}/1M list`;
        tip.style.left = xx/W*100+'%'; tip.style.top = yy/H*100+'%'; tip.style.opacity=1;
      });
      g.addEventListener('mouseleave',()=>tip.style.opacity=0);
      svg.appendChild(g);
    });

    // moving cursor line, driven by the hover handler
    const cursor = el('line',{class:'lab-cursor',x1:PL,x2:PL,y1:PT,y2:H-PB,opacity:0});
    svg.appendChild(cursor);

    // readouts — static values at a FIXED reference date (chart end), labelled
    // on-page so they aren't mistaken for live figures
    document.getElementById('lab-refnote').innerHTML =
      `Static values below are read at <b>${fmtMonth(T1)}</b> — the chart's fixed reference date — not live figures.`;
    const disc = (!isSub() && type==='list') ? seatDiscount(licences) : 0;
    const fpNow = footprint(mdlAt(T1)[3], R);
    const apiNow = apiSeries[apiSeries.length-1];
    const rateNow = mdlAt(T1)[2]*R.fx;
    const beUsers = (licences>0 && rateNow>0) ? lic/(30*tokPerPrompt/1e6*rateNow*licences) : 0;
    const beTxt = beUsers>0
      ? `${beUsers.toFixed(1)} prompts/day` + (isSub()? ` ≈ ${(beUsers/maxPpdSub()*100).toFixed(1)}% of plan` : '')
      : '—';
    document.getElementById('lab-r-lic').textContent  = R.sym+Math.round(lic).toLocaleString();
    document.getElementById('lab-r-api').textContent  = on.api ? R.sym+Math.round(apiNow).toLocaleString() : 'toggle on';
    document.getElementById('lab-r-be').textContent   = on.api ? beTxt : 'toggle on';
    document.getElementById('lab-r-seat').textContent = `${R.sym}${price.toFixed(2)}` + (disc>0?` (−${Math.round(disc*100)}%)`:'');
    document.getElementById('lab-r-model').textContent = stepAt(markers,T1)[1];
    document.getElementById('lab-r-fp').textContent = `${fpNow.energy.toFixed(1)} Wh · ${fpNow.co2.toFixed(1)} g · ${fpNow.water.toFixed(1)} mL`;

    // disclosure
    let note;
    if(override>0){
      note = `Licence price fixed at your <b>${R.sym}${override.toFixed(2)}</b> override.`;
    } else if(isSub()){
      const fees = feeSeries(t);
      const feeTxt = feeIsLocal(t)
        ? `<b>${R.sym}${price.toFixed(2)}</b>/mo — the vendor's own ${R.label} list price`
        : `<b>$${usdAt(t.usd,T1)} USD × ${R.fx} FX → ${R.sym}${price.toFixed(2)}</b>/mo (billed USD worldwide)`;
      note = `Fee = ${feeTxt}`+
             (fees.length>1 ? ` — the fee has changed over time; the steps are plotted on the line. ` : `. `)+
             `<b>100% usage</b> = exhausting the plan's estimated <b>${t.windowMTok}M tokens per ${SW.windowHours}-hour window</b>, `+
             `restarting after a ${SW.gapHours}-hour gap → ${windowsPerDay} maxed windows/day ≈ <b>${Math.round(t.windowMTok*windowsPerDay*30).toLocaleString()}M tokens/mo</b>. `+
             `The per-window allowance is an <b>editable assumption</b> — vendors publish no exact token limits, and rolling/weekly caps can bind before the window maths does. `+
             `You are at <b>${usagePct}%</b> ≈ ${Math.round(promptsDay()).toLocaleString()} prompts/day.`;
    } else if(type==='list'){
      note = `Licence = ${R.sym}${(MMURR_DATA.seat.list[MMURR_REGION.get()]??MMURR_DATA.seat.list.UK).toFixed(2)} list − <b>${Math.round(disc*100)}%</b> expected EA discount at ${licences.toLocaleString()} licences.`;
    } else {
      note = `Licence = ${R.sym}${price.toFixed(2)} regional list for this SKU.`;
    }
    if(!isSub() && type==='business' && licences>MMURR_DATA.seat.businessCap)
      note += ` <b style="color:var(--hot)">Business SKU is capped at ${MMURR_DATA.seat.businessCap} employees</b> — this licence count can't use it; sits on the E-series.`;
    if(on.api){
      const usageTxt = isSub() ? `${usagePct}% usage` : `${ppd} prompts/user/day`;
      const verdict = apiNow<lic ? `the metered API is <b>cheaper</b> than the licence at ${usageTxt}`
                                 : `the flat licence <b>wins</b> at ${usageTxt}`;
      note += ` At your usage, ${verdict}; break-even ≈ <b>${beTxt}</b>. The shaded bands mark where each side wins. `+
              (isSub()
                ? `A subscription also buys the apps, projects and priority access — the API line prices tokens only, so this isn't strictly like-for-like.`
                : `A Copilot licence also buys Graph grounding, security and the in-app surfaces — the API line prices tokens only, so this isn't strictly like-for-like.`);
    } else {
      note += isSub()
        ? ` Markers are the plan's model line stepping underneath; the fee stays flat. Toggle <b>Same workload on raw API</b> to see what your usage would cost metered.`
        : ` Markers are the Copilot backend swapping underneath; the line stays flat. Toggle <b>Same workload on raw API</b> to find where metering overtakes the licence.`;
    }
    note += ` Footprint follows <b>${am.group} ${am.label}</b>` +
            (am.assumedWh?` <span class="vflag" title="This vendor publishes no per-query energy — its Wh values are labelled assumptions.">(Wh assumed)</span>`:'') +
            `; one standardised text prompt (reasoning/image/video are far higher).`;
    const ref = window.MMURR_API_PRICES;
    if(ref && ref.models && ref.models[mainModel])
      note += ` Current API $/token referenced from the LiteLLM registry, fetched ${ref.fetched}.`;
    note += ` All figures sourced below.`;
    document.getElementById('lab-disc').innerHTML = note;

    ctx = { R, mdlAt, lic, licAt, cursor, t0, x };   // stash for the hover handler
  }

  // --- interactive hover: vertical cursor + on-page caption ----------------
  const hoverEl = document.getElementById('lab-hover');
  function onHover(clientX){
    if(!ctx) return;
    const rect = svg.getBoundingClientRect();
    let px = (clientX-rect.left)/rect.width*W;
    px = Math.max(PL, Math.min(W-PR, px));
    const t = ctx.t0 + (px-PL)/(W-PL-PR)*(T1-ctx.t0);
    ctx.cursor.setAttribute('x1',px); ctx.cursor.setAttribute('x2',px); ctx.cursor.setAttribute('opacity',1);
    const R = ctx.R;
    const api = licences*promptsDay()*30*tokPerPrompt/1e6*ctx.mdlAt(t)[2]*R.fx;
    const fp  = footprint(ctx.mdlAt(t)[3], R);
    const licHere = ctx.licAt(t);
    let s = `<b>${fmtMonth(t)}</b> · Licence ${licHere==null ? 'not launched' : R.sym+Math.round(licHere).toLocaleString()}`;
    if(on.api)    s += ` · API ${R.sym}${Math.round(api).toLocaleString()}`;
    if(on.energy) s += ` · ${fp.energy.toFixed(1)} Wh`;
    if(on.co2)    s += ` · ${fp.co2.toFixed(1)} g CO₂e`;
    if(on.water)  s += ` · ${fp.water.toFixed(1)} mL`;
    s += ` · ${isSub()?'model':'backend'} ${ctx.mdlAt(t)[1]}`;
    hoverEl.innerHTML = s;
  }
  svg.addEventListener('mousemove', e=>onHover(e.clientX));
  svg.addEventListener('mouseleave', ()=>{ if(ctx) ctx.cursor.setAttribute('opacity',0);
    hoverEl.textContent='Hover the chart to read the values at any month.'; });

  // --- bindings ------------------------------------------------------------
  const onNum = (id, set) => document.getElementById(id).addEventListener('input', e=>{ set(parseFloat(e.target.value)||0); draw(); });
  document.getElementById('lab-type').addEventListener('change', e=>{
    type = e.target.value;
    // model no longer accessible under this licence → jump to its default line
    if(!LT[type].models.includes(mainModel)) mainModel = LT[type].lineage;
    buildModelSelect();     // refresh greyed-out options for the new licence
    syncSlider(); draw();
  });
  onNum('lab-seats', v=>licences=v);
  onNum('lab-override', v=>override=v);
  document.getElementById('lab-model').addEventListener('change', e=>{ mainModel=e.target.value; draw(); });
  document.getElementById('lab-ppd').addEventListener('input', e=>{
    const v = +e.target.value;
    if(isSub()) usagePct=v; else ppd=v;
    syncSlider(); draw();
  });
  document.getElementById('lab-toggles').addEventListener('click', e=>{
    const c=e.target.closest('.lab-chip'); if(!c) return;
    const k=c.dataset.t, v=c.getAttribute('aria-pressed')!=='true';
    c.setAttribute('aria-pressed',v); on[k]=v;
    const lg=document.getElementById('lab-lg-'+k); if(lg) lg.hidden=!v;
    draw();
  });
  MMURR_REGION.onChange(()=>{ buildModelSelect(); draw(); });   // re-price + relabel on region switch

  // expose state for later-phase overlays
  window.__lab = { get:()=>({type,licences,override,mainModel,promptsDay:promptsDay()}), footprint, draw };

  buildTypeSelect(); buildModelSelect(); syncSlider(); draw();

  // ponytail: reconciliation self-check (local only). The price-page footprint
  // and the carbon dashboard MUST agree for identical inputs — same grid, same
  // all-in PUE (1.0, not a >1 multiplier), same per-prompt Wh. Guards the P4
  // acceptance test and the bug where the mockup hard-coded PUE 1.25 / grid 0.21.
  if(['localhost','127.0.0.1',''].includes(location.hostname)){
    const R = MMURR_DATA.regions.UK;
    console.assert(R.pue === 1.0, 'UK region PUE must be all-in 1.0 to reconcile with dashboard');
    const wh = 0.31, p = promptsDay();     // enterprise default at load → ppd
    const got = footprint(wh, R).co2;
    const dashboard = (p*wh)/1000 * R.pue * R.grid * 1000;   // dashboard's formula
    console.assert(Math.abs(got - dashboard) < 1e-9, 'price/dashboard CO2e per day reconcile');
    console.assert(windowsPerDay === 4, '5h window + 1h gap → 4 maxed windows/day');
    console.assert(Math.abs(LT.claudePro.usd[0][1]*R.fx - 15.60) < 1e-9, 'Claude Pro UK ≈ £15.60/mo at FX 0.78');
    console.assert(LT.geminiPro.local.UK[0][1] === 18.99, 'Google AI Pro UK local list £18.99');
  }
})();
