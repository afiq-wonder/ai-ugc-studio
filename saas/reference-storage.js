(function (global) {
  'use strict';

  const embedded = global.top !== global.self;
  const parentWindow = embedded ? global.parent : null;
  const BUCKET = 'campaign-references';
  const pending = { creator: null, product: null };
  const objectUrls = { creator: null, product: null };
  let persisting = false;

  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------------------------
  // Director v1.3.5 — Precision Digital Mockup Mode
  // Exact uploaded digital-product artwork is composited after scene generation.
  // The AI generates creator + environment + device; this layer preserves pixels.
  // ---------------------------------------------------------------------------

  function patchVersionBadge() {
    document.title = 'Director v1.3.5';
    document.querySelectorAll('.badge').forEach(node => {
      if (/Director v/i.test(node.textContent || '')) node.textContent = 'Director v1.3.5';
    });
    const build = $('build');
    if (build && /Build v/i.test(build.textContent || '')) build.textContent = 'Build v1.3.5 Prompt';
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('missing_file'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image_load_failed')); };
      img.src = url;
    });
  }

  function solveLinear8(A, b) {
    const n = 8;
    const M = A.map((row, i) => row.slice().concat([b[i]]));
    for (let col = 0; col < n; col += 1) {
      let pivot = col;
      for (let r = col + 1; r < n; r += 1) {
        if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
      }
      if (Math.abs(M[pivot][col]) < 1e-10) throw new Error('invalid_screen_geometry');
      [M[col], M[pivot]] = [M[pivot], M[col]];
      const div = M[col][col];
      for (let c = col; c <= n; c += 1) M[col][c] /= div;
      for (let r = 0; r < n; r += 1) {
        if (r === col) continue;
        const f = M[r][col];
        for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c];
      }
    }
    return M.map(row => row[n]);
  }

  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i += 1) {
      const x = src[i].x, y = src[i].y, u = dst[i].x, v = dst[i].y;
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const h = solveLinear8(A, b);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  function invert3(m) {
    const a=m[0],b=m[1],c=m[2],d=m[3],e=m[4],f=m[5],g=m[6],h=m[7],i=m[8];
    const A=e*i-f*h, B=-(d*i-f*g), C=d*h-e*g;
    const D=-(b*i-c*h), E=a*i-c*g, F=-(a*h-b*g);
    const G=b*f-c*e, H=-(a*f-c*d), I=a*e-b*d;
    const det=a*A+b*B+c*C;
    if (Math.abs(det) < 1e-10) throw new Error('invalid_screen_geometry');
    return [A/det,D/det,G/det,B/det,E/det,H/det,C/det,F/det,I/det];
  }

  function transformPoint(m, x, y) {
    const z = m[6]*x + m[7]*y + m[8];
    return { x:(m[0]*x+m[1]*y+m[2])/z, y:(m[3]*x+m[4]*y+m[5])/z };
  }

  function pointInQuad(x, y, q) {
    let sign = 0;
    for (let i=0;i<4;i+=1) {
      const a=q[i], b=q[(i+1)%4];
      const cross=(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);
      if (Math.abs(cross) < 1e-6) continue;
      const s = cross > 0 ? 1 : -1;
      if (!sign) sign=s; else if (sign !== s) return false;
    }
    return true;
  }

  function bilinear(src, sw, sh, x, y) {
    x=Math.max(0,Math.min(sw-1,x)); y=Math.max(0,Math.min(sh-1,y));
    const x0=Math.floor(x), y0=Math.floor(y), x1=Math.min(sw-1,x0+1), y1=Math.min(sh-1,y0+1);
    const dx=x-x0, dy=y-y0;
    const idx=(xx,yy)=>(yy*sw+xx)*4;
    const out=[0,0,0,0];
    for(let k=0;k<4;k+=1){
      const p00=src[idx(x0,y0)+k], p10=src[idx(x1,y0)+k], p01=src[idx(x0,y1)+k], p11=src[idx(x1,y1)+k];
      out[k]=(p00*(1-dx)+p10*dx)*(1-dy)+(p01*(1-dx)+p11*dx)*dy;
    }
    return out;
  }

  function makeContainedPlate(product, screenRatio) {
    const maxDim = 1600;
    let pw, ph;
    if (screenRatio >= 1) { pw=maxDim; ph=Math.max(1,Math.round(maxDim/screenRatio)); }
    else { ph=maxDim; pw=Math.max(1,Math.round(maxDim*screenRatio)); }
    const c=document.createElement('canvas'); c.width=pw; c.height=ph;
    const ctx=c.getContext('2d');
    ctx.fillStyle='#050505'; ctx.fillRect(0,0,pw,ph);
    const scale=Math.min(pw/product.naturalWidth, ph/product.naturalHeight);
    const dw=Math.round(product.naturalWidth*scale), dh=Math.round(product.naturalHeight*scale);
    const dx=Math.round((pw-dw)/2), dy=Math.round((ph-dh)/2);
    ctx.drawImage(product,dx,dy,dw,dh);
    return c;
  }

  function renderPrecisionComposite(state) {
    const canvas=$('precisionCanvas');
    if (!canvas || !state.scene || !state.product || state.points.length !== 4) return;
    canvas.width=state.scene.naturalWidth; canvas.height=state.scene.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(state.scene,0,0,canvas.width,canvas.height);

    const q=state.points;
    const top=Math.hypot(q[1].x-q[0].x,q[1].y-q[0].y), bottom=Math.hypot(q[2].x-q[3].x,q[2].y-q[3].y);
    const left=Math.hypot(q[3].x-q[0].x,q[3].y-q[0].y), right=Math.hypot(q[2].x-q[1].x,q[2].y-q[1].y);
    const ratio=Math.max(.2,Math.min(5,((top+bottom)/2)/Math.max(1,(left+right)/2)));
    const plate=makeContainedPlate(state.product,ratio);
    const pctx=plate.getContext('2d',{willReadFrequently:true});
    const pdata=pctx.getImageData(0,0,plate.width,plate.height);

    const src=[{x:0,y:0},{x:plate.width-1,y:0},{x:plate.width-1,y:plate.height-1},{x:0,y:plate.height-1}];
    const H=homography(src,q), inv=invert3(H);
    const minX=Math.max(0,Math.floor(Math.min(...q.map(p=>p.x)))), maxX=Math.min(canvas.width-1,Math.ceil(Math.max(...q.map(p=>p.x))));
    const minY=Math.max(0,Math.floor(Math.min(...q.map(p=>p.y)))), maxY=Math.min(canvas.height-1,Math.ceil(Math.max(...q.map(p=>p.y))));
    const target=ctx.getImageData(minX,minY,maxX-minX+1,maxY-minY+1);
    const td=target.data, tw=target.width;

    for(let y=minY;y<=maxY;y+=1){
      for(let x=minX;x<=maxX;x+=1){
        if(!pointInQuad(x+.5,y+.5,q)) continue;
        const s=transformPoint(inv,x+.5,y+.5);
        if(s.x<0||s.y<0||s.x>plate.width-1||s.y>plate.height-1) continue;
        const px=bilinear(pdata.data,plate.width,plate.height,s.x,s.y);
        const di=((y-minY)*tw+(x-minX))*4;
        const alpha=px[3]/255;
        for(let k=0;k<3;k+=1) td[di+k]=Math.round(px[k]*alpha+td[di+k]*(1-alpha));
        td[di+3]=255;
      }
    }
    ctx.putImageData(target,minX,minY);
    state.composited=true;
    $('precisionStatus').textContent='Precision composite ready — source artwork pixels preserved.';
    $('precisionDownload').disabled=false;
    drawHandles(state);
  }

  function drawHandles(state) {
    const canvas=$('precisionCanvas'); if(!canvas||!state.scene) return;
    const ctx=canvas.getContext('2d');
    ctx.save();
    ctx.strokeStyle='#7c5cff'; ctx.fillStyle='#ffffff'; ctx.lineWidth=Math.max(2,canvas.width/500);
    if(state.points.length){
      ctx.beginPath(); ctx.moveTo(state.points[0].x,state.points[0].y);
      state.points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
      if(state.points.length===4)ctx.closePath(); ctx.stroke();
    }
    state.points.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,Math.max(7,canvas.width/130),0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#111';ctx.font=`${Math.max(12,canvas.width/90)}px sans-serif`;ctx.fillText(String(i+1),p.x+9,p.y-9);ctx.fillStyle='#fff';});
    ctx.restore();
  }

  function installPrecisionPanel() {
    if ($('precisionDigitalPanel')) return;
    const campaign=document.querySelector('.campaign');
    if(!campaign) return;
    const panel=document.createElement('section');
    panel.id='precisionDigitalPanel'; panel.className='card'; panel.style.marginTop='16px';
    panel.innerHTML=`<h3>5. Precision Digital Mockup <span style="font-size:11px;color:var(--good);font-weight:700">v1.3.5</span></h3>
      <div class="sub">For digital products only. Generate the creator/device scene first, then place the exact uploaded product artwork onto the screen. No AI-redrawn logos or typography.</div>
      <div class="form">
        <div class="full"><label>Generated scene image</label><input id="precisionScene" type="file" accept="image/*"></div>
      </div>
      <div class="actions"><button class="secondary" id="precisionCalibrate" type="button">Set 4 Screen Corners</button><button class="primary" id="precisionComposite" type="button" disabled>Composite Exact Product</button><button class="secondary" id="precisionDownload" type="button" disabled>Download PNG</button></div>
      <div class="sub" style="margin-top:10px">Calibration order: top-left → top-right → bottom-right → bottom-left. Use the four INNER corners of the visible device screen.</div>
      <div style="margin-top:14px;background:#0f131b;border:1px solid var(--line);border-radius:16px;overflow:hidden"><canvas id="precisionCanvas" style="display:block;width:100%;height:auto;touch-action:none"></canvas></div>
      <div id="precisionStatus" class="status">Select Digital product, upload the source artwork above, then upload a generated scene.</div>`;
    campaign.insertAdjacentElement('afterend',panel);

    const state={scene:null,product:null,points:[],calibrating:false,composited:false};
    const canvas=$('precisionCanvas');

    $('precisionScene').addEventListener('change',async e=>{
      try{
        state.scene=await loadImageFromFile(e.target.files?.[0]); state.points=[]; state.composited=false;
        canvas.width=state.scene.naturalWidth; canvas.height=state.scene.naturalHeight; canvas.getContext('2d').drawImage(state.scene,0,0);
        $('precisionStatus').textContent='Scene loaded. Tap “Set 4 Screen Corners”.'; $('precisionComposite').disabled=true; $('precisionDownload').disabled=true;
      }catch(_){$('precisionStatus').textContent='Could not load generated scene.';}
    });

    $('precisionCalibrate').addEventListener('click',()=>{
      if(!state.scene){$('precisionStatus').textContent='Upload a generated scene first.';return;}
      state.points=[]; state.calibrating=true; state.composited=false; canvas.getContext('2d').drawImage(state.scene,0,0);
      $('precisionComposite').disabled=true; $('precisionDownload').disabled=true;
      $('precisionStatus').textContent='Tap screen corner 1 of 4: top-left.';
    });

    function addPoint(ev){
      if(!state.calibrating||!state.scene)return;
      ev.preventDefault(); const rect=canvas.getBoundingClientRect(); const touch=ev.touches?.[0]||ev;
      const x=(touch.clientX-rect.left)*canvas.width/rect.width, y=(touch.clientY-rect.top)*canvas.height/rect.height;
      state.points.push({x,y}); canvas.getContext('2d').drawImage(state.scene,0,0); drawHandles(state);
      const names=['top-left','top-right','bottom-right','bottom-left'];
      if(state.points.length<4){$('precisionStatus').textContent=`Tap screen corner ${state.points.length+1} of 4: ${names[state.points.length]}.`;}
      else{state.calibrating=false;$('precisionComposite').disabled=false;$('precisionStatus').textContent='Screen calibrated. Tap “Composite Exact Product”.';}
    }
    canvas.addEventListener('click',addPoint); canvas.addEventListener('touchstart',addPoint,{passive:false});

    $('precisionComposite').addEventListener('click',async()=>{
      if($('category')?.value!=='digital'){$('precisionStatus').textContent='Set Product category to Digital product first.';return;}
      try{
        const productFile=$('product')?.files?.[0];
        if(!productFile){$('precisionStatus').textContent='Upload the original digital product artwork in Product reference first.';return;}
        state.product=await loadImageFromFile(productFile); renderPrecisionComposite(state);
      }catch(err){console.error(err);$('precisionStatus').textContent='Precision composite failed. Recalibrate the four screen corners and retry.';}
    });

    $('precisionDownload').addEventListener('click',()=>{
      if(!state.composited)return;
      const a=document.createElement('a'); a.download='ai-ugc-studio-precision-mockup.png'; a.href=canvas.toDataURL('image/png'); a.click();
    });
  }

  // Existing campaign-reference persistence (used when Director runs embedded in SaaS).
  function client() {
    if (!embedded) return null;
    try { return parentWindow.AIUGCSupabase || null; }
    catch (_) { return null; }
  }

  function extensionFor(file) {
    const fromName = String(file?.name || '').split('.').pop().toLowerCase();
    const clean = fromName.replace(/[^a-z0-9]/g, '');
    if (clean && clean.length <= 8) return clean;
    const type = String(file?.type || '');
    if (type === 'image/png') return 'png';
    if (type === 'image/webp') return 'webp';
    if (type === 'image/heic') return 'heic';
    return 'jpg';
  }

  function renderBlob(role, blob) {
    const box = $(role === 'creator' ? 'creatorBox' : 'productBox');
    if (!box || !blob) return;
    if (objectUrls[role]) URL.revokeObjectURL(objectUrls[role]);
    const url = URL.createObjectURL(blob);
    objectUrls[role] = url;
    const img = new Image(); img.src = url;
    img.alt = role === 'creator' ? 'Saved creator reference' : 'Saved product reference';
    box.querySelectorAll('img').forEach(node => node.remove()); box.appendChild(img);
  }

  async function latestState() {
    const sb = client(); if (!sb) return null;
    const { data, error } = await sb.rpc('latest_campaign_state'); if (error) throw error;
    return data || null;
  }

  async function downloadInto(role, path) {
    if (!path) return false; const sb = client();
    const { data, error } = await sb.storage.from(BUCKET).download(path); if (error) throw error;
    renderBlob(role, data); return true;
  }

  async function restoreReferences() {
    const payload = await latestState(); const campaign = payload?.campaign; if (!campaign) return false;
    const tasks=[]; if(campaign.creator_ref_path)tasks.push(downloadInto('creator',campaign.creator_ref_path)); if(campaign.product_ref_path)tasks.push(downloadInto('product',campaign.product_ref_path));
    if(!tasks.length)return false; await Promise.all(tasks);
    const note=$('campaignRestoreState'); if(note)note.textContent=`Restored with references: ${campaign.title||campaign.product_name||'latest campaign'}`; return true;
  }

  async function uploadReference(role,file,campaignId){
    const sb=client(); const {data:userData,error:userError}=await sb.auth.getUser(); if(userError)throw userError;
    const userId=userData?.user?.id; if(!userId)throw new Error('authentication_required');
    const path=`${userId}/${campaignId}/${role}.${extensionFor(file)}`;
    const {error}=await sb.storage.from(BUCKET).upload(path,file,{upsert:true,contentType:file.type||undefined,cacheControl:'3600'}); if(error)throw error; return path;
  }

  async function persistPendingReferences(){
    if(!embedded||persisting||(!pending.creator&&!pending.product))return false; persisting=true;
    try{
      const sb=client(); if(!sb)return false; const payload=await latestState(); const campaign=payload?.campaign; if(!campaign?.id)return false;
      let creatorPath=null,productPath=null; if(pending.creator)creatorPath=await uploadReference('creator',pending.creator,campaign.id); if(pending.product)productPath=await uploadReference('product',pending.product,campaign.id);
      const {error}=await sb.rpc('set_campaign_reference_paths',{p_campaign_id:campaign.id,p_creator_ref_path:creatorPath,p_product_ref_path:productPath}); if(error)throw error;
      pending.creator=null;pending.product=null; const note=$('campaignRestoreState'); if(note)note.textContent=`Saved with references: ${campaign.title||campaign.product_name||'current campaign'}`; return true;
    }catch(error){console.error('Reference persistence failed:',error);const note=$('campaignRestoreState');if(note)note.textContent='Campaign saved; reference image upload needs retry.';return false;}finally{persisting=false;}
  }

  function watchInputs(){const creator=$('creator'),product=$('product');if(creator)creator.addEventListener('change',()=>{pending.creator=creator.files?.[0]||null;});if(product)product.addEventListener('change',()=>{pending.product=product.files?.[0]||null;});}
  function watchSaveState(){if(!embedded)return;const start=()=>{const note=$('campaignRestoreState');if(!note)return false;let last=note.textContent;new MutationObserver(()=>{const current=note.textContent;if(current!==last){last=current;if(current.startsWith('Saved:'))persistPendingReferences();}}).observe(note,{childList:true,characterData:true,subtree:true});return true;};if(!start()){let attempts=0;const timer=setInterval(()=>{attempts+=1;if(start()||attempts>=30)clearInterval(timer);},200);}}

  async function boot(){
    patchVersionBadge(); installPrecisionPanel(); watchInputs(); watchSaveState();
    if(!embedded)return;
    let attempts=0; const tryRestore=async()=>{attempts+=1;try{if(client()){await restoreReferences();return;}}catch(error){console.warn('Saved reference restore unavailable:',error?.message||error);}if(attempts<20)setTimeout(tryRestore,250);}; tryRestore();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})(window);
