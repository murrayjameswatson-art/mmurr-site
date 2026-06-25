/* ----------------------------------------------------------------------------
   mmurr.ai — price-page decision chart ("licence vs the model underneath")

   A second, distinct chart from the fixed-basket one above (js/prices.js). It
   tells a different story: the licence price is flat, but the model riding under
   it is swapped repeatedly — the markers carry that. Hand-rolled SVG (no extra
   dependency); reads model lineage + region data from js/factors.js.

   Built up across phases:
     P3 (here)  — controls, flat licence line, backend markers, seat discount
     P4 (added) — energy / CO2 / water footprint overlay + reconciliation check
     P5/P6      — same-workload-on-API line + break-even, Copilot Credits band
---------------------------------------------------------------------------- */
(function(){
  const svg = document.getElementById('labChart');
  if(!svg) return;                       // not on this page
  const M = MMURR_DATA.models;
  const tip = document.getElementById('labTip');

  // --- state (region comes from MMURR_REGION) ------------------------------
  let profile = 'list', seats = 5000, override = 0, cohort = 0, mainModel = M.defaultAxis;

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
  function draw(){
    const R = MMURR_REGION.data();
    svg.innerHTML='';
    const seat = seatPrice();
    const lic = seats * seat;
    const maxCost = (lic || 1) * 1.4;
    const yC = v => H-PB - (v/maxCost)*(H-PT-PB);

    // gridlines + cost axis (region currency)
    for(let i=0;i<=4;i++){ const yy=PT+i*(H-PT-PB)/4;
      svg.appendChild(el('line',{class:'lab-gridline',x1:PL,x2:W-PR,y1:yy,y2:yy}));
      svg.appendChild(txt('lab-axis',PL-6,yy+3,'end', R.sym+Math.round(maxCost*(1-i/4)).toLocaleString())); }
    for(const yr of ['2024','2025','2026']){ const xx=x(D(yr+'-01'));
      svg.appendChild(txt('lab-axis',xx,H-PB+16,'middle',yr)); }

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

    // readouts
    const disc = profile==='list' ? seatDiscount(seats) : 0;
    document.getElementById('lab-r-lic').textContent  = R.sym+Math.round(lic).toLocaleString();
    document.getElementById('lab-r-seat').textContent = `${R.sym}${seat.toFixed(2)}` + (disc>0?` (−${Math.round(disc*100)}%)`:'');
    document.getElementById('lab-r-model').textContent = stepAt(M.backend,T1)[1];

    const am = M.axis[mainModel];
    let note = override>0
      ? `Seat fixed at your <b>${R.sym}${override.toFixed(2)}</b> override.`
      : profile==='list'
        ? `Seat = ${R.sym}${(MMURR_DATA.seat.list[MMURR_REGION.get()]??MMURR_DATA.seat.list.UK).toFixed(2)} list − <b>${Math.round(disc*100)}%</b> expected EA discount at ${seats.toLocaleString()} seats.`
        : `Seat = ${R.sym}${seat.toFixed(2)} regional list for this SKU.`;
    if(profile==='business' && seats>MMURR_DATA.seat.businessCap)
      note += ` <b style="color:var(--hot)">Business SKU is capped at ${MMURR_DATA.seat.businessCap} employees</b> — this headcount can't use it; sits on the E-series.`;
    note += ` Markers are the Copilot backend swapping underneath; the line stays flat. `+
            `Main-model axis (drives the API/footprint comparison next): <b>${am.group} ${am.label}</b>` +
            (am.assumedWh?` <span class="vflag" title="Anthropic publishes no per-query energy — its Wh values are labelled assumptions.">(Wh assumed)</span>`:'') + `.`;
    document.getElementById('lab-disc').innerHTML = note;
  }

  // --- bindings ------------------------------------------------------------
  const onNum = (id, set) => document.getElementById(id).addEventListener('input', e=>{ set(parseFloat(e.target.value)||0); draw(); });
  document.getElementById('lab-profile').addEventListener('change', e=>{ profile=e.target.value; draw(); });
  onNum('lab-seats', v=>seats=v);
  onNum('lab-override', v=>override=v);
  document.getElementById('lab-cohort').addEventListener('change', e=>{ cohort=+e.target.value; draw(); });
  document.getElementById('lab-model').addEventListener('change', e=>{ mainModel=e.target.value; draw(); });
  MMURR_REGION.onChange(()=>{ buildModelSelect(); draw(); });   // re-price + relabel on region switch

  // expose state for later-phase overlays
  window.__lab = { get:()=>({profile,seats,override,cohort,mainModel}), draw };

  buildCohortSelect(); buildModelSelect(); draw();
})();
