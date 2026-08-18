(function (global) {
  'use strict';

  const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
  const DIRECT_ENDPOINT = model => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const str = { type: 'STRING' };
  const strings = { type: 'ARRAY', items: str };
  const evidence = {
    type: 'OBJECT',
    properties: {
      value: str,
      source: { type: 'STRING', enum: ['image', 'user_input', 'uncertain'] },
      confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] }
    },
    required: ['value', 'source', 'confidence']
  };

  function dataUrlToInlineData(dataUrl) {
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    return match ? { inlineData: { mimeType: match[1], data: match[2] } } : null;
  }

  const characterProfileSchema = {
    type: 'OBJECT',
    properties: {
      approximateAgeRange: str,
      faceShape: str,
      skinTone: str,
      eyeAppearance: str,
      build: str,
      bodyProportions: str,
      identityTraits: strings,
      currentAppearance: strings,
      uncertainFeatures: strings
    },
    required: ['approximateAgeRange', 'faceShape', 'skinTone', 'eyeAppearance', 'build', 'bodyProportions', 'identityTraits', 'currentAppearance', 'uncertainFeatures']
  };

  const productProfileSchema = {
    type: 'OBJECT',
    properties: {
      category: str,
      brandIfVisible: str,
      modelIfVisible: str,
      primaryColor: str,
      secondaryColors: strings,
      shape: str,
      observedFacts: { type: 'ARRAY', items: evidence },
      spatialEvidence: { type: 'ARRAY', items: evidence },
      scaleLock: strings,
      userProvidedClaims: strings,
      uncertainFeatures: strings,
      spatialUncertainty: strings,
      prohibitedClaims: strings
    },
    required: ['category', 'brandIfVisible', 'modelIfVisible', 'primaryColor', 'secondaryColors', 'shape', 'observedFacts', 'spatialEvidence', 'scaleLock', 'userProvidedClaims', 'uncertainFeatures', 'spatialUncertainty', 'prohibitedClaims']
  };

  const visionSchema = {
    type: 'OBJECT',
    properties: { characterProfile: characterProfileSchema, productProfile: productProfileSchema },
    required: ['characterProfile', 'productProfile']
  };

  const discoveryProfileSchema = {
    type: 'OBJECT',
    properties: {
      platform: str,
      market: str,
      language: str,
      primarySearchIntent: str,
      audienceIntent: str,
      searchPhrases: strings,
      spokenKeywords: strings,
      onScreenText: strings,
      captionKeywords: strings,
      hashtags: strings,
      hookAngle: str,
      titleSuggestion: str,
      descriptionSuggestion: str,
      avoidKeywords: strings,
      rationale: str
    },
    required: ['platform', 'market', 'language', 'primarySearchIntent', 'audienceIntent', 'searchPhrases', 'spokenKeywords', 'onScreenText', 'captionKeywords', 'hashtags', 'hookAngle', 'titleSuggestion', 'descriptionSuggestion', 'avoidKeywords', 'rationale']
  };

  const campaignSchema = {
    type: 'OBJECT',
    properties: {
      identityLock: str,
      productAccuracy: str,
      hook: str,
      caption: str,
      cta: str,
      hashtags: str,
      scenes: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { title: str, text: str },
          required: ['title', 'text']
        }
      }
    },
    required: ['identityLock', 'productAccuracy', 'hook', 'caption', 'cta', 'hashtags', 'scenes']
  };

  const discoveryCampaignSchema = {
    type: 'OBJECT',
    properties: { discoveryProfile: discoveryProfileSchema, campaign: campaignSchema },
    required: ['discoveryProfile', 'campaign']
  };

  function buildVisionPrompt(context) {
    const input = context.input || {};
    return `You are the evidence-bound visual perception layer for AI UGC Studio.

IMAGE 1 — CREATOR
Extract stable visible physical continuity traits into identityTraits. Put clothing, hijab/headwear, jewellery, makeup, pose, expression and background ONLY in currentAppearance. Never make clothing/headwear a permanent identity trait. Do not infer ethnicity, nationality, religion, health, personality or sexuality. If hair is covered, say it is not visible; do not infer it.

IMAGE 2 — PRODUCT
Extract only facts visibly supported by the image. OCR text, logos and printed dimensions visible in the image ARE valid image evidence. Every observedFacts item MUST contain value, source=image, and confidence. Exact dimensions/specifications are allowed ONLY when legible in the product image. Never infer hidden specifications, battery capacity, certifications, materials, functions, accessories, popularity, pricing or store status from appearance alone. If uncertain, put it in uncertainFeatures rather than observedFacts.

SPATIAL EVIDENCE / SCALE
Also analyze scale and spatial relationships that are visibly supported. Put these in spatialEvidence with source=image and confidence. Prefer, in order: (1) printed dimensions visible in the reference; (2) product-to-person or product-to-body relationships; (3) product-to-hand, table, chair, floor, bag, bottle, shoe or other familiar-object relationships; (4) proportions between major product components. Do not invent absolute measurements from perspective alone.
Create scaleLock as short generation constraints derived ONLY from medium/high-confidence spatialEvidence. Examples of valid constraints: preserve the assembled height shown in the reference; keep the base proportionally large relative to the fan head; preserve product-to-person scale; do not miniaturize or enlarge the product. If scale cannot be determined confidently, put the ambiguity in spatialUncertainty and keep scaleLock conservative.

USER INPUT
Product name: ${input.product || 'Not provided'}
Selling points: ${input.sellingPoints || 'Not provided'}
Copy user-supplied selling points into userProvidedClaims. They are claims supplied by the user, not visual evidence.

PROHIBITED CLAIMS
Populate prohibitedClaims with plausible but unsupported claims the Creative layer must not invent.

Return only structured JSON.`;
  }

  function buildDiscoveryPrompt(context, profiles) {
    const input = context.input || {};
    const sceneCount = Number(input.scenes || 3);
    return `You are Discovery Intelligence and a high-performing UGC Creative Director. Search grounding may be used ONLY to discover natural search/category language. Search results are NOT evidence for this specific product's specifications or claims.

INPUT
Product: ${input.product || 'Not provided'}
Platform: ${input.platform || 'TikTok'}
Market: ${input.market || 'Malaysia'}
Language: ${input.language || 'English'}
Style: ${input.style || 'Authentic UGC review'}
Location: ${input.location || 'Unspecified'}
Scenes: ${sceneCount}
User selling points: ${input.sellingPoints || 'Not provided'}

CHARACTER PROFILE
${JSON.stringify(profiles.characterProfile || {})}

PRODUCT PROFILE
${JSON.stringify(profiles.productProfile || {})}

EVIDENCE CONTRACT — NON-NEGOTIABLE
- Advertising facts may come only from productProfile.observedFacts with medium/high confidence OR productProfile.userProvidedClaims.
- uncertainFeatures must never be stated as facts. prohibitedClaims must never appear.
- Search may influence discovery language only; never product facts.
- Do not invent prices, discounts, reviews, popularity, certifications, hidden specs, accessories, capabilities or commerce mechanisms.
- Do not convert currentAppearance into permanent identity.

SPATIAL / SCALE CONTRACT — NON-NEGOTIABLE
- Treat productProfile.spatialEvidence and productProfile.scaleLock as generation-critical evidence, not optional descriptive detail.
- productAccuracy MUST include a concise Scale Lock section whenever scaleLock is non-empty.
- EVERY scene that shows or handles the product MUST explicitly preserve the same real-world scale and component proportions.
- When printed dimensions are visible with medium/high confidence, carry those dimensions into productAccuracy and into scene direction where they help prevent scale drift.
- Preserve product-to-person, product-to-hand, product-to-table/floor and component-to-component relationships when supported by spatialEvidence.
- Never miniaturize, enlarge, compress, stretch or reinterpret the product merely to fit the composition.
- Never convert uncertain perspective estimates into exact dimensions.

CREATIVE FREEDOM — ENCOURAGED
Be persuasive, conversational and creator-native WITHOUT inventing facts. Creative language, relatable situations, questions, reactions, transitions, pacing, curiosity and emotional framing do not count as product claims when they do not assert unsupported facts.
Write like a real ${input.market || 'local'} creator speaking naturally in ${input.language || 'the requested language'}, not like a catalogue, specification sheet or corporate advertisement. Avoid stiff phrases such as “unit ini menampilkan” or repeatedly describing visible geometry unless that detail matters to the story or scale lock.
Open with a relatable problem, curiosity gap, surprising observation or situational hook. Move quickly from hook -> product interaction/demonstration -> believable outcome/CTA. Prefer first-person conversational phrasing and short spoken lines.
Use the requested ${input.style || 'UGC'} style and ${input.location || 'location'} as creative context. The creator may express subjective reactions such as curiosity, convenience or visual preference, but must not convert them into objective performance claims.
Each scene must feel visually different while remaining one continuous campaign. Include action, natural spoken line, useful on-screen text, camera behavior, 6–8 second duration and continuity constraints.
The hook, spoken keywords, on-screen text, caption and hashtags should reinforce one discovery intent naturally, without keyword stuffing or ranking promises.
If no explicit commerce CTA is supplied, use a natural neutral CTA such as “semak maklumat produk” rather than inventing a yellow bag, cart, voucher, checkout or product link.

QUALITY BAR
Aim for Test #1 energy with Test #2 factual discipline and strict spatial fidelity. Produce exactly ${sceneCount} scenes. Return only structured JSON.`;
  }

  async function callGeminiDirect({ apiKey, model, parts, schema, useSearch }) {
    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema }
    };
    if (useSearch) body.tools = [{ google_search: {} }];
    const response = await fetch(DIRECT_ENDPOINT(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json())?.error?.message || ''; } catch (_) {}
      throw new Error(`Gemini request failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!text) throw new Error('Gemini returned no structured response.');
    return JSON.parse(text);
  }

  async function callProxy({ endpoint, model, operation, context, profiles }) {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, operation, context, profiles })
    });
    if (!r.ok) throw new Error(`Gemini proxy failed (${r.status}).`);
    return r.json();
  }

  function createGeminiProvider(options) {
    const config = options || {};
    const model = config.model || DEFAULT_MODEL;
    const mode = config.mode || (config.endpoint ? 'proxy' : 'direct-test');
    return {
      name: 'gemini',
      model,
      async analyzeImages(context) {
        if (mode === 'proxy') return callProxy({ endpoint: config.endpoint, model, operation: 'vision', context });
        if (!config.apiKey) throw new Error('Gemini test key is not configured.');
        const character = dataUrlToInlineData(context.references?.character);
        const product = dataUrlToInlineData(context.references?.product);
        if (!character || !product) throw new Error('Both creator and product images are required for Gemini analysis.');
        return callGeminiDirect({
          apiKey: config.apiKey,
          model,
          schema: visionSchema,
          useSearch: false,
          parts: [
            { text: 'IMAGE 1 — CREATOR IDENTITY REFERENCE' },
            character,
            { text: 'IMAGE 2 — PRODUCT REFERENCE' },
            product,
            { text: buildVisionPrompt(context) }
          ]
        });
      },
      async analyzeDiscovery(request) {
        const context = request?.context || request || {};
        const profiles = request?.profiles || {};
        if (mode === 'proxy') return callProxy({ endpoint: config.endpoint, model, operation: 'discovery', context, profiles });
        return callGeminiDirect({
          apiKey: config.apiKey,
          model,
          schema: discoveryCampaignSchema,
          useSearch: config.useSearchGrounding !== false,
          parts: [{ text: buildDiscoveryPrompt(context, profiles) }]
        });
      },
      async generateCampaign(context) {
        if (!context?.references?.character || !context?.references?.product) return null;
        const profiles = await this.analyzeImages(context);
        let directed;
        try {
          directed = await this.analyzeDiscovery({ context, profiles });
        } catch (e) {
          if (mode === 'direct-test' && config.useSearchGrounding !== false) {
            directed = await callGeminiDirect({
              apiKey: config.apiKey,
              model,
              schema: discoveryCampaignSchema,
              useSearch: false,
              parts: [{ text: buildDiscoveryPrompt(context, profiles) }]
            });
            directed.discoveryProfile = {
              ...(directed.discoveryProfile || {}),
              discoveryMode: 'model_only',
              searchGrounding: 'unavailable_or_failed'
            };
          } else {
            throw e;
          }
        }
        const c = directed?.campaign || {};
        return {
          identity: c.identityLock || context.campaign?.identity,
          productAccuracy: c.productAccuracy || context.campaign?.productAccuracy,
          scenes: Array.isArray(c.scenes) ? c.scenes : context.campaign?.scenes,
          hook: c.hook || context.campaign?.hook,
          caption: c.caption || context.campaign?.caption,
          cta: c.cta || context.campaign?.cta,
          hashtags: c.hashtags || context.campaign?.hashtags,
          analysis: {
            provider: 'gemini',
            model,
            characterProfile: profiles.characterProfile,
            productProfile: profiles.productProfile,
            discoveryProfile: directed?.discoveryProfile || null
          }
        };
      }
    };
  }

  global.GeminiProvider = {
    create: createGeminiProvider,
    registerProxy(options) {
      return global.AIProviderAdapter.registerProvider(createGeminiProvider({ ...options, mode: 'proxy' }));
    }
  };
})(window);
