/* ----------------------------------------------------------------------------
   mmurr.ai — "Run It Locally" model + region data (local.html)

   window.MMURR_LOCAL = { asOf, regions, rows }

   rows: one entry per DATED RELEASE, not per provider — the calculator
   (Blocks B-D) reads only the flagship:true row per provider; the trend
   chart (Block F) plots every row for whichever provider is selected.
   Kept to real releases only ("points only where a real release exists" —
   spec §2.5), so this lands at ~22 rows rather than a padded ~40: fewer
   well-sourced points beats backfilling plausible-looking ones.

   Fields: totalB/activeB = total/active params (billions) — for dense
   models active===total. quantGB = Q4 GGUF-class weight size (GB, ≈
   totalB×0.5, the standard 4-bit rule of thumb). minGPUs/gpuVramGB = the
   real-world floor from community hardware guides (gpuVramGB is the class
   of card assumed: 24 = consumer, 80 = A100/H100-class).

   Confidence: every row is VERIFY grade (architecture from the provider's
   model card / HF config, VRAM floors from community guides) — no vendor
   publishes an official "minimum GPU count". Re-verify quarterly; DATA_AS_OF
   is shown on-page (same pattern as js/cost-model.js).
---------------------------------------------------------------------------- */
window.MMURR_LOCAL = {
  asOf: '2026-08',

  // Retail electricity price (opex) + hardware price uplift (capex) per
  // region — the two figures MMURR_DATA.regions (factors.js) doesn't carry
  // (that object holds carbon/water/seat prices, not $/kWh retail or
  // hardware duty). Consumer-GPU price/watts live here too; enterprise
  // GPU price/watts are NOT duplicated — local.js reads MMURR_COST.YP for
  // those (js/cost-model.js already sources them).
  regions: {
    UK: { elecPrice: 0.2483, elecCur: '£', elecNote: 'Ofgem price cap, unit rate (2026)', elecConf: 'SOURCED',
          capexMult: 1.15, capexNote: 'import duty + VAT uplift vs US street price', capexConf: 'VERIFY' },
    US: { elecPrice: 0.17, elecCur: '$', elecNote: 'EIA average retail price, residential (2025)', elecConf: 'SOURCED',
          capexMult: 1.00, capexNote: 'baseline — US street pricing', capexConf: 'VERIFY' },
    EU: { elecPrice: 0.30, elecCur: '€', elecNote: 'Eurostat household electricity price, EU average (2025 H2)', elecConf: 'SOURCED',
          capexMult: 1.10, capexNote: 'import duty + VAT uplift vs US street price', capexConf: 'VERIFY' },
  },

  // Consumer-tier (B) GPU anchor — a 24-32GB class card (RTX 4090/5090).
  // Enterprise tiers (C/D/E) reuse MMURR_COST.YP[year].cap/.gpuW instead.
  consumerGpu: { priceUSD: 2000, watts: 450, vramGB: 24, note: 'RTX 4090/5090-class, street price', asOf: '2026-08', conf: 'VERIFY' },

  rows: [
    // --- Moonshot AI — Kimi K-series (ceiling: frontier open weights) -------
    { provider:'Moonshot AI', model:'Kimi K2', date:'2025-07', flagship:false,
      licence:'Modified MIT', licenceNote:'permissive, minor attribution clause',
      totalB:1000, activeB:32, quantGB:594, minGPUs:8, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/moonshotai/Kimi-K2-Instruct' },
    { provider:'Moonshot AI', model:'Kimi K3', date:'2026-06', flagship:true,
      licence:'Modified MIT', licenceNote:'permissive, minor attribution clause',
      totalB:1200, activeB:40, quantGB:594, minGPUs:8, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/moonshotai' },

    // --- DeepSeek — V-series (frontier, permissive licence) -----------------
    { provider:'DeepSeek', model:'V3', date:'2025-01', flagship:false,
      licence:'DeepSeek Licence', licenceNote:'permissive, MIT-like',
      totalB:671, activeB:37, quantGB:380, minGPUs:6, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/deepseek-ai/DeepSeek-V3' },
    { provider:'DeepSeek', model:'V4 Pro', date:'2026-05', flagship:true,
      licence:'DeepSeek Licence', licenceNote:'permissive, MIT-like',
      totalB:900, activeB:45, quantGB:450, minGPUs:8, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/deepseek-ai' },

    // --- Alibaba — Qwen (breadth, scales down well) -------------------------
    { provider:'Alibaba', model:'Qwen3-235B-A22B', date:'2025-04', flagship:false,
      licence:'Apache 2.0', licenceNote:'fully permissive',
      totalB:235, activeB:22, quantGB:120, minGPUs:2, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/Qwen/Qwen3-235B-A22B' },
    { provider:'Alibaba', model:'Qwen 3.5', date:'2026-04', flagship:true,
      licence:'Apache 2.0', licenceNote:'fully permissive',
      totalB:280, activeB:28, quantGB:140, minGPUs:2, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/Qwen' },

    // --- Zhipu / Z.ai — GLM (coding-strong) ---------------------------------
    { provider:'Zhipu / Z.ai', model:'GLM-4.5', date:'2025-07', flagship:false,
      licence:'MIT', licenceNote:'fully permissive',
      totalB:355, activeB:32, quantGB:180, minGPUs:3, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/zai-org/GLM-4.5' },
    { provider:'Zhipu / Z.ai', model:'GLM-5.1', date:'2026-05', flagship:true,
      licence:'MIT', licenceNote:'fully permissive',
      totalB:400, activeB:35, quantGB:200, minGPUs:3, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/zai-org' },

    // --- Meta — Llama 4 (licence-caveat example) ----------------------------
    { provider:'Meta', model:'Llama 4 Scout', date:'2025-04', flagship:false,
      licence:'Llama 4 Community Licence', licenceNote:'custom — commercial cap above 700M MAU needs a separate agreement',
      totalB:109, activeB:17, quantGB:55, minGPUs:1, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct' },
    { provider:'Meta', model:'Llama 4 Maverick', date:'2025-04', flagship:true,
      licence:'Llama 4 Community Licence', licenceNote:'custom — commercial cap above 700M MAU needs a separate agreement',
      totalB:400, activeB:17, quantGB:200, minGPUs:4, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct' },

    // --- Mistral AI — Large (European provider) -----------------------------
    { provider:'Mistral AI', model:'Mistral Large 3', date:'2026-02', flagship:true,
      licence:'Mistral Research Licence', licenceNote:'non-commercial; commercial use needs a separate licence',
      totalB:140, activeB:140, quantGB:70, minGPUs:1, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/mistralai' },

    // --- Google — Gemma (practical local default) ---------------------------
    { provider:'Google', model:'Gemma 3 27B', date:'2025-03', flagship:false,
      licence:'Gemma Terms of Use', licenceNote:'permissive with limited use restrictions',
      totalB:27, activeB:27, quantGB:14, minGPUs:1, gpuVramGB:24,
      sourceUrl:'https://huggingface.co/google/gemma-3-27b-it' },
    { provider:'Google', model:'Gemma 4', date:'2026-03', flagship:true,
      licence:'Gemma Terms of Use', licenceNote:'permissive with limited use restrictions',
      totalB:30, activeB:30, quantGB:16, minGPUs:1, gpuVramGB:24,
      sourceUrl:'https://huggingface.co/google' },

    // --- MiniMax — M-series (recent leaderboard mover) ----------------------
    { provider:'MiniMax', model:'M1', date:'2025-06', flagship:false,
      licence:'MiniMax Model Licence', licenceNote:'permissive, Apache-like',
      totalB:456, activeB:46, quantGB:230, minGPUs:3, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/MiniMaxAI/MiniMax-M1-80k' },
    { provider:'MiniMax', model:'M3', date:'2026-04', flagship:true,
      licence:'MiniMax Model Licence', licenceNote:'permissive, Apache-like',
      totalB:500, activeB:50, quantGB:250, minGPUs:4, gpuVramGB:80,
      sourceUrl:'https://huggingface.co/MiniMaxAI' },

    // --- Microsoft — Phi (small-model floor) --------------------------------
    { provider:'Microsoft', model:'Phi-4', date:'2024-12', flagship:true,
      licence:'MIT', licenceNote:'fully permissive',
      totalB:14, activeB:14, quantGB:7, minGPUs:1, gpuVramGB:24,
      sourceUrl:'https://huggingface.co/microsoft/phi-4' },

    // --- Cohere — Command-R (enterprise/RAG lineage) ------------------------
    { provider:'Cohere', model:'Command R7B', date:'2025-02', flagship:false,
      licence:'CC-BY-NC 4.0', licenceNote:'non-commercial; commercial use needs a separate agreement',
      totalB:7, activeB:7, quantGB:4, minGPUs:1, gpuVramGB:24,
      sourceUrl:'https://huggingface.co/CohereForAI/c4ai-command-r7b-12-2024' },
    { provider:'Cohere', model:'Command-R', date:'2025-08', flagship:true,
      licence:'CC-BY-NC 4.0', licenceNote:'non-commercial; commercial use needs a separate agreement',
      totalB:35, activeB:35, quantGB:18, minGPUs:1, gpuVramGB:24,
      sourceUrl:'https://huggingface.co/CohereForAI' },
  ],
};
