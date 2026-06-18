/* ---------------------------------------------------------------------------
   mmurr.ai — shared environmental bases (single source of truth)

   These constants are the cross-page reconciliation point: a kWh of AI/data
   work is costed the same way on every page that reports CO2 or water, so the
   dashboard, the price page and the data-centre page can never quietly disagree
   about what a kWh "means". Edit a value here and it changes everywhere.

   Loaded BEFORE each page's own script. Pages read these as their defaults; the
   user can still override any value in that page's own editable inputs.
--------------------------------------------------------------------------- */
window.MMURR_BASES = {
  grid:  0.177,   // kgCO2e/kWh — UK location-based grid intensity (DESNZ/Defra 2025)
  car:   0.17,    // kgCO2e/km  — UK average car, all fuels (Defra 2025)
  phone: 0.0082,  // kgCO2e     — one full smartphone charge (US EPA equivalencies)
  // Water (WUE) is page-specific by design and documented inline where used:
  //   dashboard  = 1.8 L/kWh (on-site cooling WUE)
  //   datacentres = 1.9 L/kWh (fleet-average WUE)
  // Both are editable; grid/car above are the figures that must match exactly.
};
