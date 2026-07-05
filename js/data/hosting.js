/* ----------------------------------------------------------------------------
   mmurr.ai — hosting-location ("served from") carbon data (v2 §4)

   Per-vendor fleet carbon intensity, kgCO2e/kWh, LOCATION-BASED — the grid
   where the prompt is actually served, not where the user sits. The honest
   limit: no vendor discloses which region served your prompt, and none
   publishes a clean location-based fleet average (Google discloses CFE %,
   market-based figures), so per-vendor values are graded:
     'sourced'   — a first-party, location-based figure exists
     'inferred'  — estimated from the vendor's disclosed siting mix
     'assumption'— falls back to the labelled US/EU-weighted default
   Every entry carries as_of (when the basis was last checked). Shown in the
   calculator's sources panel. Country selections bypass this file entirely
   and use gridFactor() from js/factors.js.
---------------------------------------------------------------------------- */
window.MMURR_HOSTING = {
  as_of: '2026-07',
  // Fallback for vendors with no usable disclosure: 70% US (0.36 eGRID) +
  // 30% EU (0.19 EEA) ≈ 0.31 — an ASSUMPTION, stated on-page wherever used.
  fallback: { ci: 0.31, note: 'US/EU-weighted assumption (70/30)', confidence: 'assumption' },
  vendors: {
    Microsoft: { fleet_ci: 0.33, regions: ['US','EU','UK'], as_of: '2026-07', confidence: 'inferred',
                 note: 'Azure fleet, US-weighted; Microsoft discloses CFE-matched market-based figures only' },
    OpenAI:    { fleet_ci: 0.33, regions: ['US','EU','UK'], as_of: '2026-07', confidence: 'inferred',
                 note: 'Serves from Microsoft Azure — same siting basis as Microsoft' },
    Google:    { fleet_ci: 0.30, regions: ['US','EU','UK','Asia'], as_of: '2026-07', confidence: 'inferred',
                 note: 'Google discloses CFE % (66% hourly, 2024) and market-based CI, not a location-based fleet average; inferred from siting mix' },
    Anthropic: { fleet_ci: 0.31, regions: ['US','EU','UK'], as_of: '2026-07', confidence: 'inferred',
                 note: 'AWS + GCP mix (London inference since late 2025); no first-party disclosure' },
    xAI:       { fleet_ci: 0.55, regions: ['US'], as_of: '2026-07', confidence: 'inferred', flag: 'gas-heavy',
                 note: 'Memphis campus on gas-heavy interim power — flagged; plausibly higher' },
    Mistral:   { fleet_ci: 0.05, regions: ['FR','EU'], as_of: '2026-07', confidence: 'sourced',
                 note: 'Primarily French data centres — nuclear-heavy grid ≈0.05 (RTE/EEA)' },
    Snowflake: { fleet_ci: null, regions: ['US','EU','UK'], as_of: '2026-07', confidence: 'assumption',
                 note: 'Multi-cloud, workload-dependent; uses the US/EU-weighted assumption' },
  },
  ciFor(provider){
    const v = this.vendors[provider];
    return (v && v.fleet_ci != null) ? v.fleet_ci : this.fallback.ci;
  },
  gradeFor(provider){
    const v = this.vendors[provider];
    return (v && v.fleet_ci != null) ? v.confidence : this.fallback.confidence;
  },
};
