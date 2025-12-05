# Product Requirements Document (PRD)
# Sodoku Stake - Daily Sudoku with Real Stakes

**Version:** 1.0  
**Last Updated:** December 3, 2024  
**Status:** Draft

---

## 1. Executive Summary

### 1.1 Product Overview
Sodoku Stake is a daily Sudoku puzzle game where players stake money to participate. All players receive an equivalent puzzle (same difficulty, different values). Winners split the pool from unsuccessful players, creating a skill-based earning opportunity.

### 1.2 Value Proposition
- **For Players:** Turn your puzzle-solving skills into real earnings
- **For Platform:** Sustainable 20% fee on all entry fees
- **For Worldcoin Ecosystem:** Engaging daily-habit mini-app that showcases World ID verification

### 1.3 Core Mechanic
```
Pay Entry Fee → Solve Sudoku → Win? Get entry back + share of losers' pool
                             → Lose? Forfeit entry fee
```

---

## 2. Target Users

- Puzzle enthusiasts (Sudoku, Wordle, crossword players)
- Worldcoin/World App users looking for engaging mini-apps
- Competitive casual gamers who enjoy skill-based challenges
- Users interested in "play-to-earn" but want skill-based, not chance-based

---

## 3. Game Mechanics

### 3.1 Daily Puzzle System

#### Puzzle Generation
- One base puzzle generated per day (same structure/difficulty for all)
- Each player receives a **value-mapped variant** based on:
  ```
  variant_seed = hash(World_ID + daily_seed)
  ```
- The mapping shuffles numbers 1-9 consistently, so:
  - If base puzzle has "5" → Player A might see "8", Player B might see "3"
  - Solution difficulty remains identical
  - Sharing answers is useless (different numbers)

#### Puzzle Difficulty
- Standard 9x9 Sudoku grid
- **NO easy puzzles** - difficulty weighted toward challenging puzzles
- Difficulty is randomly selected per day with these probabilities:

| Difficulty | Probability | Given Numbers | Expected Success Rate |
|------------|-------------|---------------|----------------------|
| Medium | 15% | 28-35 | ~55-65% |
| Hard | 50% | 22-27 | ~40-50% |
| Expert | 35% | 17-21 | ~20-35% |

- Same logical solving path required for all players
- Difficulty is deterministic per day (based on date hash)

### 3.2 Entry & Participation

| Parameter | Value |
|-----------|-------|
| Entry Fee | $1.00 USDC |
| Puzzle Available | 00:00 UTC daily |
| Deadline | 23:59 UTC same day |
| Attempts | Unlimited within time window |
| Time Limit per Attempt | None (until daily deadline) |

#### Entry Flow
1. User opens app
2. Verify World ID (one-time, cached)
3. Pay $1.00 USDC entry fee
4. Receive personalized Sudoku variant
5. Solve puzzle before deadline

### 3.3 Winning & Losing Conditions

**Win Condition:**
- Submit a valid, complete Sudoku solution before deadline
- First valid submission counts (no re-dos after winning)

**Lose Condition:**
- Deadline passes without valid submission
- User can attempt unlimited times, but must succeed before 23:59 UTC

### 3.4 Prize Distribution

#### Dynamic Fee Structure
The platform fee is dynamically adjusted to ensure winners ALWAYS at least break even (get their $1.00 entry back). This protects players during early launch phases when most players might win.

```
Total Entry Pool = Number of Players × $1.00

Tax Rate Calculation (based on winner ratio):
- If winners ≤ 80% of players → 20% platform fee (standard)
- If winners ≤ 90% of players → 10% platform fee (reduced)
- If winners > 90% of players → 0% platform fee (no tax)

Platform Fee = Total Entry Pool × Tax Rate
Prize Pool = Total Entry Pool × (1 - Tax Rate)

Winners split Prize Pool equally
Losers receive nothing (unless Streak Insurance applies - see 7.4)
```

#### Why Dynamic Tax?
During early launch or on easier puzzles, it's possible that most or all players win. With a fixed 20% tax, this would mean winners actually lose money (each winner would only get $0.80 back). The dynamic tax ensures:
1. Winners always at least break even
2. Platform still collects fees when the player pool supports it
3. Early adopters aren't penalized by small player pools

#### Streak Insurance Refunds
- Players with 7+ day streaks who lose get 50% refund ($0.50)
- Refund comes from platform fee, not prize pool
- This protects winner payouts while rewarding loyal players

#### Example Calculation (Standard 20% Tax)
```
Players: 1,000
Winners: 450 (45% win rate)
Entry Pool: $1,000

Winner ratio: 45% ≤ 80% → Use 20% tax

Platform Fee (20%): $200
Prize Pool (80%): $800

Each winner receives: $800 ÷ 450 = $1.78
Winner profit: $1.78 - $1.00 = $0.78
Loser loss: $1.00

Platform daily revenue: $200
```

#### Example Calculation (Reduced 10% Tax)
```
Players: 100
Winners: 85 (85% win rate)
Entry Pool: $100

Winner ratio: 85% > 80% but ≤ 90% → Use 10% tax

Platform Fee (10%): $10
Prize Pool (90%): $90

Each winner receives: $90 ÷ 85 = $1.06
Winner profit: $1.06 - $1.00 = $0.06
Loser loss: $1.00

Platform daily revenue: $10
```

#### Example Calculation (No Tax - Everyone Wins)
```
Players: 50
Winners: 48 (96% win rate)
Entry Pool: $50

Winner ratio: 96% > 90% → Use 0% tax

Platform Fee (0%): $0
Prize Pool (100%): $50

Each winner receives: $50 ÷ 48 = $1.04
Winner profit: $1.04 - $1.00 = $0.04
Loser loss: $1.00

Platform daily revenue: $0 (but retained players for future)
```

---

## 4. World ID Integration

### 4.1 Purpose
- **Sybil Resistance:** One account per human
- **Fair Play:** Prevents multi-accounting to game the system
- **Compliance:** Required for financial transactions in World App

### 4.2 Verification Level
- **Minimum:** Device verification (World App installed)
- **Recommended:** Orb verification (biometric proof of humanity)

### 4.3 Implementation
```typescript
import { MiniKit, VerificationLevel } from '@worldcoin/minikit-js';

// Verify user before allowing entry
const verifyUser = async () => {
  const result = await MiniKit.commands.verify({
    action: 'sodoku-stake-daily-entry',
    verification_level: VerificationLevel.Orb,
  });
  return result;
};
```

---

## 5. Payment Integration

### 5.1 Supported Currencies
- **Primary:** USDC (stable, predictable value)
- **Secondary:** WLD (native Worldcoin token)

### 5.2 Entry Fee Payment
```typescript
import { MiniKit, Tokens } from '@worldcoin/minikit-js';

const payEntryFee = async () => {
  const result = await MiniKit.commands.pay({
    to: 'PLATFORM_WALLET_ADDRESS',
    tokens: [
      {
        symbol: Tokens.USDC,
        token_amount: '1000000', // $1.00 in USDC (6 decimals)
      },
    ],
    description: 'Sodoku Stake Daily Entry Fee',
  });
  return result;
};
```

### 5.3 Prize Distribution
- Automated distribution at 00:05 UTC (after deadline)
- Direct transfer to winners' World App wallets
- Transaction receipts stored for transparency

### 5.4 Paid Reveal Feature

Players can pay to reveal the correct number for a selected cell during gameplay.

| Parameter | Value |
|-----------|-------|
| Reveal Cost | $0.20 USDC |
| Destination | Developer wallet (NOT prize pool) |
| Limit | Unlimited reveals per puzzle |

#### Reveal Payment Flow
```typescript
import { MiniKit, Tokens } from '@worldcoin/minikit-js';

const payForReveal = async () => {
  const result = await MiniKit.commands.pay({
    to: 'DEVELOPER_WALLET_ADDRESS', // Separate from platform/prize pool wallet
    tokens: [
      {
        symbol: Tokens.USDC,
        token_amount: '200000', // $0.20 in USDC (6 decimals)
      },
    ],
    description: 'Sodoku Stake - Reveal Square',
  });
  
  if (result.status === 'success') {
    // Reveal the correct number for selected cell
    revealSelectedCell();
  }
  
  return result;
};
```

#### Revenue Model for Reveals
- Reveal fees go directly to developer wallet
- Not included in prize pool calculations
- Provides additional monetization beyond platform fees
- Players can choose to use reveals strategically

**Note:** Using reveals does NOT disqualify a player from winning. A correct solution is a correct solution regardless of how the player arrived at it.

---

## 6. User Interface

### 6.1 Screens

#### 6.1.1 Home Screen
- Today's puzzle status (Not Started / In Progress / Completed / Missed)
- Entry button with fee display
- Yesterday's results (winners, your result, pool size)
- Current player count for today
- Streak counter

#### 6.1.2 Puzzle Screen
- 9x9 Sudoku grid
- Number input pad (1-9)
- Timer showing elapsed time
- Undo button (with counterclockwise arrow icon)
- Clear button (to erase selected cell)
- Notes mode toggle
- Reveal button ($0.20 to reveal correct number for selected cell)
- Submit button

#### 6.1.3 Results Screen (Post-Deadline)
- Win/Lose status with animation
- Prize amount (if won)
- Statistics:
  - Total players today
  - Success rate (% who solved)
  - Your solve time vs average
- Share button with stats card
- "Play Tomorrow" reminder opt-in

#### 6.1.4 Leaderboard Screen
- Daily fastest solvers
- Weekly/Monthly earnings leaders
- Longest active streaks
- All-time statistics

#### 6.1.5 Profile Screen
- Total games played
- Win rate
- Total earnings
- Current streak
- Verification status
- Referral code & stats

### 6.2 World App Design Guidelines Compliance

Per [World App Guidelines](https://docs.world.org/mini-apps/guidelines/app-guidelines):

#### Mobile-First Requirements
- ✅ Use bottom tab navigation (no hamburger menus)
- ✅ No footers or sidebars
- ✅ Minimal scrolling, anchored action buttons
- ✅ Smooth transitions between screens
- ✅ Consistent background colors
- ✅ Responsive UI for all screen sizes

#### iOS Scroll Bounce Prevention
```css
html, body {
  overscroll-behavior: none;
  -webkit-overflow-scrolling: touch;
}
```

#### Identity Display Rules
- ✅ **Always show username, never wallet address**
- ✅ Use World ID Address Book for verified users

#### Performance Targets
- Initial load: < 2-3 seconds
- Subsequent actions: < 1 second
- Show loading feedback during waits

#### Branding Rules
- ❌ Do NOT use "official" in name or description
- ❌ Do NOT use World logo or modified versions
- ✅ Maintain distinct brand identity

#### App Icon
- Square image
- Non-white background

#### Content Card
- Size: 345x240 px
- Keep bottom 94px free (overlay area)
- Export as PNG at 3x scale, no border radius

#### Localization Priority
Support these languages (ordered by importance):
1. English
2. Spanish
3. Thai
4. Japanese
5. Korean
6. Portuguese

### 6.3 Design Principles
- Clean, minimalist aesthetic
- High contrast for puzzle visibility
- Satisfying micro-interactions (number placement, completion)
- Celebratory win animations
- Clear financial information display
- Use @worldcoin/mini-apps-ui-kit-react components for consistency

---

## 7. Viral & Social Features

### 7.1 Share Cards
After each day, generate shareable image:
```
┌─────────────────────────────────┐
│        🧩 Sodoku Stake          │
│       December 3, 2024          │
├─────────────────────────────────┤
│                                 │
│     ✅ SOLVED in 12:34          │
│                                 │
│     🏆 Won $1.78                │
│                                 │
│     47% of players failed       │
│     today's puzzle              │
│                                 │
├─────────────────────────────────┤
│     🔥 15-day streak            │
│                                 │
│     [Play on World App]         │
└─────────────────────────────────┘
```

### 7.2 Failure Rate Hook
Prominently display:
> "🔥 53% of players failed today's puzzle. Can you beat the odds?"

This creates:
- FOMO for non-players
- Validation for winners
- Urgency and challenge framing

### 7.3 Referral System

#### Referral Rewards
Referrers earn **10% of lifetime spend** from their referees. Commission comes from the platform fee (not prize pool) and scales with the dynamic tax rate:

| Tax Rate | Referral Commission | Per Entry | Per Reveal |
|----------|--------------------|-----------| -----------|
| 20% | 10% | $0.10 | $0.02 |
| 10% | 5% | $0.05 | $0.02 |
| 0% | 0% | $0.00 | $0.02 |

Note: Reveal commissions always use the full 10% rate since reveal fees go to developer wallet, not prize pool.

#### Referral Tracking
- Unique referral code per user (auto-generated)
- Deep link: `https://world.org/mini-app?app_id={APP_ID}&path=/?ref={CODE}`
- Dashboard showing referral earnings in Profile screen
- Referral leaderboard in Leaderboard screen

### 7.4 Streak System
- Track consecutive days played (regardless of win/lose)
- Streak badges: 7-day, 30-day, 100-day, 365-day
- No streak recovery (if you miss a day, streak resets to zero)

#### 🛡️ Streak Insurance (Player Retention Mechanic)
Players who complete a **7-day play streak** earn one-time loss protection:

| Streak Length | Benefit |
|---------------|---------|
| 0-6 days | No protection |
| Reaches 7 days | **Earns insurance** (one-time 50% refund on next loss) |

**How it works:**
1. Player plays for 7 consecutive days (win or lose) → Earns insurance
2. Insurance stays active until used
3. When player loses with insurance → Receives $0.50 refund (50% of entry)
4. Insurance is consumed (one-time use)
5. To earn insurance again: streak must reset and reach 7 days again

**Example:**
```
Day 1-7: Player plays daily, builds 7-day streak → Insurance activated
Day 8: Player loses → Gets $0.50 back, insurance consumed
Day 9-15: Player continues playing → No insurance (must rebuild)
Day 16: Player skips a day → Streak resets to 0
Day 17-23: Player plays 7 consecutive days → Insurance activated again
```

**Why this works:**
- Rewards consistent daily engagement
- Softens the blow of losing after building a streak
- Incentivizes maintaining consecutive play habits
- One-time use prevents abuse while still rewarding loyalty

---

## 8. Technical Architecture

### 8.1 Tech Stack
| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router) |
| UI Components | @worldcoin/mini-apps-ui-kit-react |
| Styling | Tailwind CSS |
| State Management | Zustand |
| World App Integration | @worldcoin/minikit-js |
| Backend | Next.js API Routes / Vercel |
| Database | PostgreSQL (Supabase) |
| Authentication | World ID |
| Payments | World App Pay API |

### 8.2 Required Packages
```bash
npm install @worldcoin/minikit-js
npm install @worldcoin/mini-apps-ui-kit-react
```

### 8.3 Data Models

#### User
```typescript
interface User {
  id: string;
  worldId: string; // Nullifier hash
  username: string; // World App username (display this, never wallet address)
  walletAddress: string; // For transactions only, never display
  createdAt: Date;
  referralCode: string;
  referredBy?: string;
  totalGamesPlayed: number;
  totalWins: number;
  totalEarnings: number;
  currentStreak: number;
  longestStreak: number;
  hasStreakInsurance: boolean; // True if earned (reached 7-day streak) and not yet consumed
}
```

#### DailyPuzzle
```typescript
interface DailyPuzzle {
  id: string;
  date: string; // YYYY-MM-DD
  gameMode: string; // 'standard' for MVP, supports 'easy'/'hard'/'tournament' later
  basePuzzle: number[][]; // 9x9 grid, 0 = empty
  baseSolution: number[][]; // Complete solution
  difficulty: 'easy' | 'medium' | 'hard';
  dailySeed: string;
  createdAt: Date;
}
```

#### GameEntry
```typescript
interface GameEntry {
  id: string;
  userId: string;
  puzzleId: string;
  gameMode: string; // Links to puzzle's game mode
  entryPaidAt: Date;
  transactionHash: string;
  variantSeed: string; // hash(worldId + dailySeed)
  status: 'in_progress' | 'won' | 'lost';
  solvedAt?: Date;
  solveTimeSeconds?: number;
  streakInsuranceApplied: boolean; // True if 50% refund was given
  prizeAmount?: number;
  refundAmount?: number; // $0.50 if streak insurance applied
  prizeTransactionHash?: string;
}
```

#### DailyResult
```typescript
interface DailyResult {
  id: string;
  puzzleId: string;
  date: string;
  gameMode: string; // Separate results per game mode
  totalPlayers: number;
  totalWinners: number;
  totalPrizePool: number;
  platformFee: number;
  distributedAt: Date;
}
```

### 8.4 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/puzzle/today` | GET | Get today's puzzle (after payment verification) |
| `/api/puzzle/submit` | POST | Submit solution attempt |
| `/api/entry/pay` | POST | Initiate entry fee payment |
| `/api/entry/verify` | POST | Verify payment completion |
| `/api/results/today` | GET | Get current day statistics |
| `/api/results/[date]` | GET | Get historical results |
| `/api/user/profile` | GET | Get user profile & stats |
| `/api/user/referral` | GET | Get referral stats & code |
| `/api/leaderboard` | GET | Get leaderboard data |

### 8.5 Puzzle Generation Pipeline

```
Daily at 00:00 UTC:
1. Generate base Sudoku puzzle with target difficulty
2. Verify solution uniqueness
3. Calculate difficulty metrics
4. Store in database with daily_seed
5. Clear previous day's in-progress entries (mark as lost)
6. Trigger prize distribution for previous day
```

### 8.6 Variant Generation (Client-Side)

```typescript
function generateVariant(basePuzzle: number[][], worldId: string, dailySeed: string): number[][] {
  // Create deterministic mapping based on user's unique seed
  const variantSeed = sha256(worldId + dailySeed);
  const mapping = generateMapping(variantSeed); // e.g., {1:5, 2:9, 3:1, ...}
  
  // Apply mapping to base puzzle
  return basePuzzle.map(row => 
    row.map(cell => cell === 0 ? 0 : mapping[cell])
  );
}
```

---

## 9. Security Considerations

### 9.1 Anti-Cheat Measures
- **Unique variants:** Answer sharing is useless
- **World ID:** One account per human
- **Server-side validation:** All solutions verified on backend
- **Rate limiting:** Prevent brute-force submission attempts
- **Puzzle delivery:** Only after payment confirmation

### 9.2 Financial Security
- **Escrow model:** Entry fees held until distribution
- **Automated distribution:** No manual intervention
- **Audit trail:** All transactions logged with hashes
- **Smart contract consideration:** Future upgrade for trustless distribution

### 9.3 Data Privacy
- Minimal data collection (World ID nullifier only)
- No personal information stored
- Puzzle progress not stored server-side (client-only)

---

## 10. Monetization

### 10.1 Revenue Model

**Primary Revenue: Dynamic Platform Fee**
- 0%, 10%, or 20% of entry fees (dynamically calculated)
- Tax rate depends on winner/player ratio to ensure winners always break even
- At scale with ~50% win rate, 20% fee applies consistently

**Tax Rate Thresholds:**
| Winner Ratio | Platform Fee |
|--------------|--------------|
| ≤ 80% | 20% (standard) |
| ≤ 90% | 10% (reduced) |
| > 90% | 0% (no tax) |

**Example Monthly Revenue (early launch - mixed tax):**
```
Daily players: 100 (avg)
Avg winner ratio: 75%
Entry fee: $1.00
Daily entry pool: $100
Effective platform fee: ~18%/day (some days 10% or 0%)

Monthly revenue: ~$540
```

**Example Monthly Revenue (growth - stable 20%):**
```
Daily players: 5,000
Typical winner ratio: 50%
Entry fee: $1.00
Daily entry pool: $5,000
Platform fee (20%): $1,000/day

Monthly revenue: $30,000
```

### 10.2 Future Revenue Opportunities
- Premium tiers (higher stakes, bigger pools) - separate prize pools
- Tournament events (weekend specials)
- Sponsored puzzles (branded themes)

---

## 11. Launch Plan

### 11.1 Phase 1: MVP (Week 1-2)
- [ ] Basic Sudoku game UI
- [ ] World ID integration
- [ ] Payment integration (entry fee)
- [ ] Single difficulty level
- [ ] Basic results display
- [ ] Manual prize distribution

### 11.2 Phase 2: Core Features (Week 3-4)
- [ ] Variant puzzle generation
- [ ] Automated prize distribution
- [ ] Share cards
- [ ] Basic leaderboard
- [ ] User profiles

### 11.3 Phase 3: Growth Features (Week 5-6)
- [ ] Referral system
- [ ] Streak tracking + Streak Insurance (7+ day = 50% loss refund)
- [ ] Push notifications
- [ ] Historical statistics
- [ ] Advanced share cards

### 11.4 Phase 4: Polish & Scale (Week 7-8)
- [ ] Multiple difficulty tiers
- [ ] Advanced analytics
- [ ] Performance optimization
- [ ] World App store submission
- [ ] Marketing launch

---

## 12. Success Metrics

### 12.1 Key Performance Indicators (KPIs)

| Metric | Target (Month 1) | Target (Month 6) |
|--------|------------------|------------------|
| Daily Active Users | 200 | 2,000 |
| Daily Entries | 150 | 1,500 |
| Win Rate | 45-55% | 45-55% |
| Day 7 Retention | 30% | 40% |
| Referral Rate | 10% | 20% |
| Daily Revenue | $30 | $300 |

### 12.2 Health Metrics
- Win rate should stay 45-55% (difficulty calibration)
- Average solve time: 10-20 minutes
- Complaint rate: <1%
- Payment success rate: >99%

---

## 13. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Puzzle too easy (>70% win) | Low rewards, bored users | Medium | Difficulty calibration, A/B testing |
| Puzzle too hard (<30% win) | Users quit | Medium | Difficulty tiers in future versions |
| Low initial player count | Small pools, low engagement | High | Marketing push, early adopter incentives |
| Losing players churn | Pool collapses over time | High | **Streak Insurance** - 7+ day streak = 50% loss refund |
| Answer sharing | Unfair advantage | Low | Variant generation makes sharing useless |
| Payment failures | Lost revenue, bad UX | Low | Retry logic, clear error handling |
| Regulatory concerns | App rejection | Medium | Skill-based framing, legal review |

---

## 14. Resolved Decisions

| Question | Decision |
|----------|----------|
| Hints system | ✅ Paid "Reveal" feature - $0.20 per cell (goes to dev wallet, not prize pool) |
| Error highlighting | ❌ No - players should not get hints about incorrect answers |
| Time zones | ✅ Global UTC (midnight to midnight) |
| Speed bonus | ❌ No speed bonus, equal split |
| Entry fee | ✅ $1.00 USDC |
| Partial credit | ❌ No partial credit for close solutions |
| Spectator mode | ❌ No spectator mode |
| Streak Insurance | ✅ 7+ day streak = 50% refund on next loss |

## 15. Future Enhancements (Post-MVP)

These features are explicitly out of scope for MVP but the architecture should support adding them later:

| Feature | Notes |
|---------|-------|
| Tournament Mode | Weekend tournaments with higher stakes. Requires separate prize pool. |
| Multiple Difficulties | Easy/Medium/Hard tiers with different entry fees. Each tier has its own separate prize pool. |

**Architecture Consideration:** Design database schema and API to support multiple concurrent game modes with separate prize pools from the start.

---

## 16. Appendix

### 16.1 Competitive Analysis

| App | Model | Differentiator |
|-----|-------|----------------|
| Wordle | Free, no stakes | No financial incentive |
| Sudoku.com | Ads/Premium | No competition |
| Pool Together | No-loss lottery | Chance-based, not skill |
| Skillz Games | Skill-based betting | Not crypto-native |
| **Sodoku Stake** | Daily skill stakes | World ID, crypto-native, daily habit |

### 16.2 Sudoku Difficulty Parameters

| Difficulty | Given Numbers | Avg Solve Time | Target Success Rate | Selection Weight |
|------------|---------------|----------------|---------------------|------------------|
| ~~Easy~~ | ~~36-40~~ | ~~5-10 min~~ | ~~80%~~ | **0% (disabled)** |
| Medium | 28-35 | 10-20 min | 55-65% | 15% |
| Hard | 22-27 | 20-40 min | 40-50% | 50% |
| Expert | 17-21 | 40+ min | 20-35% | 35% |

**Production Target:** Weighted random selection favoring Hard (50%) and Expert (35%)

---

*Document End*

