/* ---------------------------------------------------------------------------
   mmurr.ai — region / currency selector (shared across all pages)

   One global control. The chosen region changes prices AND footprint, and the
   "What changes?" disclosure says so out loud. Choice persists in localStorage
   only (no cookies, no tracking). Reads region data from js/factors.js, so this
   file must load AFTER factors.js and BEFORE each page's own script.

   Usage on a page:
     <div id="region-bar"></div>            <!-- where the bar renders -->
     ... load factors.js, then region.js, then page.js ...
     MMURR_REGION.onChange(applyRegion);    // page reacts to switches
     applyRegion();                          // apply the persisted region at start

   API:
     MMURR_REGION.get()      -> 'UK' | 'US' | 'EU' | 'Custom'
     MMURR_REGION.data()     -> the region object from MMURR_DATA.regions
     MMURR_REGION.set(code)  -> switch region (persists + notifies)
     MMURR_REGION.onChange(fn)
--------------------------------------------------------------------------- */
window.MMURR_REGION = (function(){
  const KEY = 'mmurr.region';
  const regions = MMURR_DATA.regions;

  // localStorage can throw in private mode / file:// — degrade to in-memory.
  const store = {
    get(){ try{ return localStorage.getItem(KEY); }catch(e){ return null; } },
    set(v){ try{ localStorage.setItem(KEY, v); }catch(e){ /* in-memory only */ } },
  };

  let current = store.get();
  if(!regions[current]) current = MMURR_DATA.defaultRegion;

  const listeners = [];
  const get  = () => current;
  const data = () => regions[current];
  function set(code){
    if(!regions[code] || code === current) return;
    current = code;
    store.set(code);
    renderAll();
    listeners.forEach(fn => fn(current));
  }
  const onChange = fn => listeners.push(fn);

  // --- The "What changes?" assumption ledger (plan §8, the load-bearing bits)
  function ledgerHTML(){
    const R = data();
    const seatTxt = `${R.sym}${(MMURR_DATA.seat.list[current] ?? MMURR_DATA.seat.list.UK).toFixed(2)}/seat`;
    return `
      <ul class="region-ledger">
        <li><b>Seat prices are regional list, not currency conversions.</b>
            Microsoft &amp; Snowflake price per market — you see the local list
            (${current==='Custom'?'your value':`${R.label} ≈ ${seatTxt}`}), not a converted figure.</li>
        <li><b>Token / API prices are USD list, FX-converted</b> at an editable anchor
            (${R.cur||'custom'} at ${R.fx}/USD). ${MMURR_DATA.fxNote}</li>
        <li><b>Carbon depends on where compute runs, not where you sit.</b>
            Grid intensity defaults to ${R.label} ≈ ${R.grid} kg/kWh
            (${R.gridNote}). For UK M365 tenants this is an <em>assumption</em>,
            not a guarantee — inference routing isn't publicly pinned.</li>
      </ul>`;
  }

  function barHTML(){
    const buttons = Object.entries(regions).map(([code,R]) =>
      `<button type="button" data-region="${code}" aria-pressed="${code===current}"
         title="${R.label}">${R.flag} ${code}</button>`).join('');
    return `
      <div class="region-row">
        <div class="region-info">
          <strong>Region &amp; currency</strong>
          <span class="sub">Changes prices <em>and</em> footprint — see below. Default: ${regions[MMURR_DATA.defaultRegion].flag} UK · London.</span>
        </div>
        <div class="seg region-seg" role="group" aria-label="Region and currency">${buttons}</div>
      </div>
      <details class="region-disclose">
        <summary>What changes when I switch region?</summary>
        ${ledgerHTML()}
      </details>`;
  }

  // Render into every #region-bar on the page (there is normally one).
  function renderAll(){
    document.querySelectorAll('#region-bar').forEach(host => {
      host.classList.add('region-bar');
      host.innerHTML = barHTML();
      const seg = host.querySelector('.region-seg');
      seg.addEventListener('click', e => {
        const b = e.target.closest('button[data-region]');
        if(b) set(b.dataset.region);
      });
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', renderAll);
  } else {
    renderAll();
  }

  return { get, data, set, onChange };
})();
