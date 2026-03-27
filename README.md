# Tournament Bracket

A simple, clean tournament bracket manager built with plain HTML, CSS, and JavaScript. No frameworks, no dependencies, no installation needed. Just open the file in a browser and it works.

Supports up to 24 teams, Single and Double Elimination formats, Best of 1 / 2 / 3 match formats, password locking, auto-save, and human-readable result exports.

---

## Live Demo

> Add your Vercel URL here once deployed  
> Example: `https://tournament-bracket.vercel.app`

---

## Features

- **Single Elimination** — one loss and a team is out. Classic format used in cricket, football knockouts, etc.
- **Double Elimination** — one loss drops a team to the Losers Bracket for a second chance. Two losses = eliminated. Winners Bracket and Losers Bracket finals meet in a Grand Final.
- **Match formats** — Best of 1, Best of 2, or Best of 3 per match.
- **Up to 24 teams** — odd number of teams? The extra team gets a BYE (automatic advance) in Round 1.
- **Password lock** — set a password when creating the tournament. Anyone viewing the bracket will need the password to enter or edit scores. Once unlocked, the session stays unlocked until the page is refreshed.
- **Auto-save** — every score you enter is saved automatically to the browser's localStorage. Refresh or close the tab — your bracket is still there when you come back.
- **Export results** — download a `.txt` file with all match results written in plain English (e.g. `India beat Pakistan (2 - 1)`).
- **Import** — restore a previously saved bracket from a `.json` file.

---

## How to Use

### Setting up a tournament

1. Open the app in your browser.
2. Enter a tournament name.
3. Add your teams one by one (press Enter or click Add). You can also click **Load sample teams** to quickly test with 8 cricket teams.
4. Choose **Single** or **Double** Elimination.
5. Choose the match format — Best of 1, 2, or 3.
6. Optionally set a **lock password** to prevent unauthorized score edits.
7. Click **Generate Bracket**.

### Entering scores

1. Click on any match card that is ready to be played (it will highlight on hover).
2. Enter the score for each team.
3. Click **Confirm Result**.
4. The winner automatically advances to the next round. In Double Elimination, the loser drops to the Losers Bracket.

**Score rules by format:**

| Format   | Valid scores          |
|----------|-----------------------|
| Best of 1 | 1 - 0 only           |
| Best of 2 | 2 - 0 or 2 - 1       |
| Best of 3 | 2 - 0 or 2 - 1       |

Ties are not allowed — there must always be a winner.

### Password lock

If you set a password during setup, the bracket will be locked for anyone who opens the page. The first time someone clicks a match to enter a score, they will be asked for the password. Once entered correctly, the bracket stays unlocked for the rest of that browser session. Refreshing the page will lock it again.

The person who created the tournament (i.e. the one who clicked Generate Bracket) starts in an unlocked state automatically.

### Exporting results

Click **Export Results** on the bracket screen. This downloads a `.txt` file that looks like this:

```
TOURNAMENT: IPL 2025

Format: Best of 2 | Type: Single Elimination
Teams: India, Australia, England, Pakistan, New Zealand, South Africa

── MATCH RESULTS ──

[ Winners Bracket Round 1 ]
  M01: India beat Pakistan  (2 - 0)
  M02: Australia beat England  (2 - 1)
  M03: New Zealand beat South Africa  (2 - 0)

[ Winners Bracket Round 2 ]
  M04: India beat Australia  (2 - 1)
  M05: New Zealand — BYE (auto-advance)

[ Winners Bracket Final ]
  M06: India beat New Zealand  (2 - 0)

🏆 CHAMPION: India
Eliminated: Pakistan, England, South Africa, Australia, New Zealand
```

### Importing a bracket

Click **Import** and select a `.json` bracket file (saved from a previous session or another device). The bracket will be fully restored with all scores and results intact.

---

## How Double Elimination Works

With 4 teams A, B, C, D:

```
Winners Bracket          Losers Bracket
────────────────         ──────────────────
R1: A vs B  → A wins     R1: B vs D  (WB R1 losers)
    C vs D  → C wins
                          LB Final: loser of above
R2: A vs C  → A wins
               ↓
         Grand Final
         A  vs  LB winner
```

- Lose once in the Winners Bracket → drop to Losers Bracket
- Lose in the Losers Bracket → eliminated
- Winners Bracket finalist meets Losers Bracket finalist in the Grand Final

---

## File Structure

```
tournament-bracket/
├── index.html    — app structure and layout
├── style.css     — all styling
├── app.js        — all logic (bracket generation, scoring, save/load)
└── README.md     — this file
```

No build tools, no npm, no dependencies. Everything runs directly in the browser.

---

## Deploying to Vercel

1. Create a free account at [vercel.com](https://vercel.com).
2. Click **Add New → Project**.
3. Choose **"Deploy from your own files"** or connect your GitHub repo.
4. Upload or select the project folder containing all 4 files.
5. Click **Deploy** — Vercel will give you a live URL in under a minute.

To update the app later, just re-upload the changed files or push to GitHub (Vercel auto-redeploys on every push).

---

## Data & Privacy

All tournament data is stored only in the **browser's localStorage** on the device being used. Nothing is sent to any server. This means:

- Data is safe as long as you don't clear your browser's site data.
- If you open the app on a different device or browser, it will start fresh.
- To carry a bracket to another device, use **Export** to save a `.json` file, then **Import** it on the other device.

---

## Known Limitations

- localStorage is per-browser and per-device. There is no cloud sync.
- Maximum 24 teams per tournament.
- If you clear your browser data / site storage, the bracket will be lost (use Export as a backup).

---

## Built With

- HTML5
- CSS3
- Vanilla JavaScript (no libraries or frameworks)
