# Solana AI Wallet

**Describe a Solana transfer in plain English. The app verifies it against the chain. You sign it yourself.**

Built for the MLH Solana Hackathon — **AI Track**. Devnet only.

[Problem](#the-problem) · [Solution](#the-solution) · [Features](#features) · [Stack](#technology-stack) · [Architecture](#system-architecture) · [AI](#ai-integration) · [Solana](#solana-integration) · [Install](#local-installation) · [Env](#environment-variables) · [Testing](#devnet-testing) · [Status](#project-status-what-works-and-what-does-not)

---

## Overview

Solana AI Wallet turns a sentence into a verified Solana transaction.

> *"Send 0.1 SOL to 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"*

A language model reads that sentence and proposes a structured intent. It is not trusted with
anything else. The application independently re-validates the address, converts the amount to
exact integer lamports, prices the real transaction against the network, checks it against a
freshly read balance, and confirms the cluster's identity — and only then shows you a confirm
button. Your own wallet signs. The app never holds a key.

**A real transfer made by this app, finalized on Devnet:**

[`4HhuHyW56oedRxRd26vsT26wr6QykbF9tGNoLKpgQUqxpdzgQ9hUDwqXAZG1XXHbWUHLzv6tdRdCBX4ovJNdrEsT`](https://explorer.solana.com/tx/4HhuHyW56oedRxRd26vsT26wr6QykbF9tGNoLKpgQUqxpdzgQ9hUDwqXAZG1XXHbWUHLzv6tdRdCBX4ovJNdrEsT?cluster=devnet)

```
type        : system transfer        lamports : 10000000  (0.01 SOL)
fee         : 5000 lamports          err      : null
status      : finalized
```

The sender's balance fell by exactly 10,005,000 lamports — the amount plus the fee, matching the
preview to the lamport.

---

## The problem

Sending cryptocurrency asks a beginner to hold several unfamiliar ideas at once:

- A 44-character base58 address, where a single wrong character sends funds somewhere unrecoverable.
- Denominations — is `0.1` SOL, or lamports, and how many lamports are in a SOL?
- A network fee that must be left behind, or the transaction fails.
- Which network they are on, where a mistake can mean real money.

Existing wallets expose all of this as form fields and assume the user already understands them.
The result is that people either avoid sending entirely, or make expensive, irreversible mistakes.

AI chat wallets are an obvious answer, and a dangerous one. A language model that can move money
is a model whose hallucination is a financial loss. The hard part is not parsing the sentence —
it is making the parse *safe to act on*.

## The solution

Keep the natural-language interface. Make the AI structurally incapable of causing harm.

The AI's only output is a JSON object describing what it *thinks* the user meant. It cannot read
the chain, cannot sign, cannot submit, and cannot approve. Every consequential fact — the balance,
the fee, the address validity, the network — is established by the application against Solana
itself, and every transfer requires an explicit human click followed by a wallet signature.

If the model is wrong, the user sees a clear refusal instead of a wrong transaction.

---

## Features

**Wallet connection** — Wallet Standard discovery, so Phantom and any compliant wallet work.
Connect, disconnect, live address, and clear handling of a missing extension, a locked wallet, a
declined connection and RPC failure.

**Conversational assistant** — Prepare SOL transfers, report balances, and answer "how much can I
safely send?". Asks for missing details rather than guessing, and refuses what it cannot do.

**Reading the chain, not just spending from it** — Three further capabilities, all read-only and
all rendered from chain data rather than the model's recollection:

- *Explain a transaction.* Paste a signature and the app decodes it — amount, sender, recipient,
  fee, slot, timestamp and programs involved — and the assistant describes it in plain English.
  This works with no wallet connected.
- *Recent activity.* "Show me my recent transactions" reads the wallet's real history from
  `getSignaturesForAddress`, with the net lamport change for each.
- *Inspect an address.* Balance, whether an account exists, its owning program, whether it is
  executable, and how many recent transactions it has.

**Structured interpretation** — `POST /api/interpret` returns a strict, Zod-validated shape.
Amounts are decimal *strings*, never floating-point numbers.

**Independent transaction validation** — Nine checks run before a confirm button appears, none of
which consult the AI.

**Pre-signature simulation** — The transaction is run against the network *unsigned* before you
are asked to approve it, and the preview shows the balance changes the chain itself reported. A
recognised failure blocks the transfer outright.

**Full instruction disclosure** — The preview lists every instruction in the transaction
(`System Program — Transfer 10000000 lamports`), so "what am I actually signing?" is answered
literally rather than summarised.

**First-use warning** — An address with no balance and no transaction history is flagged before
you send to it, since a mistyped address is the most expensive mistake available here.

**Explicit approval** — A preview showing recipient, amount in SOL and lamports, the
network-priced fee, the network, and the total. Nothing reaches the wallet until it is approved.

**Honest results** — A transfer is reported confirmed only after the network confirms its
signature, with a link to Solana Explorer. Declined and failed transfers are reported as such.

**Verified network indicator** — The badge reflects an actual `getGenesisHash` call, not a config
constant.

**Graceful degradation** — With no AI key the app falls back to a deterministic parser and says so
in the interface, rather than going silent mid-demo.

---

## Technology stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Validation | Zod 4 |
| Solana | `@solana/kit` 8, `@solana/kit-plugin-rpc`, `@solana/kit-plugin-wallet`, `@solana/react`, `@solana-program/system` |
| Wallet | Wallet Standard (Phantom and any compliant wallet) |
| AI | OpenAI or Anthropic via structured JSON output, with a deterministic local fallback |
| Network | Solana Devnet |
| Deployment | Vercel |

---

## System architecture

```
Browser                          Next.js server              External
───────────────────────────────  ─────────────────────────   ──────────────────
ChatInterface
   │  message + chain-read facts
   └──────────────────────────▶  POST /api/interpret
                                    │ Zod: validate request
                                    │ build prompt
                                    ├────────────────────────▶ OpenAI / Anthropic
                                    │ Zod: validate reply  ◀───┘
                                    │ hardenIntent()
   ◀──────────────────────────────  │ validated intent
   │
   ▼
validateTransfer()   ◀── balance, fee ──────────────────────▶ Solana Devnet RPC
   │                                                           getBalance
   │ pass                                                      getGenesisHash
   ▼                                                           getFeeForMessage
TransactionPreview  ──▶ [ user clicks approve ]
   │
   ▼
buildTransferInstruction() ──▶ wallet signs ────────────────▶ Phantom
   │                                                           │
   └──────────────── submit + confirm ───────────────────────▶ Devnet
                                                               │
TransactionResult ◀──────────── signature ─────────────────────┘
```

**The boundary that matters:** everything above `validateTransfer()` is a suggestion. Everything
below it is checked fact. The AI lives entirely above the line.

### Project layout

```
app/
  api/interpret/route.ts   AI endpoint — the only place an API key is read
  layout.tsx               Shell, fonts, metadata
  page.tsx                 Renders the dashboard
  providers.tsx            Publishes the Kit client; useAppClient()
  globals.css              Design tokens and shared component classes
components/
  Dashboard.tsx            Orchestration: the whole message → signature flow
  ChatInterface.tsx        Conversation and input
  ChatMessage.tsx          AI prose and chain facts, kept visually distinct
  TransactionPreview.tsx   The approval step
  TransactionResult.tsx    Confirmed, failed, or declined
  TransactionHistory.tsx   Transfers made in this session
  WalletConnect.tsx        Wallet Standard discovery and connection
  WalletBalance.tsx        Chain-read balance
  NetworkBadge.tsx         Cluster indicator, Verified / AI tags
  Sidebar.tsx              Navigation
  icons.tsx                Inline icons
lib/
  constants.ts             Network identity, fees, limits, Explorer URLs
  amounts.ts               Exact decimal ↔ lamport conversion
  validation.ts            Zod schemas and every money-protecting rule
  solana.ts                Client, cluster check, balance, fee, instruction
  ai.ts                    Providers, prompt, fallback parser, hardening
types/
  transaction.ts, chat.ts  Shared types
scripts/
  devnet-smoke-test.mjs    Live Devnet test of the transaction path
```

---

## AI integration

### What the AI does

One job: turn one English sentence into one structured intent.

```jsonc
// POST /api/interpret   { "message": "Send 0.1 SOL to 9WzD..." }
{
  "status": "ready",                 // ready | needs_clarification | unsupported
  "action": "transfer_sol",          // transfer_sol | check_balance | max_sendable | unsupported
  "amountSol": "0.1",                // decimal STRING, never a float
  "recipient": "9WzDXwBbmkg8ZT...",
  "explanation": "You are sending 0.1 SOL to this address.",
  "clarificationQuestion": null,
  "warnings": [],
  "requiresConfirmation": true,
  "engine": "openai"                 // so the UI can label its own provenance
}
```

The model is asked for this shape through OpenAI's `json_schema` structured output, or
Anthropic's forced tool call — both guarantee well-formed JSON, neither guarantees *correct*
JSON, which is why the next layer exists.

### What stops the AI being dangerous

**1. A strict schema.** `AiIntentSchema` is `.strict()` — an unexpected key is a validation
failure, not an ignored field. A model cannot smuggle in a property the UI might later read.
A numeric `amountSol` is rejected outright, preserving the decimal-string contract.

**2. Hardening.** `hardenIntent()` takes a schema-valid intent and strips its authority:

- `requiresConfirmation` is **set by the server**, never read from the model.
- A transfer whose address fails Solana's address rules, or whose amount will not parse, is
  demoted to `needs_clarification` and never reaches a preview.
- `amountSol` and `recipient` are cleared for every non-transfer action.
- The model's own wording is discarded when it contradicts the outcome, so the user is never
  shown "you are sending 0.1 SOL" above a question about a missing address.

**3. Re-validation in the browser.** Even a hardened intent is re-checked by `validateTransfer()`
against a freshly fetched balance before the preview renders.

**4. Facts are supplied, never recalled.** The model is given the real balance and fee read from
chain, and instructed to quote only those figures. Balances shown in chat are rendered by the
application from its own RPC data, in a visually distinct "Read from Solana Devnet" block, beside
an "AI explanation" tag on the prose. The user can always tell which is which.

**5. A deliberate refusal.** The wallet has no price oracle, so *"what is 1 SOL worth in dollars?"*
returns `unsupported` rather than a plausible invented number.

### The fallback parser

With no API key configured, a deterministic rule-based parser in `lib/ai.ts` handles the same
contract. It understands far less, but it cannot hallucinate, and the interface labels the engine
as **"local parser"** so nobody is misled about whether a model was involved. The same fallback
catches a provider outage mid-demo.

---

## Solana integration

### Client

```ts
createClient()
  .use(walletSigner({ chain: 'solana:devnet' }))   // installs client.payer
  .use(solanaDevnetRpc({ rpcUrl: RPC_URL }));      // requires a payer
```

Plugin order matters: the RPC plugin requires `ClientWithPayer`, which `walletSigner` provides.

### Devnet is enforced in three independent places

1. The wallet plugin advertises only `solana:devnet`, so a mainnet-only account cannot connect.
2. The devnet RPC plugin.
3. `verifyDevnet()` calls `getGenesisHash` and compares it with Devnet's
   `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`. A mismatch disables transfers entirely — this
   catches a misconfigured `NEXT_PUBLIC_SOLANA_RPC_URL` pointing at mainnet, which no amount of
   client configuration would.

### Exact money arithmetic

Every amount is parsed from a decimal string directly to `BigInt` lamports. No value passes
through a JavaScript `number` at any point, so `0.1 + 0.2` is exactly `0.3` here. Amounts with
more than nine decimal places are rejected rather than rounded.

### Validation checklist

`validateTransfer()` runs all of these and reports every failure at once:

| # | Check |
| --- | --- |
| 1 | The cluster has been verified as Devnet |
| 2 | The recipient passes Solana's address rules (base58, 32 bytes) |
| 3 | The amount parses to exact lamports |
| 4 | The amount is greater than zero |
| 5 | Decimal precision is within nine places |
| 6 | The amount is under the MVP's 100 SOL ceiling |
| 7 | Amount + fee does not exceed the balance |
| 8 | Enough is left behind for the fee, plus a safety buffer |
| 9 | Warnings for a self-transfer, an unfunded recipient, or near-total spend |

### Fee estimation

The transaction is planned, then priced with `getFeeForMessage` against the real compiled message
— not a hardcoded constant. A planned message carries no blockhash (the executor adds one at send
time) and `getFeeForMessage` returns `null` without one, so the estimator attaches a current
blockhash purely for pricing. If pricing fails, it falls back to the 5,000-lamport base fee and
the preview says so rather than presenting an estimate as a quote.

### Simulation before signing

Before the preview renders, the transaction is run against the network with `simulateTransaction`
using `sigVerify: false` — the user has approved nothing yet, so there is no signature to verify.
The response gives the post-execution lamport balances of both accounts, which become the
"what will actually change" figures in the preview. This is the strongest check in the app,
because it is the chain's own answer rather than ours.

A failure the app recognises (insufficient funds, rent-exemption, a missing account) blocks the
transfer entirely. A failure it does *not* recognise is reported as **inconclusive** and warned
about rather than blocked — refusing a valid transfer because of an unfamiliar simulation quirk
would be the worse failure. The next section describes exactly such a quirk.

### A caveat on simulation fidelity

The transaction planner produces **version 1** messages, and the Devnet RPC cannot simulate them:
it answers `MaxLoadedAccountsDataSizeExceeded` for every one, including transactions that then
succeed on chain. This was confirmed by simulating the identical message at both versions — v1
always fails, v0 returns `err: null` with correct balances.

So the app simulates a **version 0 copy** of the message. For a SOL transfer this is a faithful
stand-in: the instructions, fee payer, accounts and amount are identical, and the two versions
differ only in address-lookup-table support, which this transaction does not use. The transaction
actually signed and sent is still the planner's v1 message.

This is recorded rather than hidden: the simulation is of an equivalent transaction, not of the
exact bytes being signed.

### Signing and submission

The transfer instruction is rebuilt at approval time from the validated values that were
displayed, so the signed transaction cannot drift from the preview. `client.payer` is the wallet's
signer — it can only produce a signature by prompting the user. A `useRef` guard plus a disabled
button prevents double submission. Success is reported only after the network confirms.

---

## Local installation

Requires **Node 20+** (developed on Node 24) and a Chromium browser with
[Phantom](https://phantom.app/download) installed.

```bash
git clone <your-repo-url> && cd solana-ai-wallet
```

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

Open <http://localhost:3000>.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run smoke-test` | Live Devnet test of the transaction path |

### Deploying to Vercel

1. Push to GitHub.
2. Import the repository at <https://vercel.com/new> — Next.js is detected automatically.
3. Add your environment variables under **Settings → Environment Variables**. Add
   `OPENAI_API_KEY` as a plain variable — **never** with a `NEXT_PUBLIC_` prefix.
4. Deploy.

For a live demo, set `NEXT_PUBLIC_SOLANA_RPC_URL` to a dedicated Devnet endpoint (Helius and
QuickNode have free tiers). The public endpoint rate-limits under load.

---

## Environment variables

**All are optional** — the app runs with an empty `.env.local`.

| Variable | Scope | Default | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Server | — | Interpret messages with OpenAI |
| `ANTHROPIC_API_KEY` | Server | — | Interpret with Anthropic (ignored if the OpenAI key is set) |
| `OPENAI_BASE_URL` | Server | OpenAI | Any OpenAI-compatible endpoint, e.g. `https://openrouter.ai/api/v1` |
| `OPENAI_MODEL` | Server | `gpt-4o-mini` | Model override |
| `ANTHROPIC_MODEL` | Server | `claude-haiku-5-5` | Model override |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Public | `https://api.devnet.solana.com` | Devnet RPC endpoint |

With no AI key set, the app uses the deterministic fallback parser and labels the engine
accordingly in the interface.

**Any OpenAI-compatible provider works.** Point `OPENAI_BASE_URL` at it and put its key in
`OPENAI_API_KEY` — OpenRouter (`https://openrouter.ai/api/v1`) has free models and needs no card.
The interface names the provider it actually reached, so the badge reads `openrouter` rather than
`openai`. Strict `json_schema` output is an OpenAI feature; other providers are sent plain JSON
mode with the shape described in the prompt, and the reply is validated by Zod either way — a
model that returns the wrong shape is rejected and the built-in parser answers instead.

### Secret handling

- API keys are read **only** inside `app/api/interpret/route.ts`, which runs on the Node runtime.
- `lib/ai.ts` imports `server-only`, so importing it from a client component is a **build error**,
  not a silent leak.
- `GET /api/interpret` returns the engine *name* only, never any part of a key.
- `.env`, `.env.local` and `.env*.local` are gitignored; only `.env.example`, with empty values,
  is committed.
- The compiled client bundle has been checked and contains no key material. The only inlined
  public variable is `NEXT_PUBLIC_SOLANA_RPC_URL`.
- The app never asks for, stores, or has any code path that accepts a seed phrase or private key.
- Security headers are set in `next.config.ts`: a Content-Security-Policy restricting scripts,
  styles, fonts and RPC origins; `X-Frame-Options: DENY` against a clickjacked approve button;
  plus nosniff, a referrer policy, HSTS and a permissions policy.

---

## Devnet testing

### Get Devnet SOL

Solana has **closed the `requestAirdrop` RPC method on Devnet** — the public endpoint answers it
with `410: The RPC faucet is closed on this cluster`. Use <https://faucet.solana.com> instead
(2 requests per 8 hours; connecting GitHub raises the limit). The balance card links there when
your balance is zero.

### Automated checks

```bash
npm run typecheck && npm run build
```

```bash
npm run smoke-test
```

The smoke test runs against live Devnet using the same plugin chain and the same calls as the app,
with a throwaway keypair in place of the wallet: cluster check, balance read, instruction
construction, transaction planning, and real fee pricing. To include a real submission, fund an
address at the faucet and re-run with `PAYER_SECRET_KEY=<base58 secret> npm run smoke-test`.

### Manual end-to-end test

1. Set Phantom to Devnet: **Settings → Developer Settings → Testnet Mode**.
2. Fund your wallet at <https://faucet.solana.com>.
3. In Phantom, **Add Account** to create a second address to send to.
4. Open the app and click **Connect Wallet**.
5. Confirm the balance card matches Phantom exactly.
6. Send `Send 0.01 SOL to <your second address>`.
7. Review the preview, click **Approve and sign**, confirm in Phantom.
8. Open the Explorer link and confirm the transaction is real.

**Error cases worth testing:** an invalid address, an amount above your balance, an amount with
ten decimal places, a token transfer request, a price question, and declining the signature in
Phantom. Each should be refused with a specific, accurate reason.

---

## Project status: what works and what does not

Stated precisely, because a wallet that overstates itself is the problem this project exists to
solve.

### Verified

**On live Devnet** — cluster identity by genesis hash; `getBalance`, cross-checked against an
independent RPC query; transfer instruction construction; transaction planning; real fee pricing
via `getFeeForMessage`; **and a complete end-to-end transfer with Phantom, finalized on chain**
(signature above), whose on-chain balance deltas match the preview to the lamport.

**In the browser** — wallet discovery, connect and disconnect; real balance display; the full
preview; the declined-signature path; insufficient-balance refusal with exact figures; invalid
address, price question and token-request refusals; responsive layout at 375px; no console errors.

**Pre-signature simulation** — verified against live Devnet: the unsigned transaction returns
`err: null`, 150 compute units, and balance deltas of exactly `-10,005,000` for the sender and
`+10,000,000` for the recipient, matching the preview. Instruction disclosure and the
first-use recipient warning were both confirmed rendering in the browser.

**By unit test** — 47 assertions over the validation and amount modules: the model's JSON is
rejected unless it matches exactly (extra keys, numeric `amountSol`, unknown actions, missing
explanation); exact lamport arithmetic including `0.1 + 0.2 === 0.3`; rejection of scientific
notation, thousands separators, negatives, zero and ten-decimal amounts; and the spend boundary,
where exactly the maximum sendable amount is allowed and one lamport more is blocked.

**Signing authority** — during browser testing, a mock Wallet Standard wallet counted every call
to its signing feature. The count was `0` through interpretation and preview, and became exactly
`1` the moment the approve button was pressed. The AI never receives an opportunity to sign.

### Not implemented — by design, for this MVP

- **Native SOL transfers only.** No SPL tokens, NFTs, swaps or staking. These are refused
  explicitly, not silently ignored.
- **Devnet only.** Mainnet is unreachable from this build.
- **No price data.** Fiat conversion questions are refused rather than guessed.

### Known limitations

- **Two history views, with different lifetimes.** The session list holds transfers made in this
  browser session and clears on reload; the on-chain list is read live from the chain when asked
  for, and is limited to the five most recent entries to stay within the public RPC's rate limit.
  An entry whose detail could not be fetched shows its signature and status with the balance
  change left blank rather than guessed.
- **The rate limit on `/api/interpret` is in-memory**, so on a serverless platform each instance
  keeps its own counter. It discourages casual abuse; it is not a robust limiter.
- **Multi-instruction and multi-signature transactions are untested.** The fee estimator assumes
  the single-signature case that a SOL transfer produces.
- **No automated browser test suite.** Browser verification was performed manually and with a
  mock wallet; there is no Playwright or Cypress suite in the repository.
- **The public Devnet RPC rate-limits** under repeated use. Configure a dedicated endpoint for a
  live demo.
- **Simulation runs against a version 0 copy** of the planned version 1 message, for the RPC
  reason described above. Equivalent for a SOL transfer, but not byte-identical.
- **The Content-Security-Policy still allows `'unsafe-inline'` and `'unsafe-eval'` in
  `script-src`**, because Next.js inlines its hydration bootstrap. Removing them needs
  per-request nonces, which is worthwhile hardening beyond this MVP.

### Nothing in this application is simulated

There are no mock balances, no placeholder transactions and no sample history rows. When the app
cannot read a balance it shows a dash and an error, not a plausible number. When a transfer is
declined or fails it says so. "Confirmed" appears only after the network confirms the signature.

---

## License

MIT
