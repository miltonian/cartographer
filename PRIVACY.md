# Privacy Policy

**Last updated: March 29, 2026**

## What Cartographer Does

Cartographer is a local-only code understanding tool. It runs entirely on your machine.

## Data Collection

Cartographer collects **no data**. Specifically:

- **No telemetry.** No usage data is sent anywhere.
- **No analytics.** No tracking pixels, no event logging, no crash reporting.
- **No network requests.** The service runs on localhost. It does not contact any external servers.
- **No data leaves your machine.** The world-model, evidence, and source anchors are stored locally in your project directory at `.cartographer/model.json`.

## How It Works

- The **local service** runs on your machine and stores data in your project directory.
- The **browser UI** connects to the local service on localhost. It is not hosted externally.
- The **Claude Code plugin** communicates with the local service via MCP (stdio). All communication is local.

## Third-Party Services

Cartographer itself makes zero network requests. However:

- **Claude Code** (the AI agent that uses Cartographer's tools) communicates with Anthropic's API as part of its normal operation. That communication is governed by [Anthropic's privacy policy](https://www.anthropic.com/privacy).
- Cartographer does not add to, modify, or intercept Claude Code's communication with Anthropic.

## Source Code

Cartographer is open source under the MIT License. You can audit the complete source code at [github.com/miltonian/cartographer](https://github.com/miltonian/cartographer).

## Contact

For questions about this policy, open an issue at [github.com/miltonian/cartographer/issues](https://github.com/miltonian/cartographer/issues).
