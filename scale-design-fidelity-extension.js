(function (global) {
  'use strict';

  const DIRECT_ENDPOINT = model => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const str = { type: 'STRING' };
  const strings = { type: 'ARRAY', items: str };

  const scaleDesignSchema = {
    type: 'OBJECT',
    properties: {
      itemProfiles: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            label: str,
            confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
            rigidOrAdaptive: { type: 'STRING', enum: ['rigid', 'adaptive', 'uncertain'] },
            visualInvariants: strings,
            componentProportions: strings,
            relativeScaleEvidence: strings,
            handOrBodyScaleEvidence: strings,
            hostScaleEvidence: strings,
            scaleConstraint: str,
            designConstraint: str
          },
          required: ['label','confidence','rigidOrAdaptive','visualInvariants','componentProportions','relativeScaleEvidence','handOrBodyScaleEvidence','hostScaleEvidence','scaleConstraint','designConstraint']
        }
      },
      crossItemScaleRules: strings,
      transferRules: strings,
      uncertainties: strings,
      prohibitedTransformations: strings
    },
    required: ['itemProfiles','crossItemScaleRules','transferRules','uncertainties','prohibitedTransformations']
  };

  function dataUrlToInlineData(dataUrl) {
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    return match ? { inlineData: { mimeType: match[1], data: match[2] } } : null;
  }

  async function analyzeScaleAndDesign({ apiKey, model, context }) {
    if (context?.input?.category !== 'multi') return null;
    const product = dataUrlToInlineData(context.references?.product);
    if (!product) return null;

    const prompt = `You are the Reference Scale + Design Fidelity layer for AI UGC Studio.

Analyze ONLY the uploaded PRODUCT REFERENCE for a multi-product / kit campaign.

PURPOSE
Preserve each promoted item's real-world relative scale, rigid geometry, component proportions and visually defining design traits during generation. This layer must complement existing relationship and inventory-count logic without changing item counts or inventing new products.

REFERENCE AUTHORITY — NON-NEGOTIABLE
- The uploaded reference controls what each promoted item looks like and how large it is relative to other visible promoted items and familiar visible context.
- Do not use generic category averages when the image provides stronger evidence.
- Do not enlarge a small product for prominence, readability or composition.
- Do not shrink a large product to fit the frame.
- Do not redesign a product into a generic object from the same category.
- Do not infer exact measurements unless printed dimensions are legible.
- When absolute scale is uncertain, preserve RELATIVE scale between items and any visible hand, body, phone, tablet, keyboard, mouse, table, case or other familiar object supported by the image.

ITEM ANALYSIS
For each distinct promoted item/group actually visible:
1. Identify high-confidence visual invariants: silhouette, major colors, surface pattern, vents, collar/edges, buttons, display areas, graphics/logos/text placement when legible, attachment geometry, stand geometry, case shape, number and arrangement of major visible subcomponents.
2. Identify component proportions: width-to-height, main-body-to-accessory relationships, host-to-accessory relationships, and any visually obvious size hierarchy.
3. Derive relativeScaleEvidence using only the image. Prefer direct comparisons against other promoted items and familiar objects shown in the reference.
4. Derive handOrBodyScaleEvidence only when supported by the image.
5. Derive hostScaleEvidence only when a host/support relationship is visible or clearly evidenced in the reference.
6. rigidOrAdaptive: use rigid for electronics, appliances, stands, containers and other hard goods whose geometry should remain stable; adaptive only for soft/wearable items that can physically deform; uncertain if unclear.

CROSS-ITEM SCALE
Create rules that preserve the observed size hierarchy across all promoted items. If item A is visibly much smaller than item B, generation must preserve that hierarchy. Never make all products approximately the same display size.

TRANSFER FIDELITY
Preserve product-specific design traits instead of producing category approximations. If a feature is uncertain, omit the uncertain detail rather than invent a new design.

USER LABEL
${context.input.product || 'Not provided'}
This is weak context only. The image controls product appearance and scale.

Return only structured JSON.`;

    const response = await fetch(DIRECT_ENDPOINT(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: 'PRODUCT REFERENCE — scale and visual fidelity audit only' },
          product,
          { text: prompt }
        ] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: scaleDesignSchema }
      })
    });

    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json())?.error?.message || ''; } catch (_) {}
      throw new Error(`Scale/design fidelity analysis failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!text) throw new Error('Scale/design fidelity analysis returned no response.');
    return JSON.parse(text);
  }

  function scaleDesignLock(analysis) {
    if (!analysis) return '';
    const items = (analysis.itemProfiles || []).map((item, index) => {
      const invariants = (item.visualInvariants || []).join('; ') || 'preserve visible design conservatively';
      const proportions = (item.componentProportions || []).join('; ') || 'preserve observed component proportions';
      const relative = (item.relativeScaleEvidence || []).join('; ') || 'preserve reference-relative scale';
      const hand = (item.handOrBodyScaleEvidence || []).join('; ') || 'no hand/body scale evidence';
      const host = (item.hostScaleEvidence || []).join('; ') || 'no host scale evidence';
      return `${index + 1}. ${item.label}: confidence=${item.confidence}; geometry=${item.rigidOrAdaptive}; visual invariants=${invariants}; component proportions=${proportions}; relative scale=${relative}; hand/body scale=${hand}; host scale=${host}; SCALE CONSTRAINT=${item.scaleConstraint}; DESIGN CONSTRAINT=${item.designConstraint}`;
    }).join('\n');
    const cross = (analysis.crossItemScaleRules || []).map(x => `- ${x}`).join('\n');
    const transfer = (analysis.transferRules || []).map(x => `- ${x}`).join('\n');
    const uncertain = (analysis.uncertainties || []).map(x => `- ${x}`).join('\n');
    const prohibited = (analysis.prohibitedTransformations || []).map(x => `- ${x}`).join('\n');

    return `REFERENCE SCALE + DESIGN FIDELITY LOCK — REFERENCE-SPECIFIC\nThe following scale hierarchy and visual traits come from THIS uploaded reference and are generation-critical. Product prominence must be achieved through framing, not physical resizing or redesign.\n\nITEM FIDELITY PROFILES\n${items || '- No reliable item profile extracted; preserve the original reference geometry and relative scale conservatively.'}\n\nCROSS-ITEM SCALE RULES\n${cross || '- Preserve the reference size hierarchy. Do not normalize different products to similar visual size.'}\n\nPRODUCT TRANSFER RULES\n${transfer || '- Preserve silhouette, major design features and component proportions instead of substituting a generic category look.'}\n\nUNCERTAINTIES\n${uncertain || '- None reported.'}\n\nPROHIBITED TRANSFORMATIONS\n${prohibited || '- No enlargement for emphasis, no miniaturization to fit composition, no generic redesign.'}\n\nHARD SCALE ENFORCEMENT: Keep every rigid promoted item at a believable physical size consistent with the reference evidence. A small handheld component must remain small relative to a hand and to larger kit items when the reference supports that relationship. An accessory attached to a host must remain proportionate to that host. Never enlarge one product just because the creator is holding it or because it is the current focus. Preserve product-specific geometry and visually defining features before optimizing composition.`;
  }

  function wrapProvider(provider, config) {
    if (!provider || provider.__scaleDesignFidelityWrapped) return provider;
    const originalGenerateCampaign = provider.generateCampaign?.bind(provider);
    if (typeof originalGenerateCampaign !== 'function') return provider;

    provider.generateCampaign = async function (context) {
      const campaign = await originalGenerateCampaign(context);
      if (!campaign || context?.input?.category !== 'multi') return campaign;

      const analysis = await analyzeScaleAndDesign({ apiKey: config.apiKey, model: config.model, context });
      const lock = scaleDesignLock(analysis);
      if (!lock) return campaign;

      campaign.productAccuracy = `${campaign.productAccuracy || ''}\n\n${lock}`.trim();
      if (Array.isArray(campaign.scenes)) {
        campaign.scenes = campaign.scenes.map(scene => ({
          ...scene,
          text: `${scene.text || ''}\n\n${lock}`.trim()
        }));
      }
      campaign.analysis = { ...(campaign.analysis || {}), scaleDesignFidelity: analysis };
      return campaign;
    };

    provider.__scaleDesignFidelityWrapped = true;
    return provider;
  }

  function install() {
    if (!global.GeminiProvider || global.GeminiProvider.__scaleDesignFidelityInstalled) return false;
    const originalCreate = global.GeminiProvider.create;
    if (typeof originalCreate !== 'function') return false;

    global.GeminiProvider.create = function (options) {
      const config = options || {};
      const provider = originalCreate.call(this, config);
      return wrapProvider(provider, {
        apiKey: config.apiKey,
        model: config.model || provider?.model || 'gemini-3.5-flash-lite'
      });
    };
    global.GeminiProvider.__scaleDesignFidelityInstalled = true;
    return true;
  }

  let attempts = 0;
  const timer = setInterval(function () {
    attempts += 1;
    if (install() || attempts >= 100) clearInterval(timer);
  }, 50);
})(window);
