# Submission checklist — MLH Solana Hackathon, AI Track

Work top to bottom. Everything marked **YOU** needs your accounts or your face and cannot be done
for you.

---

## 1. Public GitHub repository

- [ ] **YOU** — Create a **public** repository on GitHub.
- [ ] **YOU** — Push this project to it:

```bash
git remote add origin https://github.com/<your-username>/solana-ai-wallet.git
```

```bash
git branch -M main && git push -u origin main
```

- [x] Repository initialised, `.gitignore` in place, first commit made locally.
- [x] Secret scan passed — see section 5.
- [ ] After pushing, open the repo **in a logged-out browser window** and confirm it loads. A repo
      left private is the single most common reason a hackathon entry is disqualified.
- [ ] Confirm `.env.local` is **not** visible in the file list on GitHub.

## 2. Live deployment URL

- [ ] **YOU** — Import the repo at <https://vercel.com/new>. Next.js is auto-detected; no build
      configuration is needed.
- [ ] **YOU** — Add environment variables under **Settings → Environment Variables**:
  - `OPENAI_API_KEY` — as a **plain** variable. Never prefix it with `NEXT_PUBLIC_`.
  - `NEXT_PUBLIC_SOLANA_RPC_URL` — strongly recommended. A dedicated Devnet endpoint (Helius or
    QuickNode free tier) avoids the public RPC rate-limiting during judging.
- [ ] Deploy, then **open the live URL and run one real transfer on it**. A deployment that builds
      is not the same as a deployment that works — environment variables behave differently on
      Vercel than locally.
- [ ] Confirm the engine badge on the live site reads **openai**, not "local parser". If it reads
      "local parser", the key did not reach the deployment.
- [ ] Live URL: `________________________________`

## 3. Public demo video URL

- [ ] **YOU** — Record it. See [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for the full shot-by-shot script.
- [ ] Under **2 minutes**. The script targets 1:55.
- [ ] Shows a **real Devnet transaction** and the Solana Explorer page.
- [ ] Uploaded to YouTube or Loom, set to **public or unlisted** — not private.
- [ ] **Open the link in a private browsing window to confirm it plays.** A video left private is
      the second most common disqualification.
- [ ] Video URL: `________________________________`

## 4. Project description

- [x] Written — see [section 8](#8-project-description-copy-this) below. Short and long versions.
- [ ] **YOU** — Paste into the MLH submission form.

## 5. Secret scan

Run before every push:

```bash
git ls-files | xargs grep -lEI "sk-[A-Za-z0-9_-]{20,}|sk-ant-|-----BEGIN [A-Z ]*PRIVATE KEY" 2>/dev/null
```

Silence means clean.

Scan results at time of writing:

- [x] No API keys, tokens or secret-shaped strings in any committed file.
- [x] No private keys, keypair files or seed phrases anywhere in the repository.
- [x] `.env`, `.env.local` and `.env*.local` are gitignored.
- [x] Only `.env.example` is committed, and its key fields are empty.
- [x] The compiled client bundle contains no key material. The only inlined public variable is
      `NEXT_PUBLIC_SOLANA_RPC_URL`.
- [x] `lib/ai.ts` imports `server-only`, so importing it from a client component fails the build
      rather than leaking a key.
- [x] The application has no code path that accepts a seed phrase or private key.

- [ ] **YOU** — If you ever pasted a real key into a file while testing, check your git history,
      not just the working tree: `git log -p | grep -i "sk-"`. A key committed once stays in the
      history even after you delete it, and must be rotated rather than removed.

## 6. AI Track selection

- [ ] **YOU** — Select **AI Track** on the MLH submission form.
- [ ] **YOU** — If asked which AI provider you used, state OpenAI (or Anthropic) and note that the
      app falls back to a deterministic parser when no key is configured. Say this plainly; it is
      a design decision you can defend, not a weakness to hide.

## 7. Team information

- [ ] **YOU** — Your name, email and GitHub handle.
- [ ] **YOU** — Mark as a **solo** submission.
- [ ] **YOU** — Confirm the MLH Code of Conduct box.
- [ ] **YOU** — Check whether this hackathon requires the project to have been built during the
      event window, and that your commit timestamps are consistent with that. Read the specific
      rules for your event — they vary.

---

## 8. Project description (copy this)

### Short — one or two lines

> Solana AI Wallet turns plain English into verified Solana transactions. The AI proposes; the
> chain verifies; you sign. Devnet.

### Standard — for the main submission field

> **Solana AI Wallet** turns plain English into verified Solana transactions.
>
> Wallets expect people to understand addresses, lamports and network fees before they can send
> anything. Solana AI Wallet lets you write "Send 0.1 SOL to this address" and handles the rest —
> but it treats the language model as the untrusted component it is.
>
> The AI only proposes a structured intent, validated against a strict Zod schema. The application
> then independently re-validates the recipient with Solana's own address rules, converts the
> amount to exact integer lamports so no value is ever rounded, prices the real transaction with
> `getFeeForMessage`, checks it against a freshly read balance, and verifies the cluster's genesis
> hash — none of which consults the AI. You approve every transfer explicitly, and your own wallet
> signs it. The app never holds a key, and reports a transfer as confirmed only once the network
> confirms the signature.
>
> Built with Next.js, TypeScript and the Solana Kit SDK on Devnet. Every transaction is real: there
> are no mock balances and no simulated transfers.

### If asked "what makes this different?"

> Most AI wallet demos show a model that can move money. This one is built so the model
> structurally cannot. The AI's output is a suggestion that passes through nine independent
> validation checks before a confirm button even appears, and the signature request only ever goes
> to the user's wallet — verified during testing with a mock wallet that counted signing calls:
> zero through interpretation and preview, exactly one on approval.

---

## 9. Honest status — know this before a judge asks

Do not claim more than this. If a judge asks what is unfinished, these are the real answers, and
having them ready is a strength.

**Fully working and verified on chain**

Wallet connection via Wallet Standard; real balance reads; AI interpretation with strict schema
validation; the full validation layer; network-priced fees; explicit approval; Phantom signing;
and real confirmed SOL transfers on Devnet. A finalized example is linked in the README.

**Deliberately not built — scope decisions for the MVP**

- Native SOL transfers only. No SPL tokens, NFTs, swaps or staking — all refused explicitly.
- Devnet only. Mainnet is unreachable from this build.
- No price data. Fiat conversion questions are refused rather than guessed.

**Genuine limitations**

- Transaction history is per-session and not read back from the chain; a reload clears it.
- The `/api/interpret` rate limit is in-memory, so each serverless instance counts separately.
- Multi-instruction and multi-signature transactions are untested; the fee estimator assumes the
  single-signature case.
- No automated browser test suite. Browser testing was manual plus a mock Wallet Standard wallet;
  there is no Playwright or Cypress suite committed.

**Nothing is simulated.** No mock balances, no placeholder transactions, no sample history. A
balance that cannot be read shows a dash and an error. A declined or failed transfer is reported
as declined or failed. "Confirmed" appears only after the network confirms the signature.

---

## 10. Final pre-submit pass

- [ ] `npm run typecheck` and `npm run build` both pass.
- [ ] The live deployment loads and completes one real transfer.
- [ ] The GitHub repo is public and loads logged out.
- [ ] The video plays in a private window and is under 2 minutes.
- [ ] Every URL in the form is pasted and opens.
- [ ] AI Track selected.
- [ ] Submitted **before** the deadline — not at it. Submission forms get slow in the final hour.
