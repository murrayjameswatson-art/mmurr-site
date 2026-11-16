/* ----------------------------------------------------------------------------
   mmurr.ai — the two maps on the data-centres page (v2 §6 + §7)

   One file renders both (they share the tooltip and marker logic):
     · UK map     — curated site markers over the GB outline, All/AI-flagged
                    filter, status shown by marker style. NO per-site
                    utilisation anywhere — it is not public (§7.3).
     · World map  — grid-CI choropleth + ~35 curated flagship AI campuses +
                    model filter chips. Solid marker = vendor-DOCUMENTED
                    hosting; hollow = partnership-INFERRED. Curated ≠
                    exhaustive, and the footer says so with the data vintage.

   Data: js/data/maps.js (outlines, pre-projected by tools/build-maps.mjs),
   sites-uk.js, sites-world.js, dc-geo.js. Plain SVG — no libraries, no CDN,
   no tile servers. Site markers are projected here with the same formulas d3
   uses (checked by the generator), so sites can be edited without a rebuild.
---------------------------------------------------------------------------- */
(function(){
  if(!window.MMURR_MAPS) return;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for(const k in attrs) if(attrs[k] != null) e.setAttribute(k, attrs[k]);
    if(parent) parent.appendChild(e);
    return e;
  };
  const RAD = Math.PI / 180;
  // Projections — same maths as d3.geoMercator / d3.geoNaturalEarth1, using the
  // scale (k) and translate (tx, ty) the generator fitted to each frame.
  const PROJ = {
    mercator: (lon, lat, p) => [p.k*lon*RAD + p.tx, p.ty - p.k*Math.log(Math.tan(Math.PI/4 + lat*RAD/2))],
    naturalEarth1: (lon, lat, p) => {
      const l = lon*RAD, f = lat*RAD, f2 = f*f, f4 = f2*f2;
      const x = l*(0.8707 - 0.131979*f2 + f4*(-0.013791 + f4*(0.003971*f2 - 0.001529*f4)));
      const y = f*(1.007226 + f2*(0.015085 + f4*(-0.044475 + 0.028874*f2 - 0.005916*f4)));
      return [p.k*x + p.tx, p.ty - p.k*y];
    },
  };
  const project = (map, s) => PROJ[map.proj.type](s.lon, s.lat, map.proj);

  const STATUS = {
    operational: { label:'operational',        fill:'#5bd1a6', stroke:'#5bd1a6', dash:null,  fillOn:true  },
    building:    { label:'under construction', fill:'#e0b341', stroke:'#e0b341', dash:'3 2', fillOn:true  },
    announced:   { label:'announced',          fill:'none',    stroke:'#9aa3b2', dash:null,  fillOn:false },
  };

  function makeTip(box){
    const tip = document.createElement('div');
    tip.className = 'map-tip'; box.appendChild(tip);
    return {
      show(html, evt){
        tip.innerHTML = html; tip.style.opacity = 1;
        const r = box.getBoundingClientRect();
        const x = Math.min(evt.clientX - r.left + 12, r.width - 270);
        tip.style.left = Math.max(0, x) + 'px';
        tip.style.top  = (evt.clientY - r.top + 14) + 'px';
      },
      hide(){ tip.style.opacity = 0; },
    };
  }
  const srcLabel = (S, id) => (S.sources[id] ? S.sources[id].label : id);
  function siteTip(s, S){
    return `<b>${s.name}</b><br>${s.operator}` +
      (s.mw ? ` · ${s.mw.toLocaleString()} MW` : ' · MW not public') +
      `<br>${STATUS[s.status].label}` + (s.aiWhy ? ` · AI: ${s.aiWhy}` : '') +
      `<br><span class="dim">${srcLabel(S, s.source_id)} · ${s.conf} · as of ${S.as_of}</span>`;
  }
  function styleMarker(c, st, opacity){
    c.setAttribute('r', 4.5);
    c.setAttribute('fill', st.fillOn ? st.fill : 'none');
    c.setAttribute('fill-opacity', st.fillOn ? .85 : 0);
    c.setAttribute('stroke', st.stroke);
    c.setAttribute('stroke-width', 1.6);
    if(st.dash) c.setAttribute('stroke-dasharray', st.dash); else c.removeAttribute('stroke-dasharray');
    c.setAttribute('opacity', opacity == null ? 1 : opacity);
  }
  function addMarkers(g, map, sites, tip, tipHtml){
    g.textContent = '';
    return sites.map(s => {
      const [cx, cy] = project(map, s);
      const c = el('circle', { cx:cx.toFixed(1), cy:cy.toFixed(1), style:'cursor:pointer' }, g);
      c.addEventListener('mousemove', e => tip.show(tipHtml(s), e));
      c.addEventListener('mouseleave', tip.hide);
      return [s, c];
    });
  }

  /* --- UK map (§7) --------------------------------------------------------- */
  (function ukMap(){
    const box = document.getElementById('ukMap');
    if(!box || !window.MMURR_SITES_UK) return;
    const S = MMURR_SITES_UK, M = MMURR_MAPS.uk;
    const svg = el('svg', { viewBox:`0 0 ${M.W} ${M.H}`, role:'img', 'aria-label':'Map of Great Britain with curated data-centre sites' }, box);
    el('path', { d:M.d, fill:'#1c212b', stroke:'#2e3542', 'stroke-width':1 }, svg);
    const tip = makeTip(box), g = el('g', {}, svg);
    let mode = 'all';
    function draw(){
      const rows = S.sites.filter(s => mode === 'all' || s.ai);
      for(const [s, c] of addMarkers(g, M, rows, tip, s => siteTip(s, S))) styleMarker(c, STATUS[s.status]);
      const note = document.getElementById('ukMapNote');
      if(note) note.innerHTML =
        `Showing <b>${rows.length}</b> curated sites (of ~${S.totalIdentified} the Computer Weekly / Barbour ABI ` +
        `EPC-derived series identifies; the rest are small colocation sites). Every marker carries ` +
        `its source and confidence in the tooltip; coordinates are town-level. Data as of ${S.as_of}. ` +
        `Per-site utilisation is not public and is not shown; the national picture is in the chart below.`;
    }
    const seg = document.getElementById('ukFilter');
    if(seg) seg.addEventListener('click', e => {
      if(!e.target.dataset.f) return;
      [...seg.children].forEach(b => b.classList.remove('on'));
      e.target.classList.add('on'); mode = e.target.dataset.f; draw();
    });
    draw();
  })();

  /* --- World map (§6) ------------------------------------------------------ */
  (function worldMap(){
    const box = document.getElementById('worldMap');
    if(!box || !window.MMURR_SITES_WORLD || !window.MMURR_DC_GEO) return;
    const S = MMURR_SITES_WORLD, G = MMURR_DC_GEO, M = MMURR_MAPS.world;
    const svg = el('svg', { viewBox:`0 0 ${M.W} ${M.H}`, role:'img', 'aria-label':'World map shaded by grid carbon intensity, with major AI data-centre sites' }, box);
    const tip = makeTip(box);

    // grid-CI choropleth (display only — calculations always use gridFactor)
    const STOPS = [[0,'#17423a'], [.2,'#3d5a35'], [.45,'#6e5a26'], [.72,'#6e2a1e']];
    const hex = h => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16));
    function ciColor(v){
      if(v <= STOPS[0][0]) return STOPS[0][1];
      for(let i = 1; i < STOPS.length; i++){
        const [x1, c1] = STOPS[i];
        if(v <= x1){
          const [x0, c0] = STOPS[i-1], t = (v - x0)/(x1 - x0), a = hex(c0), b = hex(c1);
          return 'rgb(' + a.map((q, j) => Math.round(q + (b[j] - q)*t)).join(',') + ')';
        }
      }
      return STOPS[STOPS.length-1][1];
    }
    const land = el('g', {}, svg);
    for(const [id, name, d] of M.countries){
      const ci = G.ci[id];
      const p = el('path', { d, fill: ci == null ? '#171b23' : ciColor(ci), stroke:'#222732', 'stroke-width':.5 }, land);
      p.addEventListener('mousemove', e => tip.show(`<b>${name}</b><br>` + (ci == null
        ? '<span class="dim">no sourced grid figure</span>'
        : `grid ≈ ${ci} kgCO₂e/kWh <span class="dim">(${[840,826,250].includes(id) ? 'SOURCED — matches gridFactor' : 'Ember 2024, VERIFY'})</span>`), e));
      p.addEventListener('mouseleave', tip.hide);
    }

    let model = 'all';
    const g = el('g', {}, svg);
    const markers = addMarkers(g, M, S.sites, tip, s => {
      let extra = '';
      if(model !== 'all' && s.hosts[model])
        extra = `<br><span class="dim">${model.toUpperCase()}: ${s.hosts[model] === 'doc' ? 'vendor-documented hosting' : 'partnership-inferred'}</span>`;
      return siteTip(s, S) + extra;
    });
    function draw(){
      for(const [s, c] of markers){
        if(model === 'all'){ styleMarker(c, STATUS[s.status]); continue; }
        const h = s.hosts[model];
        if(!h){ styleMarker(c, STATUS[s.status], .18); continue; }
        // solid = documented, hollow = inferred — the credibility of the page
        c.setAttribute('opacity', 1); c.setAttribute('r', 5.5);
        c.setAttribute('fill', h === 'doc' ? '#7db7ff' : 'none');
        c.setAttribute('fill-opacity', h === 'doc' ? .95 : 0);
        c.setAttribute('stroke', '#7db7ff'); c.setAttribute('stroke-width', 2);
        c.removeAttribute('stroke-dasharray');
      }
      const lg = document.getElementById('wmLegend');
      if(lg) lg.innerHTML = model === 'all'
        ? `<span><i style="background:#5bd1a6"></i>operational</span>
           <span><i style="background:#e0b341;border-radius:50%"></i>under construction</span>
           <span><i style="background:none;border:1.5px solid #9aa3b2"></i>announced</span>`
        : `<span><i style="background:#7db7ff"></i>vendor-documented hosting</span>
           <span><i style="background:none;border:2px solid #7db7ff"></i>partnership-inferred</span>
           <span class="dim">dimmed = no known hosting for this model</span>`;
    }
    const chips = document.getElementById('wmChips');
    if(chips){
      chips.innerHTML = `<button data-m="all" class="on">All sites</button>` +
        S.models.map(([k, lab]) => `<button data-m="${k}">${lab}</button>`).join('');
      chips.addEventListener('click', e => {
        if(!e.target.dataset.m) return;
        [...chips.children].forEach(b => b.classList.remove('on'));
        e.target.classList.add('on'); model = e.target.dataset.m; draw();
      });
    }
    const note = document.getElementById('worldMapNote');
    if(note){
      const cap = G.capacity;
      note.innerHTML =
        `<b>Major AI sites, curated</b>: ${S.sites.length} campuses and clusters, not a complete list (a full world ` +
        `register is licensed analyst data). Choropleth = grid carbon intensity (display only; ${srcLabel(G,'ember')}, ` +
        `VERIFY except the UK/US/France anchors, which match gridFactor). Where the capacity actually sits (IEA, ` +
        `mid-2025): global ≈${cap.globalGw} GW IT — US ≈${cap.sharesPct.US}% · Europe ≈${cap.sharesPct.Europe}% · ` +
        `China ≈${cap.sharesPct.China}%; 2024 DC electricity US ${cap.twh2024.US} TWh · China ${cap.twh2024.China} TWh. ` +
        `Which models run where changes every quarter; data as of ${S.as_of}.`;
    }
    draw();
  })();
})();
