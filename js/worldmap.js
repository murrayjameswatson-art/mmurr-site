/* ----------------------------------------------------------------------------
   mmurr.ai — the two maps on the data-centres page (v2 §6 + §7)

   One file renders both (they share the topology, tooltip and marker logic):
     · UK map     — curated site markers over the GB outline, All/AI-flagged
                    filter, status shown by marker style. NO per-site
                    utilisation anywhere — it is not public (§7.3).
     · World map  — grid-CI choropleth + ~35 curated flagship AI campuses +
                    model filter chips. Solid marker = vendor-DOCUMENTED
                    hosting; hollow = partnership-INFERRED. Curated ≠
                    exhaustive, and the footer says so with the data vintage.

   Data: js/data/world-110m.js (topology), sites-uk.js, sites-world.js,
   dc-geo.js. Rendering: D3 v7 + topojson-client from cdnjs (no tile servers).
---------------------------------------------------------------------------- */
(function(){
  if(!window.d3 || !window.topojson || !window.MMURR_WORLD110) return;
  const countries = topojson.feature(MMURR_WORLD110, MMURR_WORLD110.objects.countries);

  const STATUS = {
    operational: { label:'operational',        fill:'#5bd1a6', stroke:'#5bd1a6', dash:null, fillOn:true  },
    building:    { label:'under construction', fill:'#e0b341', stroke:'#e0b341', dash:'3 2', fillOn:true },
    announced:   { label:'announced',          fill:'none',    stroke:'#9aa3b2', dash:null, fillOn:false },
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
  function marker(sel, st){
    return sel.attr('r', 4.5)
      .attr('fill', st.fillOn ? st.fill : 'none')
      .attr('fill-opacity', st.fillOn ? .85 : 0)
      .attr('stroke', st.stroke).attr('stroke-width', 1.6)
      .attr('stroke-dasharray', st.dash);
  }

  /* --- UK map (§7) --------------------------------------------------------- */
  (function ukMap(){
    const box = document.getElementById('ukMap');
    if(!box || !window.MMURR_SITES_UK) return;
    const S = MMURR_SITES_UK;
    const gb = countries.features.find(f => String(f.id) === '826');
    const W = 460, H = 560;
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
    const proj = d3.geoMercator().fitExtent([[10,10],[W-10,H-10]], gb);
    const path = d3.geoPath(proj);
    svg.append('path').attr('d', path(gb))
      .attr('fill', '#1c212b').attr('stroke', '#2e3542').attr('stroke-width', 1);
    const tip = makeTip(box);

    let mode = 'all';
    const g = svg.append('g');
    function draw(){
      const rows = S.sites.filter(s => mode === 'all' || s.ai);
      const sel = g.selectAll('circle').data(rows, s => s.name);
      sel.exit().remove();
      const ent = sel.enter().append('circle')
        .attr('cx', s => proj([s.lon, s.lat])[0])
        .attr('cy', s => proj([s.lon, s.lat])[1])
        .style('cursor', 'pointer')
        .on('mousemove', (e, s) => tip.show(siteTip(s, S), e))
        .on('mouseleave', tip.hide);
      ent.merge(sel).each(function(s){ marker(d3.select(this), STATUS[s.status]); });
      const note = document.getElementById('ukMapNote');
      if(note) note.innerHTML =
        `Showing <b>${rows.length}</b> curated sites (of ~${S.totalIdentified} the Computer Weekly / Barbour ABI ` +
        `EPC-derived series identifies — the misses are the long tail of small colocation sites). Every marker carries ` +
        `its source and confidence in the tooltip; coordinates are town-level. Data as of ${S.as_of}. ` +
        `Per-site utilisation is not public and is not shown — the national picture is in the chart below.`;
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
    const S = MMURR_SITES_WORLD, G = MMURR_DC_GEO;
    const W = 920, H = 470;
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
    const proj = d3.geoNaturalEarth1().fitExtent([[4,4],[W-4,H-4]], countries);
    const path = d3.geoPath(proj);
    const tip = makeTip(box);

    // grid-CI choropleth (display only — calculations always use gridFactor)
    const ciColor = d3.scaleLinear().domain([0, .2, .45, .72])
      .range(['#17423a', '#3d5a35', '#6e5a26', '#6e2a1e']).clamp(true);
    svg.append('g').selectAll('path').data(countries.features).join('path')
      .attr('d', path)
      .attr('fill', f => { const ci = G.ci[+f.id]; return ci == null ? '#171b23' : ciColor(ci); })
      .attr('stroke', '#222732').attr('stroke-width', .5)
      .on('mousemove', (e, f) => {
        const ci = G.ci[+f.id];
        tip.show(`<b>${f.properties.name}</b><br>` + (ci == null
          ? '<span class="dim">no sourced grid figure</span>'
          : `grid ≈ ${ci} kgCO₂e/kWh <span class="dim">(${[840,826,250].includes(+f.id) ? 'SOURCED — matches gridFactor' : 'Ember 2024, VERIFY'})</span>`), e);
      })
      .on('mouseleave', tip.hide);

    let model = 'all';
    const g = svg.append('g');
    function draw(){
      const sel = g.selectAll('circle').data(S.sites, s => s.name);
      const ent = sel.enter().append('circle')
        .attr('cx', s => proj([s.lon, s.lat])[0])
        .attr('cy', s => proj([s.lon, s.lat])[1])
        .style('cursor', 'pointer')
        .on('mousemove', (e, s) => {
          let extra = '';
          if(model !== 'all' && s.hosts[model])
            extra = `<br><span class="dim">${model.toUpperCase()}: ${s.hosts[model] === 'doc' ? 'vendor-documented hosting' : 'partnership-inferred'}</span>`;
          tip.show(siteTip(s, S) + extra, e);
        })
        .on('mouseleave', tip.hide);
      ent.merge(sel).each(function(s){
        const c = d3.select(this);
        if(model === 'all'){ marker(c, STATUS[s.status]).attr('opacity', 1); return; }
        const h = s.hosts[model];
        if(!h){ marker(c, STATUS[s.status]).attr('opacity', .18); return; }
        // solid = documented, hollow = inferred — the credibility of the page
        c.attr('opacity', 1).attr('r', 5.5)
         .attr('fill', h === 'doc' ? '#7db7ff' : 'none')
         .attr('fill-opacity', h === 'doc' ? .95 : 0)
         .attr('stroke', '#7db7ff').attr('stroke-width', 2).attr('stroke-dasharray', null);
      });
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
        `<b>Major AI-relevant sites, curated</b> — ${S.sites.length} campuses/clusters, never exhaustive (a full world ` +
        `register is licensed analyst data). Choropleth = grid carbon intensity (display only; ${srcLabel(G,'ember')}, ` +
        `VERIFY except the UK/US/France anchors, which match gridFactor). Where the capacity actually sits (IEA, ` +
        `mid-2025): global ≈${cap.globalGw} GW IT — US ≈${cap.sharesPct.US}% · Europe ≈${cap.sharesPct.Europe}% · ` +
        `China ≈${cap.sharesPct.China}%; 2024 DC electricity US ${cap.twh2024.US} TWh · China ${cap.twh2024.China} TWh. ` +
        `Model→region mappings churn quarterly — data as of ${S.as_of}.`;
    }
    draw();
  })();
})();
