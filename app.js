'use strict';

// ─────────────────────────────────────────────────────────
//  STAGE RULES
//  The stage of a match is determined by its position in
//  the bracket — not by a user setting.
//
//  With up to 8 teams:
//    WB Round 1         → Starting Rounds (Swift Play, BO1, first to 5)
//    WB Round 2 (if 8t) → Starting Rounds (Swift Play, BO1, first to 5)
//    Semi-Finals        → second-to-last WB round (Standard, BO1, first to 13)
//    Finals             → last WB round OR Grand Final (Standard, BO3, first to 13)
//
//  In Double Elim:
//    LB rounds          → Starting Rounds until LB Final
//    LB Final           → Semi-Finals
//    Grand Final        → Finals (BO3)
// ─────────────────────────────────────────────────────────

const STAGE = {
  SWIFT:   'swift',    // Starting Rounds — Swift Play BO1 first to 5
  SEMI:    'semi',     // Semi-Finals     — Standard BO1 first to 13
  FINAL:   'final',   // Finals          — Standard BO3 first to 13
};

const STAGE_INFO = {
  [STAGE.SWIFT]: {
    label: 'Starting Round',
    pill:  'swift',
    mode:  'Swift Play',
    fmt:   'Best of 1',
    win:   'First to 5 rounds · Max 20 min',
    maps:  1,
  },
  [STAGE.SEMI]: {
    label: 'Semi-Final',
    pill:  'std-bo1',
    mode:  'Standard Mode',
    fmt:   'Best of 1',
    win:   'First to 13 rounds',
    maps:  1,
  },
  [STAGE.FINAL]: {
    label: 'Final',
    pill:  'std-bo3',
    mode:  'Standard Mode',
    fmt:   'Best of 3',
    win:   'First to 13 rounds per map',
    maps:  3,
  },
};

// ─────────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────────
const T = {
  name:       '',
  teams:      [],
  type:       'single',  // 'single' | 'double'
  password:   '',
  locked:     false,
  unlocked:   false,
  wb:         [],        // [ [match,...], ... ]
  lb:         [],
  gf:         null,
  eliminated: [],
  champion:   null,
  matchNum:   0,
  totalRounds: 0,        // total WB rounds (used for stage detection)
};

const KEY = 'val_bracket_v1';

// ─────────────────────────────────────────────────────────
//  PERSISTENCE
// ─────────────────────────────────────────────────────────
function save() { try { localStorage.setItem(KEY, JSON.stringify(T)); } catch(_){} }
function load() {
  try {
    const r = localStorage.getItem(KEY);
    if (!r) return false;
    Object.assign(T, JSON.parse(r));
    return true;
  } catch(_){ return false; }
}

// ─────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if (load() && T.wb.length) showBracket();
  else refreshTags();
});

// ─────────────────────────────────────────────────────────
//  SETUP
// ─────────────────────────────────────────────────────────
const SAMPLES = ['Sentinels','NRG','Cloud9','Team Liquid','LOUD','Fnatic','Paper Rex','Evil Geniuses'];

function loadSamples() { T.teams = [...SAMPLES]; refreshTags(); }

function addTeam() {
  const inp = $('team-inp');
  const v   = inp.value.trim();
  if (!v) return;
  if (T.teams.length >= 8)  { toast('Maximum 8 teams', 'warn'); return; }
  if (T.teams.find(t => t.toLowerCase() === v.toLowerCase())) { toast('Already added', 'warn'); return; }
  T.teams.push(v);
  inp.value = '';
  refreshTags();
  inp.focus();
}

$('team-inp').addEventListener('keydown', e => { if (e.key === 'Enter') addTeam(); });

function removeTeam(i) { T.teams.splice(i, 1); refreshTags(); }

function refreshTags() {
  $('tags').innerHTML = T.teams.map((t, i) =>
    `<span class="tag">${esc(t)}<span class="tag-x" onclick="removeTeam(${i})">×</span></span>`
  ).join('');
  $('team-badge').textContent = `${T.teams.length} / 8`;
  $('team-hint').textContent  = T.teams.length < 2 ? 'Add at least 2 teams.' : `${T.teams.length} teams added.`;
  $('start-btn').disabled     = T.teams.length < 2;
}

function pick(grpId, btn) {
  $$(('#' + grpId + ' .opt')).forEach(b => b.classList.toggle('active', b === btn));
  const v = btn.dataset.v;
  if (grpId === 'grp-type') {
    T.type = v;
    $('type-desc').textContent = v === 'single'
      ? 'One loss and the team is eliminated.'
      : 'Lose once → Losers Bracket (second chance). Lose twice → eliminated.';
  }
}

// ─────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────
function startTournament() {
  T.name      = $('t-name').value.trim() || 'Valorant Tournament';
  T.password  = $('t-pw').value.trim();
  T.locked    = !!T.password;
  T.unlocked  = true;
  T.matchNum  = 0;
  T.wb = []; T.lb = []; T.gf = null;
  T.eliminated = []; T.champion = null;

  buildBracket();
  save();
  showBracket();
}

// ─────────────────────────────────────────────────────────
//  BRACKET BUILDER
// ─────────────────────────────────────────────────────────
function newMatch(t1, t2, bracket) {
  T.matchNum++;
  const m = {
    id: `M${String(T.matchNum).padStart(2,'0')}`,
    t1: t1 ?? null, t2: t2 ?? null,
    // For BO1 matches: s1/s2 are round scores
    // For BO3 Finals: maps array [{s1,s2}, {s1,s2}, {s1,s2}]
    s1: null, s2: null,
    maps: null,       // filled for FINAL stage
    winner: null, loser: null,
    done: false, bye: false,
    bracket,          // 'wb'|'lb'|'gf'
    roundIndex: 0,    // set after bracket built
  };
  if (m.t1 && !m.t2) { m.winner = m.t1; m.done = true; m.bye = true; }
  if (!m.t1 && m.t2) { m.winner = m.t2; m.done = true; m.bye = true; }
  if (!m.t1 && !m.t2){ m.done = true; m.bye = true; }
  return m;
}

function pairUp(teams, bracket) {
  const r = [];
  for (let i = 0; i < teams.length; i += 2)
    r.push(newMatch(teams[i], teams[i+1] ?? null, bracket));
  return r;
}

function buildBracket() {
  const teams = shuffle([...T.teams]);
  T.wb = [pairUp(teams, 'wb')];
  advanceWB();
  // Store total WB rounds for stage detection
  T.totalRounds = T.wb.length;
  // Tag each match with its round index
  tagRounds();

  if (T.type === 'double') { seedLB(); advanceLB(); checkGF(); }
  else checkChampSingle();
}

function tagRounds() {
  T.wb.forEach((round, ri) => round.forEach(m => { m.roundIndex = ri; }));
  T.lb.forEach((round, ri) => round.forEach(m => { m.roundIndex = ri; }));
  if (T.gf) T.gf.roundIndex = 0;
}

function advanceWB() {
  for (;;) {
    const last = T.wb[T.wb.length - 1];
    if (last.length === 1) break;
    if (!last.every(m => m.done)) break;
    const winners = last.map(m => m.winner).filter(Boolean);
    if (!winners.length) break;
    T.wb.push(pairUp(winners, 'wb'));
  }
}

function seedLB() {
  const losersByWBRound = T.wb.map(r => r.filter(m => m.done && m.loser).map(m => m.loser));
  T.lb = [];
  const r1losers = losersByWBRound[0] ?? [];
  if (!r1losers.length) return;
  T.lb.push(pairUp(r1losers, 'lb'));

  for (let wbRi = 1; wbRi < T.wb.length; wbRi++) {
    const newLosers = losersByWBRound[wbRi] ?? [];
    const lastLB    = T.lb[T.lb.length - 1];
    if (!lastLB) break;
    if (lastLB.every(m => m.done)) {
      const survivors = lastLB.map(m => m.winner).filter(Boolean);
      if (!survivors.length) break;
      if (newLosers.length) T.lb.push(pairUp(interleave(survivors, newLosers), 'lb'));
      else if (survivors.length > 1) T.lb.push(pairUp(survivors, 'lb'));
    }
  }
}

function advanceLB() {
  for (;;) {
    const last = T.lb[T.lb.length - 1];
    if (!last || last.length === 1) break;
    if (!last.every(m => m.done)) break;
    const winners = last.map(m => m.winner).filter(Boolean);
    if (winners.length <= 1) break;
    T.lb.push(pairUp(winners, 'lb'));
  }
  // Collect eliminated from LB
  T.eliminated = [];
  T.lb.forEach(r => r.forEach(m => {
    if (m.done && m.loser && !T.eliminated.includes(m.loser)) T.eliminated.push(m.loser);
  }));
}

function checkGF() {
  if (T.gf) { if (T.gf.done) T.champion = T.gf.winner; return; }
  const lastWB = T.wb[T.wb.length - 1];
  const lastLB = T.lb[T.lb.length - 1];
  if (lastWB?.length === 1 && lastWB[0].done && lastLB?.length === 1 && lastLB[0].done) {
    T.gf = newMatch(lastWB[0].winner, lastLB[0].winner, 'gf');
    T.gf.roundIndex = 0;
  }
}

function checkChampSingle() {
  const last = T.wb[T.wb.length - 1];
  if (last?.length === 1 && last[0].done) {
    T.champion = last[0].winner;
    T.eliminated = T.teams.filter(t => t !== T.champion);
  }
}

// ─────────────────────────────────────────────────────────
//  STAGE DETECTION
//  Determines which Valorant stage rules apply to a match
// ─────────────────────────────────────────────────────────
function getStage(match) {
  const total = T.totalRounds || T.wb.length;

  if (match.bracket === 'gf') return STAGE.FINAL;

  if (match.bracket === 'wb') {
    const ri = match.roundIndex;
    // Last WB round = Finals
    if (ri === total - 1) return STAGE.FINAL;
    // Second to last WB round = Semi-Finals
    if (ri === total - 2) return STAGE.SEMI;
    // Everything else = Starting Rounds
    return STAGE.SWIFT;
  }

  if (match.bracket === 'lb') {
    const totalLB = T.lb.length;
    const ri = match.roundIndex;
    // Last LB round = Semi-Final
    if (ri === totalLB - 1) return STAGE.SEMI;
    return STAGE.SWIFT;
  }

  return STAGE.SWIFT;
}

// ─────────────────────────────────────────────────────────
//  SCORE MODAL
// ─────────────────────────────────────────────────────────
let _m = null;

function openScore(match) {
  if (!match || match.done || match.bye) return;
  if (!match.t1 || !match.t2) { toast('Waiting for both teams', 'warn'); return; }
  if (T.locked && !T.unlocked) { openPw(() => openScore(match)); return; }

  _m = match;
  const stage = getStage(match);
  const info  = STAGE_INFO[stage];

  $('sm-title').textContent = `${match.id} — Enter Result`;
  $('sm-stage').innerHTML   = `
    <strong>${info.label}</strong> &nbsp;·&nbsp; ${info.mode}<br>
    Format: ${info.fmt} &nbsp;·&nbsp; ${info.win}
  `;

  if (stage === STAGE.FINAL) {
    // BO3 — enter score for each map (up to 3)
    $('sm-body').innerHTML = `
      <div class="hint" style="margin-bottom:12px">Enter round score for each map played (first to 13). Leave Map 3 blank if not needed.</div>
      ${[1,2,3].map(n => `
        <div class="map-entry">
          <div class="map-label">Map ${n}${n===3?' (if needed)':''}</div>
          <div class="sm-row">
            <div class="sm-name">${esc(match.t1)}</div>
            <input type="number" id="m${n}s1" min="0" max="13" value="${n===3?'':0}" placeholder="${n===3?'-':'0'}" />
          </div>
          <div class="vs-line">VS</div>
          <div class="sm-row">
            <div class="sm-name">${esc(match.t2)}</div>
            <input type="number" id="m${n}s2" min="0" max="13" value="${n===3?'':0}" placeholder="${n===3?'-':'0'}" />
          </div>
        </div>
      `).join('')}
    `;
    $('sm-hint').textContent = 'Winner = team that wins 2 maps. First to 13 rounds wins each map.';
  } else {
    // BO1 — single score entry
    $('sm-body').innerHTML = `
      <div class="sm-row">
        <div class="sm-name">${esc(match.t1)}</div>
        <input type="number" id="s1" min="0" max="13" value="0" />
      </div>
      <div class="vs-line">VS</div>
      <div class="sm-row">
        <div class="sm-name">${esc(match.t2)}</div>
        <input type="number" id="s2" min="0" max="13" value="0" />
      </div>
    `;
    const winTo = stage === STAGE.SWIFT ? 5 : 13;
    $('sm-hint').textContent = `Enter round scores. Winner must reach ${winTo} rounds first.`;
  }

  $('score-modal').style.display = 'flex';
  setTimeout(() => { const el = stage === STAGE.FINAL ? $('m1s1') : $('s1'); if(el) el.focus(); }, 60);
}

function closeScore() { $('score-modal').style.display = 'none'; _m = null; }

function confirmScore() {
  if (!_m) return;
  const stage  = getStage(_m);
  const winTo  = stage === STAGE.SWIFT ? 5 : 13;

  if (stage === STAGE.FINAL) {
    // BO3 validation
    const maps = [
      { s1: iv('m1s1'), s2: iv('m1s2') },
      { s1: iv('m2s1'), s2: iv('m2s2') },
      { s1: iv('m3s1'), s2: iv('m3s2') },
    ];

    let w1 = 0, w2 = 0;
    const playedMaps = [];

    for (let i = 0; i < 3; i++) {
      const { s1, s2 } = maps[i];
      // Map 3 optional — skip if both blank/zero and already decided
      if (i === 2 && s1 === 0 && s2 === 0) break;
      if (s1 === s2) { toast(`Map ${i+1}: scores cannot be equal`, 'warn'); return; }
      if (Math.max(s1, s2) < winTo) { toast(`Map ${i+1}: winner must reach ${winTo} rounds`, 'warn'); return; }
      if (s1 > s2) w1++; else w2++;
      playedMaps.push({ s1, s2 });
      if (w1 === 2 || w2 === 2) break;
    }

    if (w1 !== 2 && w2 !== 2) { toast('No winner yet — enter map scores until someone wins 2 maps', 'warn'); return; }

    _m.maps   = playedMaps;
    _m.s1     = w1;   // maps won
    _m.s2     = w2;
    _m.winner = w1 > w2 ? _m.t1 : _m.t2;
    _m.loser  = w1 > w2 ? _m.t2 : _m.t1;
    _m.done   = true;

  } else {
    // BO1 validation
    const s1 = iv('s1'), s2 = iv('s2');
    if (s1 === s2) { toast('Scores cannot be equal', 'warn'); return; }
    if (Math.max(s1, s2) < winTo) { toast(`Winner must reach ${winTo} rounds`, 'warn'); return; }

    _m.s1     = s1; _m.s2 = s2;
    _m.winner = s1 > s2 ? _m.t1 : _m.t2;
    _m.loser  = s1 > s2 ? _m.t2 : _m.t1;
    _m.done   = true;
  }

  const w = _m.winner, l = _m.loser, br = _m.bracket;
  closeScore();

  // Advance bracket
  if (T.type === 'single') {
    if (l && !T.eliminated.includes(l)) T.eliminated.push(l);
    advanceWB(); tagRounds(); T.totalRounds = T.wb.length; checkChampSingle();
  } else {
    advanceWB(); tagRounds(); T.totalRounds = T.wb.length;
    seedLB(); advanceLB(); tagRounds(); checkGF();
  }

  save(); renderBracket();

  if (T.champion)       toast(`🏆 ${T.champion} wins the tournament!`, 'ok');
  else if (br === 'gf') toast(`${w} wins the Grand Final!`, 'ok');
  else if (br === 'lb') toast(`${w} advances · ${l} eliminated`, 'warn');
  else if (T.type === 'double') toast(`${w} wins · ${l} → Losers Bracket`);
  else toast(`${w} wins · ${l} eliminated`, 'warn');

  _m = null;
}

// ─────────────────────────────────────────────────────────
//  PASSWORD
// ─────────────────────────────────────────────────────────
let _afterPw = null;
function openPw(cb) {
  _afterPw = cb;
  $('pw-inp').value = '';
  $('pw-err').style.display = 'none';
  $('pw-modal').style.display = 'flex';
  setTimeout(() => $('pw-inp').focus(), 60);
}
function closePw() { $('pw-modal').style.display = 'none'; _afterPw = null; }
function submitPw() {
  if ($('pw-inp').value === T.password) {
    T.unlocked = true; closePw(); updateLockBadge();
    toast('Unlocked for this session', 'ok');
    if (_afterPw) { _afterPw(); _afterPw = null; }
  } else {
    $('pw-err').style.display = 'block';
    $('pw-inp').value = ''; $('pw-inp').focus();
  }
}
$('pw-inp').addEventListener('keydown', e => { if (e.key === 'Enter') submitPw(); });

// ─────────────────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────────────────
function showBracket() {
  $('setup-screen').style.display  = 'none';
  $('bracket-screen').style.display = 'block';
  $('b-name').textContent = T.name;
  $('b-meta').textContent =
    `${T.teams.length} teams · ${T.type === 'double' ? 'Double' : 'Single'} Elimination · Valorant ruleset`;
  updateLockBadge();
  renderBracket();
}

function updateLockBadge() {
  const b = $('lock-badge');
  if (!T.locked) { b.style.display = 'none'; return; }
  b.style.display = '';
  b.className = 'lbadge ' + (T.unlocked ? 'unlocked' : 'locked');
  b.textContent  = T.unlocked ? '🔓 Editing' : '🔒 Locked';
}

function renderBracket() {
  const root = $('bracket-root');
  root.innerHTML = '';

  root.appendChild(secEl('Winners Bracket', 'red'));
  root.appendChild(buildCols(T.wb));

  if (T.type === 'double' && T.lb.length) {
    root.appendChild(secEl('Losers Bracket', 'blue'));
    root.appendChild(buildCols(T.lb));
  }

  if (T.gf) {
    root.appendChild(secEl('Grand Final', 'gold'));
    const gw = mk('div', 'gf-wrap');
    gw.appendChild(buildCard(T.gf));
    root.appendChild(gw);
  }

  if (T.champion) {
    const box = mk('div', 'champ');
    box.innerHTML = `
      <div class="champ-icon">🏆</div>
      <div class="champ-lbl">Tournament Champion</div>
      <div class="champ-name">${esc(T.champion)}</div>
    `;
    root.appendChild(box);
  }

  if (T.eliminated.length) {
    root.appendChild(secEl('Eliminated', 'red'));
    const ew = mk('div', 'elim-wrap');
    T.eliminated.forEach(t => {
      const d = mk('span', 'elim-tag'); d.textContent = t; ew.appendChild(d);
    });
    root.appendChild(ew);
  }
}

function buildCols(rounds) {
  const scroll = mk('div', 'bracket-scroll');
  const row    = mk('div', 'round-row');
  const total  = rounds.length;

  rounds.forEach((round, ri) => {
    const col = mk('div', 'rcol');
    let label;
    if (total === 1)        label = 'Final';
    else if (ri === total-1) label = 'Final';
    else if (ri === 0)       label = 'Round 1';
    else                     label = `Round ${ri+1}`;

    const lbl = mk('div', 'rcol-title'); lbl.textContent = label; col.appendChild(lbl);
    const stack = mk('div', 'mstack');
    round.forEach(m => stack.appendChild(buildCard(m)));
    col.appendChild(stack);
    row.appendChild(col);
  });

  scroll.appendChild(row);
  return scroll;
}

function buildCard(match) {
  const canClick = !match.done && !match.bye && match.t1 && match.t2;
  const card = mk('div', 'mcard' + (match.bye ? ' bye' : '') + (canClick ? ' clickable' : ''));
  if (canClick) card.onclick = () => openScore(match);

  // Top row: match ID + stage pill
  const top = mk('div', 'mcard-top');
  const idEl = mk('span', 'mcard-id'); idEl.textContent = match.id + (match.bye ? ' · BYE' : '');
  top.appendChild(idEl);

  if (!match.bye) {
    const stage = getStage(match);
    const info  = STAGE_INFO[stage];
    const pill  = mk('span', `stage-pill ${info.pill}`);
    pill.textContent = info.label;
    top.appendChild(pill);
  }
  card.appendChild(top);

  // For BO3 finals that are done — show map scores
  const isBO3Done = match.done && !match.bye && match.maps && match.maps.length > 0;

  if (isBO3Done) {
    // Show maps won as score + breakdown
    [1, 2].forEach(n => {
      const team  = n === 1 ? match.t1 : match.t2;
      const maps  = n === 1 ? match.s1 : match.s2;
      const isW   = match.winner === team;
      const isL   = match.loser  === team;
      const row   = mk('div', 'trow' + (isW ? ' won' : '') + (isL ? ' lost' : ''));
      const nm    = mk('div', 'tname'); nm.textContent = team; row.appendChild(nm);
      const sc    = mk('div', 'tscore'); sc.textContent = `${maps} map${maps!==1?'s':''}`; row.appendChild(sc);
      const dot   = mk('div', 'tdot' + (isW ? ' on' : '')); row.appendChild(dot);
      card.appendChild(row);
    });
    // Map breakdown
    const breakdown = mk('div', '');
    breakdown.style.cssText = 'padding:4px 10px 6px;font-size:10px;color:#5a6478;border-top:1px solid rgba(255,255,255,0.04)';
    breakdown.textContent = match.maps.map((mp, i) => {
      const w = mp.s1 > mp.s2 ? match.t1 : match.t2;
      return `Map${i+1}: ${mp.s1}-${mp.s2}`;
    }).join('  ·  ');
    card.appendChild(breakdown);
  } else {
    [1, 2].forEach(n => {
      const team  = n === 1 ? match.t1 : match.t2;
      const score = n === 1 ? match.s1 : match.s2;
      const isW   = match.done && match.winner === team;
      const isL   = match.done && match.loser  === team;
      const row   = mk('div', 'trow' + (isW ? ' won' : '') + (isL ? ' lost' : ''));
      const nm    = mk('div', 'tname' + (!team ? ' tbd' : '')); nm.textContent = team || 'TBD'; row.appendChild(nm);
      if (match.done && !match.bye && score !== null) {
        const sc = mk('div', 'tscore'); sc.textContent = score; row.appendChild(sc);
      }
      const dot = mk('div', 'tdot' + (isW ? ' on' : '')); row.appendChild(dot);
      card.appendChild(row);
    });
  }

  return card;
}

function secEl(text, cls) {
  const d = mk('div', `sec ${cls}`); d.textContent = text; return d;
}

// ─────────────────────────────────────────────────────────
//  EXPORT — human readable results
// ─────────────────────────────────────────────────────────
function doExport() {
  const lines = [];
  const line  = s => lines.push(s);
  const divider = () => line('─'.repeat(52));

  line(`VALORANT TOURNAMENT RESULTS`);
  line(`Tournament : ${T.name}`);
  line(`Format     : ${T.type === 'double' ? 'Double' : 'Single'} Elimination`);
  line(`Teams      : ${T.teams.join(', ')}`);
  divider();
  line('');
  line('MATCH RESULTS');
  line('');

  const writeRounds = (rounds, section) => {
    const total = rounds.length;
    rounds.forEach((round, ri) => {
      // Determine stage label for this round
      // Use first match of round for stage detection
      const sampleMatch = round[0];
      let stageLabel = '';
      if (sampleMatch) {
        const st = getStage(sampleMatch);
        stageLabel = ` [${STAGE_INFO[st].label} — ${STAGE_INFO[st].mode}, ${STAGE_INFO[st].fmt}]`;
      }

      let roundName;
      if (total === 1)         roundName = `${section} Final`;
      else if (ri === total-1) roundName = `${section} Final`;
      else if (ri === 0)       roundName = `${section} Round 1`;
      else                     roundName = `${section} Round ${ri+1}`;

      line(`[ ${roundName}${stageLabel} ]`);

      round.forEach(m => {
        if (m.bye) {
          line(`  ${m.id}: ${m.winner} — BYE (auto-advance)`);
        } else if (m.done) {
          const stage = getStage(m);
          if (stage === STAGE.FINAL && m.maps) {
            line(`  ${m.id}: ${m.winner} def. ${m.loser}  (${m.s1}-${m.s2} maps)`);
            m.maps.forEach((mp, i) => {
              const mw = mp.s1 > mp.s2 ? m.t1 : m.t2;
              line(`         Map ${i+1}: ${mp.s1} - ${mp.s2}  (${mw} wins)`);
            });
          } else {
            line(`  ${m.id}: ${m.winner} def. ${m.loser}  (${m.s1} - ${m.s2} rounds)`);
          }
        } else {
          line(`  ${m.id}: ${m.t1||'TBD'} vs ${m.t2||'TBD'}  — not played yet`);
        }
      });
      line('');
    });
  };

  writeRounds(T.wb, 'Winners Bracket');

  if (T.type === 'double' && T.lb.length) {
    writeRounds(T.lb, 'Losers Bracket');
  }

  if (T.gf) {
    const info = STAGE_INFO[STAGE.FINAL];
    line(`[ Grand Final — ${info.mode}, ${info.fmt} ]`);
    if (T.gf.done && T.gf.maps) {
      line(`  ${T.gf.id}: ${T.gf.winner} def. ${T.gf.loser}  (${T.gf.s1}-${T.gf.s2} maps)`);
      T.gf.maps.forEach((mp, i) => {
        const mw = mp.s1 > mp.s2 ? T.gf.t1 : T.gf.t2;
        line(`         Map ${i+1}: ${mp.s1} - ${mp.s2}  (${mw} wins)`);
      });
    } else if (T.gf.done) {
      line(`  ${T.gf.id}: ${T.gf.winner} def. ${T.gf.loser}`);
    } else {
      line(`  ${T.gf.id}: ${T.gf.t1} vs ${T.gf.t2}  — not played yet`);
    }
    line('');
  }

  divider();
  if (T.champion) line(`🏆  CHAMPION: ${T.champion}`);
  if (T.eliminated.length) {
    line('');
    line(`Eliminated (in order): ${T.eliminated.join(', ')}`);
  }

  // Final standings
  if (T.champion) {
    line('');
    line('FINAL STANDINGS');
    line(`  1st: ${T.champion}`);
    const rev = [...T.eliminated].reverse();
    rev.forEach((t, i) => line(`  ${i+2}${ordinal(i+2)}: ${t}`));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${T.name.replace(/\s+/g,'_')}_results.txt`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Results exported', 'ok');
}

// ─────────────────────────────────────────────────────────
//  RESET
// ─────────────────────────────────────────────────────────
function goNew() {
  if (!confirm('Start a new tournament? Current data will be cleared.')) return;
  localStorage.removeItem(KEY);
  Object.assign(T, {
    name:'', teams:[], type:'single', password:'', locked:false, unlocked:false,
    wb:[], lb:[], gf:null, eliminated:[], champion:null, matchNum:0, totalRounds:0,
  });
  $('bracket-screen').style.display = 'none';
  $('setup-screen').style.display   = 'block';
  $('t-name').value = ''; $('t-pw').value = '';
  $$('#grp-type .opt').forEach((b,i) => b.classList.toggle('active', i===0));
  $('type-desc').textContent = 'One loss and the team is eliminated.';
  refreshTags();
}

// ─────────────────────────────────────────────────────────
//  KEYBOARD / OVERLAY
// ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeScore(); closePw(); }
  if (e.key === 'Enter' && $('score-modal').style.display === 'flex') confirmScore();
  if (e.key === 'Enter' && $('pw-modal').style.display   === 'flex') submitPw();
});
$('score-modal').addEventListener('click', e => { if (e.target === $('score-modal')) closeScore(); });
$('pw-modal').addEventListener('click',   e => { if (e.target === $('pw-modal'))    closePw(); });

// ─────────────────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────────────────
function $(id)         { return document.getElementById(id); }
function $$(sel)       { return document.querySelectorAll(sel); }
function mk(tag, cls)  { const d = document.createElement(tag); if(cls) d.className = cls; return d; }
function esc(s)        { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function iv(id)        { return parseInt($(id)?.value) || 0; }
function clamp(v,a,b)  { return Math.min(b, Math.max(a, v)); }
function shuffle(a)    { for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a; }
function interleave(a,b){ const out=[],len=Math.max(a.length,b.length); for(let i=0;i<len;i++){if(a[i]!==undefined)out.push(a[i]);if(b[i]!==undefined)out.push(b[i]);}return out; }
function ordinal(n)    { const s=['th','st','nd','rd'],v=n%100; return (s[(v-20)%10]||s[v]||s[0]); }

let _tt;
function toast(msg, type='') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast show${type?' '+type:''}`;
  clearTimeout(_tt);
  _tt = setTimeout(() => el.classList.remove('show'), 3200);
}
