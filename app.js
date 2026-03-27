// ══════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════
const S = {
  teams: [],
  rounds: 1,
  bracketType: 'double',
  tournamentName: '',
  password: '',
  locked: false,
  sessionUnlocked: false,   // unlocked for this browser tab session
  winnersBracket: [],        // array of rounds; each round = array of match objects
  losersBracket: [],
  grandFinal: null,
  eliminated: [],
  champion: null,
  matchCounter: 0,
};

const STORAGE_KEY = 'tournament_bracket_v1';

// ══════════════════════════════════════════════
//  PERSISTENCE
// ══════════════════════════════════════════════
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch(e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    Object.assign(S, data);
    return true;
  } catch(e) { return false; }
}

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  if (loadState() && S.winnersBracket.length > 0) {
    // Restore bracket screen
    showBracketScreen();
  } else {
    renderTeamTags();
  }
});

// ══════════════════════════════════════════════
//  SETUP
// ══════════════════════════════════════════════
const SAMPLE_TEAMS = ['NAVI', 'FNATIC', 'LIQUID', 'CLOUD9', 'FAZE', 'VITALITY', 'G2', 'HEROIC'];

function loadSampleTeams() {
  S.teams = [...SAMPLE_TEAMS];
  renderTeamTags();
}

function addTeam() {
  const inp = document.getElementById('team-input');
  const name = inp.value.trim().toUpperCase();
  if (!name) return;
  if (S.teams.includes(name)) { toast('Team already added', 'warn'); return; }
  if (S.teams.length >= 32) { toast('Maximum 32 teams allowed', 'warn'); return; }
  S.teams.push(name);
  inp.value = '';
  renderTeamTags();
  inp.focus();
}

document.getElementById('team-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTeam();
});

function removeTeam(name) {
  S.teams = S.teams.filter(t => t !== name);
  renderTeamTags();
}

function renderTeamTags() {
  const list = document.getElementById('teams-list');
  list.innerHTML = S.teams.map(t =>
    `<div class="tag">${t}<span class="tag-remove" onclick="removeTeam('${escHtml(t)}')">×</span></div>`
  ).join('');
  document.getElementById('team-hint').textContent =
    `${S.teams.length} team${S.teams.length !== 1 ? 's' : ''} · minimum 4 required`;
  document.getElementById('start-btn').disabled = S.teams.length < 4;
}

function selectRounds(n, btn) {
  S.rounds = n;
  document.querySelectorAll('#rounds-group .pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function selectType(type, btn) {
  S.bracketType = type;
  document.querySelectorAll('#type-group .pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ══════════════════════════════════════════════
//  START TOURNAMENT
// ══════════════════════════════════════════════
function startTournament() {
  const nameEl = document.getElementById('tournament-name');
  const pwEl   = document.getElementById('lock-password');

  S.tournamentName = nameEl.value.trim() || 'Tournament';
  S.password = pwEl.value.trim();
  S.locked = !!S.password;
  S.sessionUnlocked = true; // creator starts in unlocked state
  S.matchCounter = 0;
  S.eliminated = [];
  S.champion = null;
  S.winnersBracket = [];
  S.losersBracket = [];
  S.grandFinal = null;

  generateBracket();
  saveState();
  showBracketScreen();
}

// ══════════════════════════════════════════════
//  BRACKET GENERATION
// ══════════════════════════════════════════════
function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeMatch(t1, t2, type) {
  S.matchCounter++;
  const m = {
    id: 'M' + String(S.matchCounter).padStart(2, '0'),
    team1: t1, team2: t2,
    score1: null, score2: null,
    winner: null, loser: null,
    type,       // 'winners' | 'losers' | 'grand'
    completed: false,
    bye: false,
  };
  // Auto-handle byes
  if (!t1 && t2) { m.winner = t2; m.completed = true; m.bye = true; }
  if (t1 && !t2) { m.winner = t1; m.completed = true; m.bye = true; }
  if (!t1 && !t2) { m.completed = true; m.bye = true; }
  return m;
}

function generateBracket() {
  const teams = shuffle(S.teams);
  const size  = nextPow2(teams.length);
  const slots = [...teams];
  while (slots.length < size) slots.push(null);

  // Round 1 of winners bracket
  const r1 = [];
  for (let i = 0; i < size; i += 2) {
    r1.push(makeMatch(slots[i], slots[i + 1], 'winners'));
  }
  S.winnersBracket = [r1];
  propagateWinners();
}

// Advance all auto-completable rounds
function propagateWinners() {
  // Winners bracket
  let changed = true;
  while (changed) {
    changed = false;
    const lastWR = S.winnersBracket[S.winnersBracket.length - 1];
    if (lastWR.length === 1) break; // final reached
    if (!lastWR.every(m => m.completed)) break;
    const winners = lastWR.map(m => m.winner);
    const nextRound = [];
    for (let i = 0; i < winners.length; i += 2) {
      nextRound.push(makeMatch(winners[i], winners[i + 1] ?? null, 'winners'));
    }
    S.winnersBracket.push(nextRound);
    changed = true;
  }

  if (S.bracketType === 'double') {
    propagateLosers();
    checkGrandFinal();
  } else {
    // Single elim: check champion
    const lastWR = S.winnersBracket[S.winnersBracket.length - 1];
    if (lastWR.length === 1 && lastWR[0].completed) {
      S.champion = lastWR[0].winner;
    }
  }
}

function propagateLosers() {
  // Collect all losers from winners bracket rounds (not yet in losers bracket)
  const alreadyIn = new Set();
  S.losersBracket.forEach(round => round.forEach(m => {
    if (m.team1) alreadyIn.add(m.team1);
    if (m.team2) alreadyIn.add(m.team2);
  }));

  // Also track who has been eliminated
  const elimSet = new Set(S.eliminated);

  for (let ri = 0; ri < S.winnersBracket.length; ri++) {
    const wr = S.winnersBracket[ri];
    const newLosers = wr
      .filter(m => m.completed && m.loser && !alreadyIn.has(m.loser) && !elimSet.has(m.loser))
      .map(m => m.loser);

    if (newLosers.length === 0) continue;
    newLosers.forEach(l => alreadyIn.add(l));

    if (S.losersBracket.length === 0) {
      // Seed first losers round
      const lRound = [];
      for (let i = 0; i < newLosers.length; i += 2) {
        lRound.push(makeMatch(newLosers[i], newLosers[i + 1] ?? null, 'losers'));
      }
      S.losersBracket.push(lRound);
    } else {
      // Try merging with pending winners of last losers round
      const lastLR = S.losersBracket[S.losersBracket.length - 1];
      if (lastLR.every(m => m.completed)) {
        const lrWinners = lastLR.map(m => m.winner).filter(Boolean);
        // Combine lrWinners vs newLosers (interleave)
        const combined = [];
        const maxLen = Math.max(lrWinners.length, newLosers.length);
        for (let i = 0; i < maxLen; i++) {
          combined.push(makeMatch(lrWinners[i] ?? null, newLosers[i] ?? null, 'losers'));
        }
        if (combined.length) S.losersBracket.push(combined);
      }
    }
  }

  // Advance completed losers rounds
  let changed = true;
  while (changed) {
    changed = false;
    const lastLR = S.losersBracket[S.losersBracket.length - 1];
    if (!lastLR || lastLR.length <= 1) break;
    if (!lastLR.every(m => m.completed)) break;
    const winners = lastLR.map(m => m.winner).filter(Boolean);
    if (winners.length < 2) break;
    const nextRound = [];
    for (let i = 0; i < winners.length; i += 2) {
      nextRound.push(makeMatch(winners[i], winners[i + 1] ?? null, 'losers'));
    }
    S.losersBracket.push(nextRound);
    changed = true;
  }

  // Collect eliminations from losers bracket
  S.losersBracket.forEach(round => round.forEach(m => {
    if (m.completed && m.loser && !elimSet.has(m.loser) && m.loser !== null) {
      if (!S.eliminated.includes(m.loser)) S.eliminated.push(m.loser);
    }
  }));
}

function checkGrandFinal() {
  if (S.grandFinal) {
    if (S.grandFinal.completed) S.champion = S.grandFinal.winner;
    return;
  }
  const lastWR = S.winnersBracket[S.winnersBracket.length - 1];
  const lastLR = S.losersBracket[S.losersBracket.length - 1];
  if (
    lastWR && lastWR.length === 1 && lastWR[0].completed &&
    lastLR && lastLR.length === 1 && lastLR[0].completed
  ) {
    S.grandFinal = makeMatch(lastWR[0].winner, lastLR[0].winner, 'grand');
  }
}

// ══════════════════════════════════════════════
//  SCORE MODAL
// ══════════════════════════════════════════════
let _activeMatch = null;

function openScoreModal(match) {
  if (!match || match.completed || match.bye) return;
  if (!match.team1 || !match.team2) return;

  // Lock check
  if (S.locked && !S.sessionUnlocked) {
    openPwModal(() => openScoreModal(match));
    return;
  }

  _activeMatch = match;
  const maxScore = state_rounds_max();
  document.getElementById('modal-title').textContent = `${match.id} · Enter Score`;
  document.getElementById('score-fields').innerHTML = `
    <div class="score-row">
      <div class="team-label">${escHtml(match.team1)}</div>
      <input type="number" id="s1" min="0" max="${maxScore}" value="0" />
    </div>
    <div class="vs-divider">VS</div>
    <div class="score-row">
      <div class="team-label">${escHtml(match.team2)}</div>
      <input type="number" id="s2" min="0" max="${maxScore}" value="0" />
    </div>
  `;
  const winsNeeded = Math.ceil(S.rounds / 2);
  document.getElementById('modal-hint').textContent =
    `Best of ${S.rounds} · First to ${winsNeeded} win${winsNeeded !== 1 ? 's' : ''}` +
    (S.bracketType === 'double' && match.type === 'winners' ? ' · Loser → Losers Bracket' : '');

  document.getElementById('score-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('s1')?.focus(), 80);
}

function closeModal() {
  document.getElementById('score-modal').style.display = 'none';
  _activeMatch = null;
}

function submitScore() {
  if (!_activeMatch) return;
  const s1 = clamp(parseInt(document.getElementById('s1').value) || 0, 0, S.rounds);
  const s2 = clamp(parseInt(document.getElementById('s2').value) || 0, 0, S.rounds);

  if (s1 === s2) { toast('Scores cannot be equal', 'warn'); return; }

  const need = Math.ceil(S.rounds / 2);
  if (Math.max(s1, s2) < need) {
    toast(`Best of ${S.rounds}: a team needs ${need} wins`, 'warn');
    return;
  }

  _activeMatch.score1  = s1;
  _activeMatch.score2  = s2;
  _activeMatch.winner  = s1 > s2 ? _activeMatch.team1 : _activeMatch.team2;
  _activeMatch.loser   = s1 > s2 ? _activeMatch.team2 : _activeMatch.team1;
  _activeMatch.completed = true;

  // Single elim: loser is eliminated immediately
  if (S.bracketType === 'single' && _activeMatch.loser) {
    if (!S.eliminated.includes(_activeMatch.loser)) S.eliminated.push(_activeMatch.loser);
  }

  const winner = _activeMatch.winner;
  const loser  = _activeMatch.loser;
  const type   = _activeMatch.type;

  closeModal();
  propagateWinners();
  saveState();
  renderBracket();

  if (S.champion) {
    toast(`🏆 ${S.champion} is the champion!`, 'success');
  } else if (type === 'losers') {
    toast(`${winner} advances · ${loser} eliminated`, 'warn');
  } else if (type === 'grand') {
    toast(`${winner} wins the Grand Final!`, 'success');
  } else {
    const drop = S.bracketType === 'double' ? ` · ${loser} → Losers Bracket` : ` · ${loser} eliminated`;
    toast(`${winner} wins${drop}`);
  }
}

// ══════════════════════════════════════════════
//  PASSWORD MODAL
// ══════════════════════════════════════════════
let _afterUnlock = null;

function openPwModal(callback) {
  _afterUnlock = callback;
  document.getElementById('pw-input').value = '';
  document.getElementById('pw-error').style.display = 'none';
  document.getElementById('pw-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('pw-input')?.focus(), 80);
}

function closePwModal() {
  document.getElementById('pw-modal').style.display = 'none';
  _afterUnlock = null;
}

function submitPassword() {
  const val = document.getElementById('pw-input').value;
  if (val === S.password) {
    S.sessionUnlocked = true;
    document.getElementById('pw-error').style.display = 'none';
    closePwModal();
    updateLockBadge();
    toast('Unlocked for this session', 'success');
    if (_afterUnlock) { _afterUnlock(); _afterUnlock = null; }
  } else {
    document.getElementById('pw-error').style.display = 'block';
    document.getElementById('pw-input').value = '';
    document.getElementById('pw-input').focus();
  }
}

document.getElementById('pw-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitPassword();
});

// ══════════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════════
function showBracketScreen() {
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('bracket-screen').style.display = 'block';
  document.getElementById('bracket-title').textContent = S.tournamentName;
  document.getElementById('bracket-meta').textContent =
    `${S.teams.length} teams · Best of ${S.rounds} · ${S.bracketType === 'double' ? 'Double' : 'Single'} Elimination`;
  updateLockBadge();
  renderBracket();
}

function updateLockBadge() {
  const badge = document.getElementById('lock-badge');
  if (!S.locked) { badge.style.display = 'none'; return; }
  badge.style.display = 'inline-flex';
  if (S.sessionUnlocked) {
    badge.className = 'badge badge-unlocked';
    badge.textContent = '🔓 Editing';
  } else {
    badge.className = 'badge badge-locked';
    badge.textContent = '🔒 Locked';
  }
}

function renderBracket() {
  const el = document.getElementById('bracket-content');
  el.innerHTML = '';

  // ── Winners Bracket ──
  el.appendChild(sectionHeading('Winners Bracket', 'winners'));
  el.appendChild(renderColumns(S.winnersBracket, 'WR'));

  // ── Losers Bracket ──
  if (S.bracketType === 'double' && S.losersBracket.length > 0) {
    el.appendChild(sectionHeading('Losers Bracket', 'losers'));
    el.appendChild(renderColumns(S.losersBracket, 'LR'));
  }

  // ── Grand Final ──
  if (S.grandFinal) {
    el.appendChild(sectionHeading('Grand Final', 'grand'));
    const gfWrap = document.createElement('div');
    gfWrap.className = 'grand-finals-wrap';
    gfWrap.appendChild(buildMatchCard(S.grandFinal));
    el.appendChild(gfWrap);
  }

  // ── Champion ──
  if (S.champion) {
    const box = document.createElement('div');
    box.className = 'champion-box';
    box.innerHTML = `
      <div class="champion-trophy">🏆</div>
      <div class="champion-label">Tournament Champion</div>
      <div class="champion-name">${escHtml(S.champion)}</div>
    `;
    el.appendChild(box);
  }

  // ── Eliminated ──
  if (S.eliminated.length > 0) {
    const sec = document.createElement('div');
    sec.className = 'elim-section';
    sec.appendChild(sectionHeading('Eliminated', 'losers'));
    const list = document.createElement('div');
    list.className = 'elim-list';
    S.eliminated.forEach(t => {
      const d = document.createElement('div');
      d.className = 'elim-item';
      d.textContent = t;
      list.appendChild(d);
    });
    sec.appendChild(list);
    el.appendChild(sec);
  }
}

function renderColumns(rounds, prefix) {
  const scroll = document.createElement('div');
  scroll.className = 'bracket-scroll';
  const cols = document.createElement('div');
  cols.className = 'bracket-columns';

  rounds.forEach((round, ri) => {
    const col = document.createElement('div');
    col.className = 'round-col';

    let label;
    if (rounds.length === 1) label = 'Final';
    else if (ri === rounds.length - 1) label = 'Final';
    else if (ri === 0) label = 'Round 1';
    else label = `Round ${ri + 1}`;

    const labelEl = document.createElement('div');
    labelEl.className = 'round-col-label';
    labelEl.textContent = label;
    col.appendChild(labelEl);

    const matchesEl = document.createElement('div');
    matchesEl.className = 'round-matches';
    round.forEach(m => matchesEl.appendChild(buildMatchCard(m)));
    col.appendChild(matchesEl);
    cols.appendChild(col);
  });

  scroll.appendChild(cols);
  return scroll;
}

function buildMatchCard(match) {
  const card = document.createElement('div');
  const canClick = !match.completed && !match.bye && match.team1 && match.team2;
  card.className = `match-card${match.bye ? ' bye' : ''}${canClick ? ' clickable' : ''}`;
  if (canClick) card.onclick = () => openScoreModal(match);

  // ID row
  const idRow = document.createElement('div');
  idRow.className = 'match-id-row';
  idRow.textContent = match.id + (match.bye ? ' · BYE' : '');
  card.appendChild(idRow);

  // Team rows
  [1, 2].forEach(n => {
    const team  = n === 1 ? match.team1 : match.team2;
    const score = n === 1 ? match.score1 : match.score2;
    const isWin = match.completed && match.winner === team;
    const isLos = match.completed && match.loser === team;

    const row = document.createElement('div');
    row.className = `team-row${isWin ? ' winner' : ''}${isLos ? ' loser' : ''}`;

    const nameEl = document.createElement('div');
    nameEl.className = 'team-name' + (!team ? ' tbd' : '');
    nameEl.textContent = team || 'TBD';
    row.appendChild(nameEl);

    if (match.completed && !match.bye && score !== null) {
      const scoreEl = document.createElement('div');
      scoreEl.className = 'team-score';
      scoreEl.textContent = score;
      row.appendChild(scoreEl);
    }

    if (isWin) {
      const dot = document.createElement('div');
      dot.className = 'win-dot';
      row.appendChild(dot);
    } else {
      const dot = document.createElement('div');
      dot.className = 'empty-dot';
      row.appendChild(dot);
    }

    card.appendChild(row);
  });

  return card;
}

function sectionHeading(text, cls) {
  const h = document.createElement('div');
  h.className = `section-heading ${cls}`;
  h.textContent = text;
  return h;
}

// ══════════════════════════════════════════════
//  EXPORT / IMPORT
// ══════════════════════════════════════════════
function exportJSON() {
  const data = JSON.stringify(S, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${S.tournamentName.replace(/\s+/g, '_')}_bracket.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Bracket exported', 'success');
}

function importJSON() {
  if (S.locked && !S.sessionUnlocked) {
    openPwModal(importJSON);
    return;
  }
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json';
  inp.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        Object.assign(S, data);
        saveState();
        showBracketScreen();
        toast('Bracket imported', 'success');
      } catch(err) { toast('Invalid file', 'error'); }
    };
    reader.readAsText(file);
  };
  inp.click();
}

// ══════════════════════════════════════════════
//  RESET
// ══════════════════════════════════════════════
function resetToSetup() {
  if (!confirm('Start a new tournament? Current progress will be cleared.')) return;
  localStorage.removeItem(STORAGE_KEY);
  Object.assign(S, {
    teams: [], rounds: 1, bracketType: 'double',
    tournamentName: '', password: '', locked: false,
    sessionUnlocked: false, winnersBracket: [], losersBracket: [],
    grandFinal: null, eliminated: [], champion: null, matchCounter: 0,
  });
  document.getElementById('bracket-screen').style.display = 'none';
  document.getElementById('setup-screen').style.display = 'block';
  document.getElementById('tournament-name').value = '';
  document.getElementById('lock-password').value = '';
  renderTeamTags();
}

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
function state_rounds_max() { return S.rounds; }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let _toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show${type ? ' ' + type : ''}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// Close modals on overlay click
document.getElementById('score-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('score-modal')) closeModal();
});
document.getElementById('pw-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('pw-modal')) closePwModal();
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closePwModal(); }
  if (e.key === 'Enter' && document.getElementById('score-modal').style.display === 'flex') submitScore();
});
