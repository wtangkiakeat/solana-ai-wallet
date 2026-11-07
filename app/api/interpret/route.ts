/**
 * POST /api/interpret — turn one English sentence into a validated intent.
 * GET  /api/interpret — report which interpretation engine is configured.
 *
 * This route is the only place in the application with access to an AI API key.
 * It runs on the Node runtime, the key is read from `process.env` on the server,
 * and no part of it is ever sent to the browser.
 */

import { NextResponse } from 'next/server';

import { aiEngineName, interpretMessage } from '@/lib/ai';
import { InterpretRequestSchema, InterpretResponseSchema } from '@/lib/validation';

/** Keep this on the Node runtime: it holds a secret and makes outbound calls. */
export const runtime = 'nodejs';

/* -------------------------------------------------------------------------- */
/* A small rate limit, so a public deployment cannot burn the API key          */
/* -------------------------------------------------------------------------- */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

/**
 * In-memory counters. Good enough for a hackathon deployment, and deliberately
 * simple: on a serverless platform each instance keeps its own window, which
 * limits abuse without adding a database to the project.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  entry.count += 1;

  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'local';
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                   */
/* -------------------------------------------------------------------------- */

export async function GET() {
  // Reports the engine name only. Never the key, and never any part of it.
  return NextResponse.json({ engine: aiEngineName() });
}

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request));

  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${limit.retryAfterSeconds} seconds.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'The request body was not valid JSON.' }, { status: 400 });
  }

  const parsedRequest = InterpretRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        error: 'The request was not in the expected shape.',
        details: parsedRequest.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const result = await interpretMessage(parsedRequest.data);

  // Defence in depth: validate our own output too, so a change in the AI layer
  // can never ship a shape the browser is not prepared for.
  const parsedResponse = InterpretResponseSchema.safeParse(result);

  if (!parsedResponse.success) {
    console.error('[interpret] built an invalid response', parsedResponse.error.issues);
    return NextResponse.json(
      { error: 'The interpretation could not be validated. Nothing was prepared.' },
      { status: 500 },
    );
  }

  return NextResponse.json(parsedResponse.data, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
