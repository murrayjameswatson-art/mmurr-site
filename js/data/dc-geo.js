/* ----------------------------------------------------------------------------
   mmurr.ai — world-map country data (v2 §6): grid carbon intensity choropleth
   + the sourced capacity headline stats.

   The doc wanted a national-DC-capacity choropleth as an option, but no
   first-tier source publishes per-country capacity at choropleth granularity
   (IEA gives shares + a few countries; the rest is licensed analyst data) —
   so per the site's own honesty rule the choropleth is GRID CARBON INTENSITY
   only, and capacity is the sourced stat strip + the curated site markers.

   ci: kgCO2e/kWh, keyed by world-atlas numeric country id. UK/US/EU-core/FR
   agree with gridFactor() in factors.js (the shared accessor remains the
   single source for anything used in calculations — this table is DISPLAY
   ONLY for the map). Non-anchored entries are Ember Yearly Electricity Data
   2024 values — VERIFY before quoting individually.
---------------------------------------------------------------------------- */
window.MMURR_DC_GEO = {
  as_of: '2026-07',
  sources: {
    iea2025: { label:'IEA — Energy and AI (2025)', url:'https://www.iea.org/reports/energy-and-ai' },
    ember:   { label:'Ember — Yearly Electricity Data (2024)', url:'https://ember-energy.org/data/yearly-electricity-data/' },
  },
  // Sourced capacity headline (IEA Energy & AI, mid-2025 / 2024):
  capacity: {
    globalGw: 55, sharesPct: { US: 50, Europe: 18, China: 10 },
    twh2024: { US: 180, China: 102, 'DE+FR+UK+NL': 41, global: 415 },
    twh2030global: 945,
    source_id: 'iea2025',
  },
  // world-atlas numeric id → kgCO2e/kWh (display only; VERIFY except anchors)
  ci: {
    840: 0.36,  // US — anchors to gridFactor('US') (eGRID, SOURCED)
    826: 0.177, // UK — anchors to gridFactor('UK') (DESNZ, SOURCED)
    250: 0.05,  // France — anchors to gridFactor('FR') (RTE/EEA, SOURCED)
    276: 0.33,  // Germany
    372: 0.28,  // Ireland
    528: 0.27,  // Netherlands
    56:  0.12,  // Belgium
    246: 0.07,  // Finland
    752: 0.02,  // Sweden
    578: 0.02,  // Norway
    352: 0.03,  // Iceland
    724: 0.15,  // Spain
    380: 0.26,  // Italy
    616: 0.60,  // Poland
    208: 0.15,  // Denmark
    756: 0.03,  // Switzerland
    40:  0.09,  // Austria
    156: 0.56,  // China
    356: 0.71,  // India
    392: 0.45,  // Japan
    158: 0.50,  // Taiwan
    410: 0.42,  // South Korea
    36:  0.55,  // Australia
    124: 0.12,  // Canada
    76:  0.09,  // Brazil
    784: 0.43,  // UAE
    682: 0.55,  // Saudi Arabia
    484: 0.40,  // Mexico
    710: 0.70,  // South Africa
  },
};
