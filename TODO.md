# Sodoku Stake - Development Tasks

## ✅ Completed

### UI/Frontend
- [x] Bottom navigation
- [x] Home screen (stats, streak, timer, play button)
- [x] Puzzle screen (Sudoku grid, number pad, submit)
- [x] Results screen
- [x] Leaderboard screen
- [x] Profile screen

### Game Logic
- [x] Sudoku puzzle generation (using `sudoku-gen`)
- [x] Variant system (unique number mapping per user)
- [x] Game state management (Zustand)
- [x] Notes mode
- [x] Undo functionality

### Server/API
- [x] `GET /api/puzzle/today` - Fetch user's puzzle variant
- [x] `POST /api/puzzle/submit` - Server-side solution validation
- [x] `POST /api/puzzle/reveal` - Paid cell reveal
- [x] `GET /api/puzzle/stats` - Admin puzzle stats
- [x] Puzzle caching (in-memory, per day)

### World ID Integration
- [x] Set up MiniKit provider with App ID
- [x] Implement World ID verification before entry
- [x] Store nullifier hash as user identifier
- [x] Handle verification errors gracefully
- [x] Dev mode fallback (mock verification outside World App)

### Payment Integration
- [x] Implement entry fee payment ($1.00 USDC)
- [x] Verify payment before showing puzzle
- [x] Implement reveal feature payment ($0.20 USDC)
- [x] Handle payment errors/cancellation
- [x] Dev mode fallback (mock payments outside World App)

### Database (Supabase) - Code Complete
- [x] Install Supabase client library
- [x] Create Supabase client configuration
- [x] Create database schema (`supabase/schema.sql`)
- [x] Create database service layer (`src/lib/db.ts`)
- [x] Update API routes to use Supabase
- [x] In-memory fallback when Supabase not configured

---

## 📋 TODO — Development Phases

Follow these phases in order. Each phase builds on the previous.

---

### ~~Phase 1: Database Setup~~ ✅

~~Connect the app to a real Supabase database (currently using in-memory fallback).~~

1. **~~Create Supabase Project~~**
   - [x] Go to https://supabase.com and sign up/login
   - [x] Click "New Project"
   - [x] Choose organization, name it "sodoku-stake"
   - [x] Set a strong database password (save it!)
   - [x] Select region closest to your users
   - [x] Wait for project to be created (~2 minutes)

2. **~~Run Database Schema~~**
   - [x] In Supabase dashboard, go to SQL Editor
   - [x] Click "New Query"
   - [x] Copy entire contents of `supabase/schema.sql`
   - [x] Paste into editor and click "Run"
   - [x] Verify all tables created in Table Editor

3. **~~Get API Credentials~~**
   - [x] Go to Project Settings → API
   - [x] Copy "Project URL" → `NEXT_PUBLIC_SUPABASE_URL`
   - [x] Copy "anon public" key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - [x] Copy "service_role" key → `SUPABASE_SERVICE_ROLE_KEY`

4. **~~Configure Environment~~**
   - [x] Create `.env.local` in `app/` folder (see Phase 2 for full template)
   - [x] Add Supabase credentials
   - [x] Restart dev server
   - [x] Test by playing a game — should persist in database

---

### ~~Phase 2: Configuration & Wallets~~ ✅

~~Set up all required API keys and wallet addresses.~~

#### ~~A. Create Your Wallets~~
| Variable | Purpose | How to Create |
|----------|---------|---------------|
| `NEXT_PUBLIC_PLATFORM_WALLET` | Receives entry fees ($1.00/entry) → prize pool, you keep 20% | Create Ethereum wallet in MetaMask |
| `NEXT_PUBLIC_DEVELOPER_WALLET` | Receives reveal fees ($0.20/reveal) → 100% yours | Same wallet or separate one |

> 💡 **Tip**: You can use the same wallet for both, or separate them for accounting.

#### ~~B. World Developer Portal~~
- [x] Create account at https://developer.worldcoin.org
- [x] Verify email and complete profile
- [x] Create new app in dashboard
- [x] Copy App ID → `NEXT_PUBLIC_APP_ID`

**Actions Created in Developer Portal:**
| Action ID | Purpose | Max Verifications |
|-----------|---------|-------------------|
| `sodoku-stake-daily-entry` | World ID verification before playing | 1 per user per day |
| `sodoku-stake-reveal` | (Optional) Verification for cell reveals | Unlimited |

> ⚠️ Action IDs must match EXACTLY what's in `src/lib/worldcoin.ts`

#### ~~C. Complete `.env.local` Template~~
`app/.env.local` configured with:
```env
# World App
NEXT_PUBLIC_APP_ID=app_xxxxxxxxxxxx

# Wallets (your Ethereum addresses for RECEIVING funds)
NEXT_PUBLIC_PLATFORM_WALLET=0x...
NEXT_PUBLIC_DEVELOPER_WALLET=0x...

# Supabase (from Phase 1)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxxx...

# Environment
NODE_ENV=development
```

---

### ~~Phase 3: Local Testing~~ ✅

Test everything works before deploying.

- [x] Test in browser (dev mode with mocks)
- [x] Verify puzzle generation works
- [x] Verify solution validation works
- [x] Verify reveal feature works (with secure payment)
- [x] Verify data persists in Supabase ✅ (10 users, 1 puzzle, 10 entries confirmed)
- [ ] Test in World App (requires deployed URL or ngrok tunnel)
- [ ] Test World ID verification flow (in World App)
- [x] Test payment flow (secure backend-first flow implemented & tested)

#### Payment Flow Improvements (Completed)
Following [Worldcoin best practices](https://docs.world.org/mini-apps/commands/pay):
- [x] Created `/api/payment/initiate` - Generates secure payment reference on backend
- [x] Created `/api/payment/confirm` - Verifies payment with Worldcoin Developer Portal API
- [x] Updated payment flow: initiate → pay → confirm (secure 3-step process)
- [x] Added `DEV_PORTAL_API_KEY` to env.example for payment verification
- [x] Created `supabase/migrations/002_add_payment_references.sql` for production use
- [x] Tested entry fee flow ($1.00 USDC) - works in dev mode
- [x] Tested reveal fee flow ($0.20 USDC) - works in dev mode

---

### ~~Phase 4: Prize Distribution Setup~~ ✅

~~**Required before launch** — Users need to receive their prizes!~~

> 📄 **Script location**: `app/scripts/distribute-prizes.ts`

#### A. Platform Wallet Private Key
- [x] Get the private key of your **existing platform wallet** (`NEXT_PUBLIC_PLATFORM_WALLET`)
  - This is the wallet already receiving entry fees and reveal payments
  - The same wallet sends prizes out, then sweeps remaining balance to developer wallet
- [x] Add environment variables to `.env.local`:


> 💡 **Note**: World Chain has a free public RPC. For better performance, get a free [Alchemy](https://alchemy.com) key.

> ⚠️ **Security**: Private key should ONLY be in secure env vars, never in code!

#### B. User Wallet Collection (Already Handled ✅)
The `wallet_address` column already exists in the database schema.

MiniKit automatically provides wallet addresses via `MiniKit.user.walletAddress`.
The code captures this automatically when users interact with the app — no manual input needed.

#### C. Install Dependencies ✅
- [x] Install ethers.js: `npm install ethers` (already installed: v6.16.0)

#### D. Test Distribution Script ✅
- [x] Run manually to verify it works:
  ```bash
  cd app
  npx tsx scripts/distribute-prizes.ts --dry-run  # Test mode (no transactions)
  npx tsx scripts/distribute-prizes.ts             # Actual distribution
  ```
- [x] Added `--dry-run` flag to test without sending transactions
- [x] Added `--date=YYYY-MM-DD` flag to test with specific dates
- [x] Verified script connects to database and calculates correctly
- [x] Verified in-progress entries are handled correctly (not counted as winners/losers)

---

### Phase 5: Push Notifications

Implement World App push notifications for user retention.

> 📄 **Reference docs**: 
> - `NOTIFICATIONS.md` — Copy variants and strategy
> - `supabase/migrations/001_add_notifications.sql` — Database schema
> - [World App Notification Docs](https://docs.world.org/mini-apps/growth/notifications)

#### ~~A. Run Database Migration~~ ✅
- [x] Run `supabase/migrations/001_add_notifications.sql` in Supabase SQL Editor
- [x] Verify tables created: `notifications`, `notification_templates`, `notification_schedule`
- [x] Verify user columns added: `timezone`, `notifications_enabled`, etc.
- [x] 43 notification templates seeded with A/B variants

#### ~~B. Implement Notification Service~~ ✅
- [x] Create `src/lib/notifications.ts` service layer
- [x] Implement World App Send Notification API integration
- [x] Add notification preferences UI in Profile screen
- [x] Create `/api/user/notifications` endpoint for preference management
- [x] Wallet address already captured via MiniKit on user creation

#### C. Core Notifications ✅
- [x] **Streak Risk** — "Don't lose your streak!" (6h before midnight via cron)
- [x] **Deadline Reminder** — "4 hours left!" for non-players (via cron)
- [x] **Incomplete Puzzle** — "Finish your puzzle!" for users with in_progress entries (via cron)
- [x] **Prize Distributed** — Instant notification when prize sent (in distribute-prizes.ts)

#### D. Achievement & Engagement Notifications ✅
- [x] **First Win** — Celebratory notification on first victory (triggered in /api/puzzle/submit)
- [x] **Win Streak Milestones** — 3, 7, 14, 30 consecutive wins (triggered in /api/puzzle/submit)
- [x] **Earnings Milestones** — $10, $50, $100 total earnings (triggered in /api/puzzle/submit)
- [x] **Referral Joined** — Instant notification when referred user signs up (triggered in /api/referral/process)
- [x] **Referral First Play** — Notification when referred user plays first puzzle (triggered in /api/puzzle/submit)
- [x] **New Puzzle Available** — For most engaged users only (via cron at 00:05 UTC)

#### E. Notification Scheduler ✅
- [x] Create `/api/cron/notifications` endpoint
- [x] Implement schedule windows for different notification types:
  - New puzzle: 00:00-01:00 UTC
  - Streak risk: 18:00-19:00 UTC (6h before midnight)
  - Deadline reminder: 20:00-21:00 UTC (4h before midnight)
  - Incomplete puzzle: 21:00-22:00 UTC (3h before midnight)
- [x] Implement rate limiting (≤1 notification per user per day)
- [x] Add skip logic (don't notify if user already played today)
- [x] Set up Vercel cron job (runs every hour) - `vercel.json` created

#### F. A/B Testing & Analytics ✅
- [x] Implement variant selection (A/B split) — Already in `getTemplate()`, randomly selects variants
- [x] Database tracks sent/opened/clicked — `notifications` table has all fields ready
- [x] Use Supabase dashboard for analytics — Query `notification_templates` table for metrics
- [ ] Track open rates via World App webhook — Post-launch (requires webhook setup)
- [ ] Target: 15%+ open rate for home-screen badge — Post-launch goal

#### G. Optimization (Post-Launch)
- [ ] Monitor 7-day open rate weekly — After launch, use Supabase dashboard
- [ ] Retire low-performing notifications — Based on real data
- [ ] A/B test copy monthly — Ongoing process
- [x] ~~Add user timezone support~~ — Skipped (column exists, logic deferred)

---

### Phase 6: Production Deployment

Deploy the app to Vercel and set up production database.

#### A. Deploy to Vercel ✅
- [x] Push code to GitHub
- [x] Go to https://vercel.com and connect repo
- [x] Add ALL environment variables in Vercel dashboard:
  - World App credentials
  - Supabase credentials
  - Payout wallet credentials (from Phase 4)
  - Set `NODE_ENV=production`
- [x] Deploy and note your production URL: https://sodoku-stake.vercel.app/

#### B. Production Database ✅
- [x] Using existing Supabase project (same as development)
- [x] Schema already in place
- [x] Notification tables set up (via `001_add_notifications.sql`)

#### C. Fund Production Payout Wallet ✅
- [x] Transfer USDC to your payout wallet on **World Chain** (6 USDC for testing)
- [x] Can add more as needed before launch

#### D. Verify Production ✅
- [x] Visit production URL: https://sodoku-stake.vercel.app/
- [x] Test full flow end-to-end in World App
- [x] Check data appears in production Supabase
- [x] Verify payout wallet is funded (6 USDC)
- [x] Fixed wallet address capture (from transaction verification)

#### E. Automated Prize Distribution (Vercel Cron) ✅
Set up daily automated prize distribution at 00:05 UTC.

- [x] Create `/api/cron/distribute` route (API wrapper for distribution script)
- [x] Update `vercel.json` with cron configuration:
  - Notifications: every hour (`0 * * * *`)
  - Distribution: daily at 00:05 UTC (`5 0 * * *`)
- [x] `CRON_SECRET` env var configured in Vercel
- [ ] Deploy and verify cron appears in Vercel dashboard
- [ ] Monitor first few automated runs in Vercel logs

> ⚠️ **Requires Vercel Pro** ($20/month) for cron jobs
> 
> 💡 **Tip**: Run manually for first week to monitor, then enable cron

---

### Phase 7: World App Store Submission

Submit your app to appear in World App's mini-app directory.

#### A. App Configuration in Developer Portal
- [ ] Set app name: "Sodoku Stake"
- [ ] Set app description (short + long)
- [ ] Set production URL (from Phase 5)
- [ ] Configure payment receiving address (your platform wallet)
- [ ] Configure webhook URLs (if needed)

#### B. Required Assets
- [ ] **App Icon**: 512x512 PNG, square, non-white background
  - Must be unique, cannot use World logo
- [ ] **Content Card**: 345x240 px (export at 3x: 1035x720)
  - Bottom 94px kept free (overlay area)
  - No border radius
- [ ] **Screenshots**: At least 3 screenshots
  - Home screen, puzzle screen, results screen

#### C. App Requirements Checklist
- [ ] Mobile-first design (no hamburger menus) ✅
- [ ] Bottom tab navigation ✅
- [ ] No footers or sidebars ✅
- [ ] Smooth transitions ✅
- [ ] Shows username, never wallet address ✅
- [ ] Initial load < 3 seconds
- [ ] No use of "official" in name/description
- [ ] Does NOT use World logo or modified versions

#### D. Final Testing Before Submission
- [ ] Test all flows in World App Simulator
- [ ] Test on actual World App (iOS/Android)
- [ ] Test payments work correctly
- [ ] Test prize distribution script works
- [ ] Test notifications work correctly
- [ ] Verify no console errors

#### E. Submit for Review
- [ ] Go to Developer Portal → Your App → Submit for Review
- [ ] Fill out submission form
- [ ] Provide test instructions
- [ ] Agree to terms and guidelines

#### F. Review Process
- [ ] Wait for review (typically 1-5 business days)
- [ ] Address any feedback/rejections
- [ ] Resubmit if needed

#### G. Post-Approval
- [ ] App appears in World App mini-app directory 🎉
- [ ] Monitor analytics in developer portal
- [ ] Respond to user feedback
- [ ] Set up automated prize distribution (if not done yet)

---

### Phase 8: Future Enhancements

Nice-to-have features for later versions.

- [ ] Streak tracking with database persistence
- [ ] Referral system
- [ ] Share cards (post-game shareable image)
- [ ] Leaderboard with real data
- [ ] Profile with real stats
- [ ] Yesterday's results display
- [ ] Localization (English, Spanish, Thai, Japanese, Korean, Portuguese)

---

## 🐛 Known Issues

- MiniKit shows "not installed" warning (expected outside World App)
- manifest.json 404 (need to add PWA manifest if desired)

---

## 📝 Reference

### Quick Links
- World Developer Portal: https://developer.worldcoin.org
- World ID Docs: https://docs.world.org/world-id
- MiniKit Docs: https://docs.world.org/mini-apps
- Supabase Dashboard: https://supabase.com/dashboard
- Vercel: https://vercel.com
- Alchemy (RPC): https://alchemy.com

### Key Decisions
| Setting | Value | Notes |
|---------|-------|-------|
| Entry fee | $1.00 USDC | Goes to prize pool |
| Reveal cost | $0.20 USDC | Goes to developer (not pool) |
| Platform fee | 0%, 10%, or 20% | Dynamic based on winner ratio |
| Streak insurance | 50% refund | For 7+ day streak losers |
| Puzzle reset | 00:00 UTC | Daily |

### Dynamic Tax System
The platform fee is calculated dynamically to ensure winners always break even:
- **20% tax**: When winners ≤ 80% of players (standard case)
- **10% tax**: When winners ≤ 90% of players (reduced to allow break-even)
- **0% tax**: When winners > 90% of players (no tax to prevent losses)

This protects early adopters and handles edge cases where most players win.

### Puzzle Difficulty Distribution
NO easy puzzles. Difficulty is weighted toward challenging puzzles:
- **Medium**: 15% chance (28-35 given numbers)
- **Hard**: 50% chance (22-27 given numbers)
- **Expert**: 35% chance (17-21 given numbers)

Difficulty is deterministically selected per day based on date hash.

### Environment Variables Reference
See `app/env.example` for a complete template with comments.
