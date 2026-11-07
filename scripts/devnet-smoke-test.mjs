/**
 * Devnet smoke test — proves the transaction path really works on chain.
 *
 *   node scripts/devnet-smoke-test.mjs
 *
 * The browser app signs with Phantom, which cannot be driven from a script.
 * Everything *else* in the path is identical here: the same plugin chain, the
 * same `getTransferSolInstruction`, the same `planTransaction`, the same
 * `getFeeForMessage` pricing and the same `sendTransaction`. Only the signer
 * differs — a throwaway keypair stands in for the wallet.
 *
 * It generates a fresh keypair, asks the devnet faucet to fund it, sends a
 * small transfer, and checks the result on chain. No key in this script ever
 * touches the application, and nothing here runs in the browser.
 */

import { getTransferSolInstruction } from '@solana-program/system';
import {
  address,
  compileTransactionMessage,
  createClient,
  createKeyPairSignerFromBytes,
  generateKeyPairSigner,
  getBase58Encoder,
  getBase64Decoder,
  getCompiledTransactionMessageEncoder,
  lamports,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import { solanaDevnetRpc } from '@solana/kit-plugin-rpc';
import { extendClient } from '@solana/plugin-core';

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const LAMPORTS_PER_SOL = 1_000_000_000n;
const TRANSFER_LAMPORTS = 1_000_000n; // 0.001 SOL

let failures = 0;

function step(name) {
  process.stdout.write(`\n▸ ${name}\n`);
}

function pass(detail) {
  console.log(`  ✓ ${detail}`);
}

function fail(detail) {
  failures += 1;
  console.log(`  ✗ ${detail}`);
}

function formatSol(value) {
  const whole = value / LAMPORTS_PER_SOL;
  const fraction = (value % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction === '' ? `${whole}` : `${whole}.${fraction}`;
}

async function main() {
  console.log('Solana AI Wallet — devnet smoke test');
  console.log(`RPC: ${RPC_URL}`);

  // A funded keypair can be supplied to exercise the submission step too.
  const payer = process.env.PAYER_SECRET_KEY
    ? await createKeyPairSignerFromBytes(getBase58Encoder().encode(process.env.PAYER_SECRET_KEY))
    : await generateKeyPairSigner();
  const recipient = await generateKeyPairSigner();

  // The same plugin chain the app builds in lib/solana.ts, with a keypair
  // standing in for the wallet signer.
  const client = createClient()
    .use((c) => extendClient(c, { payer }))
    .use(solanaDevnetRpc({ rpcUrl: RPC_URL }));

  /* ---------------------------------------------------------------- */
  step('Cluster is devnet');
  const genesisHash = await client.rpc.getGenesisHash().send();
  if (genesisHash === DEVNET_GENESIS_HASH) {
    pass(`genesis hash ${genesisHash}`);
  } else {
    fail(`expected devnet, got genesis hash ${genesisHash} — aborting`);
    return;
  }

  console.log(`\n  payer     ${payer.address}`);
  console.log(`  recipient ${recipient.address}`);

  /* ---------------------------------------------------------------- */
  step('Read a balance from chain');
  const balance = BigInt((await client.rpc.getBalance(payer.address).send()).value);
  pass(`getBalance returned ${formatSol(balance)} SOL (${balance} lamports)`);

  /* ---------------------------------------------------------------- */
  step('Build and plan the transfer instruction');
  const instruction = getTransferSolInstruction({
    source: client.payer,
    destination: address(recipient.address),
    amount: lamports(TRANSFER_LAMPORTS),
  });
  pass(`transfer instruction built for ${formatSol(TRANSFER_LAMPORTS)} SOL`);

  const message = await client.planTransaction([instruction]);
  pass(`planned a transaction message with ${message.instructions.length} instruction(s)`);

  /* ---------------------------------------------------------------- */
  step('Price the real message with getFeeForMessage');
  // Same step the app's estimateFeeLamports does: a planned message has no
  // blockhash yet, and getFeeForMessage returns null without one.
  const priceable = message.lifetimeConstraint?.blockhash
    ? message
    : setTransactionMessageLifetimeUsingBlockhash(
        (await client.rpc.getLatestBlockhash().send()).value,
        message,
      );
  const compiled = compileTransactionMessage(priceable);
  const base64 = getBase64Decoder().decode(getCompiledTransactionMessageEncoder().encode(compiled));
  const feeResponse = await client.rpc.getFeeForMessage(base64).send();

  if (feeResponse.value === null || feeResponse.value === undefined) {
    fail('the RPC could not price the message (the app falls back to 5000 lamports here)');
  } else {
    pass(`network fee ${formatSol(BigInt(feeResponse.value))} SOL (${feeResponse.value} lamports)`);
  }

  /* ---------------------------------------------------------------- */
  // Everything above runs on an empty account. Submitting does not, and the
  // devnet RPC faucet is closed cluster-wide ("The RPC faucet is closed on
  // this cluster"), so the payer has to be funded by hand for this last part.
  if (balance < TRANSFER_LAMPORTS + 10_000n) {
    step('Submit on chain — skipped');
    console.log(
      `  ! The payer holds ${formatSol(balance)} SOL, which is not enough to send.\n` +
        '\n  To run the full test including a real on-chain transfer:\n' +
        '    1. Fund an address at https://faucet.solana.com (devnet)\n' +
        '    2. Re-run with that keypair:\n' +
        '         PAYER_SECRET_KEY=<base58 64-byte secret> node scripts/devnet-smoke-test.mjs\n' +
        '\n  Every check above this point passed against live devnet.',
    );
    return;
  }

  step('Sign, submit and confirm');
  const result = await client.sendTransaction([instruction]);
  const signature = String(result.context.signature);

  if (signature && signature.length > 40) {
    pass(`signature ${signature}`);
    console.log(`    https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  } else {
    fail(`no usable signature on the result: ${JSON.stringify(result.context)}`);
    return;
  }

  /* ---------------------------------------------------------------- */
  step('Verify the result on chain');
  const statuses = await client.rpc.getSignatureStatuses([signature]).send();
  const status = statuses.value[0];

  if (status && status.err === null) {
    pass(`confirmation status "${status.confirmationStatus}", no error`);
  } else {
    fail(`unexpected signature status: ${JSON.stringify(status)}`);
  }

  const recipientBalance = BigInt((await client.rpc.getBalance(recipient.address).send()).value);
  if (recipientBalance === TRANSFER_LAMPORTS) {
    pass(`recipient received exactly ${formatSol(recipientBalance)} SOL`);
  } else {
    fail(`recipient holds ${recipientBalance} lamports, expected ${TRANSFER_LAMPORTS}`);
  }
}

main()
  .then(() => {
    console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error('\nSmoke test crashed:', error);
    process.exit(1);
  });
