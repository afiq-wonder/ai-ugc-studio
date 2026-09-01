(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const mediaState = { imageData:null, imageMime:'image/jpeg', busyImage:false };

  function sb(){
    try { if (global.parent && global.parent.AIUGCSupabase) return global.parent.AIUGCSupabase; } catch (_) {}
    try { return global.AIUGCSupabase || null; } catch (_) { return null; }
  }

  async function fileToBase64(file){
    if(!file)return null;
    return await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
      reader.onerror=()=>reject(reader.error||new Error('file_read_failed'));
      reader.readAsDataURL(file);
    });
  }

  async function references(){
    const out=[];
    for(const [id,role] of [['creator','creator'],['product','product'],['scene','scene']]){
      const file=$(id)?.files?.[0];
      if(!file)continue;
      out.push({role,mimeType:file.type||'image/jpeg',data:await fileToBase64(file)});
    }
    return out;
  }

  async function ensureSignedIn(status){
    const client=sb();
    if(!client){status.textContent='Sign up or sign in to unlock your free image.';$('build')?.click();return null;}
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    if(!data?.session){status.textContent='Sign up or sign in to unlock your free image. Your prompts remain available.';$('build')?.click();return null;}
    return client;
  }

  async function currentCampaign(status){
    const client=await ensureSignedIn(status);
    if(!client)return null;
    const {data,error}=await client.rpc('latest_campaign_state');
    if(error)throw error;
    if(!data?.campaign?.id)throw new Error('Generate and save the campaign first.');
    return data.campaign;
  }

  function errorMessage(error){
    const raw=String(error?.message||error||'Generation failed.');
    if(raw.includes('permission denied for function latest_campaign_state'))return 'Sign up or sign in to unlock your free image.';
    if(raw.includes('free_image_consumed'))return 'Your free image has already been generated. Upgrade to generate another image.';
    if(raw.includes('generation_reservation_not_found'))return 'This generation session expired. Please try again.';
    return raw;
  }

  async function edgeErrorMessage(error){
    try{
      const response=error?.context;
      if(response && typeof response.clone==='function'){
        const clone=response.clone();
        const type=clone.headers?.get?.('content-type')||'';
        if(type.includes('application/json')){
          const payload=await clone.json();
          if(payload?.error)return String(payload.error);
          if(payload?.message)return String(payload.message);
        }else{
          const text=await clone.text();
          if(text)return text.slice(0,500);
        }
      }
    }catch(_){ }
    return errorMessage(error);
  }

  function inject(){
    if($('aiugcMediaPanel'))return;
    const campaign=document.querySelector('.campaign');
    if(!campaign)return;
    const style=document.createElement('style');
    style.textContent=`
      .media-panel-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .media-badge{font-size:11px;font-weight:700;color:#c8b9ff;background:rgba(124,92,255,.18);border:1px solid rgba(124,92,255,.28);padding:4px 8px;border-radius:999px}
      .media-grid{display:flex;justify-content:center;margin-top:16px}
      .media-box{width:min(100%,820px);border:1px solid rgba(124,92,255,.55);border-radius:22px;background:radial-gradient(circle at 50% 10%,rgba(124,92,255,.10),transparent 42%),#0f131b;padding:24px}
      .media-box-inner{max-width:680px;margin:0 auto;text-align:center}
      .media-icon{width:60px;height:60px;margin:0 auto 12px;border-radius:50%;display:grid;place-items:center;font-size:28px;background:rgba(124,92,255,.14);border:1px solid rgba(124,92,255,.55)}
      .media-title{font-size:28px;font-weight:800;margin:0 0 8px}
      .media-benefit{display:inline-block;margin-bottom:8px;color:#b79dff;background:rgba(124,92,255,.12);border:1px solid rgba(124,92,255,.24);padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700}
      .media-box img{width:min(100%,420px);aspect-ratio:9/16;object-fit:cover;border-radius:16px;background:#090b10;display:none;margin:0 auto 16px;border:1px solid var(--line)}
      .media-state{min-height:20px;margin:8px 0 14px;color:var(--muted);font-size:13px;line-height:1.45;overflow-wrap:anywhere}
      .media-state.good{color:var(--good)}
      .media-actions{display:flex;justify-content:center}
      .media-actions button{width:min(100%,680px);min-height:58px;font-size:18px;font-weight:800;border-radius:14px;box-shadow:0 0 24px rgba(124,92,255,.22)}
      .media-perks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:18px;text-align:left}
      .media-perk{display:flex;gap:10px;align-items:flex-start;padding:11px;border:1px solid var(--line);border-radius:14px;background:#0c1017}
      .media-perk-icon{width:30px;height:30px;flex:0 0 30px;border-radius:50%;display:grid;place-items:center;background:rgba(124,92,255,.14);color:#c8b9ff;font-size:14px}
      .media-perk strong{display:block;font-size:12px;color:var(--text);margin-bottom:2px}
      .media-perk span{display:block;font-size:11px;color:var(--muted);line-height:1.35}
      .media-note{font-size:12px;color:var(--muted);margin-top:14px;line-height:1.45;text-align:center;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:#0c1017}
      @media(max-width:700px){.media-box{padding:18px}.media-title{font-size:24px}.media-perks{grid-template-columns:1fr}.media-actions button{min-height:54px;font-size:17px}}
    `;
    document.head.appendChild(style);
    const panel=document.createElement('section');
    panel.id='aiugcMediaPanel';panel.className='card';panel.style.marginTop='16px';
    panel.innerHTML=`
      <div class="media-panel-head"><h3 style="margin:0">6. Generate your free image</h3><span class="media-badge">Included</span></div>
      <div class="sub" style="margin-top:10px">Your campaign prompts stay copyable and portable. Sign up to unlock one included 9:16 image.</div>
      <div class="media-grid">
        <div class="media-box">
          <div class="media-box-inner">
            <div class="media-icon">✦</div>
            <div class="media-title">1 included image</div>
            <span class="media-benefit">Free account benefit</span>
            <img id="aiugcGeneratedImage" alt="Generated KakiUGC image">
            <div id="aiugcImageState" class="media-state">Sign up or sign in to unlock your included 9:16 image.</div>
            <div class="media-actions"><button id="aiugcGenerateImage" type="button" class="primary">✦ Generate Image</button></div>
            <div class="media-perks">
              <div class="media-perk"><div class="media-perk-icon">▤</div><div><strong>Full prompts</strong><span>Always copyable</span></div></div>
              <div class="media-perk"><div class="media-perk-icon">▣</div><div><strong>1 included image</strong><span>9:16 format</span></div></div>
              <div class="media-perk"><div class="media-perk-icon">✓</div><div><strong>Your data, your control</strong><span>References stay under your control</span></div></div>
            </div>
            <div class="media-note">Uses your Creator and Product references with the Director prompt. Your video prompts remain copyable for use with your preferred AI video generator.</div>
          </div>
        </div>
      </div>`;
    campaign.insertAdjacentElement('afterend',panel);
    $('aiugcGenerateImage').addEventListener('click',generateImage);
  }

  async function generateImage(){
    if(mediaState.busyImage)return;
    const button=$('aiugcGenerateImage'),status=$('aiugcImageState'),img=$('aiugcGeneratedImage');
    mediaState.busyImage=true;button.disabled=true;status.classList.remove('good');status.textContent='Checking your free image…';
    try{
      const campaign=await currentCampaign(status);if(!campaign){button.disabled=false;return;}
      const client=sb();
      const prompt=$('scene1')?.textContent?.trim()||$('output')?.textContent?.trim();
      if(!prompt||prompt==='Prompt will appear here.')throw new Error('Generate the campaign first.');
      const refs=await references();
      status.textContent='Creating your image…';
      const {data,error}=await client.functions.invoke('generate-kakiugc-media',{body:{kind:'image',campaignId:campaign.id,prompt,references:refs}});
      if(error)throw new Error(await edgeErrorMessage(error));
      if(data?.error)throw new Error(data.error);
      if(!data?.data)throw new Error('Image response was empty.');
      mediaState.imageData=data.data;mediaState.imageMime=data.mimeType||'image/jpeg';
      img.src=`data:${mediaState.imageMime};base64,${mediaState.imageData}`;img.style.display='block';
      status.textContent='Image ready. Your free image entitlement is now used.';status.classList.add('good');button.textContent='Image Generated';
    }catch(error){console.error(error);status.textContent=errorMessage(error);button.disabled=false;}
    finally{mediaState.busyImage=false;}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject,{once:true});else inject();
})(window);
