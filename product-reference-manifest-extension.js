(function (global) {
  'use strict';

  const DIRECT_ENDPOINT = model => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const str = { type: 'STRING' };
  const strings = { type: 'ARRAY', items: str };
  const ints = { type: 'ARRAY', items: { type: 'INTEGER' } };

  const manifestSchema = {
    type: 'OBJECT',
    properties: {
      environment: str,
      items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
        id: str, name: str, category: str, description: str, count: { type: 'INTEGER' },
        confidence: { type: 'STRING', enum: ['high','medium','low'] }, box2d: ints,
        boxConfidence: { type: 'STRING', enum: ['high','medium','low'] }, components: strings,
        functionalRole: str, relationships: strings, visualInvariants: strings,
        relativeScaleClass: { type: 'STRING', enum: ['very-small','small','medium','large','very-large','uncertain'] },
        scaleEvidence: strings, uncertainty: str
      }, required: ['id','name','category','description','count','confidence','box2d','boxConfidence','components','functionalRole','relationships','visualInvariants','relativeScaleClass','scaleEvidence','uncertainty'] } },
      globalConstraints: strings, uncertainties: strings
    },
    required: ['environment','items','globalConstraints','uncertainties']
  };

  const scenePlanSchema = {
    type: 'OBJECT',
    properties: {
      sceneIntent: str,
      heroItemId: str,
      heroUse: str,
      supportingItems: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: str, naturalUse: str }, required: ['id','naturalUse'] } },
      containedOrSecondaryItems: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: str, naturalState: str }, required: ['id','naturalState'] } },
      compositionRules: strings,
      antiExhibitionRules: strings
    },
    required: ['sceneIntent','heroItemId','heroUse','supportingItems','containedOrSecondaryItems','compositionRules','antiExhibitionRules']
  };

  function dataUrlToInlineData(dataUrl) {
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    return match ? { inlineData: { mimeType: match[1], data: match[2] } } : null;
  }

  async function callJson({ apiKey, model, parts, schema, label }) {
    const response = await fetch(DIRECT_ENDPOINT(model), {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema } })
    });
    if (!response.ok) {
      let detail = ''; try { detail = (await response.json())?.error?.message || ''; } catch (_) {}
      throw new Error(`${label} failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!text) throw new Error(`${label} returned no response.`);
    return JSON.parse(text);
  }

  async function analyzeManifest({ apiKey, model, context }) {
    if (context?.input?.category !== 'multi') return null;
    const product = dataUrlToInlineData(context.references?.product);
    if (!product) return null;
    const prompt = `You are the Product Reference Manifest perception layer for AI UGC Studio. Analyze ONLY the uploaded PRODUCT REFERENCE and build a structured closed-world manifest of promoted physical inventory actually supported by the image.

The image is authority; the user label is weak context. Never infer standard kit contents. Identify distinct promoted product GROUPS, not every depiction. Preserve count conservatively: alternate views, inset diagrams, packaging illustrations and repeated depictions do not become extra instances. box2d is [y_min,x_min,y_max,x_max] normalized 0..1000 for the dominant depiction. Describe category, visible design, major components, functional role, relationships, relative scale and only high-confidence visual invariants. A product system with several components remains ONE product group when those components belong to that system. State uncertainty instead of guessing. Do not invent hosts/support products unless visibly present or strongly evidenced.

USER LABEL: ${context.input.product || 'Not provided'}\nReturn only structured JSON.`;
    return callJson({ apiKey, model, schema: manifestSchema, label: 'Product reference manifest', parts: [{ text: 'PRODUCT REFERENCE — build grounded manifest only' }, product, { text: prompt }] });
  }

  async function planNaturalScene({ apiKey, model, context, manifest }) {
    if (!manifest) return null;
    const prompt = `You are the Natural UGC Scene Director. You receive a grounded Product Reference Manifest. Do NOT re-detect products and do NOT turn the manifest into an inventory exhibition.

MISSION
Plan ONE believable creator-led UGC image. The creator is the visual hero; products support a natural story. Functional truth outranks showing every component.

NON-NEGOTIABLE
- Preserve every promoted PRODUCT GROUP, but every component does NOT need independent prominence.
- Components may be worn, attached, contained in their case, naturally occluded, or secondary when that is how a real creator would use the product.
- Choose ONE hero product/group for the active demonstration based on the user's action/selling points and manifest roles.
- Other promoted groups become SUPPORTING products in natural functional positions or CONTAINED/SECONDARY when appropriate.
- Never line up small components merely to prove inventory count.
- Never scatter accessories across a surface like an evidence table.
- Never enlarge a small item for prominence.
- Never add products or hosts unsupported by the manifest.
- Do not force all promoted items into the creator's hands.
- Keep the creator dominant and the workstation/environment visually clean.
- The result should feel like a real creator owns and uses the setup, not a catalog flat-lay.

USER ACTION / SELLING POINTS
${context.input.sellingPoints || 'Natural product demonstration'}
LOCATION
${context.input.location || 'Unspecified'}
STYLE
${context.input.style || 'Authentic UGC review'}

PRODUCT REFERENCE MANIFEST
${JSON.stringify(manifest)}

Return only structured JSON.`;
    return callJson({ apiKey, model, schema: scenePlanSchema, label: 'Natural scene hierarchy plan', parts: [{ text: prompt }] });
  }

  function boxMetrics(box) {
    if (!Array.isArray(box) || box.length !== 4) return '';
    const [y1,x1,y2,x2] = box.map(Number); const w = Math.max(0,x2-x1), h = Math.max(0,y2-y1);
    return `box=[${y1},${x1},${y2},${x2}], boxWidth=${w}, boxHeight=${h}, boxArea=${w*h}`;
  }

  function manifestLock(manifest) {
    if (!manifest) return '';
    const items = (manifest.items || []).map((item,i) => `${i+1}. ${item.id} | ${item.name} | category=${item.category} | count=${item.count} | confidence=${item.confidence} | ${boxMetrics(item.box2d)} | relativeScale=${item.relativeScaleClass}\n   description=${item.description}\n   components=${(item.components||[]).join(', ') || 'none separately confirmed'}\n   role=${item.functionalRole}\n   relationships=${(item.relationships||[]).join('; ') || 'none assumed'}\n   visual invariants=${(item.visualInvariants||[]).join('; ') || 'preserve conservatively'}\n   uncertainty=${item.uncertainty || 'none'}`).join('\n');
    return `PRODUCT REFERENCE MANIFEST — PERCEPTION EVIDENCE\nThis is the grounded understanding of the uploaded reference. It defines product identity, grouping, relationships and relative scale; it is NOT a checklist requiring every component to be independently displayed.\n\n${items}\n\nDo not invent unreferenced promoted products. Preserve product groups and high-confidence identity traits. Components belonging to one system remain components of that system.`;
  }

  function scenePlanLock(plan) {
    if (!plan) return '';
    const supporting = (plan.supportingItems||[]).map(x => `- ${x.id}: ${x.naturalUse}`).join('\n') || '- None required';
    const secondary = (plan.containedOrSecondaryItems||[]).map(x => `- ${x.id}: ${x.naturalState}`).join('\n') || '- None';
    const composition = (plan.compositionRules||[]).map(x => `- ${x}`).join('\n');
    const anti = (plan.antiExhibitionRules||[]).map(x => `- ${x}`).join('\n');
    return `NATURAL UGC SCENE HIERARCHY — DIRECTING LAYER\nSCENE INTENT: ${plan.sceneIntent}\nCREATOR: visual hero of the image.\nHERO PRODUCT: ${plan.heroItemId || 'choose the most natural active product'}\nHERO USE: ${plan.heroUse}\n\nSUPPORTING PRODUCTS\n${supporting}\n\nCONTAINED / SECONDARY COMPONENTS\n${secondary}\n\nCOMPOSITION\n${composition}\n\nANTI-EXHIBITION RULES\n${anti}\n\nFINAL PRIORITY: believable creator behavior > clean visual hierarchy > functional product truth > component visibility. Preserve promoted product identity, but do not display every component independently. Do not line up accessories, create a catalog flat-lay, or turn the scene into an inventory proof image.`;
  }

  function wrapProvider(provider, config) {
    if (!provider || provider.__productReferenceManifestWrapped) return provider;
    const originalGenerateCampaign = provider.generateCampaign?.bind(provider);
    if (typeof originalGenerateCampaign !== 'function') return provider;
    provider.generateCampaign = async function(context) {
      const campaign = await originalGenerateCampaign(context);
      if (!campaign || context?.input?.category !== 'multi') return campaign;
      const manifest = await analyzeManifest({ apiKey: config.apiKey, model: config.model, context });
      const scenePlan = await planNaturalScene({ apiKey: config.apiKey, model: config.model, context, manifest });
      const perception = manifestLock(manifest);
      const direction = scenePlanLock(scenePlan);
      campaign.productAccuracy = `${campaign.productAccuracy || ''}\n\n${perception}\n\n${direction}`.trim();
      if (Array.isArray(campaign.scenes)) campaign.scenes = campaign.scenes.map(scene => ({ ...scene, text: `${scene.text || ''}\n\n${direction}`.trim() }));
      campaign.analysis = { ...(campaign.analysis || {}), productReferenceManifest: manifest, naturalSceneHierarchy: scenePlan };
      return campaign;
    };
    provider.__productReferenceManifestWrapped = true;
    return provider;
  }

  function install() {
    if (!global.GeminiProvider || global.GeminiProvider.__productReferenceManifestInstalled) return false;
    const originalCreate = global.GeminiProvider.create;
    if (typeof originalCreate !== 'function') return false;
    global.GeminiProvider.create = function(options) {
      const config = options || {}; const provider = originalCreate.call(this, config);
      return wrapProvider(provider, { apiKey: config.apiKey, model: config.model || provider?.model || 'gemini-3.5-flash-lite' });
    };
    global.GeminiProvider.__productReferenceManifestInstalled = true; return true;
  }

  let attempts = 0;
  const timer = setInterval(function(){ attempts += 1; if (install() || attempts >= 100) clearInterval(timer); }, 50);
})(window);
