'use client';

/**
 * The application shell, and the only place where the three layers meet.
 *
 * The flow it drives, in order:
 *
 *   message -> /api/interpret -> validateTransfer -> plan + price -> preview
 *           -> user approves -> wallet signs -> submit -> confirmed signature
 *
 * The AI step sits at the front and is the only step that can be wrong without
 * consequence: nothing it returns reaches a wallet until `validateTransfer` has
 * passed and the user has pressed the approve button.
 */

import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { useSendTransaction, usePlanTransaction } from '@solana/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppClient } from '@/app/providers';
import { formatSol, shortenAddress } from '@/lib/amounts';
import { FALLBACK_FEE_LAMPORTS } from '@/lib/constants';
import {
  buildTransferInstruction,
  describeRpcError,
  estimateFeeLamports,
  fetchBalanceLamports,
  fetchRecentActivity,
  fetchTransactionSummary,
  inspectAddress,
  isUserRejection,
  profileRecipient,
  simulateTransfer,
  summarizeInstructions,
  verifyDevnet,
  type NetworkCheck,
} from '@/lib/solana';
import {
  maxSendableLamports,
  validateTransfer,
  type InterpretEngine,
  type InterpretResponse,
} from '@/lib/validation';
import type { ChatMessage, VerifiedFact } from '@/types/chat';
import type {
  ActivityEntry,
  InstructionSummary,
  PendingTransfer,
  SimulationResult,
  TransactionRecord,
  TransferOutcome,
} from '@/types/transaction';

import { ChatInterface } from './ChatInterface';
import { IconShield } from './icons';
import { NetworkBadge } from './NetworkBadge';
import { Sidebar, type NavView } from './Sidebar';
import { TransactionHistory } from './TransactionHistory';
import { TransactionPreview } from './TransactionPreview';
import { TransactionResult } from './TransactionResult';
import { WalletBalance } from './WalletBalance';
import { WalletConnect } from './WalletConnect';

let messageCounter = 0;
function nextId(prefix: string): string {
  messageCounter += 1;
  return `${prefix}-${messageCounter}`;
}

const GREETING: ChatMessage = {
  id: 'greeting',
  role: 'assistant',
  text: 'I can read your Devnet balance and prepare native SOL transfers from plain English. Tell me what you want to do, for example "Send 0.01 SOL to <address>". I will never move anything without showing you the details first and having you sign it in your own wallet.',
  tone: 'plain',
  at: Date.now(),
};

export function Dashboard() {
  const client = useAppClient();
  const connected = useConnectedWallet(client);

  /**
   * Whether React has finished hydrating.
   *
   * The server has no way to know a wallet is connected, so it always renders
   * the disconnected layout. When Phantom reconnects a remembered wallet it
   * does so fast enough to be present on the browser's *first* render, which
   * makes that render disagree with the server HTML — a hydration mismatch.
   * Holding the wallet as "not connected" for one frame keeps the first client
   * render identical to the server's; the effect below then reveals the real
   * state. WalletConnect does the same thing for the same reason.
   */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const walletAddress = hydrated ? (connected?.account.address ?? null) : null;

  const sendTransaction = useSendTransaction(client);
  const planTransaction = usePlanTransaction(client);

  const [view, setView] = useState<NavView>('dashboard');

  const [network, setNetwork] = useState<NetworkCheck | null>(null);
  const [balanceLamports, setBalanceLamports] = useState<bigint | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [feeLamports, setFeeLamports] = useState<bigint>(FALLBACK_FEE_LAMPORTS);

  const [engine, setEngine] = useState<InterpretEngine | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [isInterpreting, setIsInterpreting] = useState(false);

  const [pending, setPending] = useState<PendingTransfer | null>(null);
  const [outcome, setOutcome] = useState<TransferOutcome | null>(null);
  const [history, setHistory] = useState<TransactionRecord[]>([]);
  /** Activity read back from the chain, distinct from this session's sends. */
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  /** Guards against a second submission while one is already in flight. */
  const submittingRef = useRef(false);

  const isDevnetVerified = network?.status === 'devnet';

  /* ---------------------------------------------------------------------- */
  /* Helpers                                                               */
  /* ---------------------------------------------------------------------- */

  const say = useCallback(
    (text: string, options: Partial<Omit<ChatMessage, 'id' | 'role' | 'text' | 'at'>> = {}) => {
      setMessages((current) => [
        ...current,
        {
          id: nextId('assistant'),
          role: 'assistant',
          text,
          tone: options.tone ?? 'plain',
          engine: options.engine,
          facts: options.facts,
          at: Date.now(),
        },
      ]);
    },
    [],
  );

  const refreshBalance = useCallback(async () => {
    if (!walletAddress) {
      setBalanceLamports(null);
      setBalanceError(null);
      return;
    }

    setIsBalanceLoading(true);
    try {
      const lamports = await fetchBalanceLamports(client, walletAddress);
      setBalanceLamports(lamports);
      setBalanceError(null);
    } catch (error) {
      setBalanceLamports(null);
      setBalanceError(describeRpcError(error));
    } finally {
      setIsBalanceLoading(false);
    }
  }, [client, walletAddress]);

  /* ---------------------------------------------------------------------- */
  /* Startup: verify the cluster, then read the balance                     */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    verifyDevnet(client).then((result) => {
      if (!cancelled) setNetwork(result);
    });

    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  // Which engine will read the messages. Reported by the API route, which never
  // discloses the key itself.
  useEffect(() => {
    let cancelled = false;

    fetch('/api/interpret')
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { engine?: InterpretEngine } | null) => {
        if (!cancelled && payload?.engine) setEngine(payload.engine);
      })
      .catch(() => {
        /* The badge is cosmetic; a failed probe should change nothing else. */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // A wallet change invalidates anything prepared for the previous one.
  useEffect(() => {
    setPending(null);
    setOutcome(null);
  }, [walletAddress]);

  /* ---------------------------------------------------------------------- */
  /* Preparing a transfer                                                   */
  /* ---------------------------------------------------------------------- */

  const prepareTransfer = useCallback(
    async (intent: InterpretResponse) => {
      if (!walletAddress) {
        say('Connect your wallet first, then I can prepare that transfer.', { tone: 'warning' });
        return;
      }

      // Read a fresh balance: the one on screen may be seconds old, and the
      // balance check is only meaningful against the current value.
      let currentBalance: bigint | null = null;
      try {
        currentBalance = await fetchBalanceLamports(client, walletAddress);
        setBalanceLamports(currentBalance);
        setBalanceError(null);
      } catch (error) {
        setBalanceError(describeRpcError(error));
      }

      // A first pass with the fallback fee, so an invalid address or amount is
      // rejected before any work is done on the network.
      const firstPass = validateTransfer({
        recipient: intent.recipient,
        amountSol: intent.amountSol,
        senderAddress: walletAddress,
        balanceLamports: currentBalance,
        feeLamports: FALLBACK_FEE_LAMPORTS,
        isDevnetVerified,
      });

      if (!firstPass.ok) {
        say(
          `I could not prepare that transfer:\n\n${firstPass.errors.map((error) => `• ${error}`).join('\n')}`,
          { tone: 'error' },
        );
        return;
      }

      // Plan the real transaction, then ask the network to price it, run it,
      // and tell us what it contains.
      let realFee = FALLBACK_FEE_LAMPORTS;
      let feeSource: 'rpc' | 'fallback' = 'fallback';
      let simulation: SimulationResult = {
        kind: 'unavailable',
        reason: 'The transaction could not be planned, so it was not simulated.',
      };
      let instructions: InstructionSummary[] = [];

      try {
        const instruction = buildTransferInstruction(client, firstPass.recipient, firstPass.lamports);
        const message = await planTransaction.dispatchAsync([instruction]);

        const estimate = await estimateFeeLamports(client, message);
        realFee = estimate.lamports;
        feeSource = estimate.source;
        setFeeLamports(estimate.lamports);

        instructions = summarizeInstructions(message, firstPass.lamports);
        simulation = await simulateTransfer(
          client,
          message,
          walletAddress,
          firstPass.recipient,
        );
      } catch (error) {
        // Planning failing is worth telling the user about, but the fallback fee
        // is conservative, so the flow can still continue safely.
        console.warn('[prepare] could not plan the transaction', error);
      }

      // The chain says this transaction would fail. That is a hard stop: there
      // is no reason to ask the user to sign something already known to break.
      if (simulation.kind === 'failed') {
        say(
          `I simulated this transfer against Solana Devnet before asking you to sign it, and the network reported it would fail:\n\n• ${simulation.reason}\n\nNothing was sent.`,
          { tone: 'error' },
        );
        return;
      }

      // Second pass, now with the fee the network actually quoted.
      const finalCheck = validateTransfer({
        recipient: intent.recipient,
        amountSol: intent.amountSol,
        senderAddress: walletAddress,
        balanceLamports: currentBalance,
        feeLamports: realFee,
        isDevnetVerified,
      });

      if (!finalCheck.ok) {
        say(
          `I could not prepare that transfer:\n\n${finalCheck.errors.map((error) => `• ${error}`).join('\n')}`,
          { tone: 'error' },
        );
        return;
      }

      const warnings = [...finalCheck.warnings, ...intent.warnings];

      const recipientProfile = await profileRecipient(client, finalCheck.recipient);

      if (recipientProfile?.hasNoHistory) {
        warnings.push(
          'This address has never been used on Devnet — no balance and no transaction history. Check every character: a transfer to a mistyped address cannot be reversed.',
        );
      } else if (recipientProfile?.isUnfunded) {
        warnings.push(
          'This address holds no SOL on Devnet. Check it carefully — a transfer to a mistyped address cannot be reversed.',
        );
      }

      setOutcome(null);
      setPending({
        recipient: finalCheck.recipient,
        lamports: finalCheck.lamports,
        feeLamports: realFee,
        feeSource,
        totalLamports: finalCheck.lamports + realFee,
        explanation: intent.explanation,
        warnings,
        simulation,
        instructions,
        recipientProfile,
      });

      say(
        'I have prepared the transfer, checked it against your balance, and simulated it on Devnet. Review the details and approve it when you are ready.',
        { engine: intent.engine },
      );
    },
    [client, isDevnetVerified, planTransaction, say, walletAddress],
  );

  /* ---------------------------------------------------------------------- */
  /* Sending a message                                                      */
  /* ---------------------------------------------------------------------- */

  const handleSend = useCallback(
    async (text: string) => {
      setMessages((current) => [
        ...current,
        { id: nextId('user'), role: 'user', text, tone: 'plain', at: Date.now() },
      ]);
      setIsInterpreting(true);

      try {
        const response = await fetch('/api/interpret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            // Only real, chain-read facts are passed as context, so the model
            // has no reason to invent a figure.
            context: walletAddress
              ? {
                  address: walletAddress,
                  balanceLamports: balanceLamports?.toString(),
                  feeLamports: feeLamports.toString(),
                }
              : undefined,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          say(
            payload?.error ??
              `The interpretation service returned an error (${response.status}). Nothing was prepared.`,
            { tone: 'error' },
          );
          return;
        }

        const intent = (await response.json()) as InterpretResponse;

        switch (intent.action) {
          case 'check_balance': {
            const facts: VerifiedFact[] = [];
            if (walletAddress && balanceLamports !== null) {
              facts.push({ label: 'Balance', value: `${formatSol(balanceLamports)} SOL` });
              facts.push({ label: 'Lamports', value: balanceLamports.toString() });
            }
            say(intent.explanation, { engine: intent.engine, facts: facts.length ? facts : undefined });
            break;
          }

          case 'max_sendable': {
            const facts: VerifiedFact[] = [];
            if (balanceLamports !== null) {
              const spendable = maxSendableLamports(balanceLamports, feeLamports);
              facts.push({ label: 'Safe to send', value: `${formatSol(spendable)} SOL` });
              facts.push({ label: 'Balance', value: `${formatSol(balanceLamports)} SOL` });
              facts.push({ label: 'Fee held back', value: `${formatSol(feeLamports)} SOL` });
            }
            say(intent.explanation, { engine: intent.engine, facts: facts.length ? facts : undefined });
            break;
          }

          case 'transfer_sol': {
            if (intent.status === 'ready') {
              await prepareTransfer(intent);
            } else {
              const question = intent.clarificationQuestion;
              say(question ? `${intent.explanation}\n\n${question}` : intent.explanation, {
                tone: 'warning',
                engine: intent.engine,
              });
            }
            break;
          }

          case 'explain_transaction': {
            if (intent.status !== 'ready' || !intent.signature) {
              say(
                intent.clarificationQuestion
                  ? `${intent.explanation}

${intent.clarificationQuestion}`
                  : intent.explanation,
                { tone: 'warning', engine: intent.engine },
              );
              break;
            }

            try {
              const summary = await fetchTransactionSummary(client, intent.signature);

              if (!summary) {
                say(
                  'Devnet has no record of that signature. It may be from another cluster, or too old for this RPC to still hold.',
                  { tone: 'warning', engine: intent.engine },
                );
                break;
              }

              const facts: VerifiedFact[] = [
                { label: 'Status', value: summary.error ? `Failed — ${summary.error}` : 'Succeeded' },
                { label: 'Fee', value: `${formatSol(summary.feeLamports)} SOL` },
                { label: 'Slot', value: summary.slot.toString() },
              ];

              if (summary.transfer) {
                facts.unshift(
                  { label: 'Amount', value: `${formatSol(summary.transfer.lamports)} SOL` },
                  { label: 'From', value: shortenAddress(summary.transfer.from, 6, 6) },
                  { label: 'To', value: shortenAddress(summary.transfer.to, 6, 6) },
                );
              }
              if (summary.blockTime !== null) {
                facts.push({ label: 'When', value: new Date(summary.blockTime * 1000).toLocaleString() });
              }
              if (summary.programs.length > 0) {
                facts.push({ label: 'Programs', value: summary.programs.join(', ') });
              }

              say(
                summary.transfer
                  ? `That transaction moved ${formatSol(summary.transfer.lamports)} SOL. Here is what the chain records about it.`
                  : 'Here is what the chain records about that transaction.',
                { engine: intent.engine, facts },
              );
            } catch (error) {
              say(`I could not read that transaction. ${describeRpcError(error)}`, { tone: 'error' });
            }
            break;
          }

          case 'recent_activity': {
            if (!walletAddress) {
              say('Connect your wallet first and I can read its recent activity from the chain.', {
                tone: 'warning',
              });
              break;
            }

            try {
              const entries = await fetchRecentActivity(client, walletAddress, 5);

              if (entries.length === 0) {
                say('This wallet has no transaction history on Devnet yet.', {
                  engine: intent.engine,
                });
                break;
              }

              setActivity(entries);
              say(
                `Here are the last ${entries.length} ${entries.length === 1 ? 'transaction' : 'transactions'} on your wallet, read from the chain. They are listed under Transaction History.`,
                {
                  engine: intent.engine,
                  facts: entries.slice(0, 3).map((entry) => ({
                    label: entry.error ? 'Failed' : 'Confirmed',
                    value:
                      entry.delta === null
                        ? shortenAddress(entry.signature, 6, 6)
                        : `${entry.delta < 0n ? '−' : '+'}${formatSol(entry.delta < 0n ? -entry.delta : entry.delta)} SOL`,
                  })),
                },
              );
            } catch (error) {
              say(`I could not read your activity. ${describeRpcError(error)}`, { tone: 'error' });
            }
            break;
          }

          case 'inspect_address': {
            if (intent.status !== 'ready' || !intent.subjectAddress) {
              say(
                intent.clarificationQuestion
                  ? `${intent.explanation}

${intent.clarificationQuestion}`
                  : intent.explanation,
                { tone: 'warning', engine: intent.engine },
              );
              break;
            }

            try {
              const report = await inspectAddress(client, intent.subjectAddress);

              say(
                report.isEmpty
                  ? 'That address is a valid Solana address, but no account exists at it on Devnet yet.'
                  : 'That address is valid and has an account on Devnet. Here is what the chain holds.',
                {
                  engine: intent.engine,
                  facts: [
                    { label: 'Balance', value: `${formatSol(report.lamports)} SOL` },
                    { label: 'Exists', value: report.isEmpty ? 'No' : 'Yes' },
                    { label: 'Owner', value: report.owner ? shortenAddress(report.owner, 6, 6) : '—' },
                    { label: 'Type', value: report.executable ? 'Program' : 'Wallet / data account' },
                    {
                      label: 'Recent transactions',
                      value: report.recentSignatureCount >= 10 ? '10+' : String(report.recentSignatureCount),
                    },
                  ],
                },
              );
            } catch (error) {
              say(`I could not look that address up. ${describeRpcError(error)}`, { tone: 'error' });
            }
            break;
          }

          default:
            say(intent.explanation, { engine: intent.engine });
        }
      } catch (error) {
        say(
          `The interpretation service could not be reached. ${describeRpcError(error)}`,
          { tone: 'error' },
        );
      } finally {
        setIsInterpreting(false);
      }
    },
    [balanceLamports, feeLamports, prepareTransfer, say, walletAddress],
  );

  /* ---------------------------------------------------------------------- */
  /* Approving and submitting                                               */
  /* ---------------------------------------------------------------------- */

  const confirmTransfer = useCallback(async () => {
    if (!pending || submittingRef.current || !walletAddress) return;

    // The last line of defence against a double submission: the button is also
    // disabled, but a ref cannot be outrun by a re-render.
    submittingRef.current = true;

    try {
      // Rebuilt from the validated values that were displayed, so the signed
      // transaction is exactly the one the user approved.
      const instruction = buildTransferInstruction(client, pending.recipient, pending.lamports);
      const result = await sendTransaction.dispatchAsync([instruction]);
      const signature = String(result.context.signature);

      setPending(null);
      setOutcome({
        kind: 'confirmed',
        signature,
        recipient: pending.recipient,
        lamports: pending.lamports,
        at: Date.now(),
      });
      setHistory((current) => [
        {
          id: nextId('tx'),
          recipient: pending.recipient,
          lamports: pending.lamports,
          signature,
          status: 'confirmed',
          at: Date.now(),
        },
        ...current,
      ]);
      say(
        `The transfer is confirmed on Devnet. Signature ${signature.slice(0, 12)}… — the Explorer link is in the result panel.`,
      );

      void refreshBalance();
    } catch (error) {
      const rejected = isUserRejection(error);

      setPending(null);
      setOutcome(
        rejected
          ? { kind: 'rejected', at: Date.now() }
          : { kind: 'failed', message: describeRpcError(error), at: Date.now() },
      );
      setHistory((current) => [
        {
          id: nextId('tx'),
          recipient: pending.recipient,
          lamports: pending.lamports,
          signature: null,
          status: rejected ? 'rejected' : 'failed',
          detail: rejected ? undefined : describeRpcError(error),
          at: Date.now(),
        },
        ...current,
      ]);

      say(
        rejected
          ? 'You declined the signature request, so nothing was sent and no fee was charged.'
          : `The transfer did not go through. ${describeRpcError(error)}`,
        { tone: rejected ? 'warning' : 'error' },
      );

      void refreshBalance();
    } finally {
      submittingRef.current = false;
    }
  }, [client, pending, refreshBalance, say, sendTransaction, walletAddress]);

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  // Only a wrong cluster closes the chat. A missing wallet is a nudge, not a
  // wall: questions still have real answers, and a transfer asked for without
  // a wallet is caught by `prepareTransfer`.
  const blockedReason =
    network && network.status !== 'devnet'
      ? 'Chat is disabled until the app confirms it is connected to Solana Devnet.'
      : null;

  const hint = !walletAddress
    ? 'You can ask questions now. Connect a wallet to read your balance and prepare a transfer.'
    : null;

  const spendable =
    balanceLamports !== null ? maxSendableLamports(balanceLamports, feeLamports) : null;

  const chat = (
    <ChatInterface
      messages={messages}
      onSend={handleSend}
      isBusy={isInterpreting}
      blockedReason={blockedReason}
      hint={hint}
      engine={engine}
    />
  );

  const balanceCard = (
    <WalletBalance
      address={walletAddress}
      balanceLamports={balanceLamports}
      maxSendableLamports={spendable}
      feeLamports={feeLamports}
      isLoading={isBalanceLoading}
      error={balanceError}
      onRefresh={() => void refreshBalance()}
    />
  );

  const transactionPanels = (
    <>
      {pending && (
        <TransactionPreview
          transfer={pending}
          engine={engine ?? undefined}
          isSigning={sendTransaction.isRunning}
          onConfirm={() => void confirmTransfer()}
          onCancel={() => {
            setPending(null);
            say('Cancelled. Nothing was sent.', { tone: 'warning' });
          }}
        />
      )}

      {outcome && <TransactionResult outcome={outcome} onDismiss={() => setOutcome(null)} />}
    </>
  );

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar
        view={view}
        onViewChange={setView}
        network={network}
        historyCount={history.length}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700/60 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-haze-100">
              {view === 'dashboard' && 'Dashboard'}
              {view === 'assistant' && 'AI Assistant'}
              {view === 'history' && 'Transaction History'}
              {view === 'settings' && 'Settings'}
            </h1>
            <p className="mt-0.5 text-xs text-haze-500">
              Natural-language transfers on Solana Devnet
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden sm:block">
              <NetworkBadge network={network} compact />
            </div>
            <WalletConnect />
          </div>
        </header>

        <div className="min-h-0 flex-1 px-4 py-5 sm:px-6">
          {view === 'dashboard' && (
            <div className="grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
              <div className="flex min-h-0 flex-col gap-5">
                <div className="min-h-[26rem] xl:h-[calc(100dvh-16rem)]">{chat}</div>
              </div>

              <div className="flex flex-col gap-5">
                {balanceCard}
                {transactionPanels}
                <TransactionHistory records={history} activity={activity} compact />
              </div>
            </div>
          )}

          {view === 'assistant' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
              <div className="min-h-[32rem] xl:h-[calc(100dvh-16rem)]">{chat}</div>
              <div className="flex flex-col gap-5">{transactionPanels}</div>
            </div>
          )}

          {view === 'history' && (
            <div className="max-w-3xl">
              <TransactionHistory records={history} activity={activity} />
            </div>
          )}

          {view === 'settings' && <SettingsPanel engine={engine} network={network} />}
        </div>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

function SettingsPanel({
  engine,
  network,
}: {
  engine: InterpretEngine | null;
  network: NetworkCheck | null;
}) {
  const rows: { label: string; value: string }[] = [
    { label: 'Cluster', value: 'Solana Devnet (mainnet is not reachable from this build)' },
    {
      label: 'RPC endpoint',
      value: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com (public)',
    },
    {
      label: 'Cluster check',
      value:
        network === null
          ? 'checking…'
          : network.status === 'devnet'
            ? `verified by genesis hash ${network.genesisHash}`
            : network.status === 'wrong-network'
              ? `reports ${network.name} — transfers disabled`
              : `unreachable: ${network.message}`,
    },
    {
      label: 'Interpretation engine',
      value:
        engine === null
          ? 'checking…'
          : engine === 'local-parser'
            ? 'built-in rule-based parser (no AI provider key configured)'
            : engine,
    },
    { label: 'Supported operations', value: 'Native SOL transfers, balance, maximum sendable' },
  ];

  return (
    <div className="max-w-3xl space-y-5">
      <section className="panel p-5">
        <p className="panel-heading">Configuration</p>
        <dl className="mt-3">
          {rows.map((row) => (
            <div key={row.label} className="detail-row">
              <dt className="detail-label">{row.label}</dt>
              <dd className="detail-value break-all">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel p-5">
        <div className="flex items-center gap-2">
          <IconShield className="h-4 w-4 text-mint-400" />
          <p className="panel-heading text-haze-300">How your funds are protected</p>
        </div>
        <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-haze-300">
          {[
            'The assistant can only propose a transfer. It cannot sign, submit, or move anything.',
            'Every amount and address it returns is re-validated against Solana’s own rules before you see a confirm button.',
            'Amounts are handled as integer lamports throughout, so no value is ever rounded.',
            'The app checks the cluster’s genesis hash and refuses to prepare a transfer unless it is Devnet.',
            'Your wallet signs every transaction. This app never asks for, stores, or sees a seed phrase or private key.',
            'The AI provider key is read only inside the server route and is never sent to the browser.',
            'A transfer is reported as confirmed only after the network confirms its signature.',
          ].map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-mint-400" />
              {line}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
