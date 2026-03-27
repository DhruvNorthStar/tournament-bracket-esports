'use strict';

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
const T = {
  name:        '',
  teams:       [],   // string[]
  format:      1,    // 1 | 2 | 3  (best-of)
  type:        'single', // 'single' | 'double'
  password:    '',
  locked:      false,
  unlocked:    false,  // session unlock flag

  // bracket data
  wb:          [],   // winners bracket  [ round[], round[], ... ]
  lb:          [],   // losers bracket   [ round[], round[], ... ]
  gf:          null, // grand final match object
  eliminated:  [],   // string[]
  champion:    null, // string

  matchNum:    0,
};

const SAVE_KEY = 'tbracket_v2';

// ─────────────────────────────────────────────
//  PERSISTENCE
// ─────────────────────────────────────────────
function persist()     { try { localStorage.setItem(SAVE_KEY, JSON.stringify(T)); } catch(_){} }
function hydrate()     {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    Object.assign(T, JSON.parse(raw));
    return true;
  } catch(_){ return false; }
}

// ─────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if (hydrate() && T.wb.length) {
    openBracketScreen();
  } else {
    refreshTags();
  }
});

// ─────────────────────────────────────────────
//  SETUP HELPERS
// ─────────────────────────────────────────────
const SAMPLES = ['India','Australia','England','Pakistan','New Zealand','South Africa','Sri Lanka','West Indies'];

function loadSamples() {
  T.teams = [...SAMPLES];
  refreshTags();
}

function addTeam() {
  const inp  = $('team-input');
  const name = inp.value.trim();
  if (!name) return;
  if (T.teams.length >= 24)  { toast('Maximum 24 teams', 'warn'); return; }
  if (T.teams.find(t => t.toLowerCase() === name.toLowerCase())) {
    toast('Team already added', 'warn'); return;
  }
  T.teams.push(name);
  inp.value = '';
  refreshTags();
  inp.focus();
}

$('team-input').addEventListener('keydown', e => { if (e.key === 'Enter') addTeam(); });

function removeTeam(idx) {
  T.teams.splice(idx, 1);
  refreshTags();
}

function refreshTags() {
  const wrap = $('teams-list');
  wrap.innerHTML = T.teams.map((t, i) =>
    `<span class="tag">${esc(t)}<span class="tag-x" onclick="removeTeam(${i})">×</span></span>`
  ).join('');
  $('team-count-badge').textContent = `${T.teams.length} / 24`;
  $('team-hint').textContent = T.teams.length < 2
    ? 'Add at least 2 teams to begin.'
    : `${T.teams.length} teams added.`;
  $('start-btn').disabled = T.teams.length < 2;
}

function pickType(btn) {
  T.type = btn.dataset.value;
  $$('#type-group .opt-btn').forEach(b => b.classList.toggle('active', b === btn));
  $('type-desc').textContent = T.type === 'single'
    ? 'Every team plays each round. One loss = eliminated.'
    : 'Lose once → second chance in Losers Bracket. Lose twice → eliminated.';
}

function pickFormat(btn) {
  T.format = parseInt(btn.dataset.value);
  $$('#format-group .opt-btn').forEach(b => b.classList.toggle('active', b === btn));
}

// ─────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────
function startTournament() {
  T.name      = $('tournament-name').value.trim() || 'Tournament';
  T.password  = $('lock-password').value.trim();
  T.locked    = !!T.password;
  T.unlocked  = true;
  T.matchNum  = 0;
  T.wb        = [];
  T.lb        = [];
  T.gf        = null;
  T.eliminated= [];
  T.champion  = null;

  buildBracket();
  persist();
  openBracketScreen();
}

// ─────────────────────────────────────────────
//  BRACKET BUILDER
//
//  Core idea for SINGLE ELIM with N teams:
//    Round 1 → pair teams sequentially: (0 vs 1), (2 vs 3), ...
//    If odd team out → they get a BYE (auto-advance)
//    Round 2 → winners of R1 play each other: same pairing logic
//    Continue until 1 champion.
//
//  DOUBLE ELIM:
//    Winners bracket works identically to single elim.
//    Each round's losers drop into the losers bracket.
//    Losers bracket plays its own rounds.
//    LB final winner meets WB final winner in Grand Final.
// ─────────────────────────────────────────────

function newMatch(t1, t2, bracket) {
  T.matchNum++;
  const m = {
    id:    `M${String(T.matchNum).padStart(2,'0')}`,
    t1:    t1 ?? null,
    t2:    t2 ?? null,
    s1:    null,
    s2:    null,
    winner:null,
    loser: null,
    done:  false,
    bye:   false,
    bracket,   // 'wb' | 'lb' | 'gf'
  };
  // auto-handle byes
  if (m.t1 && !m.t2) { m.winner = m.t1; m.done = true; m.bye = true; }
  if (!m.t1 && m.t2) { m.winner = m.t2; m.done = true; m.bye = true; }
  if (!m.t1 && !m.t2){ m.done = true; m.bye = true; }
  return m;
}

function pairUp(teams, bracket) {
  const round = [];
  for (let i = 0; i < teams.length; i += 2) {
    round.push(newMatch(teams[i], teams[i+1] ?? null, bracket));
  }
  return round;
}

function buildBracket() {
  // shuffle teams for fair seeding
  const teams = shuffle([...T.teams]);

  // ── Winners Bracket Round 1 ──
  T.wb = [ pairUp(teams, 'wb') ];

  // advance all auto-completable rounds upfront
  advanceWB();

  if (T.type === 'double') {
    seedLB();
    advanceLB();
    checkGF();
  } else {
    checkChampSingle();
  }
}

// Keep generating next WB rounds as long as the last round is fully complete
function advanceWB() {
  for (;;) {
    const last = T.wb[T.wb.length - 1];
    if (last.length === 1) break;          // WB final done
    if (!last.every(m => m.done)) break;   // waiting for results
    const winners = last.map(m => m.winner).filter(Boolean);
    if (winners.length === 0) break;
    T.wb.push(pairUp(winners, 'wb'));
  }
}

// ── Losers Bracket ──
// Round structure:
//   LB R1: losers from WB R1 play each other
//   LB R2: LB R1 winners vs losers from WB R2  (cross-round feed)
//   LB R3: LB R2 winners play each other
//   ... alternates between "feed" rounds and "internal" rounds
function seedLB() {
  // We rebuild LB from scratch each time to keep it consistent
  // Collect losers per WB round
  const losersByWBRound = T.wb.map(round =>
    round.filter(m => m.done && m.loser).map(m => m.loser)
  );

  T.lb = [];

  // LB R1 — WB R1 losers vs each other
  const wbR1Losers = losersByWBRound[0] ?? [];
  if (wbR1Losers.length === 0) return;
  T.lb.push(pairUp(wbR1Losers, 'lb'));

  // For each subsequent WB round that has losers, we:
  //   1. Play an internal LB round (survivors vs survivors)
  //   2. Feed in new WB losers for the next LB round
  for (let wbRi = 1; wbRi < T.wb.length; wbRi++) {
    const newLosers = losersByWBRound[wbRi] ?? [];
    const lastLB    = T.lb[T.lb.length - 1];
    if (!lastLB) break;

    // If last LB round is complete, collect its survivors
    if (lastLB.every(m => m.done)) {
      const survivors = lastLB.map(m => m.winner).filter(Boolean);
      if (survivors.length === 0) break;

      if (newLosers.length > 0) {
        // Feed round: pair survivors with new WB losers
        const combined = interleave(survivors, newLosers);
        T.lb.push(pairUp(combined, 'lb'));
      } else if (survivors.length > 1) {
        // Internal round: survivors play each other
        T.lb.push(pairUp(survivors, 'lb'));
      }
    }
  }
}

// Keep advancing completed LB rounds into new LB rounds
function advanceLB() {
  for (;;) {
    const last = T.lb[T.lb.length - 1];
    if (!last) break;
    if (last.length === 1) break;          // LB final
    if (!last.every(m => m.done)) break;
    const winners = last.map(m => m.winner).filter(Boolean);
    if (winners.length <= 1) break;
    T.lb.push(pairUp(winners, 'lb'));
  }

  // Collect all losers from LB into eliminated list
  T.eliminated = [];
  T.lb.forEach(round => {
    round.forEach(m => {
      if (m.done && m.loser && !T.eliminated.includes(m.loser)) {
        T.eliminated.push(m.loser);
      }
    });
  });
  // Also eliminated = WB losers who are NOT in LB at all (if LB is empty or they never got seeded somehow)
  // That case doesn't arise in our logic but keep eliminated list accurate.
}

function checkGF() {
  if (T.gf) {
    if (T.gf.done) T.champion = T.gf.winner;
    return;
  }
  const lastWB = T.wb[T.wb.length - 1];
  const lastLB = T.lb[T.lb.length - 1];
  if (
    lastWB && lastWB.length === 1 && lastWB[0].done &&
    lastLB && lastLB.length === 1 && lastLB[0].done
  ) {
    T.gf = newMatch(lastWB[0].winner, lastLB[0].winner, 'gf');
  }
}

function checkChampSingle() {
  const last = T.wb[T.wb.length - 1];
  if (last && last.length === 1 && last[0].done) {
    T.champion = last[0].winner;
    // everyone except champion is eliminated
    T.eliminated = T.teams.filter(t => t !== T.champion);
  }
}

// ─────────────────────────────────────────────
//  SCORE ENTRY
// ─────────────────────────────────────────────
let _match = null;

function openScore(match) {
  if (!match || match.done || match.bye) return;
  if (!match.t1 || !match.t2) { toast('Waiting for both teams', 'warn'); return; }

  if (T.locked && !T.unlocked) {
    openPw(() => openScore(match));
    return;
  }

  _match = match;
  $('sm-title').textContent = `${match.id} — Enter Result`;

  // For Best of 2, winner = whoever won more games; can be 2-0 or 2-1 or 1-1 not allowed (one must win)
  const maxVal = T.format;
  $('sm-body').innerHTML = `
    <div class="sm-row">
      <div class="sm-name">${esc(match.t1)}</div>
      <input type="number" id="sc1" min="0" max="${maxVal}" value="0" />
    </div>
    <div class="vs-line">VS</div>
    <div class="sm-row">
      <div class="sm-name">${esc(match.t2)}</div>
      <input type="number" id="sc2" min="0" max="${maxVal}" value="0" />
    </div>
  `;

  let hint = `Best of ${T.format}`;
  if (T.format === 1) hint += ' — enter 1 for winner, 0 for loser';
  if (T.format === 2) hint += ' — enter wins each (2-0 or 2-1). Ties not allowed.';
  if (T.format === 3) hint += ' — first to 2 wins (e.g. 2-0 or 2-1)';
  if (T.type === 'double' && match.bracket === 'wb') hint += '. Loser → Losers Bracket.';
  $('sm-hint').textContent = hint;

  $('score-modal').style.display = 'flex';
  setTimeout(() => { const el = $('sc1'); if(el) el.focus(); }, 60);
}

function closeScore() {
  $('score-modal').style.display = 'none';
  _match = null;
}

function confirmScore() {
  if (!_match) return;
  const s1 = clamp(parseInt($('sc1').value) || 0, 0, T.format);
  const s2 = clamp(parseInt($('sc2').value) || 0, 0, T.format);

  // Validate: no ties
  if (s1 === s2) { toast('Scores cannot be equal — must have a winner', 'warn'); return; }

  // Validate: for BO1 must be 1-0
  if (T.format === 1 && (s1 + s2 !== 1)) {
    toast('Best of 1: enter 1 for winner and 0 for loser', 'warn'); return;
  }

  // Validate: for BO2 max wins = 2
  if (T.format === 2 && Math.max(s1, s2) !== 2) {
    toast('Best of 2: winner must have exactly 2 wins (2-0 or 2-1)', 'warn'); return;
  }

  // Validate: for BO3 winner needs at least 2 wins
  if (T.format === 3 && Math.max(s1, s2) < 2) {
    toast('Best of 3: winner needs at least 2 wins', 'warn'); return;
  }

  _match.s1     = s1;
  _match.s2     = s2;
  _match.winner = s1 > s2 ? _match.t1 : _match.t2;
  _match.loser  = s1 > s2 ? _match.t2 : _match.t1;
  _match.done   = true;

  const w = _match.winner, l = _match.loser, br = _match.bracket;
  closeScore();

  // Re-run bracket logic
  if (T.type === 'single') {
    if (!T.eliminated.includes(l)) T.eliminated.push(l);
    advanceWB();
    checkChampSingle();
  } else {
    advanceWB();
    seedLB();
    advanceLB();
    checkGF();
  }

  persist();
  renderBracket();

  if (T.champion)        toast(`🏆 ${T.champion} wins the tournament!`, 'ok');
  else if (br === 'gf')  toast(`${w} wins the Grand Final!`, 'ok');
  else if (br === 'lb')  toast(`${w} advances · ${l} is eliminated`, 'warn');
  else if (T.type === 'double') toast(`${w} wins · ${l} goes to Losers Bracket`);
  else                   toast(`${w} wins · ${l} eliminated`, 'warn');

  _match = null;
}

// ─────────────────────────────────────────────
//  PASSWORD
// ─────────────────────────────────────────────
let _afterPw = null;

function openPw(cb) {
  _afterPw = cb;
  $('pw-input').value = '';
  $('pw-err').style.display = 'none';
  $('pw-modal').style.display = 'flex';
  setTimeout(() => $('pw-input').focus(), 60);
}

function closePw() {
  $('pw-modal').style.display = 'none';
  _afterPw = null;
}

function submitPw() {
  if ($('pw-input').value === T.password) {
    T.unlocked = true;
    $('pw-err').style.display = 'none';
    closePw();
    updateLockBadge();
    toast('Unlocked for this session', 'ok');
    if (_afterPw) { _afterPw(); _afterPw = null; }
  } else {
    $('pw-err').style.display = 'block';
    $('pw-input').value = '';
    $('pw-input').focus();
  }
}

$('pw-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitPw(); });

// ─────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────
function openBracketScreen() {
  $('setup-screen').style.display = 'none';
  $('bracket-screen').style.display = 'block';
  $('b-title').textContent = T.name;
  $('b-meta').textContent  =
    `${T.teams.length} teams · Best of ${T.format} · ${T.type === 'double' ? 'Double' : 'Single'} Elimination`;
  updateLockBadge();
  renderBracket();
}

function updateLockBadge() {
  const b = $('lock-badge');
  if (!T.locked) { b.style.display = 'none'; return; }
  b.style.display = '';
  if (T.unlocked) { b.className = 'lock-badge unlocked'; b.textContent = '🔓 Editing'; }
  else            { b.className = 'lock-badge locked';   b.textContent = '🔒 Locked';  }
}

function renderBracket() {
  const root = $('bracket-root');
  root.innerHTML = '';

  // ── Winners Bracket ──
  root.appendChild(secLabel('Winners Bracket', 'blue'));
  root.appendChild(buildColumns(T.wb));

  // ── Losers Bracket ──
  if (T.type === 'double' && T.lb.length) {
    root.appendChild(secLabel('Losers Bracket', 'red'));
    root.appendChild(buildColumns(T.lb));
  }

  // ── Grand Final ──
  if (T.gf) {
    root.appendChild(secLabel('Grand Final', 'gold'));
    const gw = el('div', 'grand-wrap');
    gw.appendChild(buildCard(T.gf));
    root.appendChild(gw);
  }

  // ── Champion ──
  if (T.champion) {
    const box = el('div', 'champ-box');
    box.innerHTML = `
      <div class="champ-icon">🏆</div>
      <div class="champ-label">Tournament Champion</div>
      <div class="champ-name">${esc(T.champion)}</div>
    `;
    root.appendChild(box);
  }

  // ── Eliminated ──
  if (T.eliminated.length) {
    root.appendChild(secLabel('Eliminated', 'red'));
    const ew = el('div', 'elim-wrap');
    T.eliminated.forEach(t => {
      const d = el('span', 'elim-tag');
      d.textContent = t;
      ew.appendChild(d);
    });
    root.appendChild(ew);
  }
}

function buildColumns(rounds) {
  const scroll = el('div', 'bracket-scroll');
  const row    = el('div', 'round-row');

  rounds.forEach((round, ri) => {
    const col = el('div', 'round-col');

    // Round label
    let label;
    if (rounds.length === 1)         label = 'Final';
    else if (ri === rounds.length-1) label = 'Final';
    else if (ri === 0)               label = 'Round 1';
    else                             label = `Round ${ri + 1}`;

    const lbl = el('div', 'round-col-title');
    lbl.textContent = label;
    col.appendChild(lbl);

    const stack = el('div', 'matches-stack');
    round.forEach(m => stack.appendChild(buildCard(m)));
    col.appendChild(stack);
    row.appendChild(col);
  });

  scroll.appendChild(row);
  return scroll;
}

function buildCard(match) {
  const canClick = !match.done && !match.bye && match.t1 && match.t2;
  const card = el('div', 'match-card' + (match.bye ? ' is-bye' : '') + (canClick ? ' can-click' : ''));
  if (canClick) card.onclick = () => openScore(match);

  // meta row
  const meta = el('div', 'match-meta');
  meta.textContent = match.id + (match.bye ? ' · BYE' : '');
  card.appendChild(meta);

  [1, 2].forEach(n => {
    const team  = n === 1 ? match.t1 : match.t2;
    const score = n === 1 ? match.s1 : match.s2;
    const isW   = match.done && match.winner === team;
    const isL   = match.done && match.loser  === team;

    const row = el('div', 't-row' + (isW ? ' won' : '') + (isL ? ' lost' : ''));

    const name = el('div', 't-name' + (!team ? ' tbd' : ''));
    name.textContent = team || 'TBD';
    row.appendChild(name);

    if (match.done && !match.bye && score !== null) {
      const sc = el('div', 't-score');
      sc.textContent = score;
      row.appendChild(sc);
    }

    const dot = el('div', 't-dot' + (isW ? ' filled' : ''));
    row.appendChild(dot);

    card.appendChild(row);
  });

  return card;
}

function secLabel(text, cls) {
  const d = el('div', `sec-label ${cls}`);
  d.textContent = text;
  return d;
}

// ─────────────────────────────────────────────
//  EXPORT (human-readable match results)
// ─────────────────────────────────────────────
function doExport() {
  const lines = [];
  lines.push(`TOURNAMENT: ${T.name}`);
  lines.push(`Format: Best of ${T.format} | Type: ${T.type === 'double' ? 'Double' : 'Single'} Elimination`);
  lines.push(`Teams: ${T.teams.join(', ')}`);
  lines.push('');
  lines.push('── MATCH RESULTS ──');
  lines.push('');

  const writeRound = (rounds, label) => {
    rounds.forEach((round, ri) => {
      const rLabel = round.length === 1 ? `${label} Final` : `${label} Round ${ri + 1}`;
      lines.push(`[ ${rLabel} ]`);
      round.forEach(m => {
        if (m.bye) {
          lines.push(`  ${m.id}: ${m.winner} — BYE (auto-advance)`);
        } else if (m.done) {
          lines.push(`  ${m.id}: ${m.winner} beat ${m.loser}  (${m.s1} - ${m.s2})`);
        } else {
          const t1 = m.t1 || 'TBD', t2 = m.t2 || 'TBD';
          lines.push(`  ${m.id}: ${t1} vs ${t2}  — not played yet`);
        }
      });
      lines.push('');
    });
  };

  writeRound(T.wb, 'Winners Bracket');
  if (T.type === 'double' && T.lb.length) writeRound(T.lb, 'Losers Bracket');
  if (T.gf) {
    lines.push('[ Grand Final ]');
    if (T.gf.done) lines.push(`  ${T.gf.id}: ${T.gf.winner} beat ${T.gf.loser}  (${T.gf.s1} - ${T.gf.s2})`);
    else           lines.push(`  ${T.gf.id}: ${T.gf.t1} vs ${T.gf.t2}  — not played yet`);
    lines.push('');
  }

  if (T.champion) lines.push(`🏆 CHAMPION: ${T.champion}`);
  if (T.eliminated.length) lines.push(`Eliminated: ${T.eliminated.join(', ')}`);

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${T.name.replace(/\s+/g,'_')}_results.txt`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Results exported as .txt', 'ok');
}

// ─────────────────────────────────────────────
//  IMPORT (JSON state file)
// ─────────────────────────────────────────────
function doImport() {
  if (T.locked && !T.unlocked) { openPw(doImport); return; }
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,.txt';
  inp.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        Object.assign(T, data);
        persist();
        openBracketScreen();
        toast('Bracket imported', 'ok');
      } catch(_) { toast('Could not read file — must be a saved JSON bracket', 'err'); }
    };
    r.readAsText(f);
  };
  inp.click();
}

// Save raw JSON as well (for import)
function doExportJSON() {
  const blob = new Blob([JSON.stringify(T, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${T.name.replace(/\s+/g,'_')}_bracket.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
//  RESET
// ─────────────────────────────────────────────
function goBack() {
  if (!confirm('Start a new tournament? This will clear all current data.')) return;
  localStorage.removeItem(SAVE_KEY);
  Object.assign(T, {
    name:'', teams:[], format:1, type:'single',
    password:'', locked:false, unlocked:false,
    wb:[], lb:[], gf:null, eliminated:[], champion:null, matchNum:0,
  });
  $('bracket-screen').style.display = 'none';
  $('setup-screen').style.display   = 'block';
  $('tournament-name').value = '';
  $('lock-password').value   = '';

  // reset pills
  $$('#type-group .opt-btn').forEach((b,i) => b.classList.toggle('active', i===0));
  $$('#format-group .opt-btn').forEach((b,i) => b.classList.toggle('active', i===0));
  $('type-desc').textContent = 'Every team plays each round. One loss = eliminated.';

  refreshTags();
}

// ─────────────────────────────────────────────
//  KEYBOARD / OVERLAY CLOSE
// ─────────────────────────────────────────────
function overlayClick(e, id) { if (e.target.id === id) { closeScore(); closePw(); } }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeScore(); closePw(); }
  if (e.key === 'Enter' && $('score-modal').style.display === 'flex') confirmScore();
  if (e.key === 'Enter' && $('pw-modal').style.display === 'flex')    submitPw();
});

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────
function $(id)        { return document.getElementById(id); }
function $$(sel)      { return document.querySelectorAll(sel); }
function el(tag, cls) { const d = document.createElement(tag); if (cls) d.className = cls; return d; }
function esc(s)       { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function clamp(v,a,b) { return Math.min(b, Math.max(a, v)); }
function shuffle(a)   {
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
function interleave(a, b) {
  // pair a[0] vs b[0], a[1] vs b[1], etc.
  const out = [], len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== undefined) out.push(a[i]);
    if (b[i] !== undefined) out.push(b[i]);
  }
  return out;
}

let _tTimer;
function toast(msg, type='') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast show${type ? ' '+type : ''}`;
  clearTimeout(_tTimer);
  _tTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
