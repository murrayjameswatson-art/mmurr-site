/* ----------------------------------------------------------------------------
   mmurr.ai — location- vs market-based scope-2 gap (datacentres.html)

   Mt CO2e, scope 2 only, most recent reporting year. BOTH figures are the
   vendors' own, from their 2026 reports: location-based = grid-average
   emissions of the electricity used; market-based = after renewable
   certificates and PPAs. The delta is what the certificates and PPAs net off.
   The GHG Protocol permits both; the gap is the point, not an accusation.
   Every row resolves to a source id.
---------------------------------------------------------------------------- */
window.MMURR_SCOPE2 = {
  as_of: '2026-09',
  sources: {
    msft2026: {
      label: 'Microsoft, 2026 Environmental Data Fact Sheet (FY2025, year to 30 Jun 2025)',
      url: 'https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/microsoft/msc/documents/presentations/CSR/2026-Microsoft-Environmental-Data-Fact-Sheet-PDF.pdf',
    },
    goog2026: {
      label: 'Google, 2026 Environmental Report (calendar 2025), environmental metrics tables',
      url: 'https://sustainability.google/files/google-2026-environmental-report.pdf',
    },
  },
  rows: [
    { vendor: 'Microsoft (FY2025)', location: 12.03, market: 2.71, year: 'FY2025', source_id: 'msft2026' },
    { vendor: 'Google (2025)',      location: 15.15, market: 2.82, year: '2025',   source_id: 'goog2026' },
  ],
};
