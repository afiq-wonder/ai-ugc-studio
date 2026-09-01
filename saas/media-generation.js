(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const mediaState = { imageData:null, imageMime:'image/jpeg', videoUrl:null, busyImage:false, busyVideo:false };

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
    if(!client){status.textContent='Sign up or sign in to unlock your free media.';$('build')?.click();return null;}
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    if(!data?.session){status.textContent='Sign up or sign in to unlock your free media. Your prompts remain available.';$('build')?.click();return null;}
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
    if(raw.includes('permission denied for function latest_campaign_state'))return 'Sign up or sign in to unlock your free media.';
    if(raw.includes('free_image_consumed'))return 'Your free image has already been generated. Upgrade to generate another image.';
    if(raw.includes('free_video_consumed'))return 'Your free 8-second video has already been generated. Upgrade to generate another video.';
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
    style.textContent='.media-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}.media-box{border:1px solid var(--line);border-radius:16px;background:#0f131b;padding:14px}.media-box img,.media-box video{width:100%;aspect-ratio:9/16;object-fit:cover;border-radius:12px;background:#090b10;display:none}.media-state{min-height:20px;margin:10px 0;color:var(--muted);font-size:13px;line-height:1.45;overflow-wrap:anywhere}.media-state.good{color:var(--good)}.media-actions{display:flex;gap:8px;flex-wrap:wrap}.media-actions button{flex:1}.media-note{font-size:12px;color:var(--muted);margin-top:10px;line-height:1.45}@media(max-width:760px){.media-grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
    const panel=document.createElement('section');
    panel.id='aiugcMediaPanel';panel.className='card';panel.style.marginTop='16px';
    panel.innerHTML=`<h3>6. Generate your free media</h3><div class="sub">Your campaign prompts stay copyable. Sign up to unlock one 9:16 image and one 8-second video.</div><div class="media-grid"><div class="media-box"><h4 style="margin-top:0">Free image</h4><img id="aiugcGeneratedImage" alt="Generated KakiUGC image"><div id="aiugcImageState" class="media-state">Sign up or sign in to unlock your included image.</div><div class="media-actions"><button id="aiugcGenerateImage" type="button" class="primary">Generate Image</button></div><div class="media-note">Uses your Creator, Product and optional Scene references with the Director prompt.</div></div><div class="media-box"><h4 style="margin-top:0">Free 8-second video</h4><video id="aiugcGeneratedVideo" controls playsinline></video><div id="aiugcVideoState" class="media-state">Sign up or sign in to unlock your included 8-second video.</div><div class="media-actions"><button id="aiugcGenerateVideo" type="button" class="primary">Generate 8s Video</button></div><div class="media-note">For best continuity, generate the image first. Video generation may take a few minutes.</div></div></div>`;
    campaign.insertAdjacentElement('afterend',panel);
    $('aiugcGenerateImage').addEventListener('click',generateImage);
    $('aiugcGenerateVideo').addEventListener('click',generateVideo);
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

  async function pollVideo(operationName,usageId){
    const client=sb(),status=$('aiugcVideoState');
    for(let attempt=0;attempt<72;attempt+=1){
      await new Promise(r=>setTimeout(r,10000));
      status.textContent=`Video processing… ${Math.floor((attempt+1)*10/60)}m ${((attempt+1)*10)%60}s`;
      const {data,error}=await client.functions.invoke('kakiugc-video-status',{body:{operationName,usageId}});
      if(error)throw new Error(await edgeErrorMessage(error));
      if(data?.error)throw new Error(data.error);
      if(data?.done)return data.video;
    }
    throw new Error('Video is still processing. Please try again shortly.');
  }

  async function loadVideoBlob(uri){
    const client=sb();
    const {data,error}=await client.functions.invoke('kakiugc-video-file',{body:{uri}});
    if(error)throw new Error(await edgeErrorMessage(error));
    if(data instanceof Blob)return data;
    if(data instanceof ArrayBuffer)return new Blob([data],{type:'video/mp4'});
    throw new Error('Could not load the generated video file.');
  }

  async function generateVideo(){
    if(mediaState.busyVideo)return;
    const button=$('aiugcGenerateVideo'),status=$('aiugcVideoState'),video=$('aiugcGeneratedVideo');
    mediaState.busyVideo=true;button.disabled=true;status.classList.remove('good');status.textContent='Checking your free video…';
    try{
      const campaign=await currentCampaign(status);if(!campaign){button.disabled=false;return;}
      const client=sb();
      const prompt=$('scene2')?.textContent?.trim()||$('output')?.textContent?.trim();
      if(!prompt||prompt==='Prompt will appear here.')throw new Error('Generate the campaign first.');
      const refs=await references();
      const body={kind:'video',campaignId:campaign.id,prompt,references:refs};
      if(mediaState.imageData)body.firstFrame={mimeType:mediaState.imageMime,data:mediaState.imageData};
      status.textContent='Starting your 8-second video…';
      const {data,error}=await client.functions.invoke('generate-kakiugc-media',{body});
      if(error)throw new Error(await edgeErrorMessage(error));
      if(data?.error)throw new Error(data.error);
      if(!data?.operationName||!data?.usageId)throw new Error('Video job did not start correctly.');
      status.textContent='Video job started. Processing…';
      const ready=await pollVideo(data.operationName,data.usageId);
      if(!ready?.uri)throw new Error('Video finished without a downloadable file.');
      const blob=await loadVideoBlob(ready.uri);
      if(mediaState.videoUrl)URL.revokeObjectURL(mediaState.videoUrl);
      mediaState.videoUrl=URL.createObjectURL(blob);video.src=mediaState.videoUrl;video.style.display='block';
      status.textContent='Video ready. Your free 8-second video entitlement is now used.';status.classList.add('good');button.textContent='Video Generated';
    }catch(error){console.error(error);status.textContent=errorMessage(error);button.disabled=false;}
    finally{mediaState.busyVideo=false;}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject,{once:true});else inject();
})(window);
