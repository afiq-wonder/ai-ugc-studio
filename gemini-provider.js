(function (global) {
  'use strict';

  const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
  const DIRECT_ENDPOINT = model => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const str = { type: 'STRING' };
  const strings = { type: 'ARRAY', items: str };
  const evidence = {
    type: 'OBJECT',
    properties: { value: str, source: { type: 'STRING', enum: ['image','user_input','uncertain'] }, confidence: { type: 'STRING', enum: ['high','medium','low'] } },
    required: ['value','source','confidence']
  };

  function dataUrlToInlineData(dataUrl) {
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    return match ? { inlineData: { mimeType: match[1], data: match[2] } } : null;
  }

  const characterProfileSchema = {
    type: 'OBJECT', properties: {
      approximateAgeRange: str, faceShape: str, skinTone: str, eyeAppearance: str, build: str, bodyProportions: str,
      identityTraits: strings, currentAppearance: strings, uncertainFeatures: strings
    }, required: ['approximateAgeRange','faceShape','skinTone','eyeAppearance','build','bodyProportions','identityTraits','currentAppearance','uncertainFeatures']
  };
  const productProfileSchema = {
    type: 'OBJECT', properties: {
      category: str, brandIfVisible: str, modelIfVisible: str, primaryColor: str, secondaryColors: strings, shape: str,
      observedFacts: { type: 'ARRAY', items: evidence }, userProvidedClaims: strings, uncertainFeatures: strings, prohibitedClaims: strings
    }, required: ['category','brandIfVisible','modelIfVisible','primaryColor','secondaryColors','shape','observedFacts','userProvidedClaims','uncertainFeatures','prohibitedClaims']
  };
  const visionSchema = { type: 'OBJECT', properties: { characterProfile: characterProfileSchema, productProfile: productProfileSchema }, required: ['characterProfile','productProfile'] };
  const discoveryProfileSchema = { type: 'OBJECT', properties: {
    platform:str, market:str, language:str, primarySearchIntent:str, audienceIntent:str, searchPhrases:strings, spokenKeywords:strings,
    onScreenText:strings, captionKeywords:strings, hashtags:strings, hookAngle:str, titleSuggestion:str, descriptionSuggestion:str, avoidKeywords:strings, rationale:str
  }, required:['platform','market','language','primarySearchIntent','audienceIntent','searchPhrases','spokenKeywords','onScreenText','captionKeywords','hashtags','hookAngle','titleSuggestion','descriptionSuggestion','avoidKeywords','rationale'] };
  const campaignSchema = { type:'OBJECT', properties:{ identityLock:str, productAccuracy:str, hook:str, caption:str, cta:str, hashtags:str,
    scenes:{type:'ARRAY',items:{type:'OBJECT',properties:{title:str,text:str},required:['title','text']}}
  }, required:['identityLock','productAccuracy','hook','caption','cta','hashtags','scenes'] };
  const discoveryCampaignSchema = { type:'OBJECT', properties:{discoveryProfile:discoveryProfileSchema,campaign:campaignSchema}, required:['discoveryProfile','campaign'] };

  function buildVisionPrompt(context) {
    const input=context.input||{};
    return `You are the evidence-bound visual perception layer for AI UGC Studio.\n\nIMAGE 1 — CREATOR\nExtract stable visible physical continuity traits into identityTraits. Put clothing, hijab/headwear, jewellery, makeup, pose, expression and background ONLY in currentAppearance. Never make clothing/headwear a permanent identity trait. Do not infer ethnicity, nationality, religion, health, personality or sexuality. If hair is covered, say it is not visible; do not infer it.\n\nIMAGE 2 — PRODUCT\nExtract only facts visibly supported by the image. OCR text, logos and printed dimensions visible in the image ARE valid image evidence. Every observedFacts item MUST contain value, source=image, and confidence. Exact dimensions/specifications are allowed ONLY when legible in the product image. Never infer hidden specifications, battery capacity, certifications, materials, functions, accessories, popularity, pricing or store status from appearance alone. If uncertain, put it in uncertainFeatures rather than observedFacts.\n\nUSER INPUT\nProduct name: ${input.product||'Not provided'}\nSelling points: ${input.sellingPoints||'Not provided'}\nCopy user-supplied selling points into userProvidedClaims. They are claims supplied by the user, not visual evidence.\n\nPROHIBITED CLAIMS\nPopulate prohibitedClaims with plausible but unsupported claims the Creative layer must not invent (for example hidden specs, certifications, prices, discounts, popularity, reviews or accessories).\n\nReturn only structured JSON.`;
  }

  function buildDiscoveryPrompt(context,profiles){
    const input=context.input||{}, sceneCount=Number(input.scenes||3);
    return `You are Discovery Intelligence and Creative Director for AI UGC Studio. Search grounding may be used ONLY to discover natural search/category language. Search results are NOT evidence for this specific product's specifications or claims.\n\nINPUT\nProduct: ${input.product||'Not provided'}\nPlatform: ${input.platform||'TikTok'}\nMarket: ${input.market||'Malaysia'}\nLanguage: ${input.language||'English'}\nStyle: ${input.style||'Authentic UGC review'}\nLocation: ${input.location||'Unspecified'}\nScenes: ${sceneCount}\nUser selling points: ${input.sellingPoints||'Not provided'}\n\nCHARACTER PROFILE\n${JSON.stringify(profiles.characterProfile||{})}\n\nPRODUCT PROFILE\n${JSON.stringify(profiles.productProfile||{})}\n\nEVIDENCE CONTRACT\n- Advertising facts may come only from productProfile.observedFacts with medium/high confidence OR productProfile.userProvidedClaims.\n- uncertainFeatures must never be stated as facts.\n- prohibitedClaims must never appear.\n- Search grounding may influence keywords/search intent only; it must never add product dimensions, specifications, certifications, prices, discounts, reviews, popularity, accessories or capabilities.\n- Do not invent platform UI actions or commerce mechanisms such as yellow bag, shopping cart, link in bio, voucher, checkout or product link unless the user explicitly supplied that CTA/context. Use a neutral CTA such as “semak maklumat produk” when no CTA is supplied.\n- Do not convert currentAppearance into permanent identity. identityLock should preserve physical identity while allowing wardrobe/background changes.\n\nDISCOVERY\nAlign natural spoken keywords, on-screen text, captions and hashtags around one relevant intent without keyword stuffing or ranking promises.\n\nCREATIVE\nProduce exactly ${sceneCount} authentic UGC scenes. Each scene should include action, natural spoken line, on-screen text where useful, camera behavior, 6–8 second duration and continuity constraints. Do not overstate benefits.\n\nReturn only structured JSON.`;
  }

  async function callGeminiDirect({apiKey,model,parts,schema,useSearch}){
    const body={contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',responseSchema:schema}};
    if(useSearch) body.tools=[{google_search:{}}];
    const response=await fetch(DIRECT_ENDPOINT(model),{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(body)});
    if(!response.ok){let detail='';try{detail=(await response.json())?.error?.message||''}catch(_){}throw new Error(`Gemini request failed (${response.status})${detail?`: ${detail}`:''}`)}
    const payload=await response.json(), text=payload?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
    if(!text) throw new Error('Gemini returned no structured response.'); return JSON.parse(text);
  }
  async function callProxy({endpoint,model,operation,context,profiles}){const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,operation,context,profiles})});if(!r.ok)throw new Error(`Gemini proxy failed (${r.status}).`);return r.json()}

  function createGeminiProvider(options){
    const config=options||{},model=config.model||DEFAULT_MODEL,mode=config.mode||(config.endpoint?'proxy':'direct-test');
    return {name:'gemini',model,
      async analyzeImages(context){if(mode==='proxy')return callProxy({endpoint:config.endpoint,model,operation:'vision',context});if(!config.apiKey)throw new Error('Gemini test key is not configured.');const character=dataUrlToInlineData(context.references?.character),product=dataUrlToInlineData(context.references?.product);if(!character||!product)throw new Error('Both creator and product images are required for Gemini analysis.');return callGeminiDirect({apiKey:config.apiKey,model,schema:visionSchema,useSearch:false,parts:[{text:'IMAGE 1 — CREATOR IDENTITY REFERENCE'},character,{text:'IMAGE 2 — PRODUCT REFERENCE'},product,{text:buildVisionPrompt(context)}]})},
      async analyzeDiscovery(request){const context=request?.context||request||{},profiles=request?.profiles||{};if(mode==='proxy')return callProxy({endpoint:config.endpoint,model,operation:'discovery',context,profiles});return callGeminiDirect({apiKey:config.apiKey,model,schema:discoveryCampaignSchema,useSearch:config.useSearchGrounding!==false,parts:[{text:buildDiscoveryPrompt(context,profiles)}]})},
      async generateCampaign(context){if(!context?.references?.character||!context?.references?.product)return null;const profiles=await this.analyzeImages(context);let directed;try{directed=await this.analyzeDiscovery({context,profiles})}catch(e){if(mode==='direct-test'&&config.useSearchGrounding!==false){directed=await callGeminiDirect({apiKey:config.apiKey,model,schema:discoveryCampaignSchema,useSearch:false,parts:[{text:buildDiscoveryPrompt(context,profiles)}]});directed.discoveryProfile={...(directed.discoveryProfile||{}),groundingFallback:true}}else throw e}const c=directed?.campaign||{};return{identity:c.identityLock||context.campaign?.identity,productAccuracy:c.productAccuracy||context.campaign?.productAccuracy,scenes:Array.isArray(c.scenes)?c.scenes:context.campaign?.scenes,hook:c.hook||context.campaign?.hook,caption:c.caption||context.campaign?.caption,cta:c.cta||context.campaign?.cta,hashtags:c.hashtags||context.campaign?.hashtags,analysis:{provider:'gemini',model,characterProfile:profiles.characterProfile,productProfile:profiles.productProfile,discoveryProfile:directed?.discoveryProfile||null}}}
    }
  }
  global.GeminiProvider={create:createGeminiProvider,registerProxy(options){return global.AIProviderAdapter.registerProvider(createGeminiProvider({...options,mode:'proxy'}))}};
})(window);
