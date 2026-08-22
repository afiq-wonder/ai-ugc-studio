(function (global) {
  'use strict';

  if (global.top === global.self) {
    global.location.replace('./saas/');
    return;
  }

  const parentWindow = global.parent;
  const state = { context:null,currentCampaignId:null,currentFingerprint:null,restoredIdentity:null,busy:false,bypass:false };
  const $ = id => document.getElementById(id);

  function client(){try{return parentWindow.AIUGCSupabase||null}catch(_){return null}}
  function normalize(value){return String(value||'').trim().toLowerCase().replace(/\s+/g,' ')}
  async function fileDigest(file){if(!file)return'no-image';const bytes=await file.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
  async function productFingerprint(){const file=$('product')?.files?.[0]||null;const name=normalize($('name')?.value);const category=normalize($('category')?.value);if(!file&&state.currentFingerprint&&state.restoredIdentity&&name===normalize(state.restoredIdentity.product_name)&&category===normalize(state.restoredIdentity.category))return state.currentFingerprint;const digest=file?await fileDigest(file):`persisted:${state.currentFingerprint||'no-image'}`;const bytes=new TextEncoder().encode([digest,name,category].join('|'));const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')}
  function productVariables(){return{product_name:$('name')?.value?.trim()||'',category:$('category')?.value||'',platform:$('platform')?.value||'',language:$('language')?.value||'',style:$('style')?.value||'',camera:$('camera')?.value||'',location:$('location')?.value||'',action:$('action')?.value?.trim()||''}}
  function campaignOutput(){return{prompt:$('output')?.textContent||'',scene1:$('scene1')?.textContent||'',scene2:$('scene2')?.textContent||'',scene3:$('scene3')?.textContent||'',cta:$('cta')?.textContent||'',hashtags:$('hashtags')?.textContent||''}}
  function resetAutoOutput(){if($('output'))$('output').textContent='Prompt will appear here.';['scene1','scene2','scene3','cta','hashtags'].forEach(id=>{if($(id))$(id).textContent=''})}
  function setField(id,value){const el=$(id);if(el&&value!==undefined&&value!==null)el.value=value}
  function applyPersistedState(payload){const campaign=payload?.campaign,revision=payload?.revision;if(!campaign)return false;const variables=revision?.variables||campaign.product_variables||{},output=revision?.output||{};state.currentCampaignId=campaign.id;state.currentFingerprint=campaign.product_fingerprint;state.restoredIdentity={product_name:variables.product_name||campaign.product_name||'',category:variables.category||''};['name','category','platform','language','style','camera','location','action'].forEach(id=>setField(id,id==='name'?(variables.product_name||campaign.product_name||''):variables[id]));if(revision){if($('output'))$('output').textContent=output.prompt||'Prompt will appear here.';['scene1','scene2','scene3','cta','hashtags'].forEach(id=>{if($(id))$(id).textContent=output[id]||''})}const note=$('campaignRestoreState');if(note)note.textContent=`Restored: ${campaign.title||campaign.product_name||'latest campaign'}`;return true}

  function injectUI(){
    if($('campaignUsageBar'))return;
    const card=$('build')?.closest('.card');
    if(!card)return;
    const style=document.createElement('style');
    style.textContent=`.campaign-usage{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 16px;padding:11px 13px;border:1px solid var(--line);border-radius:14px;background:#0f131b;color:var(--muted);font-size:12px}.campaign-usage strong{color:var(--text)}.campaign-restore{margin:-6px 0 14px;color:var(--good);font-size:12px}`;
    document.head.appendChild(style);
    const bar=document.createElement('div');
    bar.id='campaignUsageBar';
    bar.className='campaign-usage';
    bar.innerHTML='<span><strong>Campaign workspace</strong> · revisions stay in the same campaign</span><span id="campaignUsageState">Unlimited campaigns</span>';
    card.insertBefore(bar,card.children[1]||null);
    const restore=document.createElement('div');
    restore.id='campaignRestoreState';
    restore.className='campaign-restore';
    restore.textContent='Checking saved campaign…';
    bar.insertAdjacentElement('afterend',restore);
  }

  function renderUsage(){const label=$('campaignUsageState');if(label)label.textContent='Unlimited campaigns'}
  async function loadContext(){const sb=client();if(!sb)throw new Error('Sign in through AI UGC Studio before using Director.');const profileResult=await sb.rpc('ensure_my_profile');if(profileResult.error)throw profileResult.error;const{data,error}=await sb.rpc('my_campaign_context');if(error)throw error;state.context=data||{latest_campaign:null};renderUsage();return state.context}
  async function restoreLatestCampaign(){const sb=client();if(!sb)return false;const{data,error}=await sb.rpc('latest_campaign_state');if(error)throw error;if(!data){const note=$('campaignRestoreState');if(note)note.textContent='No saved campaign yet.';return false}return applyPersistedState(data)}
  async function createCampaign(fingerprint,variables){const sb=client();const{data,error}=await sb.rpc('create_campaign_if_allowed',{p_title:variables.product_name||'Untitled campaign',p_product_name:variables.product_name||'Untitled product',p_product_fingerprint:fingerprint,p_product_variables:variables});if(error)throw error;state.currentCampaignId=data.id;state.currentFingerprint=fingerprint;state.restoredIdentity={product_name:variables.product_name||'',category:variables.category||''};return data}
  async function recordRevision(variables,output){if(!state.currentCampaignId)return;const sb=client();const{error}=await sb.rpc('record_campaign_revision',{p_campaign_id:state.currentCampaignId,p_variables:variables,p_output:output});if(error)throw error;state.restoredIdentity={product_name:variables.product_name||'',category:variables.category||''};const note=$('campaignRestoreState');if(note)note.textContent=`Saved: ${variables.product_name||'current campaign'}`}

  async function runLocalBuild(){
    if(state.busy||state.bypass)return false;
    state.busy=true;
    try{
      const context=await loadContext();
      const fingerprint=await productFingerprint();
      const variables=productVariables();
      const existingFingerprint=state.currentFingerprint||context.latest_campaign?.product_fingerprint||null;
      const isNewCampaign=!state.currentCampaignId||!existingFingerprint||fingerprint!==existingFingerprint;
      state.bypass=true;
      try{global.build()}finally{state.bypass=false}
      if(isNewCampaign)await createCampaign(fingerprint,variables);
      await recordRevision(variables,campaignOutput());
      await loadContext();
      return true;
    }catch(error){
      console.error('Campaign workspace failed:',error);
      alert(error?.message||'Could not save this campaign.');
      return false;
    }finally{
      state.busy=false;
    }
  }

  function attachBuildGate(){const button=$('build');if(!button||button.dataset.campaignGate==='1')return;button.dataset.campaignGate='1';button.addEventListener('click',event=>{if(state.bypass)return;event.preventDefault();event.stopImmediatePropagation();runLocalBuild()},true)}
  function attachCopyGate(){const button=$('copy');if(!button||button.dataset.campaignGate==='1')return;button.dataset.campaignGate='1';button.addEventListener('click',event=>{if($('output')?.textContent!=='Prompt will appear here.')return;event.preventDefault();event.stopImmediatePropagation();runLocalBuild()},true);document.querySelectorAll('[data-target]').forEach(btn=>btn.addEventListener('click',event=>{const target=$(btn.dataset.target);if(target&&!target.textContent.trim()){event.preventDefault();event.stopImmediatePropagation();alert('Build the campaign first.')}},true))}
  async function boot(){resetAutoOutput();injectUI();attachBuildGate();attachCopyGate();try{await loadContext();await restoreLatestCampaign()}catch(error){console.warn(error?.message||error);const label=$('campaignUsageState');if(label)label.textContent='Sign in required';const note=$('campaignRestoreState');if(note)note.textContent='Saved campaign unavailable.'}}

  boot();
})(window);
