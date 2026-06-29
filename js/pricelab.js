/* ----------------------------------------------------------------------------
   mmurr.ai — price-page decision chart ("licence vs the model underneath")

   A second, distinct chart from the fixed-basket one above (js/prices.js). It
   tells a different story: the licence price is flat, but the model riding under
   it is swapped repeatedly — the markers carry that. Hand-rolled SVG (no extra
   dependency); reads model lineage + region data from js/factors.js.

   Built up across phases:
     P3 (here)  — controls, flat licence line, backend markers, seat discount
     P4 (added) — energy / CO2 / water footprint overlay + reconciliation check
     P5/P6      — same-workload-on-API line + break-even
     (rework)   — header + cost notes moved into Seat/Cost-logic dropdowns; credits removed
---------------------------------------------------------------------------- */
(function(){
  const svg = document.getElementById('labChart');
  if(!svg) return;                       // not on this page
  const M = MMURR_DATA.models;
  const tip = document.getElementById('labTip');

  // --- state (region comes from MMURR_REGION) ------------------------------
  let profile = 'list', seats = 5000, override = 0, cohort = 0, mainModel = M.defaultAxis;
  let ppd = M.defaultPpd;
  const tokPerPrompt = M.tokPerPrompt;
  const on = { api:false, energy:false, co2:false, water:false };   // cost + footprint overlays
  let ctx = null;   // last-drawn context, read by the hover handler

  // Footprint per user per day for a given per-prompt Wh, in the region's
  // grid/PUE/WUE. Same basis as the carbon dashboard so the two reconcile (§4.4).
  // PUE is the region's all-in 1.0 — NOT a >1 multiplier (that would double-count).
  function footprint(wh, R){
    const energyWh = ppd * wh;                       // Wh / user / day
    return {
      energy: energyWh,
      co2:   energyWh/1000 * R.pue * R.grid * 1000,  // g  / user / day
      water: energyWh/1000 * R.wue * 1000,           // mL / user / day
    };
  }

  // --- date + scale helpers ------------------------------------------------
  const D = s => { const [y,m] = s.split('-'); return new Date(+y, +m-1, 1).getTime(); };
  const addDays = (t,d) => t + d*864e5;
  const T0 = D('2023-09'), T1 = D('2026-08');
  const NS = 'http://www.w3.org/2000/svg';
  const W=760, H=320, PL=52, PR=46, PT=22, PB=34;
  const x = t => PL + (t-T0)/(T1-T0)*(W-PL-PR);
  const el = (n,a) => { const e=document.createElementNS(NS,n); for(const k in a) e.setAttribute(k,a[k]); return e; };
  const txt = (cls,x,y,anchor,s) => { const e=el('text',{class:cls,x,y}); if(anchor) e.setAttribute('text-anchor',anchor); e.textContent=s; return e; };
  // latest lineage step at time t for this cohort's release lag
  const stepAt = (steps,t) => { let c=steps[0]; for(const s of steps){ if(addDays(D(s[0]),M.tierLagDays[cohort])<=t) c=s; } return c; };

  // --- seat price ----------------------------------------------------------
  // Profile picks the SKU's regional LIST price; the enterprise add-on ('list')
  // also gets the headcount EA discount. A manual override beats everything.
  function seatPrice(){
    const region = MMURR_REGION.get();
    if(override > 0) return override;
    const tbl = MMURR_DATA.seat[profile] || MMURR_DATA.seat.list;
    const base = tbl[region] ?? tbl.UK;
    return profile==='list' ? base*(1 - seatDiscount(seats)) : base;
  }

  // --- currency-aware selects ----------------------------------------------
  function buildCohortSelect(){
    const sel = document.getElementById('lab-cohort'); sel.innerHTML='';
    M.cohorts.forEach((label,i)=>{
      const o=document.createElement('option'); o.value=i; o.textContent=label;
      if(i===cohort) o.selected=true; sel.appendChild(o);
    });
  }
  function buildModelSelect(){
    const sel = document.getElementById('lab-model'); const R = MMURR_REGION.data();
    sel.innerHTML=''; let og=null, lastG=null;
    for(const k in M.axis){ const m=M.axis[k];
      if(m.group!==lastG){ og=document.createElement('optgroup'); og.label=m.group; sel.appendChild(og); lastG=m.group; }
      const o=document.createElement('option'); o.value=k;
      o.textContent=`${m.label} — ${m.io[2]} (${R.sym}${(m.io[0]*R.fx).toFixed(2)}/${R.sym}${(m.io[1]*R.fx).toFixed(2)} per 1M)`;
      if(k===mainModel) o.selected=true; og.appendChild(o);
    }
  }

  // --- draw ----------------------------------------------------------------
  const PTS = (()=>{ const a=[]; for(let t=T0;t<=T1;t=addDays(t,30)) a.push(t); return a; })();

  function draw(){
    const R = MMURR_REGION.data();
    const am = M.axis[mainModel];
    const mdlAt = t => stepAt(am.steps, t);
    svg.innerHTML='';
    const seat = seatPrice();
    const lic = seats * seat;

    // same workload metered on the raw API, per month, in region currency (§4.5)
    const apiAt = t => seats * ppd * 30 * tokPerPrompt/1e6 * mdlAt(t)[2] * R.fx;
    const apiSeries = PTS.map(apiAt);

    // Anchor the cost axis to the LICENCE (fixed), not to the API line — so the
    // flat licence line never moves as you slide prompts/day; only the API line
    // sweeps up/down across it. Clamp so an API line above the top rides the edge.
    const maxCost = (lic * 2.6) || 1;
    const clampY = y => Math.max(PT, Math.min(H-PB, y));
    const yC = v => clampY(H-PB - (v/maxCost)*(H-PT-PB));

    // gridlines + cost axis (region currency)
    for(let i=0;i<=4;i++){ const yy=PT+i*(H-PT-PB)/4;
      svg.appendChild(el('line',{class:'lab-gridline',x1:PL,x2:W-PR,y1:yy,y2:yy}));
      svg.appendChild(txt('lab-axis',PL-6,yy+3,'end', R.sym+Math.round(maxCost*(1-i/4)).toLocaleString())); }
    for(const yr of ['2024','2025','2026']){ const xx=x(D(yr+'-01'));
      svg.appendChild(txt('lab-axis',xx,H-PB+16,'middle',yr)); }

    // footprint overlay (secondary scale, drawn behind the cost lines). Wh/prompt
    // steps at the MAIN MODEL's own dates (§4.4) — switching model moves it.
    const fpAt = t => footprint(mdlAt(t)[3], R);
    const series = { energy:PTS.map(t=>fpAt(t).energy), co2:PTS.map(t=>fpAt(t).co2), water:PTS.map(t=>fpAt(t).water) };
    const shown = ['energy','co2','water'].filter(k=>on[k]);
    // Anchor the footprint axis to a FIXED prompts/day reference (the slider max),
    // not to the current ppd — so the footprint lines visibly climb as you slide
    // prompts up, instead of the axis rescaling and the line staying put.
    const PPD_REF = 120, refE = PPD_REF*Math.max(...am.steps.map(s=>s[3]));
    const refByK = { energy:refE, co2:refE/1000*R.pue*R.grid*1000, water:refE/1000*R.wue*1000 };
    const maxFp = Math.max(1, ...shown.map(k=>refByK[k])) * 1.1;
    const yF = v => clampY(H-PB - (v/maxFp)*(H-PT-PB));
    const path = (arr,cls,yfn) => { let d=''; PTS.forEach((t,i)=> d+=(i?'L':'M')+x(t)+' '+yfn(arr[i])); svg.appendChild(el('path',{class:cls,d})); };
    if(on.energy) path(series.energy,'ser-energy',yF);
    if(on.co2)    path(series.co2,'ser-co2',yF);
    if(on.water)  path(series.water,'ser-water',yF);

    // raw-API cost line + break-even (the headline business view: where metering
    // overtakes the flat licence)
    if(on.api){
      path(apiSeries,'ser-api',yC);
      for(let i=1;i<apiSeries.length;i++){
        if((apiSeries[i-1]-lic)*(apiSeries[i]-lic)<0){ const xx=x(PTS[i]);
          svg.appendChild(el('line',{class:'lab-be',x1:xx,x2:xx,y1:PT,y2:H-PB}));
          svg.appendChild(txt('lab-belab',xx+4,PT+10,null,'break-even')); break; }
      }
    }

    // flat licence line
    svg.appendChild(el('line',{class:'ser-lic',x1:PL,x2:W-PR,y1:yC(lic),y2:yC(lic)}));

    // backend model-transition markers on the licence line
    M.backend.forEach(m=>{
      const t = addDays(D(m[0]), M.tierLagDays[cohort]);
      if(t<T0 || t>T1) return;
      const xx=x(t), yy=yC(lic), g=el('g',{}); g.style.cursor='pointer';
      g.appendChild(el('circle',{class:'lab-mk',cx:xx,cy:yy,r:5}));
      g.appendChild(txt('lab-mklab',xx,yy-11,'middle',m[1]));
      const reach = new Date(t).toLocaleDateString('en-GB',{month:'short',year:'numeric'});
      g.addEventListener('mouseenter',()=>{
        tip.innerHTML = `<b>Copilot backend: ${m[1]}</b><br>reaches your cohort ≈ ${reach}<br>${m[3]} Wh / prompt · $${m[2]}/1M list`;
        tip.style.left = xx/W*100+'%'; tip.style.top = yy/H*100+'%'; tip.style.opacity=1;
      });
      g.addEventListener('mouseleave',()=>tip.style.opacity=0);
      svg.appendChild(g);
    });

    // moving cursor line, driven by the hover handler
    const cursor = el('line',{class:'lab-cursor',x1:PL,x2:PL,y1:PT,y2:H-PB,opacity:0});
    svg.appendChild(cursor);

    // readouts
    const disc = profile==='list' ? seatDiscount(seats) : 0;
    const fpNow = footprint(mdlAt(T1)[3], R);
    const apiNow = apiSeries[apiSeries.length-1];
    const rateNow = mdlAt(T1)[2]*R.fx;
    const beUsers = (seats>0 && rateNow>0) ? lic/(30*tokPerPrompt/1e6*rateNow*seats) : 0;
    document.getElementById('lab-r-lic').textContent  = R.sym+Math.round(lic).toLocaleString();
    document.getElementById('lab-r-api').textContent  = on.api ? R.sym+Math.round(apiNow).toLocaleString() : 'toggle on';
    document.getElementById('lab-r-be').textContent   = on.api ? (beUsers>0?`${beUsers.toFixed(1)} prompts/seat/day`:'—') : 'toggle on';
    document.getElementById('lab-r-seat').textContent = `${R.sym}${seat.toFixed(2)}` + (disc>0?` (−${Math.round(disc*100)}%)`:'');
    document.getElementById('lab-r-model').textContent = stepAt(M.backend,T1)[1];
    document.getElementById('lab-r-fp').textContent = `${fpNow.energy.toFixed(1)} Wh · ${fpNow.co2.toFixed(1)} g · ${fpNow.water.toFixed(1)} mL`;

    // disclosure
    let note = override>0
      ? `Seat fixed at your <b>${R.sym}${override.toFixed(2)}</b> override.`
      : profile==='list'
        ? `Seat = ${R.sym}${(MMURR_DATA.seat.list[MMURR_REGION.get()]??MMURR_DATA.seat.list.UK).toFixed(2)} list − <b>${Math.round(disc*100)}%</b> expected EA discount at ${seats.toLocaleString()} seats.`
        : `Seat = ${R.sym}${seat.toFixed(2)} regional list for this SKU.`;
    if(profile==='business' && seats>MMURR_DATA.seat.businessCap)
      note += ` <b style="color:var(--hot)">Business SKU is capped at ${MMURR_DATA.seat.businessCap} employees</b> — this headcount can't use it; sits on the E-series.`;
    if(on.api){
      const verdict = apiNow<lic ? `the metered API is <b>cheaper</b> than the licence at ${ppd} prompts/seat/day`
                                 : `the flat licence <b>wins</b> at ${ppd} prompts/seat/day`;
      note += ` At your usage, ${verdict}; break-even ≈ <b>${beUsers.toFixed(1)} prompts/seat/day</b>. `+
              `A Copilot seat also buys Graph grounding, security and the in-app surfaces — the API line prices tokens only, so this isn't strictly like-for-like.`;
    } else {
      note += ` Markers are the Copilot backend swapping underneath; the line stays flat. Toggle <b>Same workload on raw API</b> to find where metering overtakes the licence.`;
    }
    note += ` Footprint follows <b>${am.group} ${am.label}</b>` +
            (am.assumedWh?` <span class="vflag" title="Anthropic publishes no per-query energy — its Wh values are labelled assumptions.">(Wh assumed)</span>`:'') +
            `; one standardised text prompt (reasoning/image/video are far higher). All figures sourced below.`;
    document.getElementById('lab-disc').innerHTML = note;

    ctx = { R, mdlAt, lic, cursor };   // stash for the hover handler
  }

  // --- interactive hover: vertical cursor + on-page caption ----------------
  const fmtMonth = t => new Date(t).toLocaleDateString('en-GB',{month:'short',year:'numeric'});
  const hoverEl = document.getElementById('lab-hover');
  function onHover(clientX){
    if(!ctx) return;
    const rect = svg.getBoundingClientRect();
    let px = (clientX-rect.left)/rect.width*W;
    px = Math.max(PL, Math.min(W-PR, px));
    const t = T0 + (px-PL)/(W-PL-PR)*(T1-T0);
    ctx.cursor.setAttribute('x1',px); ctx.cursor.setAttribute('x2',px); ctx.cursor.setAttribute('opacity',1);
    const R = ctx.R;
    const api = seats*ppd*30*tokPerPrompt/1e6*ctx.mdlAt(t)[2]*R.fx;
    const fp  = footprint(ctx.mdlAt(t)[3], R);
    let s = `<b>${fmtMonth(t)}</b> · Licence ${R.sym}${Math.round(ctx.lic).toLocaleString()}`;
    if(on.api)    s += ` · API ${R.sym}${Math.round(api).toLocaleString()}`;
    if(on.energy) s += ` · ${fp.energy.toFixed(1)} Wh`;
    if(on.co2)    s += ` · ${fp.co2.toFixed(1)} g`;
    if(on.water)  s += ` · ${fp.water.toFixed(1)} mL`;
    s += ` · backend ${ctx.mdlAt(t)[1]}`;
    hoverEl.innerHTML = s;
  }
  svg.addEventListener('mousemove', e=>onHover(e.clientX));
  svg.addEventListener('mouseleave', ()=>{ if(ctx) ctx.cursor.setAttribute('opacity',0);
    hoverEl.textContent='Hover the chart to read the values at any month.'; });

  // --- bindings ------------------------------------------------------------
  const onNum = (id, set) => document.getElementById(id).addEventListener('input', e=>{ set(parseFloat(e.target.value)||0); draw(); });
  document.getElementById('lab-profile').addEventListener('change', e=>{ profile=e.target.value; draw(); });
  onNum('lab-seats', v=>seats=v);
  onNum('lab-override', v=>override=v);
  document.getElementById('lab-cohort').addEventListener('change', e=>{ cohort=+e.target.value; draw(); });
  document.getElementById('lab-model').addEventListener('change', e=>{ mainModel=e.target.value; draw(); });
  document.getElementById('lab-ppd').addEventListener('input', e=>{ ppd=+e.target.value; document.getElementById('lab-ppdOut').textContent=ppd; draw(); });
  document.getElementById('lab-toggles').addEventListener('click', e=>{
    const c=e.target.closest('.lab-chip'); if(!c) return;
    const k=c.dataset.t, v=c.getAttribute('aria-pressed')!=='true';
    c.setAttribute('aria-pressed',v); on[k]=v;
    const lg=document.getElementById('lab-lg-'+k); if(lg) lg.hidden=!v;
    draw();
  });
  MMURR_REGION.onChange(()=>{ buildModelSelect(); draw(); });   // re-price + relabel on region switch

  // expose state for later-phase overlays
  window.__lab = { get:()=>({profile,seats,override,cohort,mainModel,ppd}), footprint, draw };

  buildCohortSelect(); buildModelSelect(); draw();

  // ponytail: reconciliation self-check (local only). The price-page footprint
  // and the carbon dashboard MUST agree for identical inputs — same grid, same
  // all-in PUE (1.0, not a >1 multiplier), same per-prompt Wh. Guards the P4
  // acceptance test and the bug where the mockup hard-coded PUE 1.25 / grid 0.21.
  if(['localhost','127.0.0.1',''].includes(location.hostname)){
    const R = MMURR_DATA.regions.UK;
    console.assert(R.pue === 1.0, 'UK region PUE must be all-in 1.0 to reconcile with dashboard');
    const wh = 0.31, p = ppd;
    const got = footprint(wh, R).co2;
    const dashboard = (p*wh)/1000 * R.pue * R.grid * 1000;   // dashboard's formula
    console.assert(Math.abs(got - dashboard) < 1e-9, 'price/dashboard CO2 per day reconcile');
  }
})();
