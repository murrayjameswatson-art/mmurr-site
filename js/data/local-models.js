/* ----------------------------------------------------------------------------
   mmurr.ai — "Run It Locally" model + region data (local.html)

   window.MMURR_LOCAL = { asOf, regions, consumerGpu, dcGpu, rows }

   rows: one entry per provider — the current flagship open-weight release
   from each of the 10 providers covered on this page.

   Fields:
     totalB/activeB  total/active parameters, billions (dense: active === total).
                     SOURCED from each model's Hugging Face card or API
                     (safetensors total), checked 16 Nov 2026. GLM-5.1's active
                     count is derived from its config.json (8 of 256 routed
                     experts + 1 shared), as the card doesn't state it.
     quantGB         weight footprint at Q4 (4-bit) ≈ 0.5 GB per billion params.
     minGPUs         DERIVED by one rule: ceil(quantGB × 1.2 ÷ gpuVramGB) — the
                     1.2 leaves room for the KV cache and runtime. Fewer GPUs
                     with more memory each (e.g. H200, 141GB) would also work.
     gpuVramGB       card class assumed: 24 = consumer, 80 = data-centre.
     hosted          what the SAME model costs per 1M tokens from hosting
                     providers: median input/output price across the providers
                     in the LiteLLM registry that serve it (n = how many). The
                     weekly price refresh updates this (MMURR_API_PRICES.open);
                     the values here are the fallback anchors.

   Previous rows (Aug 2026) had several parameter counts that did not match the
   model cards (e.g. Kimi K3 1.2T vs 2.8T actual); all rows were re-checked.
---------------------------------------------------------------------------- */
window.MMURR_LOCAL = {
  asOf: '2026-11',

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
  // bandwidthGBs: RTX 4090 memory bandwidth, NVIDIA spec (1,008 GB/s). For one
  // user, generating a token means reading every active weight once, so
  // bandwidth ÷ active-weight size is the speed ceiling on this card.
  consumerGpu: { priceUSD: 2000, watts: 450, vramGB: 24, bandwidthGBs: 1008,
                 note: 'NVIDIA GeForce RTX 4090/5090-class, street price', asOf: '2026-08', conf: 'VERIFY' },

  rows: [
    { provider:'Moonshot AI', model:'Kimi K3', date:'2026-06',
      licence:'Kimi K3 licence', licenceNote:'custom licence — read the terms before commercial use',
      totalB:2780, activeB:104, quantGB:1390, minGPUs:21, gpuVramGB:80,
      hosted:{ in:3.00, out:15.00, n:19 },
      sourceUrl:'https://huggingface.co/moonshotai/Kimi-K3' },

    { provider:'DeepSeek', model:'V4 Pro', date:'2026-04',
      licence:'MIT', licenceNote:'fully permissive',
      totalB:1600, activeB:49, quantGB:800, minGPUs:12, gpuVramGB:80,
      hosted:{ in:1.69, out:3.48, n:21 },
      sourceUrl:'https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro' },

    { provider:'Alibaba', model:'Qwen3.5 397B', date:'2026-02',
      licence:'Apache 2.0', licenceNote:'fully permissive',
      totalB:403, activeB:17, quantGB:202, minGPUs:4, gpuVramGB:80,
      hosted:{ in:0.60, out:3.60, n:8 },
      sourceUrl:'https://huggingface.co/Qwen/Qwen3.5-397B-A17B' },

    { provider:'Zhipu / Z.ai', model:'GLM-5.1', date:'2026-04',
      licence:'MIT', licenceNote:'fully permissive',
      totalB:754, activeB:40, quantGB:377, minGPUs:6, gpuVramGB:80,
      hosted:{ in:1.40, out:4.40, n:13 },
      sourceUrl:'https://huggingface.co/zai-org/GLM-5.1' },

    { provider:'Meta', model:'Llama 4 Maverick', date:'2025-04',
      licence:'Llama 4 Community Licence', licenceNote:'custom — commercial cap above 700M MAU needs a separate agreement',
      totalB:402, activeB:17, quantGB:201, minGPUs:4, gpuVramGB:80,
      hosted:{ in:0.30, out:0.93, n:12 },
      sourceUrl:'https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct' },

    // Mistral Large 4 (v4.0), 5 Nov 2026: 1.05T total / 52B active MoE, open weights under
    // the Mistral Ecosystem Open Weight License v26.10 (Mistral docs, checked 16 Nov 2026).
    { provider:'Mistral AI', model:'Mistral Large 4', date:'2026-11',
      licence:'Mistral Ecosystem Open Weight License', licenceNote:'custom licence — read the terms before commercial use',
      totalB:1050, activeB:52, quantGB:525, minGPUs:8, gpuVramGB:80,
      hosted:{ in:0.70, out:2.10, n:2 },
      sourceUrl:'https://docs.mistral.ai/models/mistral-large-4-0' },

    { provider:'Google', model:'Gemma 4 31B', date:'2026-03',
      licence:'Apache 2.0', licenceNote:'fully permissive',
      totalB:31, activeB:31, quantGB:16, minGPUs:1, gpuVramGB:24,
      hosted:{ in:0.15, out:0.40, n:12 },
      sourceUrl:'https://huggingface.co/google/gemma-4-31B-it' },

    { provider:'MiniMax', model:'M3', date:'2026-06',
      licence:'MiniMax Community Licence', licenceNote:'custom licence — read the terms before commercial use',
      totalB:427, activeB:23, quantGB:214, minGPUs:4, gpuVramGB:80,
      hosted:{ in:0.30, out:1.20, n:19 },
      sourceUrl:'https://huggingface.co/MiniMaxAI/MiniMax-M3' },

    { provider:'Microsoft', model:'Phi-4', date:'2024-12',
      licence:'MIT', licenceNote:'fully permissive',
      totalB:15, activeB:15, quantGB:7, minGPUs:1, gpuVramGB:24,
      hosted:{ in:0.10, out:0.32, n:2 },
      sourceUrl:'https://huggingface.co/microsoft/phi-4' },

    // Command A+ (20 May 2026): Cohere's first fully permissive open model.
    { provider:'Cohere', model:'Command A+', date:'2026-05',
      licence:'Apache 2.0', licenceNote:'fully permissive',
      totalB:219, activeB:25, quantGB:109, minGPUs:2, gpuVramGB:80,
      hosted:{ in:1.65, out:6.60, n:2 },
      sourceUrl:'https://huggingface.co/CohereLabs/command-a-plus-05-2026-bf16' },
  ],
};
