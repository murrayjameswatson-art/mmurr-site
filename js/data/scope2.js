/* ----------------------------------------------------------------------------
   mmurr.ai — location- vs market-based scope-2 gap (v2 §5)

   Mt CO2e, 2024 reporting year. Location-based estimates from an academic
   analysis of the 2025 sustainability reports; market-based figures are the
   vendors' own reported numbers (REC/PPA-netted). The delta is certificates
   & PPAs — permitted by the GHG Protocol; the gap itself is the story, not
   an accusation. Every row resolves to a source id.
---------------------------------------------------------------------------- */
window.MMURR_SCOPE2 = {
  as_of: '2026-07',
  sources: {
    papaevangelou2026: {
      label: 'Papaevangelou & Vogiatzoglou (2026) — analysis of big-tech 2025 sustainability reports',
      url: 'https://policyreview.info/articles/news/big-techs-2025-sustainability-reports/2027',
    },
  },
  rows: [
    { vendor: 'Microsoft', location: 25.2, market: 15.5, year: 2024, source_id: 'papaevangelou2026' },
    { vendor: 'Google',    location: 23.4, market: 15.2, year: 2024, source_id: 'papaevangelou2026' },
  ],
};
