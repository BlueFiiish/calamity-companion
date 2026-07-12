/* Calamity Companion — vanilla JS PWA
   Data: data/items.json (recipe graph), classes.json, bosses.json */
'use strict';

const S = {
  db: {},            // name -> node
  names: [],         // sorted item names for search
  lower: [],         // lowercased names (parallel to names)
  classes: {},
  bosses: [],
  meta: {},
  view: 'craft',
  root: null,        // current crafting-tree root item name
  crumbs: [],        // breadcrumb trail of roots
  expandAll: false,
  rawMode: false,
  itemFilter: 'all',
  itemLimit: 60,
};

const $ = sel => document.querySelector(sel);
const app = () => $('#app');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Sprite fallback chain: Calamity wiki -> vanilla Terraria wiki -> "?" placeholder.
// Many vanilla items / armor sets aren't hosted on the Calamity wiki but are on terraria.wiki.gg.
window.sprErr = function(img){
  if(!img.dataset.fb && img.src.indexOf('calamitymod.wiki.gg') !== -1){
    img.dataset.fb = '1';
    img.src = img.src.replace('calamitymod.wiki.gg', 'terraria.wiki.gg');
    return;
  }
  img.style.visibility='hidden';
  const w=img.closest('.spr-wrap'); if(w) w.classList.add('miss');
};

function get(name){ return S.db[name]; }

// ---- source classification -------------------------------------------------
function sourceOf(node){
  if(!node) return {kind:'base', label:'material'};
  if(node.recipes && node.recipes.length) return {kind:'craft', label:'Crafted'};
  if(node.dropped && node.drops.length){
    const npc = node.drops[0].npc || 'enemy';
    return {kind:'drop', label:'Drop: '+npc};
  }
  return {kind:'base', label:'Mined / found / bought'};
}
function srcChip(node){
  const s = sourceOf(node);
  if(s.kind==='craft') return '';                       // craftable => caret shows it
  if(s.kind==='drop') return `<span class="chip drop meta-tag">${esc(s.label)}</span>`;
  return `<span class="chip base meta-tag">base</span>`;
}
function classChips(node){
  if(!node || !node.classes || !node.classes.length) return '';
  return node.classes.map(c=>`<span class="chip cls ${c}">${c==='mage'?'Mage':c[0].toUpperCase()+c.slice(1)}</span>`).join('');
}

// ---- sprite ----------------------------------------------------------------
function imgOf(name){ const n=get(name); return n? n.img : `https://calamitymod.wiki.gg/wiki/Special:FilePath/${encodeURIComponent(name.replace(/ /g,'_'))}.png`; }
function spr(name, cls='s32'){
  return `<span class="spr-wrap"><img class="spr ${cls}" src="${esc(imgOf(name))}" loading="lazy" alt="" onerror="sprErr(this)"></span>`;
}

// ---- routing / tabs --------------------------------------------------------
function setView(v){
  S.view = v;
  document.querySelectorAll('#tabbar .tab').forEach(t=>t.classList.toggle('on', t.dataset.view===v));
  window.scrollTo(0,0);
  render();
}
function render(){
  const v = S.view;
  if(v==='craft') return renderCraft();
  if(v==='classes') return renderClasses();
  if(v==='bosses') return renderBosses();
  if(v==='items') return renderItems();
  if(v==='guide') return renderGuide();
}

// =====================  CRAFT (the centerpiece)  ============================
function focusItem(name, pushCrumb=true){
  if(!get(name)) return;
  if(pushCrumb && S.root && S.root!==name) S.crumbs.push(S.root);
  S.root = name;
  S.rawMode = false;
  setView('craft');
}
function crumbTo(name){
  const i = S.crumbs.indexOf(name);
  if(i>=0) S.crumbs = S.crumbs.slice(0,i);
  S.root = name;
  renderCraft();
}

function renderCraft(){
  const a = app();
  const searchBar = `
    <div class="search-wrap">
      <span class="search-ic">&#128269;</span>
      <input id="craftSearch" class="search" placeholder="Search any item…" autocomplete="off" autocorrect="off" spellcheck="false" />
      <button class="search-clear" id="craftClear" hidden>&times;</button>
      <div class="suggest" id="craftSuggest" hidden></div>
    </div>`;

  if(!S.root){
    a.innerHTML = `<div class="view">
      ${searchBar}
      <div class="hint">
        <div class="big">&#129683;</div>
        <div>Search an item to see its <b>full crafting tree</b>.</div>
        <div class="faint" style="margin-top:6px">Tap a row to expand ingredients · tap an icon to open details · tap &#8635; to jump into that ingredient's tree.</div>
        <div class="quick" id="quickPicks"></div>
      </div>
    </div>`;
    const picks = ['Zenith','Ark of the Cosmos','Life Alloy','Auric Bar','Cosmilite Bar','Elemental Lance','The Community','Nanoblack Reaper','Ascendant Spirit Essence','Miracle Matter'];
    $('#quickPicks').innerHTML = picks.filter(get).map(p=>`<button class="tbtn" data-focus="${esc(p)}">${esc(p)}</button>`).join('');
    wireSearch(); wireDelegation();
    return;
  }

  const node = get(S.root);
  const s = sourceOf(node);
  const crumbHtml = S.crumbs.length ? `<div class="crumbs">${S.crumbs.map(c=>`<a data-crumb="${esc(c)}">${esc(c)}</a><span class="sep">&rsaquo;</span>`).join('')}<span>${esc(S.root)}</span></div>` : '';

  a.innerHTML = `<div class="view">
    ${searchBar}
    ${crumbHtml}
    <div class="tree-head">
      ${spr(S.root,'s56')}
      <div class="ti">
        <h3>${esc(S.root)}</h3>
        <div class="sub">${classChips(node)} ${esc(s.label)}${node.recipes.length>1?` · ${node.recipes.length} recipes`:''}</div>
      </div>
      <button class="share-btn" data-sheet="${esc(S.root)}" title="Details">&#8505;</button>
    </div>
    <div class="tree-tools">
      <button class="tbtn ${S.expandAll?'on':''}" id="toggleAll">${S.expandAll?'Collapse all':'Expand all'}</button>
      <button class="tbtn ${S.rawMode?'on':''}" id="toggleRaw">${S.rawMode?'Show tree':'Raw materials'}</button>
    </div>
    <div id="treeHost"></div>
  </div>`;

  const host = $('#treeHost');
  if(!node.recipes.length){
    host.innerHTML = renderNonCraftable(node);
  } else if(S.rawMode){
    host.innerHTML = renderRaw(S.root);
  } else {
    const tree = document.createElement('div');
    tree.className = 'tree';
    tree.appendChild(buildNode(S.root, node.recipes[0].amount||1, null, 0, new Set(), true));
    host.appendChild(tree);
    if(S.expandAll) openAll(tree);
  }
  wireSearch(); wireDelegation();
}

function renderNonCraftable(node){
  const s = sourceOf(node);
  let h = `<div class="card"><div class="row g8">${spr(node.name,'s40')}<div><b>Not crafted.</b><div class="muted" style="font-size:13px">${esc(s.label)}</div></div></div>`;
  if(node.drops && node.drops.length){
    h += `<div class="sec-h" style="margin-top:12px">Drops from</div>`;
    h += node.drops.slice(0,12).map(d=>`<div class="row g8" style="padding:4px 0"><span class="chip drop">${esc(d.npc||'?')}</span><span class="faint" style="font-size:12px">${esc(d.chance||'')}${d.amount&&d.amount!=='1'?' · '+esc(d.amount):''}</span></div>`).join('');
  }
  if(node.shimmer && node.shimmer.length){
    h += `<div class="sec-h" style="margin-top:12px">Shimmer transmutation</div>`;
    h += node.shimmer.map(r=>`<div class="muted" style="font-size:13px">&#8646; ${r.ings.map(i=>esc(i[0])).join(', ')}</div>`).join('');
  }
  h += `</div>`;
  if(node.usedIn && node.usedIn.length){
    h += usedInBlock(node);
  }
  return h;
}

function usedInBlock(node){
  const list = node.usedIn.slice(0,40);
  return `<div class="card"><div class="sec-h" style="margin-top:0">Used to craft (${node.usedIn.length})</div>
    <div class="usedin">${list.map(u=>`<span class="u" data-focus="${esc(u)}">${spr(u,'s24')}<span>${esc(u)}</span></span>`).join('')}</div></div>`;
}

// build one tree node (lazy children)
function buildNode(name, qty, station, depth, ancestors, isRoot){
  const node = get(name);
  const craftable = node && node.recipes && node.recipes.length && !ancestors.has(name);
  const div = document.createElement('div');
  div.className = 'node' + (craftable?' craftable':'');
  div.dataset.name = name;

  const qtyHtml = isRoot ? '' : `<span class="qty">${qty}&times;</span>`;
  const caret = craftable ? '<span class="caret">&#9654;</span>' : '<span class="caret leaf">&bull;</span>';
  const stBadge = (craftable && node.recipes[0].station) ? `<span class="station-badge">@ ${esc(node.recipes[0].station)}</span>` : '';
  const tag = craftable ? '' : srcChip(node);

  div.innerHTML = `<div class="rowline">
      ${caret}
      <button class="spr-btn" data-sheet="${esc(name)}" style="background:none;border:0;padding:0">${spr(name,'s32')}</button>
      ${qtyHtml}
      <span class="nm"><span class="tap" data-focus2="${esc(name)}">${esc(name)}</span> ${stBadge}</span>
      ${tag}
      ${craftable && !isRoot ? '<button class="refocus" data-focus="'+esc(name)+'" title="Focus this tree" style="background:none;border:0;color:var(--accent);padding:4px">&#8635;</button>' : ''}
    </div>
    <div class="kids"></div>`;

  if(craftable){
    const kids = div.querySelector('.kids');
    kids.dataset.built = '0';
    div._build = () => {
      if(kids.dataset.built==='1') return;
      kids.dataset.built='1';
      const rec = node.recipes[0];
      const nextAnc = new Set(ancestors); nextAnc.add(name);
      rec.ings.forEach(([inm,iq])=>{
        kids.appendChild(buildNode(inm, iq, rec.station, depth+1, nextAnc, false));
      });
    };
    if(isRoot){ div.classList.add('open'); div._build(); }
  }
  return div;
}

function openAll(scope){
  scope.querySelectorAll('.node.craftable').forEach(n=>{
    if(n._build) n._build();
    n.classList.add('open');
  });
  // building may have added new craftable nodes; loop a few passes
  for(let p=0;p<8;p++){
    let added=false;
    scope.querySelectorAll('.node.craftable:not(.open)').forEach(n=>{
      if(n._build) n._build();
      n.classList.add('open'); added=true;
    });
    if(!added) break;
  }
}

// ---- raw materials aggregation ----
function computeRaw(name, mult, acc, stack){
  const node = get(name);
  const craftable = node && node.recipes && node.recipes.length && !stack.has(name);
  if(!craftable){ acc[name] = (acc[name]||0) + mult; return; }
  const rec = node.recipes[0];
  const per = rec.amount || 1;
  const crafts = Math.ceil(mult/per);
  const ns = new Set(stack); ns.add(name);
  rec.ings.forEach(([inm,iq])=> computeRaw(inm, crafts*iq, acc, ns));
}
function renderRaw(name){
  const acc = {};
  computeRaw(name, get(name).recipes[0].amount||1, acc, new Set());
  const rows = Object.entries(acc).sort((a,b)=>b[1]-a[1]);
  return `<div class="card raw-list">
    <div class="sec-h" style="margin-top:0">Total base materials for 1&times; ${esc(name)}</div>
    ${rows.map(([nm,q])=>{
      const nd=get(nm); const s=sourceOf(nd);
      return `<div class="row g8"><span class="qty">${q}&times;</span><button class="spr-btn" data-sheet="${esc(nm)}" style="background:none;border:0;padding:0">${spr(nm,'s24')}</button><span class="nm" style="flex:1"><span class="tap" data-focus2="${esc(nm)}">${esc(nm)}</span></span><span class="chip ${s.kind==='drop'?'drop':'base'}" style="font-size:10px">${s.kind==='drop'?'drop':'base'}</span></div>`;
    }).join('')}
    <div class="faint" style="font-size:11px;margin-top:10px">Assumes the primary recipe at each step; drops/mined items are the leaves.</div>
  </div>`;
}

// =====================  CLASSES  ===========================================
const CLASS_META = {melee:{em:'&#9876;',label:'Melee'},ranged:{em:'&#127993;',label:'Ranged'},mage:{em:'&#128302;',label:'Mage'},summoner:{em:'&#128123;',label:'Summoner'},rogue:{em:'&#127895;',label:'Rogue'}};
let curClass = 'melee';
function renderClasses(){
  const a = app();
  const cls = S.classes[curClass];
  a.innerHTML = `<div class="view">
    <h2 class="vh">&#9876; Class Guides</h2>
    <div class="class-picker">
      ${Object.keys(CLASS_META).map(c=>`<button class="class-btn ${c===curClass?'on':''}" data-class="${c}"><span class="em">${CLASS_META[c].em}</span>${CLASS_META[c].label}</button>`).join('')}
    </div>
    <div class="muted" style="font-size:12.5px;margin:-4px 2px 12px">Recommended gear by progression stage, straight from the Calamity class-setup guides. Tap any item for details &amp; its crafting tree.</div>
    <div id="stages">${cls.stages.map((st,i)=>stageBlock(st,i===0)).join('')}</div>
  </div>`;
  wireDelegation();
}
function stageBlock(st, open){
  const groups = [['armor','Armor'],['weapons','Weapons'],['accessories','Accessories'],['ammo','Ammo'],['buffs','Buffs / Potions']];
  const total = groups.reduce((n,[k])=>n+(st[k]?st[k].length:0),0);
  const body = groups.map(([k,label])=>{
    const arr = st[k]||[];
    if(!arr.length) return '';
    return `<div class="grp-h">${label}</div><div class="icon-grid">${arr.map(it=>`<button class="icon-cell" data-sheet="${esc(it.name)}" title="${esc(it.name)}">${spr(it.name,'s32')}</button>`).join('')}</div>`;
  }).join('');
  return `<details class="stage" ${open?'open':''}>
    <summary><span class="stg-name">${esc(st.label)}</span><span class="stg-cnt">${total} items</span></summary>
    <div class="stage-body">${body||'<div class="faint">No data for this stage.</div>'}</div>
  </details>`;
}

// =====================  BOSSES  ============================================
function renderBosses(){
  const a = app();
  a.innerHTML = `<div class="view">
    <h2 class="vh">&#128128; Boss Progression</h2>
    <div class="muted" style="font-size:12.5px;margin:-4px 2px 12px">In Calamity + Infernum order. Tap a boss for its drops. Infernum reworks its AI &amp; some drops — see the vault boss pages for fight strategy.</div>
    <div class="boss-list">
      ${S.bosses.map(b=>`<button class="boss-row" data-boss="${esc(b.name)}">
        <span class="idx">${b.order+1}</span>
        ${spr(b.name,'s40')}
        <span class="bn"><span class="t">${esc(b.name)}</span><span class="d">${b.drops.length} drops</span></span>
        <span class="cnt">&rsaquo;</span>
      </button>`).join('')}
    </div>
  </div>`;
  wireDelegation();
}
function bossSheet(name){
  const b = S.bosses.find(x=>x.name===name);
  if(!b) return;
  const body = `
    <div class="sheet-grab"></div>
    <div class="row g8">${spr(b.name,'s56')}<div><h3>${esc(b.name)}</h3><div class="muted" style="font-size:12px">Boss #${b.order+1} · ${b.drops.length} drops</div></div></div>
    <div class="sec-h">Drops</div>
    ${b.drops.length? `<div class="item-grid">${b.drops.map(d=>`<div class="item-cell" data-sheet="${esc(d.item)}">${spr(d.item,'s32')}<span class="nm">${esc(d.item)}</span><span class="faint" style="font-size:11px">${esc(d.chance||'')}</span></div>`).join('')}</div>` : '<div class="faint">Drop data not catalogued for this boss.</div>'}
    <div class="faint" style="font-size:11px;margin-top:12px">Fight strategy &amp; Infernum reworks live in the Fiiiish Island vault boss pages.</div>
  `;
  openSheet(body);
}

// =====================  ITEMS BROWSE  ======================================
function renderItems(){
  const a = app();
  a.innerHTML = `<div class="view">
    <div class="search-wrap">
      <span class="search-ic">&#128269;</span>
      <input id="itemSearch" class="search" placeholder="Search all ${S.names.length} items…" autocomplete="off" spellcheck="false" />
      <button class="search-clear" id="itemClear" hidden>&times;</button>
    </div>
    <div class="filters">
      ${[['all','All'],['craft','Craftable'],['drop','Dropped'],['melee','Melee'],['ranged','Ranged'],['mage','Mage'],['summoner','Summoner'],['rogue','Rogue']].map(([k,l])=>`<button class="fbtn ${S.itemFilter===k?'on':''}" data-filter="${k}">${l}</button>`).join('')}
    </div>
    <div id="itemList"></div>
  </div>`;
  renderItemList('');
  const inp = $('#itemSearch');
  inp.addEventListener('input', ()=>{ S.itemLimit=60; renderItemList(inp.value.trim()); $('#itemClear').hidden=!inp.value; });
  $('#itemClear').addEventListener('click', ()=>{ inp.value=''; $('#itemClear').hidden=true; renderItemList(''); });
  wireDelegation();
}
function matchFilter(node){
  const f = S.itemFilter;
  if(f==='all') return true;
  if(f==='craft') return node.recipes.length>0;
  if(f==='drop') return node.dropped;
  return node.classes && node.classes.includes(f);
}
function renderItemList(q){
  const ql = q.toLowerCase();
  let matches = S.names.filter((n,i)=>{
    const node = S.db[n];
    if(!matchFilter(node)) return false;
    return !ql || S.lower[i].includes(ql);
  });
  const total = matches.length;
  const shown = matches.slice(0, S.itemLimit);
  const host = $('#itemList');
  host.innerHTML = `<div class="item-grid">${shown.map(n=>{
    const node=S.db[n]; const s=sourceOf(node);
    return `<div class="item-cell" data-sheet="${esc(n)}">${spr(n,'s32')}<span class="nm">${esc(n)}</span><span class="tags">${node.recipes.length?'<span class="chip craft" style="font-size:10px">craft</span>':''}${node.dropped?'<span class="chip drop" style="font-size:10px">drop</span>':''}</span></div>`;
  }).join('')}</div>
  ${total>S.itemLimit?`<button class="load-more" id="loadMore">Show more (${total-S.itemLimit} more)</button>`:`<div class="faint center" style="margin-top:10px;font-size:12px">${total} item${total===1?'':'s'}</div>`}`;
  const lm = $('#loadMore');
  if(lm) lm.addEventListener('click', ()=>{ S.itemLimit+=80; renderItemList(q); });
}

// =====================  ITEM SHEET  ========================================
function openSheet(html){ $('#sheetBody').innerHTML = html; $('#sheet').hidden=false; }
function closeSheet(){ $('#sheet').hidden=true; }
function itemSheet(name){
  const node = get(name);
  if(!node){ return; }
  const s = sourceOf(node);
  let obtain = '';
  if(node.recipes.length){
    obtain += node.recipes.map(r=>`<div class="obtain"><div class="row g6 wrap"><span class="chip station">@ ${esc(r.station||'By Hand')}</span><span class="faint" style="font-size:11px">makes ${r.amount||1}</span></div>
      <div style="margin-top:7px;display:flex;flex-direction:column;gap:5px">${r.ings.map(([inm,iq])=>`<div class="row g8"><span class="qty" style="color:var(--gold);min-width:26px;text-align:right">${iq}&times;</span><button class="spr-btn" data-sheet="${esc(inm)}" style="background:none;border:0;padding:0">${spr(inm,'s24')}</button><span style="flex:1">${esc(inm)}</span></div>`).join('')}</div></div>`).join('');
  }
  if(node.drops.length){
    obtain += `<div class="obtain"><div class="sec-h" style="margin:0 0 6px">Drops from</div>${node.drops.slice(0,10).map(d=>`<div class="row g8" style="padding:3px 0"><span class="chip drop">${esc(d.npc||'?')}</span><span class="faint" style="font-size:11px">${esc(d.chance||'')}${d.amount&&d.amount!=='1'?' · '+esc(d.amount):''}</span></div>`).join('')}</div>`;
  }
  if(node.shimmer.length){
    obtain += `<div class="obtain"><div class="sec-h" style="margin:0 0 6px">Shimmer &#8646;</div>${node.shimmer.map(r=>`<div class="muted" style="font-size:13px">from ${r.ings.map(i=>esc(i[0])).join(', ')}</div>`).join('')}</div>`;
  }
  if(!obtain){ obtain = `<div class="obtain muted">${esc(s.label)}</div>`; }

  const usedin = node.usedIn.length ? `<div class="sec-h">Used to craft (${node.usedIn.length})</div><div class="usedin">${node.usedIn.slice(0,30).map(u=>`<span class="u" data-sheet="${esc(u)}">${spr(u,'s24')}<span>${esc(u)}</span></span>`).join('')}</div>` : '';

  openSheet(`
    <div class="sheet-grab"></div>
    <div class="row g8">${spr(name,'s56')}<div style="min-width:0"><h3>${esc(name)}</h3><div class="row g6 wrap" style="margin-top:4px">${classChips(node)}<span class="chip ${s.kind==='craft'?'craft':(s.kind==='drop'?'drop':'base')}">${esc(s.label)}</span></div></div></div>
    <div class="sec-h">How to obtain</div>
    ${obtain}
    ${usedin}
    ${node.recipes.length?`<button class="big-btn" data-focus="${esc(name)}">&#129683; Show full crafting tree</button>`:''}
    <a class="big-btn alt" href="https://calamitymod.wiki.gg/wiki/${encodeURIComponent(name.replace(/ /g,'_'))}" target="_blank" rel="noopener">Open on Calamity Wiki &#8599;</a>
  `);
}

// =====================  GUIDE  =============================================
function renderGuide(){
  const a = app();
  a.innerHTML = `<div class="view">
    <h2 class="vh">&#128214; How to use</h2>
    <div class="card">
      <p style="margin:0 0 10px"><b>Craft tab</b> — search any item to see its full, game-accurate crafting tree.
      Tap a row to expand its ingredients, tap &#8505; / an icon for details, and tap <b>&#8635;</b> to jump into an ingredient's own tree.
      <b>Raw materials</b> flattens the whole tree into a base-material shopping list.</p>
      <p style="margin:0 0 10px"><b>Classes</b> — recommended armor / weapons / accessories / buffs for each of the 5 classes, stage by stage.</p>
      <p style="margin:0 0 10px"><b>Bosses</b> — progression order + each boss's drops. Infernum changes the fights (AI &amp; some drops); fight strategy lives in the vault.</p>
      <p style="margin:0"><b>Items</b> — browse / filter all ${S.names.length} catalogued items.</p>
    </div>
    <div class="card">
      <div class="sec-h" style="margin-top:0">Key crafting stations (progression)</div>
      <div class="muted" style="font-size:13.5px;line-height:1.7">
        Work Bench &rarr; Furnace &rarr; Iron/Lead Anvil &rarr; Hellforge &rarr;
        Mythril/Orichalcum Anvil &rarr; Adamantite/Titanium Forge &rarr;
        <span style="color:var(--gold)">Ancient Manipulator</span> (post-Moon Lord) &rarr;
        <span style="color:var(--gold)">Draedon's Forge / Cosmic Anvil</span> (endgame).
      </div>
    </div>
    <div class="card">
      <div class="sec-h" style="margin-top:0">About the data</div>
      <div class="muted" style="font-size:12.5px">
        ${S.meta.recipeCount||''} recipes &amp; ${S.meta.itemCount||S.names.length} items pulled from the official
        <a class="link" href="https://calamitymod.wiki.gg" target="_blank" rel="noopener">Calamity Mod Wiki</a>
        (${esc(S.meta.generatedAt||'')}). Shimmer transmutations are shown separately, not as crafting steps.
        Sprites &copy; their creators, hotlinked from the wiki.
      </div>
    </div>
  </div>`;
}

// =====================  search  ============================================
function searchItems(q, limit=20){
  const ql = q.toLowerCase().trim();
  if(!ql) return [];
  const starts=[], contains=[];
  for(let i=0;i<S.names.length;i++){
    const l=S.lower[i];
    if(l===ql){ starts.unshift(S.names[i]); continue; }
    if(l.startsWith(ql)) starts.push(S.names[i]);
    else if(l.includes(ql)) contains.push(S.names[i]);
    if(starts.length>limit) break;
  }
  return starts.concat(contains).slice(0,limit);
}
function wireSearch(){
  const inp = $('#craftSearch'); if(!inp) return;
  const sug = $('#craftSuggest'); const clr=$('#craftClear');
  const run = ()=>{
    const q=inp.value.trim(); clr.hidden=!q;
    if(!q){ sug.hidden=true; return; }
    const res = searchItems(q);
    if(!res.length){ sug.hidden=true; return; }
    sug.innerHTML = res.map(n=>{ const nd=S.db[n]; const s=sourceOf(nd);
      return `<div class="sug-row" data-focus="${esc(n)}">${spr(n,'s24')}<span class="nm">${esc(n)}</span><span class="tg">${nd.recipes.length?'craftable':s.label}</span></div>`;
    }).join('');
    sug.hidden=false;
  };
  inp.addEventListener('input', run);
  inp.addEventListener('focus', run);
  clr.addEventListener('click', ()=>{ inp.value=''; clr.hidden=true; sug.hidden=true; inp.focus(); });
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ const r=searchItems(inp.value); if(r[0]) focusItem(r[0]); } });
}

// =====================  event delegation  ==================================
let wired=false;
function wireDelegation(){
  if(wired) return; wired=true;
  document.body.addEventListener('click', e=>{
    const focusEl = e.target.closest('[data-focus]');
    const focus2 = e.target.closest('[data-focus2]');
    const sheetEl = e.target.closest('[data-sheet]');
    const bossEl = e.target.closest('[data-boss]');
    const crumbEl = e.target.closest('[data-crumb]');
    const classEl = e.target.closest('[data-class]');
    const filterEl = e.target.closest('[data-filter]');
    const rowline = e.target.closest('.rowline');

    if(crumbEl){ crumbTo(crumbEl.dataset.crumb); return; }
    if(classEl){ curClass=classEl.dataset.class; renderClasses(); return; }
    if(filterEl){ S.itemFilter=filterEl.dataset.filter; S.itemLimit=60; renderItems(); return; }
    if(bossEl){ bossSheet(bossEl.dataset.boss); return; }
    if(focusEl){ closeSheet(); focusItem(focusEl.dataset.focus); return; }
    if(sheetEl){ itemSheet(sheetEl.dataset.sheet); return; }
    if(focus2){ itemSheet(focus2.dataset.focus2); return; }

    // tree row expand/collapse (only when not hitting a button/link above)
    if(rowline){
      const node = rowline.parentElement;
      if(node.classList.contains('craftable')){
        if(node._build) node._build();
        node.classList.toggle('open');
      } else {
        const nm = node.dataset.name; if(nm) itemSheet(nm);
      }
    }
  });

  // tree tool buttons (re-render-scoped, so query fresh)
  document.body.addEventListener('click', e=>{
    if(e.target.id==='toggleAll'){ S.expandAll=!S.expandAll; renderCraft(); }
    if(e.target.id==='toggleRaw'){ S.rawMode=!S.rawMode; renderCraft(); }
  });
}

// sheet close
document.addEventListener('click', e=>{ if(e.target.closest('[data-close]')) closeSheet(); });

// =====================  boot  ==============================================
async function boot(){
  try{
    const [it, cl, bo, mt] = await Promise.all([
      fetch('./data/items.json').then(r=>r.json()),
      fetch('./data/classes.json').then(r=>r.json()),
      fetch('./data/bosses.json').then(r=>r.json()),
      fetch('./data/meta.json').then(r=>r.json()).catch(()=>({})),
    ]);
    S.db = it.items; S.meta = it.meta||mt;
    S.classes = cl.classes; S.bosses = bo.bosses;
    S.names = Object.keys(S.db).sort((a,b)=>a.localeCompare(b));
    S.lower = S.names.map(n=>n.toLowerCase());
  }catch(err){
    app().innerHTML = `<div class="hint"><div class="big">&#9888;</div>Couldn't load data.<div class="faint">${esc(err.message)}</div></div>`;
    return;
  }
  document.querySelectorAll('#tabbar .tab').forEach(t=>t.addEventListener('click', ()=>setView(t.dataset.view)));
  $('#shareBtn').addEventListener('click', share);
  setView('craft');
}
function share(){
  const url = location.href.split('#')[0];
  if(navigator.share){ navigator.share({title:'Calamity Companion', url}).catch(()=>{}); }
  else { navigator.clipboard && navigator.clipboard.writeText(url); alert('Link copied!'); }
}
if('serviceWorker' in navigator){ window.addEventListener('load', ()=>navigator.serviceWorker.register('./sw.js').catch(()=>{})); }
boot();
