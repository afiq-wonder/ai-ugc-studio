(function (global) {
  'use strict';

  const parentWindow = global.parent;
  const state = { context:null,currentCampaignId:null,currentFingerprint:null,restoredIdentity:null,busy:false,bypass:false,authPromise:null };
  const $ = id => document.getElementById(id);

  function client(){
    try { if (parentWindow && parentWindow.AIUGCSupabase) return parentWindow.AIUGCSupabase; } catch (_) {}
    try { return global.AIUGCSupabase || null; } catch (_) { return null; }
  }
  function normalize(value){return String(value||'').trim().toLowerCase().replace(/\s+/g,' ')}
  async function fileDigest(file){if(!file)return'no-image';const bytes=await file.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
  async function productFingerprint(){const file=$('product')?.files?.[0]||null;const name=normalize($('name')?.value);const category=normalize($('category')?.value);if(!file&&state.currentFingerprint&&state.restoredIdentity&&name===normalize(state.restoredIdentity.product_name)&&category===normalize(state.restoredIdentity.category))return state.currentFingerprint;const digest=file?await fileDigest(file):`persisted:${state.currentFingerprint||'no-image'}`;const bytes=new TextEncoder().encode([digest,name,category].join('|'));const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')}
  function productVariables(){return{product_name:$('name')?.value?.trim()||'',category:$('category')?.value||'',platform:$('platform')?.value||'',language:$('language')?.value||'',style:$('style')?.value||'',camera:$('camera')?.value||'',location:$('location')?.value||'',action:$('action')?.value?.trim()||''}}
  function campaignOutput(){return{prompt:$('output')?.textContent||'',scene1:$('scene1')?.textContent||'',scene2:$('scene2')?.textContent||'',scene3:$('scene3')?.textContent||'',cta:$('cta')?.textContent||'',hashtags:$('hashtags')?.textContent||''}}
  function resetAutoOutput(){if($('output'))$('output').textContent='Prompt will appear here.';['scene1','scene2','scene3','cta','hashtags'].forEach(id=>{if($(id))$(id).textContent=''})}
  function setField(id,value){const el=$(id);if(el&&value!==undefined&&value!==null)el.value=value}
  function applyPersistedState(payload){const campaign=payload?.campaign,revision=payload?.revision;if(!campaign)return false;const variables=revision?.variables||campaign.product_variables||{},output=revision?.output||{};state.currentCampaignId=campaign.id;state.currentFingerprint=campaign.product_fingerprint;state.restoredIdentity={product_name:variables.product_name||campaign.product_name||'',category:variables.category||''};['name','category','platform','language','style','camera','location','action'].forEach(id=>setField(id,id==='name'?(variables.product_name||campaign.product_name||''):variables[id]));if(revision){if($('output'))$('output').textContent=output.prompt||'Prompt will appear here.';['scene1','scene2','scene3','cta','hashtags'].forEach(id=>{if($(id))$(id).textContent=output[id]||''})}const note=$('campaignRestoreState');if(note)note.textContent=`Restored: ${campaign.title||campaign.product_name||'latest campaign'}`;return true}

  function loadScript(src){
    return new Promise((resolve,reject)=>{
      const existing=[...document.scripts].find(s=>s.src===new URL(src,location.href).href);
      if(existing){if(existing.dataset.loaded==='1')return resolve();existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}
      const script=document.createElement('script');script.src=src;script.async=true;script.onload=()=>{script.dataset.loaded='1';resolve()};script.onerror=()=>reject(new Error(`Could not load ${src}`));document.head.appendChild(script);
    });
  }

  async function ensureAuthClient(){
    if(client())return client();
    if(!global.supabase)await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    if(!global.AIUGCSupabase)await loadScript('./saas/supabase-auth-provider.js');
    const sb=client();if(!sb)throw new Error('Authentication is temporarily unavailable.');return sb;
  }

  function injectAuthModal(){
    if($('aiugcAuthModal'))return;
    const style=document.createElement('style');
    style.textContent=`.aiugc-auth-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(5,7,12,.82);backdrop-filter:blur(10px);display:grid;place-items:center;padding:18px}.aiugc-auth-backdrop[hidden]{display:none}.aiugc-auth-modal{width:min(440px,100%);background:#121620;border:1px solid #283044;border-radius:22px;padding:22px;box-shadow:0 28px 80px rgba(0,0,0,.55)}.aiugc-auth-modal h3{margin:0 0 8px;font-size:24px}.aiugc-auth-modal p{margin:0 0 16px;color:#9aa4b2;line-height:1.5}.aiugc-auth-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}.aiugc-auth-tabs button{background:#1b2231;color:#fff;border:1px solid #283044}.aiugc-auth-tabs button.active{background:#7c5cff;border-color:#7c5cff}.aiugc-auth-form{display:grid;gap:10px}.aiugc-auth-form input{width:100%;background:#0f131b;color:#f7f8fb;border:1px solid #283044;border-radius:12px;padding:13px;font:inherit}.aiugc-auth-submit{background:#7c5cff;color:#fff}.aiugc-auth-cancel{width:100%;margin-top:8px;background:transparent;color:#9aa4b2;border:1px solid #283044}.aiugc-auth-message{min-height:20px;margin-top:10px;font-size:13px;color:#ff9b9b}.aiugc-auth-message.good{color:#7ee2b8}.aiugc-auth-free{padding:10px 12px;border-radius:12px;background:#17142b;border:1px solid #493f83;color:#d9d4ff!important;font-size:13px}`;
    document.head.appendChild(style);
    const wrap=document.createElement('div');wrap.id='aiugcAuthModal';wrap.className='aiugc-auth-backdrop';wrap.hidden=true;
    wrap.innerHTML=`<div class="aiugc-auth-modal" role="dialog" aria-modal="true" aria-labelledby="aiugcAuthTitle"><h3 id="aiugcAuthTitle">Your campaign is ready.</h3><p>Sign up or sign in to generate and save it. Your campaign settings stay right here.</p><p class="aiugc-auth-free"><strong>Free account:</strong> 1 campaign + full prompts + 1 generated image + 1 generated 8-second video.</p><div class="aiugc-auth-tabs"><button id="aiugcAuthSignup" type="button" class="active">Create account</button><button id="aiugcAuthSignin" type="button">Sign in</button></div><form id="aiugcAuthForm" class="aiugc-auth-form"><input id="aiugcAuthEmail" type="email" autocomplete="email" placeholder="Email" required><input id="aiugcAuthPassword" type="password" autocomplete="new-password" minlength="6" placeholder="Password" required><button id="aiugcAuthSubmit" class="aiugc-auth-submit" type="submit">Create account & continue</button></form><div id="aiugcAuthMessage" class="aiugc-auth-message"></div><button id="aiugcAuthCancel" class="aiugc-auth-cancel" type="button">Not now</button></div>`;
    document.body.appendChild(wrap);
  }

  async function hasSession(){const sb=await ensureAuthClient();const{data,error}=await sb.auth.getSession();if(error)throw error;return data.session||null}

  async function requestAuthentication(){
    const existing=await hasSession();if(existing)return existing;
    if(state.authPromise)return state.authPromise;
    injectAuthModal();
    const modal=$('aiugcAuthModal'),signup=$('aiugcAuthSignup'),signin=$('aiugcAuthSignin'),form=$('aiugcAuthForm'),email=$('aiugcAuthEmail'),password=$('aiugcAuthPassword'),submit=$('aiugcAuthSubmit'),message=$('aiugcAuthMessage'),cancel=$('aiugcAuthCancel');
    let mode='signup';
    function renderMode(next){mode=next;const isSignup=mode==='signup';signup.classList.toggle('active',isSignup);signin.classList.toggle('active',!isSignup);password.autocomplete=isSignup?'new-password':'current-password';submit.textContent=isSignup?'Create account & continue':'Sign in & continue';message.textContent='';message.classList.remove('good')}
    state.authPromise=new Promise(resolve=>{
      const cleanup=()=>{modal.hidden=true;state.authPromise=null};
      signup.onclick=()=>renderMode('signup');signin.onclick=()=>renderMode('signin');cancel.onclick=()=>{cleanup();resolve(null)};
      form.onsubmit=async event=>{event.preventDefault();message.textContent='';message.classList.remove('good');submit.disabled=true;try{const sb=await ensureAuthClient();if(mode==='signup'){const{data,error}=await sb.auth.signUp({email:email.value.trim(),password:password.value});if(error)throw error;if(data.session){cleanup();resolve(data.session);return}message.textContent='Account created. Check your email to confirm, then return here and sign in.';message.classList.add('good');renderMode('signin');}else{const{data,error}=await sb.auth.signInWithPassword({email:email.value.trim(),password:password.value});if(error)throw error;cleanup();resolve(data.session||null)}}catch(error){message.textContent=error?.message||'Could not authenticate.'}finally{submit.disabled=false}};
      modal.hidden=false;setTimeout(()=>email.focus(),50);
    });
    return state.authPromise;
  }

  function injectUI(){
    if($('campaignUsageBar'))return;
    const card=$('build')?.closest('.card');
    if(!card)return;
    const style=document.createElement('style');
    style.textContent=`.campaign-usage{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 16px;padding:11px 13px;border:1px solid var(--line);border-radius:14px;background:#0f131b;color:var(--muted);font-size:12px}.campaign-usage strong{color:var(--text)}.campaign-restore{margin:-6px 0 14px;color:var(--good);font-size:12px}`;
    document.head.appendChild(style);
    const bar=document.createElement('div');bar.id='campaignUsageBar';bar.className='campaign-usage';bar.innerHTML='<span><strong>Campaign workspace</strong> · revisions stay in the same campaign</span><span id="campaignUsageState">1 free campaign</span>';card.insertBefore(bar,card.children[1]||null);
    const restore=document.createElement('div');restore.id='campaignRestoreState';restore.className='campaign-restore';restore.textContent='Fill everything in, then tap Generate.';bar.insertAdjacentElement('afterend',restore);
  }

  function renderUsage(){const label=$('campaignUsageState');if(!label)return;const c=state.context||{};if(c.plan==='free'){label.textContent=`${Math.min(Number(c.used||0),1)}/1 free campaign used`}else{label.textContent='Paid access'}}
  async function loadContext(){const sb=client();if(!sb)throw new Error('Sign in to continue.');const profileResult=await sb.rpc('ensure_my_profile');if(profileResult.error)throw profileResult.error;const{data,error}=await sb.rpc('my_campaign_context');if(error)throw error;state.context=data||{latest_campaign:null};renderUsage();return state.context}
  async function restoreLatestCampaign(){const sb=client();if(!sb)return false;const{data,error}=await sb.rpc('latest_campaign_state');if(error)throw error;if(!data){const note=$('campaignRestoreState');if(note)note.textContent='No saved campaign yet.';return false}return applyPersistedState(data)}
  async function createCampaign(fingerprint,variables){const sb=client();const{data,error}=await sb.rpc('create_campaign_if_allowed',{p_title:variables.product_name||'Untitled campaign',p_product_name:variables.product_name||'Untitled product',p_product_fingerprint:fingerprint,p_product_variables:variables});if(error){if(String(error.message||'').includes('free_campaign_locked'))throw new Error('Your free campaign has already been used. Upgrade to create another campaign.');throw error}state.currentCampaignId=data.id;state.currentFingerprint=fingerprint;state.restoredIdentity={product_name:variables.product_name||'',category:variables.category||''};return data}
  async function recordRevision(variables,output){if(!state.currentCampaignId)return;const sb=client();const{error}=await sb.rpc('record_campaign_revision',{p_campaign_id:state.currentCampaignId,p_variables:variables,p_output:output});if(error)throw error;state.restoredIdentity={product_name:variables.product_name||'',category:variables.category||''};const note=$('campaignRestoreState');if(note)note.textContent=`Saved: ${variables.product_name||'current campaign'}`}

  async function runLocalBuild(){
    if(state.busy||state.bypass)return false;
    state.busy=true;
    try{
      const session=await requestAuthentication();if(!session)return false;
      const context=await loadContext();
      const fingerprint=await productFingerprint();
      const variables=productVariables();
      const existingFingerprint=state.currentFingerprint||context.latest_campaign?.product_fingerprint||null;
      const isNewCampaign=!state.currentCampaignId||!existingFingerprint||fingerprint!==existingFingerprint;
      state.bypass=true;try{global.build()}finally{state.bypass=false}
      if(isNewCampaign)await createCampaign(fingerprint,variables);
      await recordRevision(variables,campaignOutput());
      await loadContext();
      return true;
    }catch(error){console.error('Campaign workspace failed:',error);alert(error?.message||'Could not save this campaign.');return false}finally{state.busy=false}
  }

  function attachBuildGate(){const button=$('build');if(!button||button.dataset.campaignGate==='1')return;button.dataset.campaignGate='1';button.textContent='Generate Campaign';button.addEventListener('click',event=>{if(state.bypass)return;event.preventDefault();event.stopImmediatePropagation();runLocalBuild()},true)}
  function attachCopyGate(){const button=$('copy');if(!button||button.dataset.campaignGate==='1')return;button.dataset.campaignGate='1';button.addEventListener('click',event=>{if($('output')?.textContent!=='Prompt will appear here.')return;event.preventDefault();event.stopImmediatePropagation();runLocalBuild()},true);document.querySelectorAll('[data-target]').forEach(btn=>btn.addEventListener('click',event=>{const target=$(btn.dataset.target);if(target&&!target.textContent.trim()){event.preventDefault();event.stopImmediatePropagation();alert('Generate the campaign first.')}},true))}
  async function boot(){resetAutoOutput();injectUI();attachBuildGate();attachCopyGate();try{await ensureAuthClient();const session=await hasSession();if(session){await loadContext();await restoreLatestCampaign()}else{const label=$('campaignUsageState');if(label)label.textContent='1 free campaign';const note=$('campaignRestoreState');if(note)note.textContent='Fill everything in, then tap Generate.'}}catch(error){console.warn(error?.message||error);const label=$('campaignUsageState');if(label)label.textContent='Signup required on Generate';const note=$('campaignRestoreState');if(note)note.textContent='Your inputs will stay in place.'}}

  boot();
})(window);
