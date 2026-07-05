/* ----------------------------------------------------------------------------
   mmurr.ai — curated world AI data-centre sites (v2 §6)

   MAJOR AI-RELEVANT SITES, CURATED — never exhaustive (a full world register
   is a licensed commercial dataset). Every row carries a source_id resolving
   to the sources map, an as_of vintage, and a confidence tag:
     SOURCED — operator/government page or first-party announcement
     VERIFY  — credible press / analyst roundup, re-check before quoting
   Coordinates are town/campus-level (fine at world scale). mw is public
   nameplate/target IT power where one exists, else null — never invented.
   hosts: which chat models are served/trained there — 'doc' = vendor-
   documented, 'inf' = partnership-inferred (hollow marker on the map).
---------------------------------------------------------------------------- */
window.MMURR_SITES_WORLD = {
  as_of: '2026-07',
  sources: {
    nbf2026:   { label:'NextBigFuture — major AI DC build status (Jun 2026)', url:'https://www.nextbigfuture.com/2026/06/major-ai-data-center-build-projects-timelines-status-2026-2028.html' },
    aidcindex: { label:'AI Data Center Index — US facilities (2026)', url:'https://aidatacenterindex.com/countries/united-states/' },
    fortune26: { label:'Fortune — Meta Hyperion, Louisiana (Mar 2026)', url:'https://fortune.com/2026/03/26/meta-ai-data-center-hyperion-louisiana/' },
    nscale25:  { label:'Nscale — UK AI infrastructure announcement (Microsoft/NVIDIA/OpenAI)', url:'https://www.nscale.com/press-releases/nscale-uk-ai-infrastructure-announcement' },
    googledc:  { label:'Google — data centre locations (operator page)', url:'https://www.google.com/about/datacenters/locations/' },
    msblog:    { label:'Microsoft — official blog (Fairwater / Azure announcements)', url:'https://blogs.microsoft.com/' },
    govukaigz: { label:'GOV.UK — AI Growth Zones collection', url:'https://www.gov.uk/government/collections/ai-growth-zones' },
    wmedia:    { label:'W.Media — London data-centre market feature (2026)', url:'https://w.media/special-feature-london-still-going-strong-as-europes-data-center-powerhouse/' },
    iea2025:   { label:'IEA — Energy and AI (2025)', url:'https://www.iea.org/reports/energy-and-ai' },
    epochdc:   { label:'Epoch AI — AI data centers tracker', url:'https://epoch.ai/data/ai-data-centers' },
  },
  // model filter chips → marker highlighting (doc = solid, inf = hollow)
  models: [
    ['gpt','GPT (OpenAI)'], ['gemini','Gemini (Google)'], ['claude','Claude (Anthropic)'],
    ['grok','Grok (xAI)'], ['mistral','Mistral'],
  ],
  sites: [
    // --- United States -------------------------------------------------------
    { name:'Stargate I — Abilene', country:'US', lat:32.45, lon:-99.73, operator:'OpenAI / Oracle / Crusoe', mw:1200, status:'building', hosts:{gpt:'doc'}, source_id:'nbf2026', conf:'VERIFY' },
    { name:'xAI Colossus — Memphis', country:'US', lat:35.06, lon:-90.05, operator:'xAI', mw:300, status:'operational', hosts:{grok:'doc'}, source_id:'nbf2026', conf:'VERIFY' },
    { name:'xAI Colossus 2 — Memphis/Southaven', country:'US', lat:34.99, lon:-90.03, operator:'xAI', mw:950, status:'building', hosts:{grok:'doc'}, source_id:'nbf2026', conf:'VERIFY' },
    { name:'Project Rainier — New Carlisle, IN', country:'US', lat:41.70, lon:-86.51, operator:'AWS (Anthropic)', mw:1000, status:'operational', hosts:{claude:'doc'}, source_id:'nbf2026', conf:'VERIFY' },
    { name:'Microsoft Fairwater — Mount Pleasant, WI', country:'US', lat:42.71, lon:-87.90, operator:'Microsoft', mw:null, status:'building', hosts:{gpt:'doc'}, source_id:'msblog', conf:'VERIFY' },
    { name:'Microsoft Fairwater — Atlanta, GA', country:'US', lat:33.75, lon:-84.39, operator:'Microsoft', mw:null, status:'operational', hosts:{gpt:'doc'}, source_id:'nbf2026', conf:'VERIFY' },
    { name:'Meta Hyperion — Richland Parish, LA', country:'US', lat:32.35, lon:-91.68, operator:'Meta', mw:2000, status:'building', hosts:{}, source_id:'fortune26', conf:'SOURCED' },
    { name:'Meta Prometheus — New Albany, OH', country:'US', lat:40.08, lon:-82.81, operator:'Meta', mw:1000, status:'building', hosts:{}, source_id:'nbf2026', conf:'VERIFY' },
    { name:'Ashburn / Loudoun County cluster, VA', country:'US', lat:39.04, lon:-77.49, operator:'multi (Equinix, AWS, Azure…)', mw:null, status:'operational', hosts:{gpt:'inf', claude:'inf', gemini:'inf'}, source_id:'aidcindex', conf:'VERIFY' },
    { name:'Google — Council Bluffs, IA', country:'US', lat:41.26, lon:-95.86, operator:'Google', mw:null, status:'operational', hosts:{gemini:'doc'}, source_id:'googledc', conf:'SOURCED' },
    { name:'Google — The Dalles, OR', country:'US', lat:45.59, lon:-121.18, operator:'Google', mw:null, status:'operational', hosts:{gemini:'doc'}, source_id:'googledc', conf:'SOURCED' },
    { name:'Microsoft — West Des Moines, IA', country:'US', lat:41.57, lon:-93.71, operator:'Microsoft', mw:null, status:'operational', hosts:{gpt:'doc'}, source_id:'msblog', conf:'VERIFY' },
    // --- Europe ---------------------------------------------------------------
    { name:'Google — St. Ghislain, Belgium', country:'BE', lat:50.45, lon:3.82, operator:'Google', mw:null, status:'operational', hosts:{gemini:'doc'}, source_id:'googledc', conf:'SOURCED' },
    { name:'Google — Hamina, Finland', country:'FI', lat:60.57, lon:27.19, operator:'Google', mw:null, status:'operational', hosts:{gemini:'doc'}, source_id:'googledc', conf:'SOURCED' },
    { name:'Meta — Luleå, Sweden', country:'SE', lat:65.62, lon:22.13, operator:'Meta', mw:null, status:'operational', hosts:{}, source_id:'epochdc', conf:'VERIFY' },
    { name:'Microsoft — Dublin (Grange Castle)', country:'IE', lat:53.33, lon:-6.42, operator:'Microsoft', mw:null, status:'operational', hosts:{gpt:'doc'}, source_id:'msblog', conf:'VERIFY' },
    { name:'AWS — Dublin', country:'IE', lat:53.35, lon:-6.26, operator:'AWS', mw:null, status:'operational', hosts:{claude:'inf'}, source_id:'epochdc', conf:'VERIFY' },
    { name:'Frankfurt cluster', country:'DE', lat:50.11, lon:8.68, operator:'multi (Equinix, all clouds)', mw:null, status:'operational', hosts:{gpt:'inf', gemini:'inf', claude:'inf'}, source_id:'epochdc', conf:'VERIFY' },
    { name:'Microsoft — Middenmeer (Agriport), NL', country:'NL', lat:52.76, lon:4.99, operator:'Microsoft', mw:null, status:'operational', hosts:{gpt:'inf'}, source_id:'epochdc', conf:'VERIFY' },
    { name:'Stargate Norway — Narvik', country:'NO', lat:68.44, lon:17.43, operator:'Nscale / Aker (OpenAI)', mw:null, status:'building', hosts:{gpt:'doc'}, source_id:'nscale25', conf:'SOURCED' },
    { name:'Mistral / MGX campus — Essonne, France', country:'FR', lat:48.63, lon:2.43, operator:'Mistral AI / MGX', mw:null, status:'announced', hosts:{mistral:'doc'}, source_id:'epochdc', conf:'VERIFY' },
    { name:'Verne Global — Keflavík, Iceland', country:'IS', lat:63.97, lon:-22.60, operator:'Verne', mw:null, status:'operational', hosts:{}, source_id:'epochdc', conf:'VERIFY' },
    // --- United Kingdom (detail on the UK map above) ---------------------------
    { name:'Stargate UK — Cobalt Park, North Tyneside', country:'GB', lat:55.02, lon:-1.47, operator:'Nscale / OpenAI / NVIDIA', mw:null, status:'announced', hosts:{gpt:'doc'}, source_id:'nscale25', conf:'SOURCED' },
    { name:'Microsoft/Nscale AI campus — Loughton', country:'GB', lat:51.65, lon:0.06, operator:'Microsoft / Nscale', mw:90, status:'building', hosts:{gpt:'doc'}, source_id:'nscale25', conf:'SOURCED' },
    { name:'Google — Waltham Cross', country:'GB', lat:51.69, lon:-0.03, operator:'Google', mw:null, status:'operational', hosts:{gemini:'doc'}, source_id:'googledc', conf:'SOURCED' },
    // --- Middle East / Asia / Pacific ------------------------------------------
    { name:'Stargate UAE — Abu Dhabi', country:'AE', lat:24.45, lon:54.38, operator:'G42 / OpenAI', mw:1000, status:'building', hosts:{gpt:'doc'}, source_id:'nbf2026', conf:'VERIFY' },
    { name:'HUMAIN — Riyadh', country:'SA', lat:24.71, lon:46.68, operator:'HUMAIN (PIF)', mw:null, status:'announced', hosts:{}, source_id:'nbf2026', conf:'VERIFY' },
    { name:'Google — Changhua County, Taiwan', country:'TW', lat:24.08, lon:120.54, operator:'Google', mw:null, status:'operational', hosts:{gemini:'doc'}, source_id:'googledc', conf:'SOURCED' },
    { name:'GDS — Ulanqab, Inner Mongolia', country:'CN', lat:40.99, lon:113.13, operator:'GDS', mw:null, status:'operational', hosts:{}, source_id:'epochdc', conf:'VERIFY' },
    { name:'Tencent — Guian, Guizhou', country:'CN', lat:26.62, lon:106.63, operator:'Tencent', mw:null, status:'operational', hosts:{}, source_id:'epochdc', conf:'VERIFY' },
    { name:'Yotta NM1 — Navi Mumbai', country:'IN', lat:19.03, lon:73.03, operator:'Yotta', mw:null, status:'operational', hosts:{}, source_id:'epochdc', conf:'VERIFY' },
    { name:'Stargate Japan — Sakai, Osaka', country:'JP', lat:34.58, lon:135.47, operator:'SoftBank / OpenAI', mw:null, status:'announced', hosts:{gpt:'doc'}, source_id:'nbf2026', conf:'VERIFY' },
    { name:'Singapore cluster', country:'SG', lat:1.35, lon:103.82, operator:'multi (Google, AWS, Equinix)', mw:null, status:'operational', hosts:{gemini:'doc', claude:'inf'}, source_id:'googledc', conf:'VERIFY' },
    { name:'Sydney cluster', country:'AU', lat:-33.87, lon:151.21, operator:'multi (AWS, NEXTDC)', mw:null, status:'operational', hosts:{claude:'inf'}, source_id:'epochdc', conf:'VERIFY' },
    { name:'Montréal cluster', country:'CA', lat:45.50, lon:-73.57, operator:'multi (AWS, Google)', mw:null, status:'operational', hosts:{gemini:'inf', claude:'inf'}, source_id:'epochdc', conf:'VERIFY' },
  ],
};
