# mmurr-site

Source for [mmurr.ai](https://mmurr.ai) — small browser-based experiments in AI, data and their footprint. Static site on GitHub Pages; no build step, no tracking.

- **AI Impact Calculator** (`prices.html`) — cost, energy, CO₂e & water of a fixed AI stack over time, licence vs raw-API break-even, per-prompt impact readouts.
- **UK Data Centres** (`datacentres.html`) — capacity, build-out pipeline and the sourced footprint of building and running it.
- **Impact Handbook** (`handbook.html`) — every number on the site, derived, with sources.

Current API prices refresh weekly and GBP/USD FX monthly via GitHub Actions (`tools/`).
