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

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      characterProfile: {
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
      },
      productProfile: {
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
      },
      campaign: {
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
      }
    },
    required: ['characterProfile','productProfile','campaign']
  };

  function buildPrompt(context) {
    const input = context.input || {};
    const sceneCount = Number(input.scenes || 3);
    return `You are the visual-analysis and campaign-direction layer for AI UGC Studio.\n\nREFERENCE RULES\n- Image 1 is CHARACTER IDENTITY ONLY. Analyze stable visible identity traits useful for visual continuity. Do not infer ethnicity, nationality, health, personality, religion, sexuality, or other sensitive traits. Do not treat clothing, background, pose, or temporary expression as identity unless needed for continuity.\n- Image 2 is PRODUCT ONLY. Analyze only visible product attributes. Never invent a logo, model, material, control, feature, dimension, function, or accessory that cannot be supported by the image or user-provided text. Put uncertain visual observations in uncertainFeatures.\n- Separate observed facts from uncertainty.\n\nCAMPAIGN INPUT\nProduct name: ${input.product || 'Not provided'}\nPlatform: ${input.platform || 'TikTok'}\nStyle: ${input.style || 'Authentic UGC review'}\nLanguage: ${input.language || 'English'}\nLocation: ${input.location || 'Unspecified'}\nRequested scenes: ${sceneCount}\nUser selling points: ${input.sellingPoints || 'Not provided'}\n\nTASK\n1. Build a structured characterProfile from Image 1.\n2. Build a structured productProfile from Image 2.\n3. Create a campaign that uses the visible profiles as hard continuity constraints.\n4. identityLock must explicitly describe the stable visible identity traits to preserve, while still stating Image 1 is the source of truth.\n5. productAccuracy must explicitly describe the visible product attributes to preserve, while still stating Image 2 is the source of truth.\n6. Produce exactly ${sceneCount} scene objects. Each scene must include platform, language, location, action, camera behavior, 6-8 second duration, character continuity, product continuity, and avoidance constraints.\n7. Do not claim the product has a function merely because the product name suggests it unless the user supplied that selling point or it is visibly supportable.\n8. Keep copy commercially useful but natural UGC rather than polished TV advertising.\n\nReturn only the requested structured JSON.`;
  }

  async function callGeminiDirect({ apiKey, model, parts }) {
    const response = await fetch(DIRECT_ENDPOINT(model), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema
        }
      })
    });

    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json())?.error?.message || ''; } catch (_) {}
      throw new Error(`Gemini request failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    if (!text) throw new Error('Gemini returned no structured analysis.');
    return JSON.parse(text);
  }

  async function callProxy({ endpoint, model, context }) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, context })
    });
    if (!response.ok) throw new Error(`Gemini proxy failed (${response.status}).`);
    return response.json();
  }

  function createGeminiProvider(options) {
    const config = options || {};
    const model = config.model || DEFAULT_MODEL;
    const mode = config.mode || (config.endpoint ? 'proxy' : 'direct-test');

    return {
      name: 'gemini',
      model,
      async analyzeImages(request) {
        const context = request || {};
        if (mode === 'proxy') return callProxy({ endpoint: config.endpoint, model, context });
        if (!config.apiKey) throw new Error('Gemini test key is not configured.');
        const character = dataUrlToInlineData(context.references?.character);
        const product = dataUrlToInlineData(context.references?.product);
        if (!character || !product) throw new Error('Both creator and product images are required for Gemini analysis.');
        return callGeminiDirect({ apiKey: config.apiKey, model, parts: [character, { text: 'IMAGE 1 — CHARACTER IDENTITY REFERENCE' }, product, { text: 'IMAGE 2 — PRODUCT REFERENCE' }, { text: buildPrompt(context) }] });
      },
      async generateCampaign(context) {
        if (!context?.references?.character || !context?.references?.product) return null;
        const result = await this.analyzeImages(context);
        const campaign = result?.campaign || {};
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
            characterProfile: result?.characterProfile || null,
            productProfile: result?.productProfile || null
          }
        };
      }
    };
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
      <h3>Gemini Visual Analysis <span style="font-size:11px;color:var(--muted);font-weight:600">TEST MODE</span></h3>
      <div class="sub">Optional. Scans the creator and product references before the Director builds the campaign. Your key stays in memory for this tab only and is never saved.</div>
      <div class="form-grid">
        <div><label>Gemini API key (session only)</label><input id="geminiApiKey" type="password" autocomplete="off" placeholder="Paste a test key" /></div>
        <div><label>Analysis model</label><select id="geminiModel"><option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</option><option value="gemini-2.5-flash">Gemini 2.5 Flash</option></select></div>
      </div>
      <div style="margin-top:12px;color:var(--muted);font-size:12px;line-height:1.5">For private testing only. Production must use a server-side proxy so the API key is never exposed in browser code.</div>
      <div class="actions" style="position:static;background:none;border:0;padding:0;margin-top:14px">
        <button class="secondary" id="geminiConnectBtn" type="button">Enable AI Analysis</button>
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
      global.AIProviderAdapter.registerProvider(createGeminiProvider({ apiKey, model: modelInput.value, mode: 'direct-test' }));
      keyInput.value = '';
      status.textContent = `AI analysis enabled · ${modelInput.value}`;
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
