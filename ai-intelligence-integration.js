(function (global) {
  'use strict';

  const POLL_MS = 80;
  const MAX_POLLS = 100;
  const DIRECT_ENDPOINT = model => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const str = { type: 'STRING' };
  const strings = { type: 'ARRAY', items: str };

  const relationshipSchema = {
    type: 'OBJECT',
    properties: {
      inventoryItems: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: str,
            visibleDescription: str,
            functionalRole: str,
            interactionMode: str,
            confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
            relationshipToOtherVisibleItems: str,
            handlingConstraint: str
          },
          required: ['name', 'visibleDescription', 'functionalRole', 'interactionMode', 'confidence', 'relationshipToOtherVisibleItems', 'handlingConstraint']
        }
      },
      functionalRelationships: strings,
      allowedSupportObjects: strings,
      sceneRules: strings,
      uncertainties: strings,
      doNotInvent: strings
    },
    required: ['inventoryItems', 'functionalRelationships', 'allowedSupportObjects', 'sceneRules', 'uncertainties', 'doNotInvent']
  };

  function ready() {
    return global.AIProviderAdapter && global.GeminiProvider && document.body;
  }

  function findCampaignCard() {
    const productName = document.getElementById('name');
    return productName ? productName.closest('.card') : null;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function dataUrlToInlineData(dataUrl) {
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    return match ? { inlineData: { mimeType: match[1], data: match[2] } } : null;
  }

  function localCampaignSnapshot() {
    return {
      identity: document.getElementById('output')?.textContent || '',
      productAccuracy: document.getElementById('output')?.textContent || '',
      scenes: ['scene1','scene2','scene3'].map((id, index) => ({
        title: `Scene ${index + 1}`,
        text: document.getElementById(id)?.textContent || ''
      })),
      cta: document.getElementById('cta')?.textContent || '',
      hashtags: document.getElementById('hashtags')?.textContent || ''
    };
  }

  async function analyzeDynamicRelationships({ apiKey, model, context }) {
    if (context?.input?.category !== 'multi') return null;
    const product = dataUrlToInlineData(context.references?.product);
    if (!product) return null;

    const prompt = `You are the Dynamic Product Relationship Intelligence layer for AI UGC Studio.

Analyze ONLY the uploaded PRODUCT REFERENCE as a closed-world visual inventory for a multi-product or kit campaign.

GOAL
Determine what distinct promoted objects are actually visible, what each object appears to do, and how those visible objects should physically relate to one another in a believable real-world scene. This analysis will prevent product fusion, illogical placement and generic kit hallucinations.

CLOSED-WORLD RULE — NON-NEGOTIABLE
- Do NOT assume that a generic "creator kit", "camping kit", "beauty kit", "tool kit" or any other kit contains standard category items.
- Never introduce a laptop, phone, camera, tent, stove, table, chair, bottle, cosmetic item, tool or any other host/support object merely because such an object is commonly associated with the inferred category.
- A non-promoted host/support object may be listed in allowedSupportObjects ONLY when its presence or necessity is supported by this reference itself: it is visibly shown, legible text explicitly identifies compatibility/use with it, or the visible physical interface makes the relationship high-confidence.
- If a relationship is uncertain, say so. Prefer conservative display over invented functionality.

INVENTORY
- Treat each distinct promoted item/component as a separate object.
- Do not merge variants, accessories or unrelated products into a fictional device.
- Separate promoted products from contextual props/support devices shown only to explain use.
- Preserve recognizable shape, relative scale and count.

FUNCTIONAL RELATIONSHIPS
For each inventory item, infer the most conservative visually supported role and interaction mode. Examples of relationship TYPES include attached-to, supports, sits-on, worn-on, inserted-into, paired-with, operated-beside, held, placed-on-surface, or independent-display. These examples are relationship vocabulary only; DO NOT assume any specific product is present.

SCENE RULES
Generate short sceneRules that tell an image model how to arrange the ACTUAL detected inventory. If an item needs a host/support object, only permit that host when allowed by the closed-world rule above. Otherwise keep the item separate and conservatively displayed rather than inventing a missing host.

USER LABEL
Product name entered by user: ${context.input.product || 'Not provided'}
This label is weak context only. The image controls inventory.

Return only structured JSON.`;

    const response = await fetch(DIRECT_ENDPOINT(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: 'PRODUCT REFERENCE — analyze this image only' },
          product,
          { text: prompt }
        ] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: relationshipSchema }
      })
    });

    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json())?.error?.message || ''; } catch (_) {}
      throw new Error(`Dynamic relationship analysis failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!text) throw new Error('Dynamic relationship analysis returned no response.');
    return JSON.parse(text);
  }

  function relationshipLock(analysis) {
    if (!analysis) return '';
    const inventory = (analysis.inventoryItems || []).map((item, i) => {
      const relation = item.relationshipToOtherVisibleItems ? `; relationship: ${item.relationshipToOtherVisibleItems}` : '';
      const handling = item.handlingConstraint ? `; handling: ${item.handlingConstraint}` : '';
      return `${i + 1}. ${item.name}: ${item.visibleDescription}; role: ${item.functionalRole}; interaction: ${item.interactionMode}; confidence: ${item.confidence}${relation}${handling}`;
    }).join('\n');
    const relationships = (analysis.functionalRelationships || []).map(x => `- ${x}`).join('\n');
    const supports = (analysis.allowedSupportObjects || []).map(x => `- ${x}`).join('\n');
    const rules = (analysis.sceneRules || []).map(x => `- ${x}`).join('\n');
    const uncertainties = (analysis.uncertainties || []).map(x => `- ${x}`).join('\n');
    const doNotInvent = (analysis.doNotInvent || []).map(x => `- ${x}`).join('\n');

    return `DYNAMIC PRODUCT RELATIONSHIP LOCK — REFERENCE-SPECIFIC\nUse the following analysis of THIS product reference only. Do not substitute generic assumptions about what a kit should contain.\n\nDETECTED INVENTORY\n${inventory || '- No confident inventory extracted; preserve visible objects conservatively.'}\n\nFUNCTIONAL RELATIONSHIPS\n${relationships || '- No relationship may be assumed beyond visible support/placement.'}\n\nALLOWED CONTEXTUAL HOST / SUPPORT OBJECTS\n${supports || '- None. Do not introduce additional host devices or major support objects.'}\n\nSCENE PLACEMENT RULES\n${rules || '- Keep each detected product separate, visible, supported and physically plausible.'}\n\nUNCERTAINTIES\n${uncertainties || '- None reported.'}\n\nDO NOT INVENT\n${doNotInvent || '- Do not add products or support devices that are not supported by the reference.'}\n\nCLOSED-WORLD ENFORCEMENT: The scene may contain the detected promoted inventory plus ordinary environmental background appropriate to the selected location. Do not introduce a category-specific product, host device, accessory or major prop unless it is explicitly permitted above. When confidence is low, preserve appearance and separation and avoid demonstrating speculative functionality.`;
  }

  function wrapProviderWithRelationships(provider, config) {
    if (!provider || provider.__dynamicRelationshipsWrapped) return provider;
    const originalGenerateCampaign = provider.generateCampaign?.bind(provider);
    if (typeof originalGenerateCampaign !== 'function') return provider;

    provider.generateCampaign = async function (context) {
      const campaign = await originalGenerateCampaign(context);
      if (!campaign || context?.input?.category !== 'multi') return campaign;

      const analysis = await analyzeDynamicRelationships({
        apiKey: config.apiKey,
        model: config.model,
        context
      });
      const lock = relationshipLock(analysis);
      if (!lock) return campaign;

      campaign.productAccuracy = `${campaign.productAccuracy || ''}\n\n${lock}`.trim();
      if (Array.isArray(campaign.scenes)) {
        campaign.scenes = campaign.scenes.map(scene => ({
          ...scene,
          text: `${scene.text || ''}\n\n${lock}`.trim()
        }));
      }
      campaign.analysis = { ...(campaign.analysis || {}), dynamicProductRelationships: analysis };
      return campaign;
    };
    provider.__dynamicRelationshipsWrapped = true;
    return provider;
  }

  async function buildEnhancedCampaign(status) {
    if (!global.AIProviderAdapter.hasProvider()) {
      status.textContent = 'Enable Enhanced first';
      return;
    }

    const creatorFile = document.getElementById('creator')?.files?.[0];
    const productFile = document.getElementById('product')?.files?.[0];
    if (!creatorFile || !productFile) {
      status.textContent = 'Upload creator + product first';
      return;
    }

    if (typeof global.build === 'function') global.build();

    const snapshot = {
      output: document.getElementById('output')?.textContent || '',
      scene1: document.getElementById('scene1')?.textContent || '',
      scene2: document.getElementById('scene2')?.textContent || '',
      scene3: document.getElementById('scene3')?.textContent || '',
      cta: document.getElementById('cta')?.textContent || '',
      hashtags: document.getElementById('hashtags')?.textContent || ''
    };

    status.textContent = 'Enhanced Intelligence working…';

    try {
      const [character, product] = await Promise.all([
        fileToDataUrl(creatorFile),
        fileToDataUrl(productFile)
      ]);

      const context = {
        input: {
          product: document.getElementById('name')?.value.trim() || 'the promoted product',
          category: document.getElementById('category')?.value || 'other',
          platform: document.getElementById('platform')?.value || 'TikTok',
          market: 'Malaysia',
          language: document.getElementById('language')?.value || 'English',
          style: document.getElementById('style')?.value || 'Authentic UGC review',
          location: document.getElementById('location')?.value || 'Unspecified',
          scenes: 3,
          sellingPoints: document.getElementById('action')?.value.trim() || ''
        },
        references: { character, product },
        campaign: localCampaignSnapshot()
      };

      const enhanced = await global.AIProviderAdapter.enhanceCampaign(context);
      if (!enhanced) throw new Error('Enhanced provider returned no campaign.');

      const scenes = Array.isArray(enhanced.scenes) ? enhanced.scenes : [];
      const summary = [
        enhanced.identity ? `IDENTITY LOCK:\n${enhanced.identity}` : '',
        enhanced.productAccuracy ? `PRODUCT ACCURACY:\n${enhanced.productAccuracy}` : '',
        enhanced.hook ? `HOOK:\n${enhanced.hook}` : '',
        enhanced.caption ? `CAPTION:\n${enhanced.caption}` : ''
      ].filter(Boolean).join('\n\n');

      if (summary) document.getElementById('output').textContent = summary;
      if (scenes[0]?.text) document.getElementById('scene1').textContent = scenes[0].text;
      if (scenes[1]?.text) document.getElementById('scene2').textContent = scenes[1].text;
      if (scenes[2]?.text) document.getElementById('scene3').textContent = scenes[2].text;
      if (enhanced.cta) document.getElementById('cta').textContent = enhanced.cta;
      if (enhanced.hashtags) document.getElementById('hashtags').textContent = enhanced.hashtags;

      const dynamic = enhanced.analysis?.dynamicProductRelationships;
      status.textContent = dynamic
        ? `Enhanced complete · Dynamic relationships analyzed · ${global.AIProviderAdapter.getProviderInfo().model || 'Gemini'}`
        : `Enhanced complete · ${global.AIProviderAdapter.getProviderInfo().model || 'Gemini'}`;
    } catch (error) {
      document.getElementById('output').textContent = snapshot.output;
      document.getElementById('scene1').textContent = snapshot.scene1;
      document.getElementById('scene2').textContent = snapshot.scene2;
      document.getElementById('scene3').textContent = snapshot.scene3;
      document.getElementById('cta').textContent = snapshot.cta;
      document.getElementById('hashtags').textContent = snapshot.hashtags;
      status.textContent = `Enhanced failed · local campaign preserved`;
      console.warn('Enhanced Intelligence failed; local output preserved.', error);
    }
  }

  function installPanel() {
    if (document.getElementById('wonderlabsIntelligencePanel')) return;
    const campaignCard = findCampaignCard();
    if (!campaignCard) return;

    const panel = document.createElement('section');
    panel.id = 'wonderlabsIntelligencePanel';
    panel.className = 'card';
    panel.style.marginTop = '16px';
    panel.innerHTML = `
      <h3>Enhanced — USE YOUR OWN API KEY <span style="font-size:11px;color:var(--good);font-weight:700">OPTIONAL</span></h3>
      <div class="sub">Director v1.3.3 Local Mode remains the default full engine. Enhanced Intelligence is an optional BYOK comparison path. Multi-product campaigns now add reference-specific Dynamic Product Relationship analysis before scene direction.</div>
      <div class="form">
        <div>
          <label>Gemini API key — session only</label>
          <input id="productGeminiKey" type="password" autocomplete="off" placeholder="Paste your own API key" />
        </div>
        <div>
          <label>Intelligence model</label>
          <select id="productGeminiModel">
            <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite</option>
            <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
          </select>
        </div>
      </div>
      <div style="margin-top:12px;color:var(--muted);font-size:12px;line-height:1.5">
        Your key is kept only in this browser tab's memory and is never saved by AI UGC Studio. Local Mode requires no API key.
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="secondary" id="enableProductIntelligence" type="button">Enable Enhanced Intelligence</button>
        <button class="secondary" id="buildEnhancedCampaign" type="button" disabled>Build Enhanced Campaign</button>
        <button class="secondary" id="disableProductIntelligence" type="button">Use Local Mode</button>
        <span id="productIntelligenceStatus" style="align-self:center;color:var(--muted);font-size:12px">Local Mode · Director v1.3.3</span>
      </div>`;

    campaignCard.insertAdjacentElement('afterend', panel);

    const key = document.getElementById('productGeminiKey');
    const model = document.getElementById('productGeminiModel');
    const status = document.getElementById('productIntelligenceStatus');
    const enhancedBuild = document.getElementById('buildEnhancedCampaign');

    document.getElementById('enableProductIntelligence').addEventListener('click', function () {
      const apiKey = key.value.trim();
      if (!apiKey) {
        status.textContent = 'Paste your API key first';
        return;
      }
      try {
        const selectedModel = model.value;
        const baseProvider = global.GeminiProvider.create({
          apiKey,
          model: selectedModel,
          mode: 'direct-test',
          useSearchGrounding: true
        });
        const provider = wrapProviderWithRelationships(baseProvider, { apiKey, model: selectedModel });
        global.AIProviderAdapter.registerProvider(provider);
        key.value = '';
        enhancedBuild.disabled = false;
        status.textContent = `Enhanced ready · Dynamic relationships armed · ${selectedModel}`;
      } catch (error) {
        status.textContent = error?.message || 'Could not enable Enhanced Intelligence';
      }
    });

    enhancedBuild.addEventListener('click', function () {
      buildEnhancedCampaign(status);
    });

    document.getElementById('disableProductIntelligence').addEventListener('click', function () {
      global.AIProviderAdapter.clearProvider();
      key.value = '';
      enhancedBuild.disabled = true;
      status.textContent = 'Local Mode · Director v1.3.3';
    });
  }

  let polls = 0;
  const timer = setInterval(function () {
    polls += 1;
    if (ready()) {
      clearInterval(timer);
      installPanel();
    } else if (polls >= MAX_POLLS) {
      clearInterval(timer);
      console.warn('Enhanced Intelligence unavailable; Director v1.3.3 Local Mode remains active.');
    }
  }, POLL_MS);
})(window);
