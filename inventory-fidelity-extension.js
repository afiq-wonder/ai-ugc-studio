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
            hardMaximumSceneInstances: str,
            countConfidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
            visibleComponents: strings,
            representationMultiplicityEvidence: strings,
            variantOrDuplicateStatus: str,
            countConstraint: str
          },
          required: ['label', 'instanceCount', 'hardMaximumSceneInstances', 'countConfidence', 'visibleComponents', 'representationMultiplicityEvidence', 'variantOrDuplicateStatus', 'countConstraint']
        }
      },
      authoritativeSceneInventory: strings,
      totalPromotedInstanceBudget: str,
      inventorySummary: strings,
      countRules: strings,
      duplicateSuppressionRules: strings,
      uncertainties: strings
    },
    required: ['inventoryGroups', 'authoritativeSceneInventory', 'totalPromotedInstanceBudget', 'inventorySummary', 'countRules', 'duplicateSuppressionRules', 'uncertainties']
  };

  function dataUrlToInlineData(dataUrl) {
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    return match ? { inlineData: { mimeType: match[1], data: match[2] } } : null;
  }

  async function analyzeInventoryFidelity({ apiKey, model, context }) {
    if (context?.input?.category !== 'multi') return null;
    const product = dataUrlToInlineData(context.references?.product);
    if (!product) return null;

    const prompt = `You are the Inventory Cardinality and Fidelity layer for AI UGC Studio.

Analyze ONLY the uploaded PRODUCT REFERENCE for a multi-product / kit campaign.

PURPOSE
Create an authoritative physical inventory budget for ONE generated scene. Prevent duplicate products, extra variants, omitted items and accidental multiplication of components while preserving the separate Dynamic Product Relationship behavior handled by another layer.

CORE PRINCIPLE
A visual appearance in the reference is NOT automatically a separate physical scene instance. First determine whether repeated appearances are the same product shown multiple times, alternate angles, variants, packaging artwork, diagrams, compatibility illustrations, or genuinely separate promoted objects intended to coexist.

CLOSED-WORLD INVENTORY RULE — NON-NEGOTIABLE
- The uploaded product reference is the authority for promoted-item inventory.
- Count only promoted physical items or visibly distinct promoted components actually supported by the reference.
- Do not infer standard kit contents from the product name or category.
- Do not add extra copies because a product is shown from multiple angles, in an inset, on packaging, in a diagram, in a lifestyle example, or in a compatibility illustration.
- Do not treat alternate colour variants as multiple scene copies unless the reference clearly presents them as separate promoted items intended to appear together.
- Distinguish one product with multiple functional components from multiple duplicate products.
- If one device is pictured both alone and attached to a host/support device, count it as ONE promoted instance unless the reference clearly sells multiple units.
- If a charging/storage case contains several components, count the case and its genuine contained components according to what is visibly supported; do not clone the components outside the case unless the reference supports multiple physical units.
- If the same promoted item appears repeatedly only to demonstrate different states, angles, colours, or uses, its hardMaximumSceneInstances must normally remain 1.
- When exact count is visually clear, preserve it as a hard scene constraint.
- When count is uncertain, do NOT invent extra instances. Prefer the minimum confidently supported inventory and explicitly mark uncertainty.
- A contextual host/support object is not part of promoted-item count unless it is itself visibly promoted.

COUNTING PROCEDURE
1. Group repeated depictions that appear to represent the same underlying promoted product.
2. Separate genuine bundled components that are physically distinct in real use.
3. For every group, estimate the supported instance count for ONE scene.
4. Set hardMaximumSceneInstances to the maximum number the image model is allowed to render for that group.
5. Build authoritativeSceneInventory as explicit lines such as “1 x [item]”, “2 x [component]”. Use only reference-supported counts.
6. Sum only promoted physical instances into totalPromotedInstanceBudget. Do not include ordinary background furniture or allowed contextual host/support objects.

DUPLICATE SUPPRESSION
- Never create a second copy of an item merely because empty space remains in the frame.
- Never repeat an object to improve symmetry, composition, visual balance, perceived bundle value, or product visibility.
- Never split a single product into multiple near-identical variants unless the reference proves that multiple physical units belong in the same bundle.
- Never place one instance in-hand and another duplicate on the table unless the reference supports two separate physical units.
- Never duplicate a host-attached accessory as a separate standalone copy at the same time unless two units are clearly promoted.
- If an item must change state between scenes, reuse the same conceptual instance rather than multiplying it inside one scene.

For every detected inventory group, report the supported instance count, a hard maximum scene count, confidence, visible components, evidence explaining why repeated appearances are or are not separate physical units, whether apparent repeats are true duplicates/variants/alternate views, and a concise generation count constraint.

USER LABEL
${context.input.product || 'Not provided'}
This is weak context only. The image controls inventory.

Return only structured JSON.`;

    const response = await fetch(DIRECT_ENDPOINT(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: 'PRODUCT REFERENCE — exact one-scene inventory audit only' },
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
      const multiplicity = (group.representationMultiplicityEvidence || []).join('; ') || 'no repeat-evidence reported';
      return `${index + 1}. ${group.label}: supported instances=${group.instanceCount}; HARD MAX=${group.hardMaximumSceneInstances}; count confidence=${group.countConfidence}; visible components=${components}; repeat evidence=${multiplicity}; repeat/variant status=${group.variantOrDuplicateStatus}; constraint=${group.countConstraint}`;
    }).join('\n');
    const authoritative = (analysis.authoritativeSceneInventory || []).map(x => `- ${x}`).join('\n');
    const summary = (analysis.inventorySummary || []).map(x => `- ${x}`).join('\n');
    const counts = (analysis.countRules || []).map(x => `- ${x}`).join('\n');
    const duplicates = (analysis.duplicateSuppressionRules || []).map(x => `- ${x}`).join('\n');
    const uncertainties = (analysis.uncertainties || []).map(x => `- ${x}`).join('\n');

    return `INVENTORY CARDINALITY LOCK — REFERENCE-SPECIFIC\nThe following promoted-item inventory is authoritative for ONE generated scene. Preserve confidently detected instance counts exactly and never exceed any HARD MAX.\n\nAUTHORITATIVE ONE-SCENE INVENTORY\n${authoritative || '- Use only the minimum confidently supported promoted inventory.'}\n\nTOTAL PROMOTED INSTANCE BUDGET\n${analysis.totalPromotedInstanceBudget || 'Use the minimum confidently supported total.'}\n\nINVENTORY GROUPS\n${groups || '- No reliable grouped count extracted; use the minimum confidently visible inventory.'}\n\nINVENTORY SUMMARY\n${summary || '- Preserve only confidently supported promoted items.'}\n\nCOUNT RULES\n${counts || '- One supported physical instance must remain one physical instance unless the reference clearly shows more.'}\n\nDUPLICATE SUPPRESSION\n${duplicates || '- Do not duplicate, clone, mirror, repeat or create extra colour variants of promoted products.'}\n\nUNCERTAINTIES\n${uncertainties || '- None reported.'}\n\nHARD CARDINALITY ENFORCEMENT: Treat each group HARD MAX as an absolute ceiling for this scene. Never create an extra copy to fill space, balance the frame, show another angle, imply a larger bundle, or keep one duplicate on a surface while another is being used. A promoted accessory attached to its host is the same physical instance and must not also appear as a duplicate standalone object unless the authoritative inventory explicitly allows more than one. Alternate views, packaging illustrations, colour options and repeated marketing depictions do not increase the physical scene count. If count confidence is low, choose the minimum confidently supported number and do not exceed it.`;
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
