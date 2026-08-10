/* ----------------------------------------------------------------------------
   mmurr.ai — "Run It Locally" model + region data (local.html)

   window.MMURR_LOCAL = { asOf, regions, consumerGpu, rows }

   rows: one entry per provider — the current flagship open-weight release
   from each of the 10 providers covered on this page.

   Fields: totalB/activeB = total/active parameters, in billions — for a
   dense (non-MoE) model, active === total. quantGB = the storage and
   graphics-memory (VRAM) footprint at Q4 (4-bit) quantisation, in
   gigabytes — see the page's explanation of quantisation for what this
   means. minGPUs/gpuVramGB = the real-world minimum from community
   hardware guides (gpuVramGB is the class of card assumed: 24 = consumer,
   80 = data-centre-grade).

   Confidence: every row is VERIFY grade (architecture from the provider's
   model card / Hugging Face config, VRAM floors from community guides) —
   no vendor publishes an official minimum GPU count. Re-verify quarterly;
   asOf is shown on-page (same convention as js/cost-model.js).
---------------------------------------------------------------------------- */
window.MMURR_LOCAL = {
  asOf: '2026-08',

  // Retail electricity price (operating cost) + hardware price uplift
  // (capital cost) per region — the two figures MMURR_DATA.regions
  // (factors.js) does not carry (that object holds carbon/water/seat
  // prices, not retail electricity price or import duty on hardware).
  // Consumer-GPU price/wattage live here too; enterprise GPU price/wattage
  // are read from MMURR_COST.YP (js/cost-model.js) instead of being
  // sourced a second time.
  regions: {
    UK: { elecPrice: 0.2483, elecCur: '£', elecNote: 'Ofgem price cap, unit rate (2026)', elecConf: 'SOURCED',
          capexMult: 1.15, capexNote: 'import duty + VAT uplift vs US street price', capexConf: 'VERIFY' },
    US: { elecPrice: 0.17, elecCur: '$', elecNote: 'EIA average retail price, residential (2025)', elecConf: 'SOURCED',
          capexMult: 1.00, capexNote: 'baseline — US street pricing', capexConf: 'VERIFY' },
    EU: { elecPrice: 0.30, elecCur: '€', elecNote: 'Eurostat household electricity price, EU average (2025 H2)', elecConf: 'SOURCED',
          capexMult: 1.10, capexNote: 'import duty + VAT uplift vs US street price', capexConf: 'VERIFY' },
  },

  // Consumer-tier (Tier B) GPU anchor — a 24-32GB class card (NVIDIA
  // GeForce RTX 4090 or RTX 5090). Enterprise tiers (C/D/E) instead reuse
  // MMURR_COST.YP[year].cap/.gpuW (js/cost-model.js).
  consumerGpu: { priceUSD: 2000, watts: 450, vramGB: 24, note: 'NVIDIA GeForce RTX 4090/5090-class, street price', asOf: '2026-08', conf: 'VERIFY' },

  rows: [
    { provider:'Moonshot AI', model:'Kimi K3', date:'2026-06',
      licence:'Modified MIT', licenceNote:'permissive, minor attribution clause',
      totalB:1200, activeB:40, quantGB:594, minGPUs:8, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/moonshotai' },

    { provider:'DeepSeek', model:'V4 Pro', date:'2026-05',
      licence:'DeepSeek Licence', licenceNote:'permissive, MIT-like',
      totalB:900, activeB:45, quantGB:450, minGPUs:8, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/deepseek-ai' },

    { provider:'Alibaba', model:'Qwen 3.5', date:'2026-04',
      licence:'Apache 2.0', licenceNote:'fully permissive',
      totalB:280, activeB:28, quantGB:140, minGPUs:2, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/Qwen' },

    { provider:'Zhipu / Z.ai', model:'GLM-5.1', date:'2026-05',
      licence:'MIT', licenceNote:'fully permissive',
      totalB:400, activeB:35, quantGB:200, minGPUs:3, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/zai-org' },

    { provider:'Meta', model:'Llama 4 Maverick', date:'2025-04',
      licence:'Llama 4 Community Licence', licenceNote:'custom — commercial cap above 700M MAU needs a separate agreement',
      totalB:400, activeB:17, quantGB:200, minGPUs:4, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct' },

    { provider:'Mistral AI', model:'Mistral Large 3', date:'2026-02',
      licence:'Mistral Research Licence', licenceNote:'non-commercial; commercial use needs a separate licence',
      totalB:140, activeB:140, quantGB:70, minGPUs:1, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/mistralai' },

    { provider:'Google', model:'Gemma 4', date:'2026-03',
      licence:'Gemma Terms of Use', licenceNote:'permissive with limited use restrictions',
      totalB:30, activeB:30, quantGB:16, minGPUs:1, gpuVramGB:24,
      sourceUrl:'https://huggingface.co/google' },

    { provider:'MiniMax', model:'M3', date:'2026-04',
      licence:'MiniMax Model Licence', licenceNote:'permissive, Apache-like',
      totalB:500, activeB:50, quantGB:250, minGPUs:4, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/MiniMaxAI' },

    { provider:'Microsoft', model:'Phi-4', date:'2024-12',
      licence:'MIT', licenceNote:'fully permissive',
      totalB:14, activeB:14, quantGB:7, minGPUs:1, gpuVramGB:24,
      sourceUrl:'https://huggingface.co/microsoft/phi-4' },

    { provider:'Cohere', model:'Command-R', date:'2025-08',
      licence:'CC-BY-NC 4.0', licenceNote:'non-commercial; commercial use needs a separate agreement',
      totalB:35, activeB:35, quantGB:18, minGPUs:1, gpuVramGB:24,
      sourceUrl:'https://huggingface.co/CohereForAI' },
  ],
};
