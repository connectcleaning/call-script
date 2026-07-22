/* ================================================================
 *  Connect Cleaning — interactive call script
 *  Plain browser JS (no build step). Loads after data.js.
 * ================================================================ */

/* ---------- state ---------- */
const State = {
  service: 'house',
  contact: { first:'', last:'', phone:'', email:'', address:'' },
  sqft: null,
  pains: new Set(),
  painFree: '',
  favroom: '',
  fiveStar: '',
  reason: '',
  windowPkg: 'silver',
  addons: new Set(),
  winMode: 'resi',                 // window cleaning: 'resi' | 'commercial'
  appt: { date: '', date2: '', window: '', urgency: '' },
  discount: { type: 'none', value: 0, scope: 'firstclean' }   // type: none|pct|amt · scope: firstclean|all
};

/* ---------- discount ----------
 * scope 'firstclean' → first/initial clean & one-offs only (custom discounts,
 *                      e.g. a Facebook coupon). Recurring visits stay full.
 * scope 'all'        → also applies to recurring visits (the 10% objection).
 * Window packages are floored at $175 after any discount. */
const RECURRING_KEYS = new Set(['weekly','biweekly','monthly']);
const WINDOW_DISCOUNT_FLOOR = 175;
function discountActive(){ return State.discount.type!=='none' && State.discount.value>0; }
function discApplies(rowKey){
  if(!discountActive()) return false;
  if(State.discount.scope==='all') return true;
  return !RECURRING_KEYS.has(rowKey);   // firstclean scope skips recurring visits
}
function discPrice(price,rowKey,floor){
  if(price==null||isNaN(price)) return price;
  if(!discApplies(rowKey)) return price;
  const d=State.discount;
  let out = d.type==='pct' ? price*(1-d.value/100) : price-d.value;
  out = +out.toFixed(2);
  if(floor!=null) out = Math.max(floor,out);
  return Math.max(0,out);
}
function discountLabel(){
  const d=State.discount;
  if(!discountActive()) return '';
  const amt = d.type==='pct' ? `${d.value}% off` : `$${d.value.toFixed(2)} off`;
  return amt + (d.scope==='all' ? ' — first clean + recurring' : ' — first cleaning only');
}

const ARRIVAL_WINDOWS = ['8–10','10–12','12–2','2–4'];

/* ---------- config (integration endpoints) ---------- */
const CFG_KEY = 'cc_call_cfg';
let CFG = loadCfg();
function loadCfg(){
  try { return Object.assign(defaultCfg(), JSON.parse(localStorage.getItem(CFG_KEY)||'{}')); }
  catch(e){ return defaultCfg(); }
}
function defaultCfg(){
  // Deployed on Vercel, the app talks to its own /api/* routes by default.
  // sqftUrl stays blank so the friendly property-search fallback keeps working
  // until a property-data provider key is added.
  return { ghlUrl:'/api/ghl', sqftUrl:'', hcpUrl:'/api/estimate', bookedUrl:'/api/booked', aiUrl:'' };
}
function saveCfg(){ localStorage.setItem(CFG_KEY, JSON.stringify(CFG)); }

/* ---------- tiny helpers ---------- */
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const money = n => '$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function toast(msg, isErr){
  const t=$('#toast'); t.textContent=msg; t.className='toast on'+(isErr?' err':'');
  clearTimeout(toast._t); toast._t=setTimeout(()=>{t.className='toast';},3200);
}
async function postJSON(url, payload){
  const r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const ct=r.headers.get('content-type')||'';
  const body = ct.includes('json') ? await r.json().catch(()=>({})) : {};
  if(!r.ok){
    const msg = body.error || ('HTTP '+r.status);
    const detail = body.detail ? ' — '+(typeof body.detail==='string'?body.detail:JSON.stringify(body.detail)) : '';
    throw new Error(msg+detail);
  }
  return body;
}
function copyText(txt){
  if(navigator.clipboard) return navigator.clipboard.writeText(txt);
  const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select();
  document.execCommand('copy'); ta.remove(); return Promise.resolve();
}

/* ---------- pricing engine ---------- */
function bucketFor(sqft){
  if(sqft==null||isNaN(sqft)) return null;
  for(const b of HOME_BUCKETS){ if(sqft>=b[0]&&sqft<=b[1]) return b; }
  return sqft>HOME_BUCKETS[HOME_BUCKETS.length-1][1] ? HOME_BUCKETS[HOME_BUCKETS.length-1] : HOME_BUCKETS[0];
}
function windowPrice(pkg,sqft){
  if(sqft==null||isNaN(sqft)) return null;
  return Math.max(WINDOW.min, +(sqft*WINDOW.packages[pkg].rate).toFixed(2));
}

/* ---------- rephrase engine (instant, local) ---------- */
function detectPainsFromText(txt){
  const found=[];
  for(const [re,key] of PAIN_KEYWORDS){ if(re.test(txt)&&!found.includes(key)) found.push(key); }
  return found;
}
function activePainKeys(){
  const keys=[...State.pains];
  for(const k of detectPainsFromText(State.painFree)) if(!keys.includes(k)) keys.push(k);
  return keys;
}
function painObj(key){ return PAIN_POINTS.find(p=>p.key===key); }

function capFirst(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }

/* Turn a first-person phrase ("my house burnt down") into second person
   ("your house burnt down") so a typed pain slots into the script naturally. */
function swapPronouns(t){
  const map=[
    [/\bI['’]m\b/gi,'you are'], [/\bI['’]ve\b/gi,'you have'], [/\bI['’]ll\b/gi,'you will'],
    [/\bI\b/g,'you'], [/\bme\b/gi,'you'], [/\bmy\b/gi,'your'], [/\bmine\b/gi,'yours'],
    [/\bmyself\b/gi,'yourself'],
    [/\bwe['’]re\b/gi,'you are'], [/\bwe['’]ve\b/gi,'you have'], [/\bwe\b/gi,'you'],
    [/\bour\b/gi,'your'], [/\bours\b/gi,'yours'], [/\bus\b/gi,'you']
  ];
  let s=t; for(const [re,rep] of map) s=s.replace(re,rep); return s;
}

/* Pick a benefit clause that actually fits the room they named. */
function roomBenefit(room){
  const r = room.toLowerCase();
  if(/guest/.test(r))                         return 'have it guest-ready for whenever company shows up';
  if(/bath|shower|powder|ensuite|en-suite/.test(r)) return 'make it feel fresh and spotless every time you walk in';
  if(/bed|master|primary|suite/.test(r))      return 'make it the calm, restful space you unwind in at the end of the day';
  if(/living|family|great\s*room|den|lounge/.test(r)) return 'make it the room where you can finally relax';
  if(/kitchen/.test(r))                        return 'make it the clean, welcoming heart of the home';
  if(/dining/.test(r))                         return 'have it ready for everyone around the table';
  if(/office|study|desk/.test(r))              return 'give you a clear space you can actually focus in';
  if(/floor|baseboard|tile/.test(r))           return 'get them looking brand new';
  return "make sure it's the part of your home you're proudest of";
}

function buildParagraph(){
  const first = State.contact.first.trim();
  const namePrefix = first ? first + ', ' : '';
  const keys = activePainKeys();
  const room = State.favroom.trim();
  const roomLine = room
    ? `You told me ${room} matters most to you, so we're going to take it top to bottom and ${roomBenefit(room)}. `
    : '';
  const five = State.fiveStar.trim().replace(/[.\s]+$/,'');
  const fiveLine = five
    ? `We'll also make sure ${five} is taken care of, so it's a 5-star clean for you. `
    : '';
  const followUp = `And when we're done, I'm personally following up to make sure it got the white-glove treatment.`;
  const tail = roomLine + fiveLine + followUp;

  const empathies = keys.map(k=>painObj(k)?.empathy).filter(Boolean);
  if(empathies.length){
    const benefit = keys.map(k=>painObj(k)?.benefit).filter(Boolean)[0] || 'have one less thing on your plate';
    const empathyClause = empathies.length===1 ? empathies[0] : empathies.slice(0,2).join(' and also ');
    let p = capFirst(`${namePrefix}I know you've been ${empathyClause}. `);
    p += `Our whole goal is to give you your time back — so you can ${benefit}. `;
    return p + tail;
  }

  // A typed phrase that didn't match a preset pain point.
  const raw = (State.painFree.trim() || State.reason.trim()).replace(/[.\s]+$/,'');
  if(raw){
    const swapped = swapPronouns(raw);
    let p = capFirst(`${namePrefix}I know how it is with ${swapped} — there's a lot on your plate right now. `);
    p += `Our whole goal is to take the cleaning off your list so it's one less thing you have to think about. `;
    return p + tail;
  }

  // Nothing captured yet.
  let p = capFirst(`${namePrefix}Our whole goal is to give you your time back, so you can focus on everything else you've got going on instead of the cleaning. `);
  return p + tail;
}

/* Step-3 products question adapts to pets / kids-baby pain points. */
function renderProductsQuestion(){
  const el=$('#q-products'); if(!el) return;
  const keys=activePainKeys();
  const pets=keys.includes('pets');
  const child = keys.includes('baby') || /\b(kid|kids|child|children|toddler|little one|little ones)\b/i.test(State.painFree);
  let t;
  if(pets && child) t="You mentioned you've got a little one and pets at home — does it matter to you that the products we use around them are eco-friendly, non-toxic, and safe?";
  else if(pets) t="You mentioned you've got pets at home — does it matter to you that the products we use around them are eco-friendly, non-toxic, and safe?";
  else if(child) t="You mentioned there's a little one at home — does it matter to you that the products we use around them are eco-friendly, non-toxic, and safe?";
  else t="Does it matter to you that the company you choose uses eco-friendly, non-toxic products that are safe for you and everyone in your home?";
  el.textContent=t;
}

/* Auto-expand the moving-clean lines when "moving" is a pain point. */
function renderMovingBranch(){
  const d=$('#branch-moving'); if(!d) return;
  if(activePainKeys().includes('moving')) d.setAttribute('open',''); else d.removeAttribute('open');
}

/* The consequence question adapts to the pain points, with a solid default. */
function renderConsequence(){
  const el=$('#q-consequence'); if(!el) return;
  const k=activePainKeys();
  let t;
  if(k.includes('guests')||k.includes('listing'))
    t="If it stayed the way it is now, how would that feel when people are walking through the door?";
  else if(k.includes('surgery'))
    t="If it stayed the way it is now, how tough would that be to keep up with while you're trying to rest and recover?";
  else if(k.includes('baby'))
    t="If it stayed the way it is now, how would that feel to manage on top of everything with a new baby?";
  else if(k.includes('parent'))
    t="If it stayed the way it is now, how would that feel on top of everything you're already carrying?";
  else if(k.includes('moving'))
    t="If it stayed the way it is now, how would that feel on top of everything else with the move?";
  else if(k.includes('health'))
    t="If it stayed the way it is now, how much is the dust and buildup bothering you day to day?";
  else
    t="If it stayed the way it is now, how would you feel walking in a week from now — is that something you want to keep dealing with?";
  el.textContent=t;
}

function onPainsChanged(){ renderRephrase(); renderProductsQuestion(); renderConsequence(); renderMovingBranch(); }

function renderRephrase(){
  $('#rephraseOut').textContent = buildParagraph();
}

/* Optional: send to an AI endpoint for a polished rewrite */
async function aiPolish(){
  if(!CFG.aiUrl){ toast('No AI endpoint set (Settings). Using instant local rewrite.'); return; }
  const btn=$('#aiBtn'); const old=btn.textContent; btn.textContent='✨ polishing…'; btn.disabled=true;
  try{
    const out = await postJSON(CFG.aiUrl,{
      draft: buildParagraph(),
      painPoints: activePainKeys().map(k=>painObj(k)?.label).filter(Boolean),
      freeText: State.painFree, favoriteRoom: State.favroom, firstName: State.contact.first,
      instruction:'Rewrite this cleaning-company closing paragraph warmly and naturally in 2-4 sentences to match the customer\'s situation. Keep the personal follow-up promise.'
    });
    if(out && out.text){ $('#rephraseOut').textContent = out.text; toast('AI polish applied'); }
    else toast('AI endpoint returned no text', true);
  }catch(e){ toast('AI polish failed: '+e.message, true); }
  finally{ btn.textContent=old; btn.disabled=false; }
}

/* Price cell: shows the discounted amount, with the original struck through. */
function amtHtml(price,rowKey,floor){
  if(price==null||isNaN(price)) return money(price);
  if(!discApplies(rowKey)) return money(price);
  return `<span class="was">${money(price)}</span> ${money(discPrice(price,rowKey,floor))}`;
}
function discBanner(){
  return discountActive() ? `<div class="disc-banner">${discountLabel()}</div>` : '';
}

/* ---------- render: pricing rail ---------- */
function renderPricing(){
  const list=$('#priceList'); const tag=$('#bucketTag');
  const sqft=State.sqft;
  if(State.service==='house'){
    const b=bucketFor(sqft);
    if(!b){ tag.textContent=''; list.innerHTML='<div class="empty">Enter square footage to see live pricing.</div>'; return; }
    tag.textContent = `Range bucket: ${b[0].toLocaleString()}–${b[1].toLocaleString()} sq ft`;
    const rows=[
      ['oneTime','One-time cleaning', b[HOME_SERVICE_INDEX.oneTime], 'muted-amt'],
      ['initial','Initial (first) cleaning', b[HOME_SERVICE_INDEX.initial], ''],
      ['biweekly','Biweekly (recurring)', b[HOME_SERVICE_INDEX.biweekly], 'rec'],
      ['weekly','Weekly', b[HOME_SERVICE_INDEX.weekly], 'muted-amt'],
      ['monthly','Monthly', b[HOME_SERVICE_INDEX.monthly], 'muted-amt'],
      ['moving','Moving clean', b[HOME_SERVICE_INDEX.moving], 'muted-amt']
    ];
    let addonHtml='';
    if(State.addons.size){
      const items=[...State.addons].map(k=>ADDONS.find(a=>a.key===k)).filter(Boolean);
      const sum=items.reduce((s,a)=>s+a.price,0);
      addonHtml=`<div class="price-row"><span class="nm">Add-ons: ${items.map(a=>a.label.split(' ')[0]).join(', ')}</span><span class="amt">${money(sum)}</span></div>`;
    }
    list.innerHTML = discBanner() + rows.map(r=>
      `<div class="price-row ${r[3]}"><span class="nm">${r[1]}</span><span class="amt">${amtHtml(r[2], r[0])}</span></div>`
    ).join('') + addonHtml;
  }
  else if(State.service==='window'){
    if(sqft==null||isNaN(sqft)){ tag.textContent=''; list.innerHTML='<div class="empty">Enter square footage to see package pricing.</div>'; return; }
    tag.textContent = `Priced on ${sqft.toLocaleString()} sq ft · $${WINDOW.min} minimum`;
    const order=[['gold','anchor'],['silver','rec'],['bronze','muted-amt']];
    list.innerHTML = discBanner() + order.map(([k,cls])=>{
      const p=WINDOW.packages[k]; const price=windowPrice(k,sqft);
      const min = price===WINDOW.min ? ' <span class="bucket-tag">(minimum)</span>':'';
      return `<div class="price-row ${cls}"><span class="nm">${p.label}${min}</span><span class="amt">${amtHtml(price, k, WINDOW_DISCOUNT_FLOOR)}</span></div>`;
    }).join('');
  }
  else {
    tag.textContent='';
    list.innerHTML='<div class="empty">This service is not quoted on the call — collect details and the owner follows up. (See the script.)</div>';
  }
}

/* ---------- render: name slots + inline bindings ---------- */
function prettyDay(iso){
  if(!iso) return '';
  const d=new Date(iso+'T00:00:00');
  if(isNaN(d)) return '';
  return d.toLocaleDateString('en-US',{weekday:'long', month:'short', day:'numeric'});
}
function renderBindings(){
  const nm = State.contact.first.trim() || '[First name]';
  $$('.slot-name').forEach(el=>el.textContent=nm);
  const sq = State.sqft!=null&&!isNaN(State.sqft) ? State.sqft.toLocaleString() : '_____';
  $$('.slot-sqft').forEach(el=>el.textContent=sq);
  // appointment slots
  $$('.slot-day').forEach(el=>el.textContent = prettyDay(State.appt.date) || '[day]');
  $$('.slot-day2').forEach(el=>el.textContent = prettyDay(State.appt.date2) || '[second day]');
  $$('.slot-window').forEach(el=>el.textContent = State.appt.window ? State.appt.window+' arrival' : '[arrival window]');
  const urg = State.appt.urgency.trim();
  $$('.slot-urgency').forEach(el=>el.textContent = urg ? 'before '+urg : 'within a week');
  // house pricing slots inside the read-aloud lines (discount-aware)
  if(State.service==='house'){
    const b=bucketFor(State.sqft);
    setSlot('slot-onetime', b&&b[HOME_SERVICE_INDEX.oneTime], 'oneTime');
    setSlot('slot-initial', b&&b[HOME_SERVICE_INDEX.initial], 'initial');
    setSlot('slot-biweekly',b&&b[HOME_SERVICE_INDEX.biweekly], 'biweekly');
  }
  if(State.service==='window'){
    setSlot('slot-gold',   windowPrice('gold',   State.sqft), 'gold',   WINDOW_DISCOUNT_FLOOR);
    setSlot('slot-silver', windowPrice('silver', State.sqft), 'silver', WINDOW_DISCOUNT_FLOOR);
    setSlot('slot-bronze', windowPrice('bronze', State.sqft), 'bronze', WINDOW_DISCOUNT_FLOOR);
  }
  renderSchedule();
}
function setSlot(cls,val,rowKey,floor){
  $$('.'+cls).forEach(el=> el.textContent = (val? money(discPrice(val,rowKey,floor)):'_____'));
}

/* Show/hide the two-proposed-days line and the 2-day-reminder line. */
function renderSchedule(){
  const has2 = !!State.appt.date2 && !!State.appt.date;
  $$('.js-twodays').forEach(el=>el.classList.toggle('hidden', !has2));
  let far=false;
  if(State.appt.date){
    const d=new Date(State.appt.date+'T00:00:00'); const today=new Date(); today.setHours(0,0,0,0);
    far = ((d-today)/86400000) > 2;
  }
  $$('.js-reminder').forEach(el=>el.classList.toggle('hidden', !far));
}

/* ---------- service switching ---------- */
function switchService(svc){
  State.service=svc;
  $$('.tab').forEach(t=>t.classList.toggle('active', t.dataset.svc===svc));
  $$('.svc-section').forEach(s=>s.classList.toggle('hidden', s.dataset.svc!==svc));
  renderPricing(); renderBindings();
}

function refreshDiscount(){
  renderPricing(); renderBindings();
  const note=$('#discNote'); if(note) note.textContent=discountLabel() || 'No discount applied.';
  const b=$('#disc10'); if(b) b.classList.toggle('on', State.discount.type==='pct' && State.discount.value===10);
}

/* Window cleaning: residential vs commercial paths */
function setWinMode(mode){
  State.winMode=mode;
  $$('.winmode').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
  $$('.win-resi').forEach(el=>el.classList.toggle('hidden', mode!=='resi'));
  $$('.win-comm').forEach(el=>el.classList.toggle('hidden', mode!=='commercial'));
  renderPricing();
}

/* ---------- integration actions ---------- */
function contactPayload(){
  return { firstName:State.contact.first, lastName:State.contact.last, phone:State.contact.phone,
           email:State.contact.email, address:State.contact.address, source:'Inbound call — CSR script' };
}
async function saveContact(){
  const c=State.contact;
  if(!c.first && !c.phone && !c.email){ toast('Enter at least a name, phone, or email first', true); return; }
  if(CFG.ghlUrl){
    try{ await postJSON(CFG.ghlUrl, contactPayload()); toast('Contact pushed to GHL ✓'); }
    catch(e){ toast('GHL push failed: '+e.message, true); }
  } else {
    await copyText(JSON.stringify(contactPayload(),null,2));
    toast('No GHL webhook set (Settings) — contact JSON copied to clipboard');
  }
}
async function lookupSqft(){
  const addr=State.contact.address.trim();
  if(!addr){ toast('Enter the address first', true); return; }
  if(CFG.sqftUrl){
    toast('Looking up square footage…');
    try{
      const out=await postJSON(CFG.sqftUrl,{address:addr});
      const sq = out.sqft||out.squareFeet||out.livingArea;
      if(sq){ setSqft(+sq); toast(`Found ~${(+sq).toLocaleString()} sq ft — confirm with the customer`); }
      else toast('No sq ft returned — enter manually', true);
    }catch(e){ toast('Lookup failed: '+e.message+' — enter manually', true); }
  } else {
    window.open('https://www.google.com/search?q='+encodeURIComponent(addr+' square feet zillow'),'_blank');
    toast('Opened a property search — read the sq ft, type it in, and confirm with the customer');
  }
}
function setSqft(v){
  State.sqft = (v===''||v==null||isNaN(v))? null : Math.round(v);
  const inp=$('#sqft'); if(inp && String(State.sqft||'')!==inp.value) inp.value = State.sqft??'';
  renderPricing(); renderBindings();
}

function callSummary(outcome){
  const b=bucketFor(State.sqft);
  return {
    outcome, timestamp:new Date().toISOString(),
    service:State.service, contact:contactPayload(),
    squareFeet:State.sqft,
    bucket: b? `${b[0]}-${b[1]}`:null,
    painPoints: activePainKeys().map(k=>painObj(k)?.label).filter(Boolean),
    painPhrase: State.painFree, favoriteRoom:State.favroom, fiveStarMustHave:State.fiveStar, reason:State.reason,
    closingParagraph: buildParagraph(),
    addons:[...State.addons], windowPackage: State.service==='window'?State.windowPkg:null,
    windowMode: State.service==='window'?State.winMode:null,
    appointment: {
      date: State.appt.date||null, date2: State.appt.date2||null,
      arrivalWindow: State.appt.window||null, urgency: State.appt.urgency||null,
      dayLabel: prettyDay(State.appt.date)||null, day2Label: prettyDay(State.appt.date2)||null
    },
    discount: discountActive() ? { type:State.discount.type, value:State.discount.value, scope:State.discount.scope, label:discountLabel() } : null
  };
}
async function doOutcome(kind){
  const summary=callSummary(kind);
  const label = {declined:'Declined',estimate:'Maybe (estimate)',booked:'Booked'}[kind];
  const parts=[];

  // 1) Always push the contact to GHL (upsert). Booked also creates/updates
  //    the opportunity in Residential Sales → Needs Scheduled.
  if(CFG.ghlUrl){
    try{
      const nm=`${State.contact.first} ${State.contact.last}`.trim();
      const opp = kind==='booked'
        ? { name: (nm||'New booking')+` — ${State.service}` }
        : null;
      const r=await postJSON(CFG.ghlUrl,{ ...contactPayload(), createOpportunity: kind==='booked', opportunity: opp });
      if(kind==='booked' && r.opportunity){
        parts.push(r.opportunity.ok ? `GHL opp ${r.opportunity.action} → ${r.opportunity.stage}` : 'GHL opp failed');
      } else parts.push('GHL contact saved');
    }catch(e){ parts.push('GHL failed: '+e.message); }
  }

  // 2) Outcome-specific webhook: Slack/Asana for Booked, HCP email for Maybe.
  const url = kind==='booked' ? CFG.bookedUrl : (kind==='estimate' ? CFG.hcpUrl : '');
  if(url){
    try{ await postJSON(url, summary); parts.push(kind==='booked'?'Slack/Asana sent':'HCP estimate sent'); }
    catch(e){ parts.push('webhook failed: '+e.message); }
  } else if(!CFG.ghlUrl){
    await copyText(JSON.stringify(summary,null,2));
    parts.push('summary copied');
  }

  toast(`${label} — ${parts.join(' · ')||'recorded'}`, parts.some(p=>/failed/.test(p)));
}

/* ---------- settings modal ---------- */
function openSettings(){
  $('#cfg_ghl').value=CFG.ghlUrl; $('#cfg_sqft').value=CFG.sqftUrl;
  $('#cfg_hcp').value=CFG.hcpUrl; $('#cfg_booked').value=CFG.bookedUrl; $('#cfg_ai').value=CFG.aiUrl;
  $('#modal').classList.add('on');
}
function closeSettings(){ $('#modal').classList.remove('on'); }
function persistSettings(){
  CFG.ghlUrl=$('#cfg_ghl').value.trim(); CFG.sqftUrl=$('#cfg_sqft').value.trim();
  CFG.hcpUrl=$('#cfg_hcp').value.trim(); CFG.bookedUrl=$('#cfg_booked').value.trim(); CFG.aiUrl=$('#cfg_ai').value.trim();
  saveCfg(); closeSettings(); toast('Settings saved');
}

/* ---------- build dynamic bits + wire events ---------- */
function buildPainChips(){
  const wrap=$('#painChips'); wrap.innerHTML='';
  PAIN_POINTS.forEach(p=>{
    const c=document.createElement('button');
    c.className='chip'; c.textContent=p.label; c.dataset.key=p.key;
    c.addEventListener('click',()=>{
      if(State.pains.has(p.key)) State.pains.delete(p.key); else State.pains.add(p.key);
      c.classList.toggle('on'); onPainsChanged();
    });
    wrap.appendChild(c);
  });
}
function buildAddons(){
  const wrap=$('#addonChips'); if(!wrap) return;
  ADDONS.forEach(a=>{
    const c=document.createElement('button');
    c.className='chip'; c.textContent=`${a.label} (+$${a.price})`; c.dataset.key=a.key;
    c.addEventListener('click',()=>{
      if(State.addons.has(a.key)) State.addons.delete(a.key); else State.addons.add(a.key);
      c.classList.toggle('on'); renderPricing();
    });
    wrap.appendChild(c);
  });
}

function wire(){
  // contact fields
  const fmap={c_first:'first',c_last:'last',c_phone:'phone',c_email:'email',c_address:'address'};
  Object.entries(fmap).forEach(([id,key])=>{
    const el=$('#'+id); if(!el) return;
    el.addEventListener('input',()=>{ State.contact[key]=el.value; renderBindings(); if(key==='first') renderRephrase(); });
  });
  $('#sqft').addEventListener('input',e=> setSqft(e.target.value===''?null:parseInt(e.target.value,10)) );
  $('#btnLookup').addEventListener('click',lookupSqft);
  $('#btnSaveContact').addEventListener('click',saveContact);
  $('#btnLookup2') && $('#btnLookup2').addEventListener('click',lookupSqft);

  // tabs
  $$('.tab').forEach(t=>t.addEventListener('click',()=>switchService(t.dataset.svc)));
  // window residential / commercial toggle
  $$('.winmode').forEach(b=>b.addEventListener('click',()=>setWinMode(b.dataset.mode)));
  // appointment: urgency, two proposed days, arrival window
  $('#appt_urgency') && $('#appt_urgency').addEventListener('input',e=>{State.appt.urgency=e.target.value; renderBindings();});
  $('#appt_date') && $('#appt_date').addEventListener('input',e=>{State.appt.date=e.target.value; renderBindings();});
  $('#appt_date2') && $('#appt_date2').addEventListener('input',e=>{State.appt.date2=e.target.value; renderBindings();});
  $('#appt_window') && $('#appt_window').addEventListener('change',e=>{State.appt.window=e.target.value; renderBindings();});

  // discount controls
  // 10% objection discount applies to recurring too (scope 'all')
  $('#disc10') && $('#disc10').addEventListener('click',()=>{State.discount={type:'pct',value:10,scope:'all'}; if($('#discVal'))$('#discVal').value=''; refreshDiscount();});
  $('#discClear') && $('#discClear').addEventListener('click',()=>{State.discount={type:'none',value:0,scope:'firstclean'}; if($('#discVal'))$('#discVal').value=''; refreshDiscount();});
  $$('.disctype').forEach(btn=>btn.addEventListener('click',()=>{ $$('.disctype').forEach(x=>x.classList.toggle('active', x===btn)); }));
  // custom discounts apply to the first/initial clean only (scope 'firstclean')
  $('#discApply') && $('#discApply').addEventListener('click',()=>{
    const v=parseFloat($('#discVal').value);
    const t=($$('.disctype').find(x=>x.classList.contains('active'))||{}).dataset?.t || 'amt';
    if(isNaN(v)||v<=0){ toast('Enter a discount amount first', true); return; }
    if(t==='pct' && v>100){ toast('Percent can\'t exceed 100', true); return; }
    State.discount={type:t,value:v,scope:'firstclean'}; refreshDiscount();
  });

  // discovery
  $('#d_favroom') && $('#d_favroom').addEventListener('input',e=>{State.favroom=e.target.value; renderRephrase(); renderBindings();});
  $('#d_fivestar') && $('#d_fivestar').addEventListener('input',e=>{State.fiveStar=e.target.value; renderRephrase();});
  $('#painFree') && $('#painFree').addEventListener('input',e=>{State.painFree=e.target.value; onPainsChanged();});

  // window package select
  $$('.wpkg').forEach(r=>r.addEventListener('change',e=>{State.windowPkg=e.target.value;}));

  // rephrase tools
  $('#copyRephrase').addEventListener('click',()=>{copyText(buildParagraph()); toast('Closing paragraph copied');});
  $('#aiBtn').addEventListener('click',aiPolish);

  // outcomes
  $('#ocDeclined').addEventListener('click',()=>doOutcome('declined'));
  $('#ocMaybe').addEventListener('click',()=>doOutcome('estimate'));
  $('#ocBooked').addEventListener('click',()=>doOutcome('booked'));

  // settings
  $('#gear').addEventListener('click',openSettings);
  $('#cfgSave').addEventListener('click',persistSettings);
  $('#cfgCancel').addEventListener('click',closeSettings);
  $('#modal').addEventListener('click',e=>{ if(e.target.id==='modal') closeSettings(); });
}

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded',()=>{
  buildPainChips(); buildAddons(); wire();
  switchService('house'); setWinMode('resi'); onPainsChanged(); renderPricing(); renderBindings();
});
