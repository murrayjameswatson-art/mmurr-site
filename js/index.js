/* ----------------------------------------------------------------------------
   mmurr.ai — landing page
   Renders the honest "what this costs to run" card. Figures live in
   js/factors.js (MMURR_DATA.running) so they stay editable & sourced; shown in
   the currency of the selected region. Claude Pro is the owner's real £20/mo
   (verbatim under UK, FX-converted elsewhere). No servers, no tracking.
---------------------------------------------------------------------------- */
function renderRunningCosts(){
  const host = document.getElementById('running-costs');
  if(!host) return;
  const R = MMURR_REGION.data();
  const r = MMURR_DATA.running;
  const gbpFx = MMURR_DATA.regions.UK.fx;            // GBP per USD, the £ anchor
  const round5 = n => Math.round(n/5)*5;
  const dom = r.domainUsdPerYear.map(v => round5(v * R.fx));   // USD range → region
  const claude = Math.round(r.claudeGbpPerMonth / gbpFx * R.fx); // GBP → region
  const z = v => `<span class="run-zero">${v}</span>`;

  host.innerHTML = `
    <h2 class="run-h">What this costs to run</h2>
    <p class="run-lead">No ads, no servers, no analytics — so it's basically a domain and some time.</p>
    <dl class="run-grid">
      <dt>.ai domain</dt><dd>~${R.sym}${dom[0]}–${dom[1]} / yr</dd>
      <dt>Hosting — GitHub Pages (public repo)</dt><dd>${z(R.sym+'0')}</dd>
      <dt>Build assistant — Claude subscription (Pro)</dt><dd>${R.sym}${claude} / mo</dd>
      <dt>Compute to serve you</dt><dd>${z(R.sym+'0')} · runs in your browser</dd>
    </dl>
    <p class="run-foot">Rough all-in: a domain a year, plus the occasional whisky.
      GitHub Pages is free within ${r.ghPagesLimits}.</p>`;
}

MMURR_REGION.onChange(renderRunningCosts);
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', renderRunningCosts);
} else {
  renderRunningCosts();
}
