(function (global) {
  'use strict';

  const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
  const DIRECT_ENDPOINT = model => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  function dataUrlToInlineData(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { inlineData: { mimeType: match[1], data: match[2] } };
  }

  const characterProfileSchema = {
    type: 'OBJECT',
    properties: {
      approximateAgeRange: { type: 'STRING' },
      faceShape: { type: 'STRING' },
      skinTone: { type: 'STRING' },
      hairColor: { type: 'STRING' },
      hairLength: { type: 'STRING' },
      hairstyle: { type: 'STRING' },
      eyeAppearance: { type: 'STRING' },
      build: { type: 'STRING' },
      bodyProportions: { type: 'STRING' },
      distinguishingFeatures: { type: 'ARRAY', items: { type: 'STRING' } },
      uncertainFeatures: { type: 'ARRAY', items: { type: 'STRING' } }
    },
    required: ['approximateAgeRange','faceShape','skinTone','hairColor','hairLength','hairstyle','eyeAppearance','build','bodyProportions','distinguishingFeatures','uncertainFeatures']
  };

  const productProfileSchema = {
    type: 'OBJECT',
    properties: {
      category: { type: 'STRING' },
      brandIfVisible: { type: 'STRING' },
      modelIfVisible: { type: 'STRING' },
      primaryColor: { type: 'STRING' },
      secondaryColors: { type: 'ARRAY', items: { type: 'STRING' } },
      shape: { type: 'STRING' },
      materials: { type: 'ARRAY', items: { type: 'STRING' } },
      surfaceFinish: { type: 'STRING' },
      proportions: { type: 'STRING' },
      visibleControls: { type: 'ARRAY', items: { type: 'STRING' } },
      visibleTextOrLogos: { type: 'ARRAY', items: { type: 'STRING' } },
      distinctiveFeatures: { type: 'ARRAY', items: { type: 'STRING' } },
      functionalFeaturesVisible: { type: 'ARRAY', items: { type: 'STRING' } },
      uncertainFeatures: { type: 'ARRAY', items: { type: 'STRING' } }
    },
    required: ['category','brandIfVisible','modelIfVisible','primaryColor','secondaryColors','shape','materials','surfaceFinish','proportions','visibleControls','visibleTextOrLogos','distinctiveFeatures','functionalFeaturesVisible','uncertainFeatures']
  };

  const visionSchema = {
    type: 'OBJECT',
    properties: {
      characterProfile: characterProfileSchema,
      productProfile: productProfileSchema
    },
    required: ['characterProfile','productProfile']
  };

  const discoveryProfileSchema = {
    type: 'OBJECT',
    properties: {
      platform: { type: 'STRING' },
      market: { type: 'STRING' },
      language: { type: 'STRING' },
      primarySearchIntent: { type: 'STRING' },
      audienceIntent: { type: 'STRING' },
      searchPhrases: { type: 'ARRAY', items: { type: 'STRING' } },
      spokenKeywords: { type: 'ARRAY', items: { type: 'STRING' } },
      onScreenText: { type: 'ARRAY', items: { type: 'STRING' } },
      captionKeywords: { type: 'ARRAY', items: { type: 'STRING' } },
      hashtags: { type: 'ARRAY', items: { type: 'STRING' } },
      hookAngle: { type: 'STRING' },
      titleSuggestion: { type: 'STRING' },
      descriptionSuggestion: { type: 'STRING' },
      avoidKeywords: { type: 'ARRAY', items: { type: 'STRING' } },
      rationale: { type: 'STRING' }
    },
    required: ['platform','market','language','primarySearchIntent','audienceIntent','searchPhrases','spokenKeywords','onScreenText','captionKeywords','hashtags','hookAngle','titleSuggestion','descriptionSuggestion','avoidKeywords','rationale']
  };

  const campaignSchema = {
    type: 'OBJECT',
    properties: {
      identityLock: { type: 'STRING' },
      productAccuracy: { type: 'STRING' },
      hook: { type: 'STRING' },
      caption: { type: 'STRING' },
      cta: { type: 'STRING' },
      hashtags: { type: 'STRING' },
      scenes: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            text: { type: 'STRING' }
          },
          required: ['title','text']
        }
      }
    },
    required: ['identityLock','productAccuracy','hook','caption','cta','hashtags','scenes']
  };

  const discoveryCampaignSchema = {
    type: 'OBJECT',
    properties: {
      discoveryProfile: discoveryProfileSchema,
      campaign: campaignSchema
    },
    required: ['discoveryProfile','campaign']
  };

  function buildVisionPrompt(context) {
    const input = context.input || {};
    return `You are the visual perception layer for AI UGC Studio.\n\nREFERENCE RULES\n- Image 1 is CHARACTER IDENTITY ONLY. Analyze stable visible identity traits useful for visual continuity. Do not infer ethnicity, nationality, health, personality, religion, sexuality, or other sensitive traits. Do not treat clothing, background, pose, or temporary expression as identity unless needed for visual continuity.\n- Image 2 is PRODUCT ONLY. Analyze only visible product attributes. Never invent a logo, model, material, control, feature, dimension, function, or accessory that cannot be supported by the image or user-provided text. Put uncertain observations in uncertainFeatures.\n- Separate observed facts from uncertainty.\n\nPRODUCT CONTEXT\nProduct name: ${input.product || 'Not provided'}\nUser selling points: ${input.sellingPoints || 'Not provided'}\n\nTASK\n1. Build characterProfile from Image 1.\n2. Build productProfile from Image 2.\n3. Return only the requested structured JSON.`;
  }

  function buildDiscoveryPrompt(context, profiles) {
    const input = context.input || {};
    const sceneCount = Number(input.scenes || 3);
    return `You are the Discovery Intelligence and Creative Director for AI UGC Studio. Use Google Search grounding when it helps identify current, natural product-search language and market terminology. Do not promise ranking, virality, reach, sales, or platform placement. Optimize for relevance and discoverability while keeping the content useful to a real viewer.\n\nCAMPAIGN INPUT\nProduct name: ${input.product || 'Not provided'}\nPlatform: ${input.platform || 'TikTok'}\nTarget market: ${input.market || 'Malaysia'}\nLanguage: ${input.language || 'English'}\nCampaign style: ${input.style || 'Authentic UGC review'}\nLocation: ${input.location || 'Unspecified'}\nRequested scenes: ${sceneCount}\nUser selling points: ${input.sellingPoints || 'Not provided'}\n\nCHARACTER PROFILE\n${JSON.stringify(profiles.characterProfile || {})}\n\nPRODUCT PROFILE\n${JSON.stringify(profiles.productProfile || {})}\n\nDISCOVERY RULES\n- Build search phrases around real product/category intent, not keyword stuffing.\n- Align spoken dialogue, on-screen text, caption language and hashtags around the same primary intent.\n- For TikTok, prioritize natural keywords that can appear in captions, hashtags, voiceover and on-screen text.\n- For YouTube Shorts, prioritize clear title/description language, metadata-query relevance and video-content relevance; do not overvalue tags.\n- For Instagram Reels or Shopee Video, use platform-appropriate natural product/category terms and concise caption language.\n- Use the selected market and language naturally. Include localized synonyms only when genuinely relevant.\n- Never invent claims, specifications, certifications, prices, discounts, popularity, reviews, or product functions.\n- User-provided selling points may be communicated, but visual facts must remain consistent with productProfile.\n\nCREATIVE RULES\n- identityLock must turn the characterProfile into explicit continuity constraints while keeping Image 1 as source of truth.\n- productAccuracy must turn productProfile into explicit product continuity constraints while keeping Image 2 as source of truth.\n- Produce exactly ${sceneCount} scenes.\n- Each scene must specify action, natural spoken line or keyword phrase where useful, on-screen text where useful, camera behavior, 6-8 second duration, identity continuity, product continuity and avoidance constraints.\n- Make the hook useful and searchable without sounding like SEO copy.\n- Keep the campaign authentic UGC rather than polished TV advertising.\n\nReturn only the requested structured JSON containing discoveryProfile and campaign.`;
  }

  async function callGeminiDirect({ apiKey, model, parts, schema, useSearch }) {
    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema
      }
    };
    if (useSearch) body.tools = [{ google_search: {} }];

    const response = await fetch(DIRECT_ENDPOINT(model), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json())?.error?.message || ''; } catch (_) {}
      throw new Error(`Gemini request failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    if (!text) throw new Error('Gemini returned no structured response.');
    return JSON.parse(text);
  }

  async function callProxy({ endpoint, model, operation, context, profiles }) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, operation, context, profiles })
    });
    if (!response.ok) throw new Error(`Gemini proxy failed (${response.status}).`);
    return response.json();
  }

  function createGeminiProvider(options) {
    const config = options || {};
    const model = config.model || DEFAULT_MODEL;
    const mode = config.mode || (config.endpoint ? 'proxy' : 'direct-test');

    const provider = {
      name: 'gemini',
      model,

      async analyzeImages(request) {
        const context = request || {};
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
            { text: 'IMAGE 1 — CHARACTER IDENTITY REFERENCE' }, character,
            { text: 'IMAGE 2 — PRODUCT REFERENCE' }, product,
            { text: buildVisionPrompt(context) }
          ]
        });
      },

      async analyzeDiscovery(request) {
        const context = request?.context || request || {};
        const profiles = request?.profiles || {};
        if (mode === 'proxy') return callProxy({ endpoint: config.endpoint, model, operation: 'discovery', context, profiles });
        if (!config.apiKey) throw new Error('Gemini test key is not configured.');
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
        } catch (searchError) {
          // Search grounding can be quota- or availability-limited. Retry once
          // without Search so the Director still benefits from visual profiles.
          if (mode === 'direct-test' && config.useSearchGrounding !== false) {
            directed = await callGeminiDirect({
              apiKey: config.apiKey,
              model,
              schema: discoveryCampaignSchema,
              useSearch: false,
              parts: [{ text: buildDiscoveryPrompt(context, profiles) }]
            });
            directed.discoveryProfile = { ...(directed.discoveryProfile || {}), groundingFallback: true };
          } else {
            throw searchError;
          }
        }

        const campaign = directed?.campaign || {};
        return {
          identity: campaign.identityLock || context.campaign?.identity,
          productAccuracy: campaign.productAccuracy || context.campaign?.productAccuracy,
          scenes: Array.isArray(campaign.scenes) ? campaign.scenes : context.campaign?.scenes,
          hook: campaign.hook || context.campaign?.hook,
          caption: campaign.caption || context.campaign?.caption,
          cta: campaign.cta || context.campaign?.cta,
          hashtags: campaign.hashtags || context.campaign?.hashtags,
          analysis: {
            provider: 'gemini',
            model,
            characterProfile: profiles?.characterProfile || null,
            productProfile: profiles?.productProfile || null,
            discoveryProfile: directed?.discoveryProfile || null
          }
        };
      }
    };

    return provider;
  }

  function injectTestControls() {
    if (!document.body || document.getElementById('geminiTestPanel')) return;
    const campaignCard = document.querySelector('.card[style*="margin-top:18px"]');
    if (!campaignCard) return;

    const panel = document.createElement('section');
    panel.id = 'geminiTestPanel';
    panel.className = 'card';
    panel.style.marginTop = '18px';
    panel.innerHTML = `
      <h3>Gemini Intelligence <span style="font-size:11px;color:var(--muted);font-weight:600">TEST MODE</span></h3>
      <div class="sub">Optional. Scans creator + product, builds a Discovery Profile, then directs the campaign. Your key stays in memory for this tab only and is never saved.</div>
      <div class="form-grid">
        <div><label>Gemini API key (session only)</label><input id="geminiApiKey" type="password" autocomplete="off" placeholder="Paste a test key" /></div>
        <div><label>Intelligence model</label><select id="geminiModel"><option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</option><option value="gemini-2.5-flash">Gemini 2.5 Flash</option></select></div>
      </div>
      <div style="margin-top:12px;color:var(--muted);font-size:12px;line-height:1.5">Perception → Discovery → Creative. Google Search grounding is used when available; if grounding hits a quota or availability error, the Director retries without grounding. Production must move this behind the WonderLabs backend boundary.</div>
      <div class="actions" style="position:static;background:none;border:0;padding:0;margin-top:14px">
        <button class="secondary" id="geminiConnectBtn" type="button">Enable Gemini Intelligence</button>
        <button class="ghost" id="geminiDisconnectBtn" type="button">Use Local Mode</button>
        <span id="geminiStatus" style="align-self:center;color:var(--muted);font-size:12px">Local mode</span>
      </div>`;
    campaignCard.insertAdjacentElement('afterend', panel);

    const keyInput = document.getElementById('geminiApiKey');
    const modelInput = document.getElementById('geminiModel');
    const status = document.getElementById('geminiStatus');

    document.getElementById('geminiConnectBtn').addEventListener('click', () => {
      const apiKey = keyInput.value.trim();
      if (!apiKey) { status.textContent = 'Paste a test key first'; return; }
      global.AIProviderAdapter.registerProvider(createGeminiProvider({ apiKey, model: modelInput.value, mode: 'direct-test', useSearchGrounding: true }));
      keyInput.value = '';
      status.textContent = `Perception + Discovery + Creative enabled · ${modelInput.value}`;
    });

    document.getElementById('geminiDisconnectBtn').addEventListener('click', () => {
      global.AIProviderAdapter.clearProvider();
      keyInput.value = '';
      status.textContent = 'Local mode';
    });
  }

  global.GeminiProvider = {
    create: createGeminiProvider,
    registerProxy(options) {
      const provider = createGeminiProvider({ ...(options || {}), mode: 'proxy' });
      return global.AIProviderAdapter.registerProvider(provider);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectTestControls);
  else injectTestControls();
})(window);
