# Sodoku Stake - Notification Copy Guide

> **Reference**: [World App Notification Guidelines](https://docs.world.org/mini-apps/growth/notifications)

## 📋 Quick Reference

### Worldcoin Best Practices
- **Title**: ≤30 characters
- **Emojis**: 1-2 per notification
- **Personalize**: Always use `${username}`
- **Frequency**: ≤1 notification per user per day
- **Deep link**: Include `mini_app_path` for direct navigation
- **Target**: 15%+ open rate for home-screen badge, 25%+ is excellent

### Available Template Variables
| Variable | Description | Example |
|----------|-------------|---------|
| `${username}` | User's World App username | "alice.world" |
| `${streak_count}` | Current streak days | "7" |
| `${prize_amount}` | Prize won (formatted) | "1.78" |
| `${solve_time}` | Solve time (formatted) | "12:34" |
| `${hours_left}` | Hours until deadline | "4" |
| `${players_count}` | Players in today's pool | "234" |
| `${total_players}` | Yesterday's total players | "1,203" |
| `${total_winners}` | Yesterday's winners | "542" |
| `${success_rate}` | Win rate percentage | "45" |
| `${prize_per_winner}` | Prize per winner | "1.78" |
| `${yesterday_prize}` | Yesterday's prize per winner | "1.84" |
| `${yesterday_winners}` | Yesterday's winner count | "487" |
| `${referee_username}` | Referred user's username | "bob.world" |
| `${referral_amount}` | Referral earnings | "2.50" |
| `${referral_count}` | Number of referral plays | "12" |
| `${games_played}` | Weekly games played | "5" |
| `${wins}` | Weekly wins | "3" |
| `${earnings}` | Weekly earnings | "4.20" |
| `${percentile}` | User's ranking percentile | "15" |
| `${date}` | Puzzle date (formatted) | "December 4" |

---

## 🔥 Streak Risk Notifications

**Priority: HIGHEST** — These have the best open rates due to loss aversion psychology.

**Trigger**: User has an active streak (3+ days) and hasn't played today  
**Timing**: 6 hours before midnight UTC (18:00 UTC)

### Active Streak Warning

| Variant | Title | Body |
|---------|-------|------|
| **A** | 🔥 Don't lose your streak! | ${username}, your ${streak_count}-day streak ends at midnight. Today's puzzle awaits. |
| **B** | 🔥 ${streak_count} days strong! | Keep it going, ${username}. Play today's puzzle before midnight. |
| **C** | 🔥 Streak at risk! | ${streak_count} days will vanish at midnight. Don't let it slip, ${username}. |

### Approaching Streak Insurance (Day 6)

**Trigger**: User has 6-day streak and won today  
**Timing**: Immediately after winning

| Variant | Title | Body |
|---------|-------|------|
| **A** | 🛡️ 1 day from protection | Play tomorrow and unlock 50% loss insurance for your 7-day streak! |
| **B** | 🛡️ Almost there! | ${username}, one more day unlocks streak insurance. Don't stop now! |
| **C** | 🛡️ Tomorrow unlocks safety | 7-day streak = 50% refund on losses. You're 1 day away! |

### Has Streak Insurance (Day 7+)

**Trigger**: User has 7+ day streak, insurance active, hasn't played today  
**Timing**: 6 hours before midnight UTC

| Variant | Title | Body |
|---------|-------|------|
| **A** | 🛡️ You're protected today | Your 7-day streak means 50% refund if you lose! |
| **B** | 🛡️ Safety net active | ${username}, your streak insurance is ready. Play with confidence! |
| **C** | 🛡️ Lose less today | Your ${streak_count}-day streak gives you 50% back on losses. Go for it! |

---

## 🎉 Achievement Notifications

**Priority: HIGH** — Celebrate wins to build positive associations.

### First Win Ever

**Trigger**: User's first successful puzzle completion  
**Timing**: Immediately after winning

| Variant | Title | Body |
|---------|-------|------|
| **A** | 🎉 First victory! | ${username}, you just won your first puzzle and earned $${prize_amount}! |
| **B** | 🏆 You did it! | First win unlocked! $${prize_amount} coming your way, ${username}. |
| **C** | 🎊 Winner winner! | $${prize_amount} earned on your first try! Welcome to the winners' circle. |

### Win Streak Milestones

**Trigger**: User reaches 3, 7, 14, or 30 consecutive wins  
**Timing**: Immediately after qualifying win

| Milestone | Variant | Title | Body |
|-----------|---------|-------|------|
| 3 wins | A | 🔥 3-win streak! | Three in a row! You're on fire, ${username}. |
| 3 wins | B | 🔥 Hat trick! | 3 wins straight. Keep this energy going! |
| 7 wins | A | 🔥 7-win streak! | A full week of wins! You're unstoppable, ${username}. |
| 7 wins | B | 🔥 Perfect week! | 7 days, 7 wins. Legendary status unlocked. |
| 14 wins | A | 🔥 14-win streak! | Two weeks of dominance! Legend status, ${username}. |
| 30 wins | A | 👑 30-win streak! | A month undefeated. You're a Sudoku master, ${username}! |
| 30 wins | B | 👑 Unstoppable! | 30 wins. You've transcended, ${username}. |

### Earnings Milestones

**Trigger**: User's total earnings crosses $10, $50, or $100  
**Timing**: After prize distribution

| Milestone | Variant | Title | Body |
|-----------|---------|-------|------|
| $10 | A | 💰 $10 earned! | Double digits! Your puzzle skills are paying off, ${username}. |
| $10 | B | 💵 Ten bucks richer! | Puzzle profits adding up. Keep it going! |
| $50 | A | 💰 $50 earned! | Halfway to $100! Keep solving, ${username}. |
| $50 | B | 💰 Fifty and counting! | Your brain is a money-making machine. |
| $100 | A | 💰 $100 earned! | Triple digits! You've mastered Sodoku Stake, ${username}. |
| $100 | B | 💰 The $100 club! | Elite earner status. What's your secret, ${username}? |

### Personal Best Time

**Trigger**: User beats their previous fastest solve time  
**Timing**: Immediately after submission

| Variant | Title | Body |
|---------|-------|------|
| **A** | ⚡ New personal best! | You solved today's puzzle in just ${solve_time}. Can you beat it tomorrow? |
| **B** | ⚡ Fastest solve yet! | ${solve_time} - your new record, ${username}! Challenge it tomorrow. |
| **C** | ⚡ Speed demon! | ${solve_time}! You're getting faster. What's your limit? |

### Beat the Average

**Trigger**: User solves faster than the daily average  
**Timing**: After results are calculated (00:05 UTC next day)

| Variant | Title | Body |
|---------|-------|------|
| **A** | 📊 Above average! | You beat ${success_rate}% of today's players. You're getting good at this. |
| **B** | 📊 Top performer! | Faster than ${success_rate}% of players today. Nice work, ${username}! |
| **C** | 📊 In the top tier! | Only ${success_rate}% solved faster. You're in elite company. |

---

## 👥 Referral Notifications

**Priority: MEDIUM** — Instant feedback encourages more sharing.

### Referral Signs Up

**Trigger**: Referred user creates account  
**Timing**: Immediately

| Variant | Title | Body |
|---------|-------|------|
| **A** | 🎉 New referral joined! | ${referee_username} just joined using your code. You earn 10% of their spend! |
| **B** | 👋 Welcome aboard! | ${referee_username} signed up with your link. Watch those commissions grow! |
| **C** | 🤝 Referral success! | ${referee_username} is in. You'll earn on every puzzle they play! |

### Referral Plays First Puzzle

**Trigger**: Referred user completes their first game  
**Timing**: Immediately after their entry

| Variant | Title | Body |
|---------|-------|------|
| **A** | 💸 You just earned $0.10 | ${referee_username} played their first puzzle. Keep sharing! |
| **B** | 💰 Commission earned! | $0.10 from ${referee_username}'s first game. Nice! |
| **C** | 💵 Passive income! | ${referee_username} started playing. $0.10 is yours! |

### Weekly Referral Summary

**Trigger**: Weekly cron job (Sunday evening)  
**Timing**: Sunday 20:00 UTC

| Variant | Title | Body |
|---------|-------|------|
| **A** | 💰 Weekly referral update | You earned $${referral_amount} from ${referral_count} referrals this week. |
| **B** | 📊 Your referrals this week | ${referral_count} plays, $${referral_amount} earned. Share more to earn more! |
| **C** | 💸 Referral payday | $${referral_amount} this week from ${referral_count} plays. Keep sharing! |

---

## ⏰ Deadline/Urgency Notifications

**Priority: HIGH** — Drives immediate action.

### Hours Until Deadline

**Trigger**: User hasn't started today's puzzle, time running out  
**Timing**: 4-6 hours before midnight UTC

| Variant | Title | Body |
|---------|-------|------|
| **A** | ⏰ ${hours_left} hours left! | ${username}, today's puzzle ends at midnight. ${players_count} players already entered. |
| **B** | ⏰ Clock is ticking! | Only ${hours_left}h to play today. ${players_count} are already in the pool. |
| **C** | ⏰ Time's running out! | ${hours_left} hours until deadline. ${players_count} players waiting to split the pot. |

### Puzzle Started But Not Submitted

**Trigger**: User has an in_progress entry, 2-3 hours before deadline  
**Timing**: 21:00-22:00 UTC

| Variant | Title | Body |
|---------|-------|------|
| **A** | ⚠️ Finish your puzzle! | You started but didn't submit. Don't forfeit your $1.00 entry! |
| **B** | ⚠️ Don't leave $1 behind! | ${username}, your puzzle is waiting. Submit before midnight! |
| **C** | ⚠️ Unfinished business! | Your $1.00 is on the line. Complete your puzzle before midnight! |

### New Puzzle Available

**Trigger**: Daily puzzle reset (00:00 UTC)  
**Timing**: Shortly after midnight UTC (for most engaged users only)

| Variant | Title | Body |
|---------|-------|------|
| **A** | 🧩 Today's puzzle is live | ${date} puzzle is ready. Yesterday's winners got $${yesterday_prize} each. |
| **B** | 🧩 Fresh puzzle awaits! | New day, new challenge. Yesterday: ${yesterday_winners} winners, $${yesterday_prize} each. |
| **C** | 🧩 New puzzle dropped! | ${date} is live. ${yesterday_winners} won yesterday. Will you join them? |

---

## 🚀 Re-engagement Notifications

**Priority: LOW** — Be careful with these; test thoroughly to avoid causing opt-outs.

### Inactive 2-3 Days

**Trigger**: User hasn't played in 2-3 days  
**Timing**: Morning (based on user timezone if available)

| Variant | Title | Body |
|---------|-------|------|
| **A** | 🚀 We miss you! | ${username}, come back for a fresh puzzle. Your skills are waiting. |
| **B** | 🧩 Puzzles await! | It's been a few days, ${username}. Ready for a challenge? |
| **C** | 👋 Still got it? | It's been ${days_away} days. Prove your skills haven't gone anywhere! |

### Inactive 7+ Days

**Trigger**: User hasn't played in 7+ days  
**Timing**: Morning (based on user timezone)

| Variant | Title | Body |
|---------|-------|------|
| **A** | 🎁 Welcome back? | It's been a while. Today's puzzle has ${players_count} players in the pool! |
| **B** | 👋 Long time no solve! | ${username}, the puzzles miss you. ${players_count} playing today. |
| **C** | 🧩 Remember us? | Today's pool: ${players_count} players. Jump back in, ${username}! |

### After a Loss (Encouragement)

**Trigger**: User lost yesterday's puzzle  
**Timing**: Morning after the loss

| Variant | Title | Body |
|---------|-------|------|
| **A** | 💪 Try again today! | Yesterday was tough (only ${success_rate}% won). Today could be your day. |
| **B** | 🔄 Fresh start! | New puzzle, new chance. Only ${success_rate}% won yesterday. Beat the odds! |
| **C** | 💪 Redemption time! | Yesterday was hard. Today's a clean slate, ${username}. |

---

## 📊 Results Notifications

**Priority: MEDIUM** — Builds engagement loop.

### Daily Results Summary

**Trigger**: Results calculated for yesterday  
**Timing**: Shortly after 00:05 UTC (after prize distribution)

| Variant | Title | Body |
|---------|-------|------|
| **A** | 📊 Results are in! | Yesterday: ${total_players} played, ${success_rate}% won. Winners got $${prize_per_winner} each. |
| **B** | 📊 Yesterday's numbers | ${total_players} players, ${total_winners} winners, $${prize_per_winner} each. Did you win? |
| **C** | 📊 Final tally! | ${total_winners} of ${total_players} won yesterday. $${prize_per_winner} each! |

### Prize Sent Confirmation

**Trigger**: Prize successfully transferred to user's wallet  
**Timing**: Immediately after successful transfer

| Variant | Title | Body |
|---------|-------|------|
| **A** | 💸 Prize sent! | ${username}, $${prize_amount} USDC is on its way to your wallet. Congrats! |
| **B** | 🎉 Payday! | $${prize_amount} sent to your wallet, ${username}. Well earned! |
| **C** | 💰 Cha-ching! | $${prize_amount} is yours! Check your wallet, ${username}. |

### Weekly Stats Summary

**Trigger**: Weekly cron job (Sunday evening)  
**Timing**: Sunday 20:00 UTC

| Variant | Title | Body |
|---------|-------|------|
| **A** | 📈 Your week in review | ${games_played} puzzles, ${wins} wins, $${earnings} earned. You're in the top ${percentile}%! |
| **B** | 📊 Weekly stats | This week: ${games_played} games, ${wins} wins, $${earnings} profit. Nice work! |
| **C** | 📈 Week ${week_number} recap | ${wins}/${games_played} wins. $${earnings} earned. Top ${percentile}% player! |

---

## 🧪 A/B Testing Strategy

### Phase 1: Baseline (Week 1-2)
- Send only Variant A for all notification types
- Measure open rates and click-through rates
- Establish baseline metrics

### Phase 2: Copy Testing (Week 3-4)
- Split users 50/50 between Variant A and B
- Compare open rates between variants
- Winner becomes new default

### Phase 3: Emoji Testing (Week 5-6)
- Test different emoji combinations
- Test emoji placement (beginning vs. end)

### Phase 4: Timing Testing (Week 7-8)
- Test different send times within allowed windows
- Test based on user timezone vs. fixed UTC times

### Metrics to Track
| Metric | Formula | Target |
|--------|---------|--------|
| Open Rate | opened / sent | ≥15% (badge), ≥25% (excellent) |
| Click Rate | clicked / sent | ≥5% |
| Conversion Rate | action_taken / clicked | ≥20% |
| Opt-out Rate | opted_out / sent | <1% |

---

## 📝 Copy Tips

### ✅ Do
- Lead with benefit: "Win $1.78" beats "Check the app"
- Create curiosity: "Something's waiting..."
- Use specific numbers: "4 hours left" > "Hurry up"
- Personalize: Always include `${username}`
- Keep titles under 30 characters

### ❌ Don't
- Be vague: "New update available"
- Be pushy: "PLAY NOW!!!"
- Over-emoji: 🎉🔥💰🚀🎊
- Miss personalization: Generic "Hey there"
- Send without value: "Don't forget us"

---

## 🔗 Deep Links

Each notification should include a `mini_app_path` for deep linking:

| Notification Type | Deep Link Path |
|-------------------|----------------|
| Streak risk | `/?screen=home` |
| New puzzle | `/?screen=puzzle` |
| Results | `/?screen=results` |
| Achievements | `/?screen=profile` |
| Referrals | `/?screen=profile&tab=referrals` |
| Prize sent | `/?screen=profile&tab=earnings` |

---

## 📅 Notification Schedule

### Daily Schedule (UTC)
| Time | Notification Type | Target Users |
|------|-------------------|--------------|
| 00:05 | New puzzle available | Most engaged users only |
| 00:10 | Prize sent | Yesterday's winners |
| 18:00 | Streak risk | Users with active streaks who haven't played |
| 20:00 | Deadline warning (4h) | Users who haven't started today |
| 21:00 | Incomplete puzzle | Users with in_progress entries |

### Weekly Schedule (UTC)
| Day | Time | Notification Type |
|-----|------|-------------------|
| Sunday | 20:00 | Weekly summary |
| Sunday | 20:00 | Referral summary |

### On-Demand (Triggered Immediately)
- First win
- Win streak milestones
- Earnings milestones
- Personal best time
- Referral signup
- Referral first play
- Approaching streak insurance

---

## 📊 Performance Benchmarks

Based on Worldcoin guidelines and industry standards:

| Rating | Open Rate | Action |
|--------|-----------|--------|
| 🔴 Poor | <10% | Delivery paused for 7 days |
| 🟡 Acceptable | 10-15% | Iterate on copy |
| 🟢 Good | 15-25% | Badge displayed, maintain |
| 🌟 Excellent | 25%+ | Scale and expand |

---

*Last updated: December 4, 2024*

