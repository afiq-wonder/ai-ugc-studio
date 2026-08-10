/* AI UGC Studio — Mini UGC Director v1.2.1
   Character Lock + Product Separation + Framing Guard + Scene Integrity Guard
   Branch: director-v1.2-character-lock
*/

(function (global) {
  'use strict';

  const libraries = {
    fashion: {
      focuses: ['overall silhouette and fit','sleeve, neckline, and fabric movement','side profile and garment proportions','material texture and construction details','complete styled look in motion'],
      actions: [
        'walks naturally into frame and briefly adjusts the garment while keeping the face visible',
        'turns about 45 degrees and gently shows sleeve or fabric movement, then looks back toward camera',
        'steps back to reveal the silhouette while keeping the full head and face identifiable',
        'shows one product detail briefly without turning the whole scene into a neck-down crop',
        'walks naturally through the scene and ends with the creator clearly identifiable'
      ],
      shots: [
        'medium head-to-thigh framing with the full head and recognizable face visible',
        'waist-up framing with the full head visible and a gentle forward handheld push',
        'medium-wide head-to-knee framing; never crop above the neck',
        'creator-established detail framing: begin with face visible, move briefly to detail, then return to creator',
        'medium lifestyle framing with the full head and recognizable face visible'
      ]
    },
    beauty: {
      focuses: ['product reveal and packaging','texture and dispensing action','application technique and feel','finish or visible result','product-in-routine lifestyle proof'],
      actions: ['brings the product naturally into frame while keeping the face readable','dispenses a small amount and shows texture while the creator remains identifiable','applies the product naturally while explaining one benefit','shows the finished result from a realistic angle with the face clearly visible','places the product back into the routine and gives a relaxed recommendation'],
      shots: ['medium close-up with full head visible','face-and-product framing with a gentle forward push','face-and-hands framing with steady handheld movement','close result framing that still preserves the full recognizable face','medium lifestyle framing with subtle natural sway']
    },
    home: {
      focuses: ['the everyday problem','how the product works','important mechanism or feature','visible result or convenience','real-life usefulness'],
      actions: ['shows the everyday problem first while remaining identifiable, then brings the product into frame','uses the product naturally to demonstrate its main function','shows the key feature close to camera without hiding the creator for the whole scene','reveals the finished result and compares it to the starting situation','uses the product once more in a normal daily-life moment'],
      shots: ['medium contextual creator shot with full head visible','medium demonstration shot with a gentle forward push','creator-established feature shot; brief detail close-up only','wider result shot that keeps the creator identifiable','lifestyle follow shot with subtle movement']
    },
    general: {
      focuses: ['first impression and product reveal','main feature and use','primary benefit in action','important product detail','final result and recommendation'],
      actions: ['introduces the product immediately with a natural first reaction while facing the camera','demonstrates the main feature with relaxed hand movement while keeping the face visible','uses the product naturally and shows the main benefit in context','brings one product detail closer to camera briefly without blocking the creator for the whole scene','shows the final result and ends with a relaxed recommendation to camera'],
      shots: ['medium chest-up creator framing with full head visible','waist-up framing with full head visible and a gentle forward push','medium-wide contextual framing with creator clearly identifiable','creator-established detail framing; return to face after close-up','medium creator framing with natural handheld follow']
    }
  };

  const structures = {
    'Authentic UGC review': ['First Impression','Proof','Verdict','Detail Proof','Lifestyle Recommendation'],
    'Fashion showcase': ['Visual Reveal','Fit Demonstration','Movement Proof','Detail Close-up','Final Look'],
    'Problem and solution': ['Problem Hook','Solution Reveal','Proof','Result','Recommendation'],
    'Unboxing': ['Package Hook','Reveal','First Reaction','Demonstration','Verdict'],
    'Luxury lifestyle': ['Aspirational Hook','Product Experience','Craft Detail','Lifestyle Proof','Soft Recommendation'],
    'Before and after': ['Before','Discovery','Application / Use','After','Recommendation']
  };

  function productLabel(d) { return (d && d.product) || 'the product shown in the second reference image'; }
  function sellingPoints(d) { return (d && d.sellingPoints) || 'quality, usefulness, comfort, and value'; }

  function detectCategory(d) {
    const text = `${d.product || ''} ${d.sellingPoints || ''} ${d.style || ''}`.toLowerCase();
    if (/shirt|dress|abaya|wear|fashion|outfit|shoe|bag|fabric|sleeve|fit|clothing|jeans|jacket|blazer|tudung|hijab/.test(text)) return 'fashion';
    if (/skin|serum|cream|beauty|makeup|cosmetic|lotion|shampoo|cleanser|lip|hair/.test(text)) return 'beauty';
    if (/home|kitchen|clean|mop|vacuum|storage|organizer|lamp|cooker|bottle|household/.test(text)) return 'home';
    return 'general';
  }

  function dialogueIntent(role,index,total) {
    const r = String(role || '').toLowerCase();
    if (/problem|hook|impression|reveal|before/.test(r)) return 'Open with a short, natural observation or curiosity line; do not explain everything yet.';
    if (/proof|demonstration|application|use|fit|detail|experience/.test(r)) return 'Explain one specific product benefit while it is visibly demonstrated; do not repeat the hook wording.';
    if (/result|after|verdict|recommendation|final/.test(r) || index === total - 1) return 'Give a personal verdict and a simple, non-pushy next step; do not repeat earlier benefit wording.';
    return 'Speak conversationally about what is happening in this scene, using new wording.';
  }

  function endingFor(index,total,seed) {
    const endings = ['briefly looks at the product, then back to camera before the cut','releases the product naturally and looks back to camera','changes stance while keeping both face and product clearly visible','finishes the detail demonstration and returns attention to camera','ends with a small confident smile and natural movement out of the shot'];
    return endings[(index + seed) % endings.length];
  }

  function direct(d,seed=0) {
    const category = detectCategory(d), lib = libraries[category], roles = structures[d.style] || structures['Authentic UGC review'], scenes = [];
    for (let i=0;i<d.scenes;i++) {
      const offset=(i+seed)%lib.actions.length;
      scenes.push({id:i,title:`Scene ${i+1} — ${roles[i] || 'Campaign Scene'}`,purpose:roles[i] || 'Advance the campaign naturally',category,productFocus:lib.focuses[offset],action:lib.actions[offset],camera:lib.shots[offset],dialogueIntent:dialogueIntent(roles[i] || '',i,d.scenes),ending:endingFor(i,d.scenes,seed)});
    }
    return scenes;
  }

  function identityPrompt() {
    return `CHARACTER IDENTITY LOCK — NON-NEGOTIABLE\n\nREFERENCE ROLE:\nReference image 1 is the ONLY source of truth for the creator's human identity.\n\nUse the exact same person from reference image 1 in every scene. Identity preservation has higher priority than styling, wardrobe, location, camera creativity, or product presentation.\n\nLOCK ALL VISIBLE IDENTITY FEATURES:\n- identical facial structure and facial proportions\n- identical eyes, eyebrows, nose, lips, jawline, cheeks and face shape\n- identical skin tone and apparent age\n- identical hairline, hair length, hairstyle and visible hair characteristics\n- identical headwear or head covering when present in the character reference\n- identical body proportions and overall recognizable appearance\n\nCRITICAL REFERENCE SEPARATION:\nIf reference image 2 contains another person or model, completely ignore that person's face, hair, headwear, skin, body and identity. Never blend that person with the creator. Reference image 2 may contribute PRODUCT INFORMATION ONLY.\n\nWARDROBE RULE:\nIf the promoted product is clothing, change only the garment required by the product reference. Do not use the clothing change as permission to redesign the creator's face, hair, headwear, body, age, makeup or other identity characteristics.\n\nVISIBILITY RULE:\nFor creator-led scenes, the creator's recognizable face and full head must remain visible. Never crop every generated scene below the neck. Never hide the face simply to prioritize the product.\n\nCONTINUITY:\nThe output must look like the same creator recorded during one continuous campaign session, not a similar person and not a newly cast model.\n\nDO NOT:\nidentity drift, face substitution, hairstyle substitution, removal or invention of headwear, beauty-filter redesign, age change, body replacement, identity blending, random model generation, or borrowing human traits from the product reference.`;
  }

  function productPrompt(d) {
    return `PRODUCT LOCK — NON-NEGOTIABLE\n\nREFERENCE ROLE:\nReference image 2 is the source of truth for the promoted product only.\n\nPromoted item: ${productLabel(d)}\n\nPreserve all product details actually visible in reference image 2: color, silhouette, material or fabric, cut, pattern, proportions, construction details, finish, visible graphics, accessories and overall design.\n\nDo not invent or alter logos, text, prints, colors, closures, stitching, packaging, accessories or product features that are not supported by the reference.\n\nREFERENCE SEPARATION:\nIf reference image 2 contains a human model, ignore that model completely. Do not copy the model's face, hair, hairstyle, headwear, body, pose or identity. The human subject must always come from reference image 1.\n\nWhen the product is apparel, transfer ONLY the referenced garment/product onto the locked creator while preserving the creator's identity and head appearance.\n\nKey selling points to communicate: ${sellingPoints(d)}.\nSelling points are communication guidance only. Do not render them as signs, captions, posters, labels, floating text, or environmental graphics unless explicitly requested.`;
  }

  function framingGuard(scene) {
    return `FRAMING GUARD — NON-NEGOTIABLE\nCamera direction: ${scene.camera}.\n- Never frame the entire scene below the creator's neck.\n- Do not cut off the top of the head in creator-led scenes.\n- Do not obscure the face with the product, hands, hair, props, or camera crop for most of the scene.\n- Keep enough product visible to understand the demonstration without sacrificing identity.\n- Product-detail close-ups must be brief and must be established by a recognizable creator shot before or after the detail.\n- Face visibility and identity verification take priority over extreme product close-ups.`;
  }

  function sceneIntegrityGuard(d) {
    return `SCENE INTEGRITY GUARD — NON-NEGOTIABLE\n- The selected scene location is: ${d.location}. Treat this as a hard environment constraint. The generated scene must visibly match this location unless physical impossibility requires a minor adaptation.\n- Reference image 1 supplies HUMAN IDENTITY ONLY. Do not copy its original room, furniture, background, signage, props, lighting setup, or environment unless they independently match the selected location.\n- Reference image 2 supplies PRODUCT INFORMATION ONLY. Do not copy its shop, rack, wall, packaging environment, background, signage, brand board, other products, people, props, or scene composition.\n- Selling points (${sellingPoints(d)}) are semantic guidance for dialogue, demonstration, and creator behavior ONLY. Never convert selling points into visible text, signs, chalkboards, posters, captions, labels, stickers, or environmental graphics.\n- Do not invent campaign branding, store signage, watermarks, slogans, promotional boards, UI text, subtitles, or decorative typography.\n- Preserve text or logos only when they are genuine visible details physically printed/embroidered on the promoted product in reference image 2. Do not move product graphics into the environment.\n- Keep the scene visually natural and plausible for authentic UGC; avoid staged advertising sets created merely to display selling points.\n- If a reference background conflicts with the selected location, the selected location wins.`;
  }

  function scenePrompt(d,scene) {
    return `DIRECTOR PRIORITY ORDER\n1. CHARACTER IDENTITY LOCK\n2. PRODUCT ACCURACY\n3. SCENE INTEGRITY + LOCATION\n4. FACE VISIBILITY + FRAMING\n5. SCENE ACTION\n6. UGC STYLE\n\nCHARACTER LOCK:\nUse reference image 1 as the ONLY human identity source. Generate the exact same person: identical face, facial proportions, skin tone, apparent age, hairline, hairstyle, hair length, visible hair characteristics, headwear/head covering if present, and body proportions.\n\nIf reference image 2 contains a model/person, IGNORE that person's identity completely. Never borrow or blend their face, hair, headwear or body. Reference image 2 is PRODUCT-ONLY.\n\n${scene.title}\n\nCreate a vertical 9:16 ${d.platform} campaign scene in ${d.language}.\n\nCampaign style: ${d.style}\nLocation: ${d.location}\nProduct: ${productLabel(d)}\n\nDIRECTOR PLAN:\nScene purpose: ${scene.purpose}\nCreator action: The creator ${scene.action}.\nProduct focus: ${scene.productFocus}.\nDialogue intent: ${scene.dialogueIntent}\nScene ending: The creator ${scene.ending}.\n\n${sceneIntegrityGuard(d)}\n\n${framingGuard(scene)}\n\nPRODUCT RULE:\nUse reference image 2 only to reproduce the product accurately. If this is apparel, transfer only the garment/product onto the locked creator. Preserve the creator's original identity and head appearance.\n\nPERFORMANCE:\nNatural blinking, subtle breathing, relaxed gestures, believable fabric/product physics, correct hand anatomy, and authentic creator expressions.\n\nCAMERA:\nAuthentic handheld smartphone creator footage with gentle micro-movement and natural UGC framing. Avoid polished fashion-editorial framing that sacrifices creator recognition. The creator must remain visually identifiable.\n\nDURATION:\n6–8 seconds, one coherent campaign scene.\n\nCONTINUITY:\nSame creator. Same identity. Same product. Same campaign session.\n\nREJECT THE GENERATION IF:\n- the creator becomes a different or merely similar person\n- hairstyle or headwear changes from the character reference\n- traits are copied from a person shown in the product reference\n- the face is missing for most or all of a creator-led scene\n- framing remains below the neck\n- the product is distorted or redesigned\n- the selected location is replaced by a reference-image background or unrelated environment\n- selling points appear as generated signage, captions, posters, labels, or decorative text\n- background branding/signage is copied from a reference image\n\nAVOID:\nidentity drift, random casting, face replacement, hair/headwear substitution, neck-down-only framing, product distortion, extra fingers, warped hands, altered logos, fake text, duplicate objects, exaggerated expressions, repeated poses, repeated dialogue, invented signage, reference-background leakage, or overly cinematic advertising.`;
  }

  function quality(scenes) {
    let duplicates=0;
    for(let i=0;i<scenes.length;i++) for(let j=i+1;j<scenes.length;j++) ['action','camera','productFocus','dialogueIntent'].forEach(k=>{if(scenes[i][k]===scenes[j][k]) duplicates++;});
    const max=Math.max(1,(scenes.length*(scenes.length-1)/2)*4);
    return Math.max(0,Math.round(100-(duplicates/max)*100));
  }

  const Director = {version:'1.2.1',libraries,structures,detectCategory,direct,redirect(d,scene,attempt){return direct(d,attempt+1)[scene.id];},quality,identityPrompt,productPrompt,framingGuard,sceneIntegrityGuard,scenePrompt,productLabel,sellingPoints};
  global.AIUGCDirector = Director;
})(window);