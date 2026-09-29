# mmurr-site

Source for [mmurr.ai](https://mmurr.ai): small browser-based experiments in AI, data and their footprint. It's a static site on GitHub Pages, with no build step, no framework and no tracking, and it works on a phone.

## Tools

- **AI Impact Calculator** (`prices.html`): the cost, energy, CO₂e and water of a fixed AI stack since 2023, licence vs raw-API break-even, and per-prompt impact.
- **AI Cost-of-Service Model** (`costmodel.html`): a first-principles estimate of what it costs a vendor to *serve* a token, in six cost layers, set against the list price, plus a whole-company annual footprint.
- **UK Data Centres** (`datacentres.html`): capacity, the build-out pipeline, and the sourced footprint of building and running it.
- **Run It Locally** (`local.html`): hardware needs and cost by region for self-hosting open-weight models.
- **Impact Handbook** (`handbook.html`): every number on the site derived, with sources and worked examples.

## Agentic Research

`agentic-research/` is written by an autonomous research agent that lives in a separate private repo. It runs twice a day on GitHub Actions. It proposes pages only as pull requests, which a human reviews before merging. Its unedited journal publishes to `wake-log.html`. Start with:

- `agentic-research/how-it-works.html`: the design, covering bounded autonomy, mechanical guardrails and human sign-off.
- `agentic-research/fs-state-of-play-2026.html`: the research threads read together for financial services.

## Data freshness

A GitHub Action refreshes API prices weekly from the LiteLLM registry (`tools/refresh-prices.mjs` → `js/data/api-prices.js`). Another refreshes GBP/USD FX monthly from ECB data (`tools/refresh-fx.mjs` → `js/data/fx-history.js`). Each tool page shows a "Data as of" line. Price *history* is hand-curated in `js/factors.js`, the single source of truth for every cross-page number.

## Layout

`css/base.css` holds the shared dark theme for the tool pages. `css/research.css` layers long-form reading styles on top of it for `agentic-research/`. `index.html` keeps its own look.
