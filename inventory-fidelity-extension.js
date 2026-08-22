(function (global) {
  'use strict';

  const DIRECT_ENDPOINT = model => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const str = { type: 'STRING' };
  const strings = { type: 'ARRAY', items: str };

  const inventorySchema = {
    type: 'OBJECT',
    properties: {
      inventoryGroups: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            label: str,
            instanceCount: str,
            countConfidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
            visibleComponents: strings,
            variantOrDuplicateStatus: str,
            countConstraint: str
          },
          required: ['label', 'instanceCount', 'countConfidence', 'visibleComponents', 'variantOrDuplicateStatus', 'countConstraint']
        }
      },
      inventorySummary: strings,
      countRules: strings,
      duplicateSuppressionRules: strings,
      uncertainties: strings
    },
    required: ['inventoryGroups', 'inventorySummary', 'countRules', 'duplicateSuppressionRules', 'uncertainties']
  };

  function dataUrlToInlineData(dataUrl) {
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    return match ? { inlineData: { mimeType: match[1], data: match[2] } } : null;
  }

  async function analyzeInventoryFidelity({ apiKey, model, context }) {
    if (context?.input?.category !== 'multi') return null;
    const product = dataUrlToInlineData(context.references?.product);
    if (!product) return null;

    const prompt = `You are the Inventory Fidelity layer for AI UGC Studio.

Analyze ONLY the uploaded PRODUCT REFERENCE for a multi-product / kit campaign.

PURPOSE
Prevent duplicate products, extra variants, omitted items and accidental multiplication of components while preserving the Dynamic Product Relationship behavior handled by another layer.

CLOSED-WORLD INVENTORY RULE — NON-NEGOTIABLE
- The uploaded product reference is the authority for promoted-item inventory.
- Count only promoted physical items or visibly distinct promoted components actually supported by the reference.
- Do not infer standard kit contents from the product name or category.
- Do not add extra copies because a product is shown from multiple angles, in an inset, on packaging, in a diagram, or in a compatibility illustration.
- Do not treat alternate colour variants as multiple scene copies unless the reference clearly presents them as separate promoted items intended to appear together.
- Distinguish one product with multiple components from multiple duplicate products.
- When exact count is visually clear, preserve it as a hard scene constraint.
- When count is uncertain, do NOT invent extra instances. Prefer the minimum confidently supported inventory and explicitly mark uncertainty.
- A contextual host/support object is not part of promoted-item count unless it is itself visibly promoted.

For every detected inventory group, report the supported physical instance count, confidence, visible components, whether apparent repeats are true duplicates/variants/alternate views, and a concise generation count constraint.

USER LABEL
${context.input.product || 'Not provided'}
This is weak context only. The image controls inventory.

Return only structured JSON.`;

    const response = await fetch(DIRECT_ENDPOINT(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: 'PRODUCT REFERENCE — inventory-count audit only' },
          product,
          { text: prompt }
        ] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: inventorySchema }
      })
    });

    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json())?.error?.message || ''; } catch (_) {}
      throw new Error(`Inventory fidelity analysis failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!text) throw new Error('Inventory fidelity analysis returned no response.');
    return JSON.parse(text);
  }

  function inventoryLock(analysis) {
    if (!analysis) return '';
    const groups = (analysis.inventoryGroups || []).map((group, index) => {
      const components = (group.visibleComponents || []).join(', ') || 'no separate components confirmed';
      return `${index + 1}. ${group.label}: supported instances=${group.instanceCount}; count confidence=${group.countConfidence}; visible components=${components}; repeat/variant status=${group.variantOrDuplicateStatus}; constraint=${group.countConstraint}`;
    }).join('\n');
    const summary = (analysis.inventorySummary || []).map(x => `- ${x}`).join('\n');
    const counts = (analysis.countRules || []).map(x => `- ${x}`).join('\n');
    const duplicates = (analysis.duplicateSuppressionRules || []).map(x => `- ${x}`).join('\n');
    const uncertainties = (analysis.uncertainties || []).map(x => `- ${x}`).join('\n');

    return `INVENTORY FIDELITY LOCK — REFERENCE-SPECIFIC\nThe following promoted-item inventory is authoritative for THIS reference. Preserve confidently detected instance counts and component structure. Do not multiply products merely to make the composition look fuller.\n\nINVENTORY GROUPS\n${groups || '- No reliable grouped count extracted; use the minimum confidently visible inventory.'}\n\nINVENTORY SUMMARY\n${summary || '- Preserve only confidently supported promoted items.'}\n\nCOUNT RULES\n${counts || '- One supported physical instance must remain one physical instance unless the reference clearly shows more.'}\n\nDUPLICATE SUPPRESSION\n${duplicates || '- Do not duplicate, clone, mirror, repeat or create extra colour variants of promoted products.'}\n\nUNCERTAINTIES\n${uncertainties || '- None reported.'}\n\nHARD COUNT ENFORCEMENT: Never create additional copies of a promoted item to fill empty space, balance the frame, demonstrate another angle, or imply a larger bundle. Do not convert alternate views, packaging illustrations or colour options into extra physical scene objects. When count confidence is low, use the minimum confidently supported count and preserve the item's appearance rather than inventing another instance.`;
  }

  function wrapProvider(provider, config) {
    if (!provider || provider.__inventoryFidelityWrapped) return provider;
    const originalGenerateCampaign = provider.generateCampaign?.bind(provider);
    if (typeof originalGenerateCampaign !== 'function') return provider;

    provider.generateCampaign = async function (context) {
      const campaign = await originalGenerateCampaign(context);
      if (!campaign || context?.input?.category !== 'multi') return campaign;

      const analysis = await analyzeInventoryFidelity({
        apiKey: config.apiKey,
        model: config.model,
        context
      });
      const lock = inventoryLock(analysis);
      if (!lock) return campaign;

      campaign.productAccuracy = `${campaign.productAccuracy || ''}\n\n${lock}`.trim();
      if (Array.isArray(campaign.scenes)) {
        campaign.scenes = campaign.scenes.map(scene => ({
          ...scene,
          text: `${scene.text || ''}\n\n${lock}`.trim()
        }));
      }
      campaign.analysis = { ...(campaign.analysis || {}), inventoryFidelity: analysis };
      return campaign;
    };

    provider.__inventoryFidelityWrapped = true;
    return provider;
  }

  function install() {
    if (!global.GeminiProvider || global.GeminiProvider.__inventoryFidelityInstalled) return false;
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
    global.GeminiProvider.__inventoryFidelityInstalled = true;
    return true;
  }

  let attempts = 0;
  const timer = setInterval(function () {
    attempts += 1;
    if (install() || attempts >= 100) clearInterval(timer);
  }, 50);
})(window);
