/* Household Budget — 100% client-side. No network, no accounts, no tracking.
   All data lives in localStorage on this device only. */
(() => {
'use strict';

const LS_KEY = 'household-budget-v1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- money helpers ---------- */
const fmt = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const fmt0 = n => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

/* ---------- categories ---------- */
const CATS = [
  {name: 'Groceries',      color: '#59d98a'},
  {name: 'Dining',         color: '#f2c14e'},
  {name: 'Gas',            color: '#ff9f45'},
  {name: 'Shopping',       color: '#a970ff'},
  {name: 'Utilities',      color: '#35d0ba'},
  {name: 'Rent/Mortgage',  color: '#6d8cff'},
  {name: 'Subscriptions',  color: '#ff6ad5'},
  {name: 'Health',         color: '#ff6a8a'},
  {name: 'Entertainment',  color: '#c792ea'},
  {name: 'Transport',      color: '#4fc3f7'},
  {name: 'Kids',           color: '#ffd166'},
  {name: 'Pets',           color: '#b5e48c'},
  {name: 'Fees',           color: '#e07a5f'},
  {name: 'Income',         color: '#2ec4b6'},
  {name: 'Transfer/Payment', color: '#8a86a8'},
  {name: 'Uncategorized',  color: '#7a72a6'},
];
const catColor = name => (CATS.find(c => c.name === name) || {}).color || '#7a72a6';
// categories that are NOT counted as spending
const NON_SPEND = new Set(['Income', 'Transfer/Payment']);

const DEFAULT_RULES = [
  ['Groceries', ['walmart','wal-mart','kroger','h-e-b','heb ','aldi','trader joe','whole foods','safeway','publix','costco','sam\'s club','sams club','grocery','sprouts','food lion','winco','meijer','wegmans','market street','brookshire']],
  ['Dining', ['restaurant','mcdonald','starbucks','chipotle','taco','pizza','doordash','uber eats','ubereats','grubhub','chick-fil','chick fil','sonic','wendy','burger','cafe','coffee','panera','subway','dunkin','domino','whataburger','raising cane','cane\'s','ihop','denny','olive garden','cheesecake','buffalo wild','five guys','jack in the box','dairy queen','popeye','kfc','little caesar','jimmy john','jersey mike','pei wei','panda express','freddy']],
  ['Gas', ['shell','exxon','chevron','valero','quiktrip','quik trip',' qt ','buc-ee','buccee','circle k','7-eleven','7 eleven','murphy','conoco','phillips 66','texaco','sunoco','racetrac','fuel','marathon petro','love\'s','pilot ','speedway']],
  ['Utilities', ['electric','water dept','water util','waste manage','at&t','att ','verizon','t-mobile','tmobile','comcast','xfinity','spectrum','cox comm','centerpoint','oncor','reliant','txu','energy','gas utility','sewer','trash','internet','frontier','google fib']],
  ['Rent/Mortgage', ['rent','mortgage','apartment','property mgmt','realty','leasing','hoa ','landlord','loancare','mr cooper','rocket mort']],
  ['Subscriptions', ['netflix','spotify','hulu','disney+','disney plus','amazon prime','prime video','youtube','apple.com/bill','apple.com','google *','hbo','max.com','patreon','audible','icloud','dropbox','adobe','microsoft','onedrive','peacock','paramount+','sirius','nyt','ny times','openai','anthropic','chatgpt']],
  ['Shopping', ['amazon','amzn','target','best buy','ebay','etsy','home depot','lowe\'s','lowes','ikea','wayfair','macy','nordstrom','kohl','ross ','tj maxx','tjmaxx','marshalls','old navy','gap ','nike','adidas','dick\'s sport','academy','michaels','hobby lobby','five below','dollar tree','dollar general','family dollar','bath & body','ulta','sephora','shein','temu','wish.com']],
  ['Health', ['pharmacy','cvs','walgreens','doctor','medical','dental','clinic','hospital','urgent care','optometr','vision','labcorp','quest diag','copay','health','wellmed','goodrx','fitness','gym','planet fit','lifetime','peloton']],
  ['Entertainment', ['cinema','movie','amc ','regal','steam games','steampowered','playstation','xbox','nintendo','ticketmaster','stubhub','fandango','epic games','twitch','concert','museum','zoo ','theme park','six flags','arcade','bowling','golf','dave & buster']],
  ['Transport', ['uber','lyft','parking','toll','turnpike','ntta','txtag','ez tag','transit','metro','amtrak','airline','southwest air','american air','delta air','united air','frontier air','spirit air','airport','rental car','enterprise rent','hertz','avis']],
  ['Kids', ['daycare','preschool','kindercare','school','tuition','children','toys r','carter','babies','diaper','pediatric','kids ']],
  ['Pets', ['petco','petsmart','chewy','veterinar',' vet ','animal hosp','pet supply','dog ','cat food']],
  ['Fees', ['overdraft','nsf fee','service charge','service fee','interest charge','late fee','atm fee','foreign trans','annual fee','finance charge','maintenance fee']],
  ['Income', ['payroll','direct deposit','dir dep','salary','deposit','refund','irs treas','tax ref','interest paid','interest earned','cashback bonus','cash back bonus','reward','dividend','venmo cashout']],
  ['Transfer/Payment', ['payment thank','payment - thank','autopay','online payment','automatic payment','internetpayment','e-payment','epayment','transfer','xfer','zelle','venmo payment','cash app','paypal transfer','withdrawal','atm withdrawal','bill pay','billpay','pymt','directpay','card payment','pymnt']],
];

/* ---------- default accounts (from the user's setup) ---------- */
function defaultAccounts() {
  return [
    {id: 'a_prosperity', name: 'Prosperity Bank', owner: 'Joint',  type: 'checking', color: '#35d0ba', emoji: '🏦'},
    {id: 'a_discover',   name: 'Discover Card',   owner: 'Josiah', type: 'credit',   color: '#ff9f45', emoji: '💳'},
    {id: 'a_boa',        name: 'Bank of America', owner: 'Spouse', type: 'credit',   color: '#ff6a8a', emoji: '💳'},
  ];
}

/* ---------- state ---------- */
let state = load();
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
    if (raw && raw.accounts) return raw;
  } catch (e) {}
  return {version: 1, accounts: defaultAccounts(), transactions: [], budgets: {}, rules: [], seenHashes: []};
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save — storage may be full.'); }
}

/* ---------- categorization ---------- */
function categorize(desc) {
  const d = (' ' + desc + ' ').toLowerCase();
  // user rules first (highest priority)
  for (const r of state.rules) {
    if (r.match && d.includes(r.match.toLowerCase())) return r.category;
  }
  for (const [cat, keys] of DEFAULT_RULES) {
    for (const k of keys) if (d.includes(k)) return cat;
  }
  return 'Uncategorized';
}

/* ---------- CSV parsing ---------- */
function parseCSV(text) {
  text = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/* Guess which columns hold date / description / amount (or debit/credit). */
function guessMapping(header) {
  const h = header.map(x => x.trim().toLowerCase());
  const find = (...names) => {
    for (const n of names) { const i = h.findIndex(x => x === n); if (i >= 0) return i; }
    for (const n of names) { const i = h.findIndex(x => x.includes(n)); if (i >= 0) return i; }
    return -1;
  };
  return {
    date: find('transaction date', 'trans. date', 'trans date', 'posting date', 'posted date', 'post date', 'date'),
    desc: find('description', 'payee', 'merchant', 'name', 'memo', 'details', 'transaction'),
    amount: find('amount', 'transaction amount'),
    debit: find('debit', 'withdrawal', 'money out'),
    credit: find('credit', 'deposit', 'money in'),
  };
}

function parseAmountCell(s) {
  if (s == null) return NaN;
  let t = String(s).trim();
  if (!t) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }         // (12.34) => negative
  t = t.replace(/[$,\s]/g, '');
  if (t.startsWith('-')) { neg = true; t = t.slice(1); }
  if (t.endsWith('-')) { neg = true; t = t.slice(0, -1); }            // trailing minus
  const v = parseFloat(t);
  if (isNaN(v)) return NaN;
  return neg ? -v : v;
}

function parseDateCell(s) {
  if (!s) return null;
  const t = String(s).trim();
  let m;
  if ((m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/))) {        // US M/D/Y
    let y = m[3]; if (y.length === 2) y = (+y > 70 ? '19' : '20') + y;
    return `${y}-${pad(m[1])}-${pad(m[2])}`;
  }
  const d = new Date(t);
  if (!isNaN(d)) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return null;
}
const pad = n => String(n).padStart(2, '0');

/* Build normalized rows from parsed CSV + mapping + sign setting.
   spendPositive=true means: in this file a purchase shows as a POSITIVE number
   (Discover-style). We flip it so internally negative = money out. */
function buildRows(rows, map, spendPositive) {
  const start = looksLikeHeader(rows[0], map) ? 1 : 0;
  const out = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDateCell(r[map.date]);
    const desc = (r[map.desc] || '').trim().replace(/\s+/g, ' ');
    let amt = NaN;
    if (map.amount >= 0 && r[map.amount] != null && r[map.amount].trim() !== '') {
      amt = parseAmountCell(r[map.amount]);
      if (spendPositive && !isNaN(amt)) amt = -amt;
    } else {
      const deb = map.debit >= 0 ? parseAmountCell(r[map.debit]) : NaN;
      const cred = map.credit >= 0 ? parseAmountCell(r[map.credit]) : NaN;
      if (!isNaN(deb) && deb !== 0) amt = -Math.abs(deb);
      else if (!isNaN(cred) && cred !== 0) amt = Math.abs(cred);
    }
    if (!date || isNaN(amt) || !desc) continue;
    out.push({date, desc, amount: round2(amt)});
  }
  return out;
}
function looksLikeHeader(row, map) {
  const cell = row[map.date] || row[map.amount] || '';
  return parseDateCell(cell) == null; // if the "date" column of row0 isn't a date, it's a header
}

/* Auto-detect sign convention: a statement always has more spending rows than
   income/payment rows, so the dominant sign in a single amount column is the
   spending sign. Discover lists purchases as +, Bank of America as −. Returns
   true when purchases appear as POSITIVE numbers (so we should flip them). */
function guessSpendPositive(rows, map) {
  if (map.amount < 0) return false; // debit/credit split — sign is explicit
  const start = looksLikeHeader(rows[0], map) ? 1 : 0;
  let pos = 0, neg = 0;
  for (let i = start; i < rows.length; i++) {
    const v = parseAmountCell(rows[i][map.amount]);
    if (isNaN(v) || v === 0) continue;
    if (v > 0) pos++; else neg++;
  }
  return pos > neg;
}

function hashTx(accId, date, desc, amount) {
  return `${accId}|${date}|${desc.toLowerCase().slice(0, 40)}|${amount.toFixed(2)}`;
}

/* ---------- import commit ---------- */
function commitImport(accId, normRows) {
  const seen = new Set(state.seenHashes);
  let added = 0, dup = 0;
  for (const nr of normRows) {
    const hash = hashTx(accId, nr.date, nr.desc, nr.amount);
    if (seen.has(hash)) { dup++; continue; }
    seen.add(hash);
    state.transactions.push({
      id: 't_' + hash.length + '_' + state.transactions.length + '_' + Math.abs(hashCode(hash)),
      accountId: accId, date: nr.date, description: nr.desc,
      amount: nr.amount, category: categorize(nr.desc), hash,
    });
    added++;
  }
  state.seenHashes = [...seen];
  save();
  return {added, dup};
}
function hashCode(s){let h=0;for(let i=0;i<s.length;i++){h=(h<<5)-h+s.charCodeAt(i)|0;}return h;}

/* ---------- month helpers ---------- */
const monthOf = t => t.date.slice(0, 7);
function allMonths() {
  const set = new Set(state.transactions.map(monthOf));
  return [...set].sort().reverse();
}
function monthLabel(m) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  return new Date(+y, +mo - 1, 1).toLocaleString('en-US', {month: 'long', year: 'numeric'});
}
let curMonth = null;

/* ---------- aggregation ---------- */
function txForMonth(m) { return state.transactions.filter(t => monthOf(t) === m); }
function isSpend(t) { return t.amount < 0 && !NON_SPEND.has(t.category); }
function isIncome(t) { return t.amount > 0 && t.category === 'Income'; }

function summary(txs) {
  let spend = 0, income = 0;
  const byCat = {}, byAcc = {}, byOwner = {};
  for (const t of txs) {
    if (isSpend(t)) {
      const s = -t.amount;
      spend += s;
      byCat[t.category] = (byCat[t.category] || 0) + s;
      byAcc[t.accountId] = (byAcc[t.accountId] || 0) + s;
      const o = ownerOf(t.accountId);
      byOwner[o] = (byOwner[o] || 0) + s;
    } else if (isIncome(t)) income += t.amount;
  }
  return {spend: round2(spend), income: round2(income), byCat, byAcc, byOwner};
}
function ownerOf(accId) { const a = state.accounts.find(x => x.id === accId); return a ? a.owner : '—'; }
function accById(id) { return state.accounts.find(a => a.id === id) || {name: 'Unknown', color: '#777', emoji: '?'}; }

/* ---------- rendering ---------- */
const app = $('#app');
let view = 'overview';
let txFilter = {acc: 'all', cat: 'all', q: ''};

function render() {
  $$('#tabbar .tab').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  buildMonthSelect();
  if (view === 'overview') renderOverview();
  else if (view === 'tx') renderTx();
  else if (view === 'import') renderImport();
  else if (view === 'budget') renderBudget();
  else if (view === 'settings') renderSettings();
  app.scrollTop = 0; window.scrollTo(0, 0);
}

function buildMonthSelect() {
  const sel = $('#monthSelect');
  const months = allMonths();
  if (!months.length) { sel.innerHTML = '<option>—</option>'; sel.disabled = true; return; }
  sel.disabled = false;
  if (!curMonth || !months.includes(curMonth)) curMonth = months[0];
  sel.innerHTML = months.map(m => `<option value="${m}" ${m === curMonth ? 'selected' : ''}>${esc(monthLabel(m))}</option>`).join('');
}

/* ----- Overview ----- */
function renderOverview() {
  if (!state.transactions.length) return emptyState();
  const txs = txForMonth(curMonth);
  const s = summary(txs);
  const net = round2(s.income - s.spend);
  const budgetTotal = round2(Object.values(state.budgets).reduce((a, b) => a + (+b || 0), 0));

  let html = `<div class="view">`;
  html += `<div class="stats">
    <div class="stat"><div class="lab">Spent</div><div class="val neg">${fmt0(s.spend)}</div></div>
    <div class="stat"><div class="lab">Income</div><div class="val pos">${fmt0(s.income)}</div></div>
    <div class="stat"><div class="lab">Net</div><div class="val ${net >= 0 ? 'pos' : 'neg'}">${fmt0(net)}</div></div>
    <div class="stat"><div class="lab">Budget left</div><div class="val ${budgetTotal - s.spend >= 0 ? 'pos' : 'neg'}">${budgetTotal ? fmt0(budgetTotal - s.spend) : '—'}</div></div>
  </div>`;

  // donut by category
  const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
  if (cats.length) {
    html += `<div class="card"><h3>Where the money went</h3>${donut(cats, s.spend)}</div>`;
  }

  // by person
  const owners = Object.entries(s.byOwner).sort((a, b) => b[1] - a[1]);
  if (owners.length) {
    html += `<div class="card"><h3>By person</h3>`;
    for (const [o, amt] of owners) {
      const pct = s.spend ? (amt / s.spend * 100) : 0;
      html += `<div class="cat-row" style="border:0;padding:8px 0">
        <div class="cat-name">${esc(o)}</div><div class="cat-amt">${fmt(amt)}</div></div>
        <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div class="mini">${pct.toFixed(0)}% of spending</div>`;
    }
    html += `</div>`;
  }

  // by account
  html += `<div class="card"><h3>By account</h3>`;
  for (const a of state.accounts) {
    const amt = s.byAcc[a.id] || 0;
    html += `<div class="cat-row">
      <span class="cat-dot" style="background:${a.color}"></span>
      <div class="cat-name">${esc(a.name)} <span class="faint">· ${esc(a.owner)}</span></div>
      <div class="cat-amt">${fmt(amt)}</div></div>`;
  }
  html += `</div></div>`;
  app.innerHTML = html;
}

function donut(cats, total) {
  const R = 54, C = 2 * Math.PI * R, cx = 66, cy = 66;
  let off = 0, segs = '';
  for (const [cat, amt] of cats) {
    const frac = total ? amt / total : 0;
    const len = frac * C;
    segs += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${catColor(cat)}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"></circle>`;
    off += len;
  }
  const legend = cats.map(([cat, amt]) => {
    const pct = total ? (amt / total * 100) : 0;
    return `<div class="leg-row"><span class="cat-dot" style="background:${catColor(cat)}"></span>
      <span class="grow">${esc(cat)}</span><span class="amt">${fmt(amt)} · ${pct.toFixed(0)}%</span></div>`;
  }).join('');
  return `<div class="donut-wrap">
    <svg class="donut" width="132" height="132" viewBox="0 0 132 132">
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#221e42" stroke-width="22"></circle>
      ${segs}
      <text x="66" y="62" text-anchor="middle" fill="#e9e6ff" font-size="16" font-weight="700">${fmt0(total)}</text>
      <text x="66" y="80" text-anchor="middle" fill="#7a72a6" font-size="10">spent</text>
    </svg>
    <div class="donut-legend">${legend}</div></div>`;
}

function emptyState() {
  app.innerHTML = `<div class="view empty">
    <div class="big">💸</div>
    <h2 class="vh center" style="justify-content:center">No transactions yet</h2>
    <p class="muted">Download a CSV from your bank and import it — everything stays private on this device.</p>
    <button class="btn primary" onclick="__budget.go('import')">Import transactions</button>
  </div>`;
}

/* ----- Transactions ----- */
function renderTx() {
  if (!state.transactions.length) return emptyState();
  let txs = txForMonth(curMonth).slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  if (txFilter.acc !== 'all') txs = txs.filter(t => t.accountId === txFilter.acc);
  if (txFilter.cat !== 'all') txs = txs.filter(t => t.category === txFilter.cat);
  if (txFilter.q) { const q = txFilter.q.toLowerCase(); txs = txs.filter(t => t.description.toLowerCase().includes(q)); }

  let html = `<div class="view">`;
  html += `<input class="search" id="txSearch" placeholder="Search descriptions…" value="${esc(txFilter.q)}" />`;
  html += `<div class="filters">`;
  html += `<button class="btn sm ${txFilter.acc === 'all' ? 'on' : ''}" data-acc="all">All accounts</button>`;
  for (const a of state.accounts) html += `<button class="btn sm ${txFilter.acc === a.id ? 'on' : ''}" data-acc="${a.id}">${esc(a.name)}</button>`;
  html += `</div>`;
  const usedCats = [...new Set(txForMonth(curMonth).map(t => t.category))];
  html += `<div class="filters"><button class="btn sm ${txFilter.cat === 'all' ? 'on' : ''}" data-cat="all">All</button>`;
  for (const c of CATS.filter(c => usedCats.includes(c.name))) html += `<button class="btn sm ${txFilter.cat === c.name ? 'on' : ''}" data-cat="${esc(c.name)}">${esc(c.name)}</button>`;
  html += `</div>`;

  html += `<div class="card" style="padding:4px 12px">`;
  if (!txs.length) html += `<p class="muted center" style="padding:20px">No matching transactions.</p>`;
  for (const t of txs) {
    const a = accById(t.accountId);
    html += `<div class="tx" data-tx="${t.id}">
      <span class="acc-dot" style="background:${a.color}"></span>
      <div class="tx-main">
        <div class="tx-desc">${esc(t.description)}</div>
        <div class="tx-meta"><span>${esc(t.date)}</span><span>${esc(a.name)}</span></div>
      </div>
      <div style="text-align:right">
        <div class="tx-amt ${t.amount < 0 ? 'neg' : 'pos'}">${fmt(t.amount)}</div>
        <div class="tx-cat" style="border-color:${catColor(t.category)}66">${esc(t.category)}</div>
      </div></div>`;
  }
  html += `</div></div>`;
  app.innerHTML = html;

  $('#txSearch').addEventListener('input', e => { txFilter.q = e.target.value; clearTimeout(window.__ts); window.__ts = setTimeout(renderTx, 200); });
  $$('[data-acc]').forEach(b => b.onclick = () => { txFilter.acc = b.dataset.acc; renderTx(); });
  $$('[data-cat]').forEach(b => b.onclick = () => { txFilter.cat = b.dataset.cat; renderTx(); });
  $$('[data-tx]').forEach(el => el.onclick = () => openTxSheet(el.dataset.tx));
}

function openTxSheet(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;
  const a = accById(t.accountId);
  const opts = CATS.map(c => `<option value="${esc(c.name)}" ${c.name === t.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  openSheet(`
    <h3>${esc(t.description)}</h3>
    <p class="muted" style="margin-top:-6px">${esc(t.date)} · ${esc(a.name)} · <b class="${t.amount < 0 ? 'neg' : 'pos'}">${fmt(t.amount)}</b></p>
    <label class="field"><span>Category</span><select class="inp" id="txCat">${opts}</select></label>
    <label class="row" style="gap:8px;margin:6px 2px 14px"><input type="checkbox" id="txRule" /> <span class="muted" style="font-size:13px">Always categorize “${esc(merchantKey(t.description))}” this way</span></label>
    <button class="btn primary block" id="txSave">Save</button>
    <button class="btn ghost danger block" id="txDel" style="margin-top:8px">Delete transaction</button>
  `);
  $('#txSave').onclick = () => {
    const newCat = $('#txCat').value;
    t.category = newCat;
    if ($('#txRule').checked) {
      const key = merchantKey(t.description).toLowerCase();
      state.rules = state.rules.filter(r => r.match !== key);
      state.rules.unshift({match: key, category: newCat});
      // reapply to matching existing tx
      for (const x of state.transactions) if ((' ' + x.description + ' ').toLowerCase().includes(key)) x.category = newCat;
    }
    save(); closeSheet(); render(); toast('Saved');
  };
  $('#txDel').onclick = () => {
    state.transactions = state.transactions.filter(x => x.id !== t.id);
    state.seenHashes = state.seenHashes.filter(h => h !== t.hash);
    save(); closeSheet(); render(); toast('Deleted');
  };
}
function merchantKey(desc) {
  return desc.replace(/\d{2,}/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ') || desc;
}

/* ----- Import ----- */
let importCtx = null; // {accId, rows, map, spendPositive, fileName}
function renderImport() {
  let html = `<div class="view"><h2 class="vh">📤 Import transactions</h2>`;
  html += `<div class="hint">Log in to each bank's website, find <b>Download / Export</b> on the transactions page, and choose <b>CSV</b>. Then drop the file below. Nothing is uploaded — parsing happens right here in your browser.</div>`;

  html += `<label class="field"><span>Which account is this file from?</span><select class="inp" id="impAcc">`;
  for (const a of state.accounts) html += `<option value="${a.id}">${esc(a.name)} · ${esc(a.owner)}</option>`;
  html += `</select></label>`;

  html += `<div class="drop" id="drop">
    <div style="font-size:26px">📄</div>
    <p class="muted" style="margin:8px 0 4px">Drop a .csv file here, or</p>
    <button class="btn" id="pickBtn">Choose file</button>
    <input type="file" id="fileInput" accept=".csv,text/csv" hidden />
  </div>`;
  html += `<div id="impArea"></div></div>`;
  app.innerHTML = html;

  const drop = $('#drop'), fi = $('#fileInput');
  $('#pickBtn').onclick = () => fi.click();
  fi.onchange = () => { if (fi.files[0]) handleFile(fi.files[0]); };
  ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('hot'); }));
  ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('hot'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
}

function handleFile(file) {
  if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') { toast('Please choose a .csv file'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCSV(reader.result);
    if (rows.length < 2) { toast('That file has no rows I can read.'); return; }
    const accId = $('#impAcc').value;
    const acc = accById(accId);
    const header = rows[0];
    const map = guessMapping(header);
    // auto-detect from the data (Discover=+, BoA=−); user can flip in the preview
    const spendPositive = guessSpendPositive(rows, map);
    importCtx = {accId, rows, map, spendPositive, fileName: file.name, header};
    renderImportPreview();
  };
  reader.readAsText(file);
}

function renderImportPreview() {
  const {rows, map, header, spendPositive, accId} = importCtx;
  const acc = accById(accId);
  const norm = buildRows(rows, map, spendPositive);
  const colOpts = (sel) => `<option value="-1">— none —</option>` +
    header.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(h.trim() || ('Column ' + (i + 1)))}</option>`).join('');

  const seen = new Set(state.seenHashes);
  let newCount = 0;
  for (const n of norm) if (!seen.has(hashTx(accId, n.date, n.desc, n.amount))) newCount++;

  let html = `<div class="card"><h3>${esc(importCtx.fileName)}</h3>`;
  html += `<div class="map-grid">
    <label class="field"><span>Date column</span><select class="inp" data-map="date">${colOpts(map.date)}</select></label>
    <label class="field"><span>Description column</span><select class="inp" data-map="desc">${colOpts(map.desc)}</select></label>
    <label class="field"><span>Amount column</span><select class="inp" data-map="amount">${colOpts(map.amount)}</select></label>
    <label class="field"><span>Debit column (optional)</span><select class="inp" data-map="debit">${colOpts(map.debit)}</select></label>
    <label class="field"><span>Credit column (optional)</span><select class="inp" data-map="credit">${colOpts(map.credit)}</select></label>
  </div>`;

  html += `<div class="field"><span>In this file, purchases/spending appear as…</span>
    <div class="pill-toggle" id="signToggle">
      <button data-sp="1" class="${spendPositive ? 'on' : ''}">Positive numbers</button>
      <button data-sp="0" class="${!spendPositive ? 'on' : ''}">Negative numbers</button>
    </div>
    <div class="mini" style="margin-top:6px">Check the preview: money you <b>spent</b> should show in <span class="neg">red</span>.</div>
  </div>`;

  // preview first 6 normalized
  html += `<div class="preview"><table class="pv"><thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th><th>Category</th></tr></thead><tbody>`;
  for (const n of norm.slice(0, 6)) {
    html += `<tr><td>${esc(n.date)}</td><td>${esc(n.desc.slice(0, 40))}</td>
      <td class="num ${n.amount < 0 ? 'neg' : 'pos'}">${fmt(n.amount)}</td><td>${esc(categorize(n.desc))}</td></tr>`;
  }
  html += `</tbody></table></div>`;

  html += `<p class="mini">Found <b>${norm.length}</b> readable rows · <b class="pos">${newCount} new</b> · ${norm.length - newCount} already imported.</p>`;
  html += `<button class="btn primary block" id="commitBtn" ${newCount ? '' : 'disabled'}>Import ${newCount} transaction${newCount === 1 ? '' : 's'} into ${esc(acc.name)}</button>`;
  html += `</div>`;
  $('#impArea').innerHTML = html;

  $$('[data-map]').forEach(sel => sel.onchange = () => { importCtx.map[sel.dataset.map] = +sel.value; renderImportPreview(); });
  $$('#signToggle button').forEach(b => b.onclick = () => { importCtx.spendPositive = b.dataset.sp === '1'; renderImportPreview(); });
  $('#commitBtn').onclick = () => {
    const norm2 = buildRows(importCtx.rows, importCtx.map, importCtx.spendPositive);
    const res = commitImport(importCtx.accId, norm2);
    importCtx = null;
    curMonth = allMonths()[0];
    toast(`Imported ${res.added} · skipped ${res.dup} duplicate${res.dup === 1 ? '' : 's'}`);
    view = 'overview'; render();
  };
}

/* ----- Budget ----- */
function renderBudget() {
  const txs = txForMonth(curMonth);
  const s = summary(txs);
  const spendCats = CATS.filter(c => !NON_SPEND.has(c.name) && c.name !== 'Uncategorized');
  let html = `<div class="view"><h2 class="vh">🎯 Monthly budget</h2>
    <p class="sub">Set a limit per category. Progress reflects ${esc(monthLabel(curMonth) || 'the selected month')}.</p>`;

  const totalBudget = round2(Object.values(state.budgets).reduce((a, b) => a + (+b || 0), 0));
  html += `<div class="stats"><div class="stat"><div class="lab">Total budget</div><div class="val">${totalBudget ? fmt0(totalBudget) : '—'}</div></div>
    <div class="stat"><div class="lab">Spent</div><div class="val neg">${fmt0(s.spend)}</div></div></div>`;

  html += `<div class="card">`;
  for (const c of spendCats) {
    const lim = +state.budgets[c.name] || 0;
    const spent = s.byCat[c.name] || 0;
    const pct = lim ? Math.min(100, spent / lim * 100) : 0;
    const over = lim && spent > lim;
    html += `<div style="padding:11px 0;border-bottom:1px solid var(--line)">
      <div class="spread">
        <div class="row" style="gap:8px"><span class="cat-dot" style="background:${c.color}"></span><span class="cat-name">${esc(c.name)}</span></div>
        <div class="row" style="gap:8px">
          <span class="cat-amt ${over ? 'neg' : ''}">${fmt0(spent)}</span>
          <span class="faint">/</span>
          <input class="inp" style="width:92px;padding:7px 9px;font-size:14px" inputmode="decimal" data-budget="${esc(c.name)}" value="${lim || ''}" placeholder="—" />
        </div>
      </div>
      ${lim ? `<div class="bar ${over ? 'over' : ''}"><i style="width:${pct}%"></i></div>
        <div class="mini">${over ? `${fmt0(spent - lim)} over budget` : `${fmt0(lim - spent)} left`}</div>` : ''}
    </div>`;
  }
  html += `</div></div>`;
  app.innerHTML = html;

  $$('[data-budget]').forEach(inp => {
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value.replace(/[$,\s]/g, ''));
      if (isNaN(v) || v <= 0) delete state.budgets[inp.dataset.budget];
      else state.budgets[inp.dataset.budget] = round2(v);
      save(); renderBudget();
    });
  });
}

/* ----- Settings ----- */
function renderSettings() {
  let html = `<div class="view"><h2 class="vh">⚙️ Setup</h2>`;

  html += `<div class="card"><h3>Accounts</h3><p class="mini" style="margin-top:-4px">Tap to rename or change who it belongs to.</p>`;
  for (const a of state.accounts) {
    const count = state.transactions.filter(t => t.accountId === a.id).length;
    html += `<div class="acc-card" data-acc-edit="${a.id}">
      <div class="acc-badge" style="background:${a.color}">${a.emoji || '🏦'}</div>
      <div class="grow"><div class="nm">${esc(a.name)}</div><div class="mt">${esc(a.owner)} · ${a.type} · ${count} tx</div></div>
      <span class="faint">›</span></div>`;
  }
  html += `<button class="btn sm ghost" id="addAcc">+ Add account</button></div>`;

  html += `<div class="card"><h3>Category rules</h3><p class="mini" style="margin-top:-4px">Custom keyword → category (checked before the built-in list).</p>`;
  if (!state.rules.length) html += `<p class="muted" style="font-size:13px">No custom rules yet. You can add them from any transaction, or below.</p>`;
  for (const r of state.rules) {
    html += `<div class="spread" style="padding:7px 0;border-bottom:1px solid var(--line)">
      <div class="grow"><b>${esc(r.match)}</b> <span class="faint">→</span> ${esc(r.category)}</div>
      <button class="btn sm ghost danger" data-del-rule="${esc(r.match)}">Remove</button></div>`;
  }
  html += `<button class="btn sm ghost" id="addRule" style="margin-top:8px">+ Add rule</button></div>`;

  html += `<div class="card"><h3>Your data</h3>
    <p class="mini" style="margin-top:-4px">${state.transactions.length} transactions stored on this device only. Back it up so you don't lose it if you clear your browser.</p>
    <div class="row wrap" style="gap:8px">
      <button class="btn sm" id="exportBtn">⬇ Export backup (.json)</button>
      <button class="btn sm" id="exportCsv">⬇ Export CSV</button>
      <button class="btn sm ghost" id="importBtn">⬆ Restore backup</button>
      <input type="file" id="restoreInput" accept=".json" hidden />
    </div>
    <div class="divider"></div>
    <button class="btn sm ghost danger" id="wipeBtn">Delete all data</button>
  </div>`;

  html += `<p class="mini center" style="opacity:.7">Private household budget · offline-only · nothing leaves this device.</p>`;
  html += `</div>`;
  app.innerHTML = html;

  $$('[data-acc-edit]').forEach(el => el.onclick = () => openAccSheet(el.dataset.accEdit));
  $('#addAcc').onclick = () => openAccSheet(null);
  $('#addRule').onclick = () => openRuleSheet();
  $$('[data-del-rule]').forEach(b => b.onclick = () => { state.rules = state.rules.filter(r => r.match !== b.dataset.delRule); save(); renderSettings(); });
  $('#exportBtn').onclick = exportBackup;
  $('#exportCsv').onclick = exportCsv;
  $('#importBtn').onclick = () => $('#restoreInput').click();
  $('#restoreInput').onchange = e => restoreBackup(e.target.files[0]);
  $('#wipeBtn').onclick = () => {
    openSheet(`<h3>Delete everything?</h3><p class="muted">This removes all imported transactions, budgets, and custom accounts from this device. This cannot be undone.</p>
      <button class="btn danger block" id="wipeYes">Yes, delete all data</button>
      <button class="btn ghost block" style="margin-top:8px" data-close>Cancel</button>`);
    $('#wipeYes').onclick = () => { localStorage.removeItem(LS_KEY); state = load(); curMonth = null; closeSheet(); view = 'overview'; render(); toast('All data deleted'); };
  };
}

function openAccSheet(id) {
  const a = id ? accById(id) : {name: '', owner: '', type: 'credit', color: '#a970ff', emoji: '🏦'};
  const colors = ['#35d0ba','#ff9f45','#ff6a8a','#a970ff','#59d98a','#6d8cff','#f2c14e','#ff6ad5'];
  openSheet(`
    <h3>${id ? 'Edit account' : 'Add account'}</h3>
    <label class="field"><span>Name</span><input class="inp" id="acN" value="${esc(a.name)}" placeholder="e.g. Chase Checking" /></label>
    <label class="field"><span>Belongs to</span><input class="inp" id="acO" value="${esc(a.owner)}" placeholder="e.g. Josiah, Spouse, Joint" /></label>
    <label class="field"><span>Type</span><select class="inp" id="acT">
      <option value="checking" ${a.type === 'checking' ? 'selected' : ''}>Checking / Debit</option>
      <option value="credit" ${a.type === 'credit' ? 'selected' : ''}>Credit card</option>
    </select></label>
    <label class="field"><span>Color</span><div class="row wrap" id="acCols">${colors.map(c => `<button class="acc-badge" data-col="${c}" style="background:${c};outline:${c === a.color ? '2px solid #fff' : 'none'}"></button>`).join('')}</div></label>
    <button class="btn primary block" id="acSave">Save</button>
    ${id ? `<button class="btn ghost danger block" id="acDel" style="margin-top:8px">Delete account & its transactions</button>` : ''}
  `);
  let chosen = a.color;
  $$('#acCols [data-col]').forEach(b => b.onclick = () => { chosen = b.dataset.col; $$('#acCols [data-col]').forEach(x => x.style.outline = 'none'); b.style.outline = '2px solid #fff'; });
  $('#acSave').onclick = () => {
    const name = $('#acN').value.trim(); if (!name) { toast('Name required'); return; }
    const owner = $('#acO').value.trim() || '—';
    const type = $('#acT').value;
    if (id) { Object.assign(accById(id), {name, owner, type, color: chosen}); }
    else { state.accounts.push({id: 'a_' + Math.abs(hashCode(name + owner + state.accounts.length)), name, owner, type, color: chosen, emoji: type === 'credit' ? '💳' : '🏦'}); }
    save(); closeSheet(); renderSettings(); toast('Saved');
  };
  if (id) $('#acDel').onclick = () => {
    state.transactions = state.transactions.filter(t => t.accountId !== id);
    state.seenHashes = state.transactions.map(t => t.hash);
    state.accounts = state.accounts.filter(x => x.id !== id);
    save(); closeSheet(); renderSettings(); toast('Account deleted');
  };
}

function openRuleSheet() {
  const opts = CATS.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
  openSheet(`<h3>Add category rule</h3>
    <label class="field"><span>When description contains…</span><input class="inp" id="rlM" placeholder="e.g. costco" /></label>
    <label class="field"><span>Category</span><select class="inp" id="rlC">${opts}</select></label>
    <button class="btn primary block" id="rlSave">Add rule</button>`);
  $('#rlSave').onclick = () => {
    const m = $('#rlM').value.trim().toLowerCase(); if (!m) { toast('Enter a keyword'); return; }
    state.rules = state.rules.filter(r => r.match !== m);
    state.rules.unshift({match: m, category: $('#rlC').value});
    for (const x of state.transactions) if ((' ' + x.description + ' ').toLowerCase().includes(m)) x.category = $('#rlC').value;
    save(); closeSheet(); renderSettings(); toast('Rule added');
  };
}

/* ---------- backup ---------- */
function download(name, text, type) {
  const blob = new Blob([text], {type: type || 'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportBackup() { download('budget-backup.json', JSON.stringify(state, null, 2), 'application/json'); toast('Backup downloaded'); }
function exportCsv() {
  const head = ['Date','Account','Owner','Description','Amount','Category'];
  const lines = [head.join(',')];
  for (const t of state.transactions.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    const a = accById(t.accountId);
    const cell = s => /[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s;
    lines.push([t.date, cell(a.name), cell(a.owner), cell(t.description), t.amount.toFixed(2), t.category].join(','));
  }
  download('transactions.csv', lines.join('\n'), 'text/csv');
  toast('CSV downloaded');
}
function restoreBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d.accounts || !Array.isArray(d.transactions)) throw new Error('bad');
      state = Object.assign({version: 1, budgets: {}, rules: [], seenHashes: []}, d);
      if (!state.seenHashes.length) state.seenHashes = state.transactions.map(t => t.hash).filter(Boolean);
      save(); curMonth = allMonths()[0]; view = 'overview'; render(); toast('Backup restored');
    } catch (e) { toast('That is not a valid backup file'); }
  };
  reader.readAsText(file);
}

/* ---------- sheet / toast ---------- */
const sheet = $('#sheet'), sheetBody = $('#sheetBody');
function openSheet(html) { sheetBody.innerHTML = `<div class="sheet-grab"></div>` + html; sheet.hidden = false; }
function closeSheet() { sheet.hidden = true; sheetBody.innerHTML = ''; }
sheet.addEventListener('click', e => { if (e.target.matches('[data-close], .sheet-backdrop')) closeSheet(); });
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }

/* ---------- nav ---------- */
$$('#tabbar .tab').forEach(b => b.onclick = () => { view = b.dataset.view; render(); });
$('#monthSelect').addEventListener('change', e => { curMonth = e.target.value; render(); });

/* expose a tiny api for inline handlers */
window.__budget = {go: v => { view = v; render(); }};

render();
})();
