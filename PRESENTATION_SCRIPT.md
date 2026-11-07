# Presentation script — Solana AI Wallet

Narration for the 8-slide deck. Roughly **2 minutes 40 seconds** at a natural speaking pace,
around 155 words a minute.

**Read only the quoted lines.** Everything else is direction for whoever records it.

A note on delivery: this is written to be *said*, not read off a page. Short sentences. Ordinary
words. Where a line looks almost too plain, that is deliberate — a confident speaker does not
decorate. The arguments carry themselves, and overselling them is what makes a pitch sound
rehearsed.

---

## Slide 1 — Cover · 0:00–0:16

> "Every crypto wallet asks the same thing of a beginner. Learn our vocabulary first, then you may
> send your money.
>
> This is Solana AI Wallet. You describe what you want in plain English, the blockchain checks it,
> and you sign it yourself."

*Pause before moving on. Let the title sit.*

---

## Slide 2 — The problem · 0:16–0:42

> "Sending cryptocurrency means getting four things right at the same time.
>
> A forty-four character address, where one wrong letter sends your money somewhere nobody can
> reach. Lamports or SOL — nine decimal places to confuse. A network fee you have to leave behind,
> or the whole thing just fails. And the right network, where a mistake costs real money.
>
> So the obvious answer is to let an AI handle it. That is also the dangerous answer. A model that
> can move money is a model whose mistakes cost money."

*Slow down for the last sentence. It is the argument the whole project rests on.*

---

## Slide 3 — The solution · 0:42–1:02

> "So we kept the plain English, and we took the power away.
>
> The model reads your sentence and proposes one thing: an amount and an address. That is the
> entire extent of what it is allowed to do. It cannot read the blockchain. It cannot sign. It
> cannot submit. It cannot approve its own suggestion.
>
> When it gets something wrong, you see a clear refusal. Not a wrong transaction."

---

## Slide 4 — How it works · 1:02–1:24

> "Here is the path from a sentence to a signature.
>
> You type it. The model turns it into structured data. Then the application takes over, and this
> is the part that matters — it checks the address against Solana's own rules, works out the exact
> amount in lamports, and compares it with your real balance. None of those checks ask the AI
> anything.
>
> Then the network runs the transaction without signing it, so you can see what would actually
> happen. And only then do you approve."

*Move left to right across the five steps as you speak. The colour changes at step three — that is
where suggestion becomes verified fact.*

---

## Slide 5 — Five layers · 1:24–1:48

> "Five layers stand between the model and your money, and not one of them trusts it.
>
> A strict schema, where an unexpected field is a failure rather than something quietly ignored.
> A hardening step, where the server decides a transfer needs confirmation — never the model.
> Independent validation against the chain. A simulation run before you sign. And your own wallet,
> holding the only key.
>
> We measured this. During testing, a wallet that counts every signing request recorded zero while
> the model was reading and the preview was on screen — and exactly one, the moment the approve
> button was pressed."

*The last line is evidence, not a claim. Say it that way: flat, factual.*

---

## Slide 6 — Proof · 1:48–2:08

> "This is a real transaction, made by this application, finalised on Solana Devnet.
>
> Ten million lamports moved. A five thousand lamport fee. No error. And the sender's balance fell
> by exactly ten million and five thousand — the amount plus the fee, matching what the screen
> promised, down to the last lamport.
>
> Nothing in this application is simulated. There are no placeholder balances and no sample
> transactions. If it cannot read something, it tells you so."

---

## Slide 7 — Honest scope · 2:08–2:28

> "Here is what it does, and what it deliberately does not.
>
> It sends SOL, by conversation or by form, through the same checks either way. It reads your
> balance and your history. It explains any transaction you paste into it.
>
> It does not do tokens, or NFTs, or swaps. It has no price data, so it refuses questions about
> what SOL is worth rather than inventing a number. And it only runs on Devnet.
>
> Every one of those limits is stated in the interface, not buried. A wallet that overstates itself
> is the problem we set out to solve."

---

## Slide 8 — Close · 2:28–2:40

> "The AI proposes. The chain verifies. You approve.
>
> Most AI wallets show you a model that can move money. This one is built so that it cannot.
>
> Thank you."

---

## For whoever records this

**Pace.** Around 155 words a minute. The instinct under pressure is to speed up; resist it. The
pauses between slides are part of the timing.

**Tone.** Explaining something you built to someone whose opinion you respect. Not selling. Not
performing. The strongest lines here are the plainest ones, and they land better understated.

**Three moments to slow down for.** The last sentence of slide 2 ("a model that can move money is
a model whose mistakes cost money"). The measurement on slide 5 ("zero… and exactly one"). And the
three-line close on slide 8, with a real beat between each line.

**Numbers.** Say "ten million lamports", not "10,000,000". "Forty-four character address". "Nine
decimal places". Spoken numbers need words.

**Mistakes.** A small stumble is fine and sounds human. Keep going. If you need a second take of
one section, leave three seconds of silence before restarting it so the cut is easy to find.

**Recording.** Quiet room, microphone about a hand's width away, slightly off to the side so your
breath does not hit it. Record ten seconds first and play it back before committing to a full take.

---

## Sending it back

Send the finished audio as **MP3, M4A, WAV or MP4**. One continuous file for the whole script is
easiest — I can align it to the slides from the timings above.

If you record slide by slide instead, name the files in order (`01.mp3`, `02.mp3`, and so on) and
I will join them.

Tell me if you want a pause of a particular length between slides. The default I will use is half
a second, which reads as a natural breath rather than a gap.
