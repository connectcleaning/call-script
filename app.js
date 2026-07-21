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
  reason: '',
  windowPkg: 'silver',
  addons: new Set()
};

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

function buildParagraph(){
  const name = State.contact.first.trim() || 'there';
  const keys = activePainKeys();
  const empathies = keys.map(k=>painObj(k)?.empathy).filter(Boolean);
  const benefit   = keys.map(k=>painObj(k)?.benefit).filter(Boolean)[0]
                    || 'get your time back and stop thinking about the cleaning';
  const room = State.favroom.trim();

  let empathyClause;
  if(empathies.length===0){
    const raw=State.painFree.trim()||State.reason.trim();
    empathyClause = raw ? 'dealing with '+raw.replace(/\.$/,'') : 'juggling a lot right now';
  } else if(empathies.length===1){
    empathyClause = empathies[0];
  } else {
    empathyClause = empathies.slice(0,2).join(' and also ');
  }

  let p = `${name}, I know you've been ${empathyClause}. `;
  p += `Our whole goal is to give you your time back — so you can ${benefit}. `;
  if(room){
    p += `You told me ${room} matters most to you, so we're going to take that room top to bottom and make it the place you go to recharge. `;
  }
  p += `And when we're done, I'm personally following up to make sure it got the white-glove treatment.`;
  return p;
}
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
    list.innerHTML = rows.map(r=>
      `<div class="price-row ${r[3]}"><span class="nm">${r[1]}</span><span class="amt">${money(r[2])}</span></div>`
    ).join('') + addonHtml;
  }
  else if(State.service==='window'){
    if(sqft==null||isNaN(sqft)){ tag.textContent=''; list.innerHTML='<div class="empty">Enter square footage to see package pricing.</div>'; return; }
    tag.textContent = `Priced on ${sqft.toLocaleString()} sq ft · $${WINDOW.min} minimum`;
    const order=[['gold','anchor'],['silver','rec'],['bronze','muted-amt']];
    list.innerHTML = order.map(([k,cls])=>{
      const p=WINDOW.packages[k]; const price=windowPrice(k,sqft);
      const min = price===WINDOW.min ? ' <span class="bucket-tag">(minimum)</span>':'';
      return `<div class="price-row ${cls}"><span class="nm">${p.label}${min}</span><span class="amt">${money(price)}</span></div>`;
    }).join('');
  }
  else {
    tag.textContent='';
    list.innerHTML='<div class="empty">This service is not quoted on the call — collect details and the owner follows up. (See the script.)</div>';
  }
}

/* ---------- render: name slots + inline bindings ---------- */
function renderBindings(){
  const nm = State.contact.first.trim() || '[First name]';
  $$('.slot-name').forEach(el=>el.textContent=nm);
  const sq = State.sqft!=null&&!isNaN(State.sqft) ? State.sqft.toLocaleString() : '_____';
  $$('.slot-sqft').forEach(el=>el.textContent=sq);
  // house pricing slots inside the read-aloud lines
  if(State.service==='house'){
    const b=bucketFor(State.sqft);
    setSlot('slot-onetime', b&&b[HOME_SERVICE_INDEX.oneTime]);
    setSlot('slot-initial', b&&b[HOME_SERVICE_INDEX.initial]);
    setSlot('slot-biweekly',b&&b[HOME_SERVICE_INDEX.biweekly]);
  }
}
function setSlot(cls,val){
  $$('.'+cls).forEach(el=> el.textContent = (val? money(val):'_____'));
}

/* ---------- service switching ---------- */
function switchService(svc){
  State.service=svc;
  $$('.tab').forEach(t=>t.classList.toggle('active', t.dataset.svc===svc));
  $$('.svc-section').forEach(s=>s.classList.toggle('hidden', s.dataset.svc!==svc));
  renderPricing(); renderBindings();
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
    painPhrase: State.painFree, favoriteRoom:State.favroom, reason:State.reason,
    closingParagraph: buildParagraph(),
    addons:[...State.addons], windowPackage: State.service==='window'?State.windowPkg:null
  };
}
async function doOutcome(kind){
  const summary=callSummary(kind);
  // Declined never fires booking/estimate automation — it's just recorded.
  const url = kind==='booked' ? CFG.bookedUrl : (kind==='estimate' ? CFG.hcpUrl : '');
  const label = {declined:'Declined',estimate:'Estimate → HCP email',booked:'Booked → Needs-Scheduled cadence'}[kind];
  if(url){
    try{ await postJSON(url, summary); toast(label+' sent ✓'); }
    catch(e){ toast(label+' failed: '+e.message, true); }
  } else {
    await copyText(JSON.stringify(summary,null,2));
    toast(kind==='declined'
      ? 'Marked declined — call summary copied for your notes'
      : 'No webhook set for this outcome (Settings) — call summary copied to clipboard');
  }
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
      c.classList.toggle('on'); renderRephrase();
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

  // discovery
  $('#d_reason') && $('#d_reason').addEventListener('input',e=>{State.reason=e.target.value; renderRephrase();});
  $('#d_favroom') && $('#d_favroom').addEventListener('input',e=>{State.favroom=e.target.value; renderRephrase(); renderBindings();});
  $('#painFree') && $('#painFree').addEventListener('input',e=>{State.painFree=e.target.value; renderRephrase();});

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
  switchService('house'); renderRephrase(); renderPricing(); renderBindings();
});
