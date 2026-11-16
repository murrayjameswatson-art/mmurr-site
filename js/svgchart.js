/* ----------------------------------------------------------------------------
   mmurr.ai — tiny SVG chart helper (replaces Chart.js; no dependencies)

   MMURR_CHART.line(host, opts)   line / area / band chart over categories
   MMURR_CHART.bars(host, opts)   grouped bar chart over categories

   Shared opts:
     labels   ['2023','2024',…]            x categories, evenly spaced
     series   [{name, data:[n|null], color, …}]
     yFmt     v => '12 GW'                 tooltip + table formatter (and ticks)
     tickFmt  v => '12k'                   optional shorter tick formatter
     yTitle   'TWh / year'                 small caption above the y axis
     label    'Accessible description of the chart'
     table    true (default)               adds a "Show as table" fallback
   line() series extras:
     dash:true  area:true  points:true  line:false (markers only)
     marker:'diamond'  spanGaps:true  width:2  legend:false (hide from legend)
   line() extras:  band:{lo:[], hi:[], color, name}  maxXTicks:10
   bars() extras:  tipExtra: i => 'extra tooltip line'

   Charts measure their box and redraw on resize (and when a closed <details>
   around them opens), so they always render crisp at the real width.
   Colours come from the caller; text and grid use the site's CSS variables.
---------------------------------------------------------------------------- */
(function(){
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // "Nice" y ticks: 4–6 steps of 1, 2, 2.5 or 5 × 10^k, starting at zero.
  function niceTicks(max){
    if (!(max > 0)) max = 1;
    const raw = max / 5, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
    const top = Math.ceil(max / step - 1e-9) * step;
    const ticks = [];
    for (let v = 0; v <= top + step / 2; v += step) ticks.push(+v.toFixed(10));
    return ticks;
  }

  // Common scaffold: legend, plot box with tooltip, optional data table.
  function frame(host, opts, legendItems){
    host.innerHTML = '';
    host.classList.add('svgc');
    if (legendItems.length){
      const lg = document.createElement('div');
      lg.className = 'svgc-legend';
      lg.innerHTML = legendItems.map(s =>
        `<span><i class="${s.kind || 'line'}${s.dash ? ' dash' : ''}" style="--c:${esc(s.color)}"></i>${esc(s.name)}</span>`).join('');
      host.appendChild(lg);
    }
    const plot = document.createElement('div');
    plot.className = 'svgc-plot';
    host.appendChild(plot);
    const tip = document.createElement('div');
    tip.className = 'svgc-tip';
    tip.hidden = true;
    plot.appendChild(tip);
    if (opts.table !== false){
      const d = document.createElement('details');
      d.className = 'svgc-table';
      const cols = opts.series.filter(s => s.legend !== false);
      const fmt = opts.yFmt || (v => v);
      d.innerHTML = `<summary>Show as table</summary><div class="tw"><table class="src"><thead><tr><th></th>` +
        cols.map(s => `<th>${esc(s.name)}</th>`).join('') + `</tr></thead><tbody>` +
        opts.labels.map((lab, i) => `<tr><td>${esc(lab)}</td>` +
          cols.map(s => `<td class="v">${s.data[i] == null ? '–' : esc(fmt(s.data[i]))}</td>`).join('') + `</tr>`).join('') +
        `</tbody></table></div>`;
      host.appendChild(d);
    }
    return { plot, tip };
  }

  // Redraw on resize; a chart inside a closed <details> has width 0 until opened.
  // Pages that redraw on every input (the calculator) call line() again on the
  // same host, so the previous watcher is disconnected first.
  function responsive(host, draw){
    let last = 0, t;
    const run = () => { const w = host.clientWidth; if (w > 0 && w !== last){ last = w; draw(w); } };
    if (host._svgcStop) host._svgcStop();
    if (window.ResizeObserver){
      const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(run, 60); });
      ro.observe(host);
      host._svgcStop = () => ro.disconnect();
    } else {
      const on = () => { clearTimeout(t); t = setTimeout(run, 120); };
      window.addEventListener('resize', on);
      host._svgcStop = () => window.removeEventListener('resize', on);
    }
    run();
  }

  function axes(svg, m, W, H, ticks, y, fmt, title){   // fmt = tick formatter
    for (const v of ticks){
      el('line', { x1:m.l, x2:W - m.r, y1:y(v), y2:y(v), class:'svgc-grid' }, svg);
      el('text', { x:m.l - 6, y:y(v) + 3.5, 'text-anchor':'end' }, svg).textContent = fmt(v);
    }
    if (title) el('text', { x:m.l, y:m.t - 8, 'text-anchor':'start', class:'svgc-ytitle' }, svg).textContent = title;
  }

  // Every k-th label, always including the last one; if the last falls too close
  // to the previous regular label, that one gives way so the two never overlap.
  function xLabels(svg, labels, x, H, m, maxTicks){
    const n = labels.length, every = Math.max(1, Math.ceil(n / maxTicks));
    const idx = [];
    for (let i = 0; i < n; i += every) idx.push(i);
    if (idx[idx.length - 1] !== n - 1){
      if (idx.length > 1 && (n - 1) - idx[idx.length - 1] < every * 0.6) idx.pop();
      idx.push(n - 1);
    }
    for (const i of idx)
      el('text', { x:x(i), y:H - 8, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, svg).textContent = labels[i];
  }

  function showTip(tip, plot, html, px, py){
    tip.innerHTML = html;
    tip.hidden = false;
    const w = plot.clientWidth, tw = tip.offsetWidth;
    tip.style.left = Math.min(w - tw / 2, Math.max(tw / 2, px)) + 'px';
    tip.style.top = Math.max(0, py) + 'px';
  }
  const row = (color, name, val) =>
    `<div class="r"><span><i style="--c:${esc(color)}"></i>${esc(name)}</span><b>${esc(val)}</b></div>`;

  /* --- line / area / band ------------------------------------------------- */
  function line(host, opts){
    const fmt = opts.yFmt || (v => v.toLocaleString());
    const legend = opts.series.filter(s => s.legend !== false)
      .map(s => ({ name:s.name, color:s.color, dash:s.dash, kind: s.line === false ? 'dot' : s.area ? 'area' : 'line' }));
    if (opts.band && opts.band.name) legend.push({ name:opts.band.name, color:opts.band.color, kind:'area' });
    const { plot, tip } = frame(host, opts, legend);
    const n = opts.labels.length;
    let max = 0;
    for (const s of opts.series) for (const v of s.data) if (v != null && v > max) max = v;
    if (opts.band) for (const v of opts.band.hi) if (v != null && v > max) max = v;
    if (opts.yMax) max = Math.max(max, opts.yMax);
    const ticks = niceTicks(max);

    const tfmt = opts.tickFmt || fmt;
    function draw(Wpx){
      plot.querySelector('svg')?.remove();
      const W = Wpx, H = opts.height || (W < 520 ? 240 : 300);
      const labW = Math.max(...ticks.map(v => tfmt(v).length)) * 6 + 12;
      const m = { l:Math.max(34, labW), r:14, t: opts.yTitle ? 26 : 12, b:26 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const x = i => m.l + (n === 1 ? iw / 2 : i * iw / (n - 1));
      const top = ticks[ticks.length - 1];
      const y = v => m.t + ih - (v / top) * ih;
      const svg = el('svg', { viewBox:`0 0 ${W} ${H}`, role:'img', 'aria-label':opts.label || '' });
      plot.insertBefore(svg, tip);
      axes(svg, m, W, H, ticks, y, tfmt, opts.yTitle);
      xLabels(svg, opts.labels, x, H, m, opts.maxXTicks || (W < 520 ? 5 : 10));

      // segments of consecutive non-null points (gaps stay gaps unless spanGaps)
      const segs = data => {
        const out = []; let cur = [];
        data.forEach((v, i) => {
          if (v == null){ if (cur.length) out.push(cur); cur = []; return; }
          cur.push([x(i), y(v)]);
        });
        if (cur.length) out.push(cur);
        return out;
      };
      const pts = (data, span) => span ? [data.map((v, i) => v == null ? null : [x(i), y(v)]).filter(Boolean)] : segs(data);
      const d = p => 'M' + p.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L');

      if (opts.band){
        const hi = opts.band.hi.map((v, i) => [x(i), y(v)]), lo = opts.band.lo.map((v, i) => [x(i), y(v)]).reverse();
        el('path', { d: d(hi) + 'L' + lo.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L') + 'Z',
                     fill:opts.band.color, 'fill-opacity':.16, stroke:'none' }, svg);
      }
      for (const s of opts.series){
        for (const p of pts(s.data, s.spanGaps)){
          if (s.area && p.length > 1)
            el('path', { d: d(p) + `L${p[p.length-1][0].toFixed(1)},${y(0)}L${p[0][0].toFixed(1)},${y(0)}Z`,
                         fill:s.color, 'fill-opacity':.22, stroke:'none' }, svg);
          if (s.line !== false && p.length > 1)
            el('path', { d:d(p), fill:'none', stroke:s.color, 'stroke-width':s.width || 2,
                         'stroke-dasharray': s.dash ? '6 4' : null, 'stroke-linejoin':'round', 'stroke-linecap':'round' }, svg);
          if (s.points || s.line === false || p.length === 1)
            for (const q of p){
              if (s.marker === 'diamond') el('rect', { x:q[0] - 5, y:q[1] - 5, width:10, height:10, fill:s.color,
                                                       transform:`rotate(45 ${q[0]} ${q[1]})` }, svg);
              else el('circle', { cx:q[0], cy:q[1], r:3, fill:'var(--panel)', stroke:s.color, 'stroke-width':2 }, svg);
            }
        }
      }

      // hover: nearest category, all series values
      const guide = el('line', { y1:m.t, y2:m.t + ih, class:'svgc-guide', opacity:0 }, svg);
      const hit = el('rect', { x:m.l, y:m.t, width:iw, height:ih, fill:'transparent' }, svg);
      const move = ev => {
        const r = svg.getBoundingClientRect(), k = W / r.width;
        const sx = (ev.clientX - r.left) * k;
        const i = Math.max(0, Math.min(n - 1, Math.round((sx - m.l) / (n === 1 ? 1 : iw / (n - 1)))));
        guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('opacity', 1);
        const rows = opts.series.filter(s => s.legend !== false && s.data[i] != null).map(s => row(s.color, s.name, fmt(s.data[i])));
        if (opts.tipExtra) { const e = opts.tipExtra(i); if (e) rows.push(`<div class="dim">${esc(e)}</div>`); }
        if (!rows.length){ tip.hidden = true; return; }
        let yTop = m.t + ih;
        for (const s of opts.series) if (s.data[i] != null) yTop = Math.min(yTop, y(s.data[i]));
        showTip(tip, plot, `<b>${esc(opts.labels[i])}</b>` + rows.join(''), x(i) / k, yTop / k - 6);
      };
      hit.addEventListener('pointermove', move);
      hit.addEventListener('pointerdown', move);
      hit.addEventListener('pointerleave', () => { tip.hidden = true; guide.setAttribute('opacity', 0); });
    }
    responsive(host, draw);
  }

  /* --- grouped bars --------------------------------------------------------- */
  function bars(host, opts){
    const fmt = opts.yFmt || (v => v.toLocaleString());
    const { plot, tip } = frame(host, opts, opts.series.map(s => ({ name:s.name, color:s.color, kind:'area' })));
    const n = opts.labels.length, k = opts.series.length;
    let max = 0;
    for (const s of opts.series) for (const v of s.data) if (v != null && v > max) max = v;
    const ticks = niceTicks(max);

    function draw(W){
      plot.querySelector('svg')?.remove();
      const H = opts.height || (W < 520 ? 240 : 280);
      const labW = Math.max(...ticks.map(v => fmt(v).length)) * 6 + 12;
      const m = { l:Math.max(34, labW), r:10, t: opts.yTitle ? 26 : 12, b:26 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b, slot = iw / n;
      const top = ticks[ticks.length - 1];
      const y = v => m.t + ih - (v / top) * ih;
      const svg = el('svg', { viewBox:`0 0 ${W} ${H}`, role:'img', 'aria-label':opts.label || '' });
      plot.insertBefore(svg, tip);
      axes(svg, m, W, H, ticks, y, fmt, opts.yTitle);
      const bw = Math.min(56, slot * 0.7 / k);
      opts.labels.forEach((lab, i) => {
        const cx = m.l + slot * (i + .5);
        el('text', { x:cx, y:H - 8, 'text-anchor':'middle' }, svg).textContent = lab;
        opts.series.forEach((s, j) => {
          const v = s.data[i]; if (v == null) return;
          const bx = cx - (k * bw) / 2 + j * bw;
          el('rect', { x:bx + 1, y:y(v), width:bw - 2, height:Math.max(0, y(0) - y(v)), rx:3, fill:s.color }, svg);
          el('text', { x:bx + bw / 2, y:y(v) - 5, 'text-anchor':'middle', class:'svgc-val' }, svg).textContent = fmt(v);
        });
        const hit = el('rect', { x:m.l + slot * i, y:m.t, width:slot, height:ih, fill:'transparent' }, svg);
        const show = () => {
          const r = svg.getBoundingClientRect(), sc = W / r.width;
          const rows = opts.series.filter(s => s.data[i] != null).map(s => row(s.color, s.name, fmt(s.data[i])));
          if (opts.tipExtra) { const e = opts.tipExtra(i); if (e) rows.push(`<div class="dim">${esc(e)}</div>`); }
          showTip(tip, plot, `<b>${esc(lab)}</b>` + rows.join(''), cx / sc, m.t / sc + 10);
        };
        hit.addEventListener('pointerenter', show);
        hit.addEventListener('pointerdown', show);
        hit.addEventListener('pointerleave', () => { tip.hidden = true; });
      });
    }
    responsive(host, draw);
  }

  window.MMURR_CHART = { line, bars };
})();
