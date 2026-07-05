/* ----------------------------------------------------------------------------
   mmurr.ai — curated UK data-centre sites (v2 §7)

   ~24 sites: the majors and everything AI-flagged — NOT the full UK register.
   Computer Weekly's EPC-derived series identifies ~190 sites but its
   coordinates are not public, so this file is hand-curated from AI Growth
   Zone designations (GOV.UK), operator pages and press-cited announcements;
   the misses are the long tail of small colocation sites. State this on-page.
   Coordinates are town-level. mw only where a public nameplate/consented
   figure exists. ai=true criterion (sourced, per row in aiWhy): AI Growth
   Zone designation, announced GPU deployment, or hyperscaler AI campus.
   Per-site utilisation is NOT public and is never shown (§7.3).
---------------------------------------------------------------------------- */
window.MMURR_SITES_UK = {
  as_of: '2026-07',
  totalIdentified: 190,   // CW/Barbour EPC-derived series — the fuller register this curates from
  sources: {
    govukaigz: { label:'GOV.UK — AI Growth Zones collection', url:'https://www.gov.uk/government/collections/ai-growth-zones' },
    cwaigz:    { label:'Computer Weekly — AI Growth Zones explainer', url:'https://www.computerweekly.com/news/366628066/The-UK-governments-AI-Growth-Zones-strategy-Everything-you-need-to-know' },
    cwcap:     { label:'Computer Weekly / Barbour ABI — UK capacity series', url:'https://www.computerweekly.com/news/366640935/Data-dive-Government-2030-datacentre-capacity-targets-look-shaky' },
    nscale25:  { label:'Nscale — UK AI infrastructure announcement (Microsoft/NVIDIA/OpenAI)', url:'https://www.nscale.com/press-releases/nscale-uk-ai-infrastructure-announcement' },
    wmedia:    { label:'W.Media — London data-centre market feature (2026)', url:'https://w.media/special-feature-london-still-going-strong-as-europes-data-center-powerhouse/' },
    dcd14bn:   { label:'DCD — £14bn of DC projects under the AI action plan', url:'https://www.datacenterdynamics.com/en/news/uk-ai-opportunities-action-plan-data-center/' },
    tradegov:  { label:'US ITA — UK’s latest AI Growth Zone (North Lanarkshire, Jan 2026)', url:'https://www.trade.gov/market-intelligence/uk-latest-ai-growth-zone-2026' },
    kao:       { label:'Kao Data — Harlow campus (operator page)', url:'https://www.kaodata.com/' },
    googledc:  { label:'Google — data centre locations (operator page)', url:'https://www.google.com/about/datacenters/locations/' },
  },
  sites: [
    // --- operational majors ---------------------------------------------------
    { name:'Slough Trading Estate (Equinix LD campus)', lat:51.52, lon:-0.62, operator:'Equinix', mw:null, status:'operational', ai:false, source_id:'cwcap', conf:'VERIFY' },
    { name:'London Docklands (Telehouse)', lat:51.51, lon:-0.00, operator:'Telehouse', mw:null, status:'operational', ai:false, source_id:'cwcap', conf:'VERIFY' },
    { name:'Park Royal (VIRTUS + Vantage LHR2)', lat:51.53, lon:-0.28, operator:'VIRTUS / Vantage', mw:20, status:'operational', ai:false, source_id:'wmedia', conf:'SOURCED' },
    { name:'Hayes Digital Park', lat:51.50, lon:-0.42, operator:'Colt DCS', mw:160, status:'operational', ai:false, source_id:'wmedia', conf:'SOURCED' },
    { name:'Union Park, Uxbridge', lat:51.52, lon:-0.46, operator:'Ark', mw:null, status:'operational', ai:false, source_id:'cwcap', conf:'VERIFY' },
    { name:'Spring Park, Corsham', lat:51.43, lon:-2.18, operator:'Ark', mw:null, status:'operational', ai:false, source_id:'cwcap', conf:'VERIFY' },
    { name:'Google Waltham Cross', lat:51.69, lon:-0.03, operator:'Google', mw:null, status:'operational', ai:true, aiWhy:'hyperscaler AI region (£5bn UK programme)', source_id:'googledc', conf:'SOURCED' },
    { name:'Kao Data Harlow', lat:51.77, lon:0.10, operator:'Kao Data', mw:40, status:'operational', ai:true, aiWhy:'hosts NVIDIA Cambridge-1 supercomputer', source_id:'kao', conf:'SOURCED' },
    { name:'Imperial Park, Newport (Vantage CWL)', lat:51.55, lon:-2.93, operator:'Vantage', mw:93, status:'operational', ai:true, aiWhy:'inside the South Wales AI Growth Zone', source_id:'dcd14bn', conf:'VERIFY' },
    { name:'Cobalt Park, North Tyneside (Stellium)', lat:55.02, lon:-1.47, operator:'Stellium / Nscale', mw:null, status:'operational', ai:true, aiWhy:'Stargate UK site; North East AI Growth Zone', source_id:'nscale25', conf:'SOURCED' },
    { name:'Manchester cluster (Equinix MA)', lat:53.48, lon:-2.24, operator:'Equinix et al.', mw:null, status:'operational', ai:false, source_id:'cwcap', conf:'VERIFY' },
    { name:'DataVita Chapelhall, Lanarkshire', lat:55.83, lon:-3.93, operator:'DataVita', mw:null, status:'operational', ai:true, aiWhy:'inside the North Lanarkshire AI Growth Zone', source_id:'tradegov', conf:'VERIFY' },
    // --- under construction / consented ----------------------------------------
    { name:'Loughton AI campus (Microsoft/Nscale)', lat:51.65, lon:0.06, operator:'Microsoft / Nscale', mw:90, status:'building', ai:true, aiWhy:'23,040 NVIDIA GB300s from Q1 2027 — UK’s largest AI supercomputer', source_id:'nscale25', conf:'SOURCED' },
    { name:'Microsoft Newport', lat:51.58, lon:-2.99, operator:'Microsoft', mw:null, status:'building', ai:true, aiWhy:'hyperscaler AI region build-out (South Wales AIGZ)', source_id:'dcd14bn', conf:'VERIFY' },
    { name:'Cambois, Blyth (QTS/Blackstone)', lat:55.13, lon:-1.53, operator:'QTS / Blackstone', mw:null, status:'building', ai:true, aiWhy:'£10bn AI campus; North East AI Growth Zone', source_id:'govukaigz', conf:'VERIFY' },
    // --- announced / designated -------------------------------------------------
    { name:'Culham AI Growth Zone (UKAEA)', lat:51.66, lon:-1.23, operator:'UKAEA + partner TBC', mw:500, status:'announced', ai:true, aiWhy:'first AI Growth Zone — 100 MW scaling to 500 MW', source_id:'govukaigz', conf:'SOURCED' },
    { name:'Prosperity Parc, Anglesey (N Wales AIGZ)', lat:53.30, lon:-4.43, operator:'TBC', mw:null, status:'announced', ai:true, aiWhy:'North Wales AI Growth Zone', source_id:'govukaigz', conf:'SOURCED' },
    { name:'Trawsfynydd, Gwynedd (N Wales AIGZ)', lat:52.90, lon:-3.94, operator:'TBC', mw:null, status:'announced', ai:true, aiWhy:'North Wales AI Growth Zone', source_id:'govukaigz', conf:'SOURCED' },
    { name:'Newport–Bridgend corridor (S Wales AIGZ)', lat:51.50, lon:-3.58, operator:'multi', mw:null, status:'announced', ai:true, aiWhy:'South Wales AI Growth Zone', source_id:'govukaigz', conf:'SOURCED' },
    { name:'Ravenscraig, North Lanarkshire (Apatura)', lat:55.78, lon:-3.98, operator:'Apatura', mw:550, status:'announced', ai:true, aiWhy:'North Lanarkshire AIGZ (designated Jan 2026)', source_id:'tradegov', conf:'VERIFY' },
    { name:'Elsham, North Lincolnshire', lat:53.60, lon:-0.42, operator:'TBC', mw:1000, status:'announced', ai:false, source_id:'cwcap', conf:'VERIFY' },
    { name:'East Havering, London', lat:51.56, lon:0.21, operator:'TBC', mw:600, status:'announced', ai:false, source_id:'cwcap', conf:'VERIFY' },
    { name:'Humber Tech Park', lat:53.70, lon:-0.45, operator:'TBC', mw:384, status:'announced', ai:false, source_id:'cwcap', conf:'VERIFY' },
  ],
};
