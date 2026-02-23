# Fix: Double-Charge Payment Bug

## Problem
Payment references are stored in an in-memory `Map` that doesn't persist across Vercel serverless instances. When `initiate` and `confirm` hit different instances, the confirm step fails, but the on-chain payment already went through. The user retries and gets charged again.

## Strategy
Two changes, both in existing files:

1. **Move payment references from in-memory to Supabase** (the table already exists in migration `002`)
2. **Add retry with backoff for Worldcoin API verification** in the confirm endpoint

No new files needed. No frontend changes needed.

---

## Step 1: Update the migration to support `extra_life` type

**File:** `supabase/migrations/002_add_payment_references.sql`

- Change the `type` check constraint from `('entry', 'reveal')` to `('entry', 'reveal', 'extra_life')`
- Add `game_entry_id TEXT` column (needed for extra_life payments)

---

## Step 2: Replace in-memory storage with Supabase in `initiate/route.ts`

**File:** `app/src/app/api/payment/initiate/route.ts`

- Remove the in-memory `Map`, `globalForPayments`, and `cleanupOldReferences()`
- Rewrite `getPaymentReference()` to query Supabase `payment_references` table
- Rewrite `updatePaymentReference()` to update Supabase
- In the POST handler, replace `paymentReferences.set(...)` with a Supabase insert
- Import `getServerClient` from `@/lib/supabase`
- Keep the in-memory fallback for dev mode (when Supabase is not configured)

---

## Step 3: Add retry logic to Worldcoin API verification in `confirm/route.ts`

**File:** `app/src/app/api/payment/confirm/route.ts`

- Update imports: read references from Supabase instead of importing from `initiate/route`
- In `verifyTransactionWithWorldcoin()`, add retry with backoff (3 attempts, 1s/2s/4s delays) for non-200 responses from the Worldcoin API. This handles the race condition where the transaction isn't indexed yet.
- Do NOT retry on explicit `status: 'failed'` — only retry on network/API errors.

---

## What this fixes

| Issue | Fix |
|-------|-----|
| In-memory refs lost across serverless instances | Refs stored in Supabase (persistent) |
| Worldcoin API race condition (transaction not indexed yet) | Retry with backoff before declaring failure |
| Double-charge on retry | Both above fixes prevent the confirm step from failing spuriously, so the game entry gets created and the duplicate check in `initiate` works |

## What this does NOT change
- Frontend code (no changes to `worldcoin.ts` client-side flow or `HomeScreen.tsx`)
- Database schema structure (table already exists, just fixing the type constraint)
- Payment amounts or wallet routing
- Game logic
