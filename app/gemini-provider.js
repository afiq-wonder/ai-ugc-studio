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
      styleTraits: strings,
      subjectCount: str,
      creatorInputQuality: str,
      uncertainFeatures: strings
    },
    required: ['approximateAgeRange', 'faceShape', 'skinTone', 'eyeAppearance', 'build', 'bodyProportions', 'identityTraits', 'currentAppearance', 'styleTraits', 'subjectCount', 'creatorInputQuality', 'uncertainFeatures']
  };

  const productProfileSchema = {
    type: 'OBJECT',
    properties: {
      category: str,
      interactionMode: str,
      adaptationMode: str,
      designInvariants: strings,
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
    required: ['category', 'interactionMode', 'adaptationMode', 'designInvariants', 'brandIfVisible', 'modelIfVisible', 'primaryColor', 'secondaryColors', 'shape', 'observedFacts', 'spatialEvidence', 'scaleLock', 'userProvidedClaims', 'uncertainFeatures', 'spatialUncertainty', 'prohibitedClaims']
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
      wardrobeDirection: str,
      environmentLock: str,
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
    required: ['identityLock', 'wardrobeDirection', 'environmentLock', 'productAccuracy', 'hook', 'caption', 'cta', 'hashtags', 'scenes']
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
Extract stable visible physical continuity traits into identityTraits. Put literal clothing, headwear/hijab, jewellery, makeup, pose, expression and background ONLY in currentAppearance. Never make a literal outfit or background a permanent identity trait.
Infer only visible presentation/style language into styleTraits, using conservative neutral descriptors such as modest styling, hijab styling, modern, casual, polished, sporty or formal when visually supported. Style is NOT the same as the exact outfit. Do not infer ethnicity, nationality, religion, health, personality or sexuality. If hair is covered, say it is not visible; do not infer it.
Estimate subjectCount from the creator image. creatorInputQuality should say whether there is one clear primary person in one usable pose or whether multiple people/poses make identity ambiguous. Do not guess which person is intended when multiple distinct people are prominent.

IMAGE 2 — PRODUCT
Extract only facts visibly supported by the image. OCR text, logos and printed dimensions visible in the image ARE valid image evidence. Every observedFacts item MUST contain value, source=image, and confidence. Exact dimensions/specifications are allowed ONLY when legible in the product image. Never infer hidden specifications, battery capacity, certifications, materials, functions, accessories, popularity, pricing or store status from appearance alone. If uncertain, put it in uncertainFeatures rather than observedFacts.
Classify interactionMode conservatively as one of: wear, hold, use, display. Prefer wear for garments/apparel intended to be worn; hold for hand-carried products; use for products whose visible form strongly supports normal interaction; display when interaction cannot be inferred safely.
Classify adaptationMode as wearable_physical_adaptation for garments/apparel and rigid_spatial_preservation for ordinary rigid products. For wearable products, designInvariants must list the visually defining product traits that should survive fitting to a body: color, silhouette/cut, collar/neckline, sleeve treatment, piping/stripes, graphics, logos/text placement, pattern and other medium/high-confidence visible details. The garment's folds, drape, tension, sleeve bend, hem position, perspective and body fit are allowed to adapt naturally and are NOT design invariants.

SPATIAL EVIDENCE / SCALE
Analyze scale and spatial relationships that are visibly supported. Put these in spatialEvidence with source=image and confidence. Prefer: (1) printed dimensions visible in the reference; (2) product-to-person/body relationships; (3) product-to-hand, table, chair, floor, bag, bottle, shoe or other familiar-object relationships; (4) proportions between major product components. Do not invent absolute measurements from perspective alone.
For rigid_spatial_preservation products, create scaleLock as short generation constraints derived ONLY from medium/high-confidence spatialEvidence. For wearable_physical_adaptation products, do NOT freeze the garment into hanger/reference geometry; keep scaleLock conservative and protect designInvariants while allowing the garment to conform naturally to the wearer.

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

AUTHORITY ORDER — NON-NEGOTIABLE
Creator reference controls WHO the creator is. Product reference controls WHAT the promoted product is. Wardrobe behavior controls HOW the creator is styled. Selected Location controls WHERE the campaign occurs. Campaign Style controls presentation/cinematography. Scene direction controls WHAT HAPPENS. Do not let a creator-reference background override Location, and do not let a product-reference display/rack/background override product interaction.

EVIDENCE CONTRACT — NON-NEGOTIABLE
- Advertising facts may come only from productProfile.observedFacts with medium/high confidence OR productProfile.userProvidedClaims.
- uncertainFeatures must never be stated as facts. prohibitedClaims must never appear.
- Search may influence discovery language only; never product facts.
- Do not invent prices, discounts, reviews, popularity, certifications, hidden specs, accessories, capabilities or commerce mechanisms.
- currentAppearance is evidence of the current photo, NOT a permanent continuity lock.

IDENTITY / WARDROBE BEHAVIOR
- identityLock must preserve the creator's stable recognizable identity and body proportions, not the literal outfit or original background.
- Default wardrobe behavior is KEEP CURRENT STYLE, not keep exact outfit. Preserve medium/high-confidence styleTraits while allowing context-appropriate wardrobe changes.
- A hijab/head-covering presentation may be preserved as part of current style when clearly visible, without making claims about religion or identity.
- wardrobeDirection must explicitly describe what is preserved and what may change.
- If productProfile.interactionMode is wear, the promoted garment becomes the hero wardrobe item. Preserve creator identity + compatible current style, replace/adapt the relevant original garment, and dress the creator naturally in the promoted product. Do NOT reproduce clothing racks, hangers, mannequins, product-reference models, product-reference backgrounds, or alternate color variants unless the campaign explicitly asks for them.
- For wearable_physical_adaptation, preserve designInvariants while allowing realistic drape, stretch, folds, compression, sleeve bend, hem movement, body turn, sitting/walking posture, perspective and occlusion. Never reshape the creator's body merely to match the garment reference.

PRODUCT INTERACTION
- Respect productProfile.interactionMode: wear means wear it; hold means handle/carry it naturally; use means show plausible supported use; display means present it without inventing unsupported function.
- The product reference defines the product, not the composition of the reference photograph.

ENVIRONMENT LOCK — NON-NEGOTIABLE
- environmentLock must restate the exact selected Location: ${input.location || 'Unspecified'}.
- Every scene must visibly and unambiguously occur in that selected environment unless the scene text explicitly says it is a transition within the same environment.
- Preserve BOTH the broad environment class and the specific environment identity. Example: "Outdoor city street" requires an outdoor/open-air scene AND recognizable urban street context; generic garden, countryside, indoor room, studio, home or café interior does not satisfy it.
- Use visible environmental anchors appropriate to the selected location (for a city street: pavement/sidewalk, buildings/storefronts, road/street elements, exterior daylight/open-air depth) without inventing a specific real business or address.
- Never inherit furniture, architecture, room, scenery or background from the creator or product reference unless the selected Location explicitly requests it.

SPATIAL / SCALE CONTRACT — NON-NEGOTIABLE
- For rigid_spatial_preservation products, treat productProfile.spatialEvidence and scaleLock as generation-critical evidence.
- productAccuracy MUST include a concise Scale Lock section whenever scaleLock is non-empty.
- Every scene that shows or handles a rigid product must preserve real-world scale and component proportions.
- When printed dimensions are visible with medium/high confidence, carry those dimensions into productAccuracy and scene direction where they prevent scale drift.
- Never miniaturize, enlarge, compress, stretch or reinterpret a rigid product merely to fit the composition.
- For wearable_physical_adaptation, protect design invariants rather than freezing reference geometry.
- Never convert uncertain perspective estimates into exact dimensions.

CREATOR INPUT QUALITY
- If creatorInputQuality indicates multiple distinct people or materially ambiguous identity, do not silently combine identities. Keep output conservative and include a short production note inside identityLock recommending a single-person, single-pose creator reference for best consistency.

CREATIVE FREEDOM — ENCOURAGED
Be persuasive, conversational and creator-native WITHOUT inventing facts. Creative language, relatable situations, questions, reactions, transitions, pacing, curiosity and emotional framing do not count as product claims when they do not assert unsupported facts.
Write like a real ${input.market || 'local'} creator speaking naturally in ${input.language || 'the requested language'}, not like a catalogue, specification sheet or corporate advertisement.
Open with a relatable problem, curiosity gap, surprising observation or situational hook. Move quickly from hook -> product interaction/demonstration -> believable outcome/CTA. Prefer first-person conversational phrasing and short spoken lines.
Each scene must feel visually different while remaining one continuous campaign. Include action, natural spoken line, useful on-screen text, camera behavior, 6–8 second duration and continuity constraints.
The hook, spoken keywords, on-screen text, caption and hashtags should reinforce one discovery intent naturally, without keyword stuffing or ranking promises.
If no explicit commerce CTA is supplied, use a natural neutral CTA such as “semak maklumat produk” rather than inventing a yellow bag, cart, voucher, checkout or product link.

QUALITY BAR
Preserve truth, preserve intent, allow natural physical adaptation, and make the selected environment unmistakable. Produce exactly ${sceneCount} scenes. Return only structured JSON.`;
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
          wardrobeDirection: c.wardrobeDirection || '',
          environmentLock: c.environmentLock || '',
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
            discoveryProfile: directed?.discoveryProfile || null,
            wardrobeDirection: c.wardrobeDirection || '',
            environmentLock: c.environmentLock || ''
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
