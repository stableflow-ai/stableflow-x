# StableFlow X

Cross-chain Bridge / Swap frontend (Vite + React). Users pick source and destination assets; **Rhea CrossChainDex** aggregates quotes and execution across routers (e.g. Near Intents, Rango) for near 1:1 transfers.

---

## Overview

| Item | Details |
| --- | --- |
| Stack | Vite 8 · React 19 · TypeScript · Tailwind 4 |
| State | Zustand · TanStack Query · ahooks |
| Quote & execution | Rhea HTTP API (`https://api.rhea.finance`) |
| Product API | StableFlow Backend (history, analytics, `/v1/trade/add`, etc.) |

Main flow:

```text
Quote → Select route → Swap (approve / tx) → Sign & broadcast → Report / Order Status
```

---

## Getting Started

```bash
# Requires Node.js and pnpm
pnpm install
pnpm dev          # http://localhost:5174
pnpm build        # typecheck + production build
pnpm preview      # preview the build output
pnpm lint
```

---

## Environment Variables

Create `.env.local` in the project root (do not commit secrets):

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_BASE_API_URL` | No | StableFlow API; default `https://api.stableflow.ai` |
| `VITE_RHEA_CCD_API_ACCESS_TOKEN` | **Yes** | Rhea CrossChainDex Bearer token |
| `VITE_RAINBOW_PROJECT_ID` | **Yes** | WalletConnect / RainbowKit project ID |
| `VITE_PRC_PROXY_HOST` | No | RPC proxy host; default `rpcs.stableflow.ai` |
| `VITE_RPC_SECRET_KEY` | Conditional | RPC proxy signing secret |
| `VITE_HELIUS_RPC_API_KEY` | Conditional | Solana RPC |
| `VITE_ALCHEMY_RPC_API_KEY` | Conditional | Alchemy RPC |
| `VITE_TON_RPC_API_KEY` | Conditional | TON RPC |
| `VITE_TRANSFER_MIN_AMOUNT` | No | Minimum transfer amount; default `0.0001` |
| `VITE_SENTRY_DSN` | No | Sentry DSN |
| `VITE_ZENDESK_KEY` | No | Zendesk widget key |

Rhea API base (configured in code): `https://api.rhea.finance` (`/api/swap/*`).

---

## Architecture

```text
src/
├── views/bridge/          # Bridge UI: tokens, quotes, Transfer, result
├── services/rhea/         # Rhea: quote / swap / execute / report / status / tokens
├── libs/wallets/          # Multi-chain wallets (EVM / Solana / NEAR / Tron / Aptos / TON / Sui / OKX)
├── config/                # chains, api, trade, abi
├── stores/                # bridge, wallet, history, trade-report, etc.
├── hooks/                 # balances, analytics, toast, etc.
└── components/ · layouts/
```

### Rhea integration

1. **`POST /api/swap/quote`** — Fetch `allQuotes` / `bestQuote`; normalize for UI (fees, `totalFeeUsd`, price impact, etc.).
2. **`POST /api/swap/swap`** — Build txs for the selected router; if `needsApprove && approve`, run `approve.tx` first, then the main `tx`.
3. **On-chain execution** — Sign and broadcast via `sendRheaTx` / chain-specific wallet helpers.
4. **`POST /api/swap/report`** + **`GET /api/swap/order-status`** — Report and poll order status.
5. **StableFlow `POST /v1/trade/add`** — Product trade record: `route` is always `rhea`; the concrete router goes in `sub_route` (e.g. `nearintents`, `rango`).

See `doc_local/CrossChainDexAPI.*.md` for the full Rhea HTTP guide when available.

---

## App Routes

| Path | Description |
| --- | --- |
| `/` | Bridge |
| `/history` | Transfer history / pending |
| `/about` | About |
| `/developer` · `/developer/documentation` | Developer docs |
| `/ecosystem` · `/apply` | Ecosystem & apply |
| `/privacy-policy` · `/terms-of-service` | Legal |

---

## Wallets

| Chain family | Integration |
| --- | --- |
| EVM | wagmi · viem · RainbowKit · ethers |
| Solana | `@solana/wallet-adapter-*` |
| NEAR | `@near-wallet-selector/*` · rhea-wallet-connect |
| Tron | `@tronweb3/tronwallet-adapters` · TronWeb |
| Aptos | `@aptos-labs/wallet-adapter-react` |
| TON | `@tonconnect/ui-react` |
| Sui | `@mysten/dapp-kit-react` |
| OKX | `@okxconnect/*` |

---

## Bridge UX Notes

- Changing amount, slippage, tokens, or recipient clears quotes and re-quotes (amount changes are debounced ~1s).
- The refresh button re-quotes immediately; the icon spins and is disabled while quoting.
- If swap returns `code: -2` or a message containing `re-quote`, the app re-quotes automatically. User rejection and other swap failures show a toast only (Transfer button text is not overwritten).
- On reject / re-quote / manual refresh, the app prefers the user’s last manually selected router; otherwise it selects the best quote.

---

## Scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Local development |
| `pnpm build` | `tsc -b` + `vite build` (increased Node heap) |
| `pnpm preview` | Preview `dist` |
| `pnpm lint` | ESLint |

---

## License

See [LICENSE](./LICENSE).
