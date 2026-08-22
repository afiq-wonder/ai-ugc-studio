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
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            id: str,
            name: str,
            category: str,
            description: str,
            count: { type: 'INTEGER' },
            confidence: { type: 'STRING', enum: ['high','medium','low'] },
            box2d: ints,
            boxConfidence: { type: 'STRING', enum: ['high','medium','low'] },
            components: strings,
            functionalRole: str,
            relationships: strings,
            visualInvariants: strings,
            relativeScaleClass: { type: 'STRING', enum: ['very-small','small','medium','large','very-large','uncertain'] },
            scaleEvidence: strings,
            uncertainty: str
          },
          required: ['id','name','category','description','count','confidence','box2d','boxConfidence','components','functionalRole','relationships','visualInvariants','relativeScaleClass','scaleEvidence','uncertainty']
        }
      },
      globalConstraints: strings,
      uncertainties: strings
    },
    required: ['environment','items','globalConstraints','uncertainties']
  };

  function dataUrlToInlineData(dataUrl) {
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    return match ? { inlineData: { mimeType: match[1], data: match[2] } } : null;
  }

  async function analyzeManifest({ apiKey, model, context }) {
    if (context?.input?.category !== 'multi') return null;
    const product = dataUrlToInlineData(context.references?.product);
    if (!product) return null;

    const prompt = `You are the Product Reference Manifest perception layer for AI UGC Studio.

Analyze ONLY the uploaded PRODUCT REFERENCE. Build a structured, closed-world manifest of the promoted physical inventory actually supported by the image.

PURPOSE
Convert the visual reference into grounded evidence the Director can use instead of relying on vague prompt language.

RULES — NON-NEGOTIABLE
- The image is the authority. The user's product label is weak context only.
- Do not infer standard kit contents from category names such as creator kit, camping kit, beauty kit, tool kit, etc.
- Identify each distinct promoted product/group actually visible.
- Preserve product count conservatively. Alternate views, inset diagrams, packaging illustrations and repeated depictions of the same physical item must NOT become extra scene instances.
- box2d must be [y_min, x_min, y_max, x_max] normalized to 0..1000 for the dominant visible depiction of that item. If uncertain, still give the best conservative box and mark boxConfidence low.
- Use box geometry only as evidence of the reference depiction, not as an instruction to copy the original composition.
- Describe the product semantically: category, visible design, major components, functional role, and relationships to other visible items.
- Derive relativeScaleClass and scaleEvidence from the reference itself. Do not invent exact measurements unless legible.
- visualInvariants must contain only high-confidence traits that should survive generation: silhouette, major colors, rigid geometry, key openings/vents/buttons, display areas, graphics/text placement when legible, and obvious component arrangement.
- If a relationship or identity is uncertain, state uncertainty instead of guessing.
- Do not invent host devices or support products unless visibly present or strongly evidenced by the reference.

USER LABEL
${context.input.product || 'Not provided'}

Return only structured JSON.`;

    const response = await fetch(DIRECT_ENDPOINT(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: 'PRODUCT REFERENCE — build grounded manifest only' },
          product,
          { text: prompt }
        ] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: manifestSchema }
      })
    });

    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json())?.error?.message || ''; } catch (_) {}
      throw new Error(`Product reference manifest failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!text) throw new Error('Product reference manifest returned no response.');
    return JSON.parse(text);
  }

  function boxMetrics(box) {
    if (!Array.isArray(box) || box.length !== 4) return '';
    const [y1,x1,y2,x2] = box.map(Number);
    const w = Math.max(0, x2-x1), h = Math.max(0, y2-y1), area = w*h;
    return `box=[${y1},${x1},${y2},${x2}], boxWidth=${w}, boxHeight=${h}, boxArea=${area}`;
  }

  function manifestLock(manifest) {
    if (!manifest) return '';
    const items = (manifest.items || []).map((item, i) => {
      const components = (item.components || []).join(', ') || 'none separately confirmed';
      const relations = (item.relationships || []).join('; ') || 'no relationship assumed';
      const invariants = (item.visualInvariants || []).join('; ') || 'preserve visible appearance conservatively';
      const scale = (item.scaleEvidence || []).join('; ') || 'preserve reference-relative scale conservatively';
      return `${i+1}. ${item.id} | ${item.name} | category=${item.category} | count=${item.count} | confidence=${item.confidence} | ${boxMetrics(item.box2d)} | boxConfidence=${item.boxConfidence} | relativeScale=${item.relativeScaleClass}\n   description=${item.description}\n   components=${components}\n   role=${item.functionalRole}\n   relationships=${relations}\n   visual invariants=${invariants}\n   scale evidence=${scale}\n   uncertainty=${item.uncertainty || 'none reported'}`;
    }).join('\n');
    const constraints = (manifest.globalConstraints || []).map(x => `- ${x}`).join('\n');
    const uncertainties = (manifest.uncertainties || []).map(x => `- ${x}`).join('\n');

    return `PRODUCT REFERENCE MANIFEST — STRUCTURED VISUAL EVIDENCE\nUse this manifest as the authoritative perception record for THIS uploaded product reference. Do not replace it with generic category assumptions. The bounding boxes are normalized reference evidence for location and relative footprint, not a request to copy the source layout.\n\nREFERENCE ENVIRONMENT\n${manifest.environment || 'Unspecified'}\n\nDETECTED PROMOTED INVENTORY\n${items || '- No confident inventory extracted. Preserve only clearly visible products.'}\n\nGLOBAL CONSTRAINTS\n${constraints || '- Closed-world inventory; no unreferenced promoted products; preserve count, identity and relative scale.'}\n\nUNCERTAINTIES\n${uncertainties || '- None reported.'}\n\nMANIFEST ENFORCEMENT\nBefore composing the scene, reconcile every rendered promoted object against this manifest. Preserve the detected product identity, count, component structure, relationships, relative scale hierarchy and high-confidence visual invariants. Never enlarge, shrink, duplicate, substitute or generically redesign a product merely for composition. If manifest confidence is low, choose conservative placement and appearance rather than inventing details.`;
  }

  function wrapProvider(provider, config) {
    if (!provider || provider.__productReferenceManifestWrapped) return provider;
    const originalGenerateCampaign = provider.generateCampaign?.bind(provider);
    if (typeof originalGenerateCampaign !== 'function') return provider;

    provider.generateCampaign = async function (context) {
      const campaign = await originalGenerateCampaign(context);
      if (!campaign || context?.input?.category !== 'multi') return campaign;

      const manifest = await analyzeManifest({ apiKey: config.apiKey, model: config.model, context });
      const lock = manifestLock(manifest);
      if (!lock) return campaign;

      campaign.productAccuracy = `${campaign.productAccuracy || ''}\n\n${lock}`.trim();
      if (Array.isArray(campaign.scenes)) {
        campaign.scenes = campaign.scenes.map(scene => ({ ...scene, text: `${scene.text || ''}\n\n${lock}`.trim() }));
      }
      campaign.analysis = { ...(campaign.analysis || {}), productReferenceManifest: manifest };
      return campaign;
    };

    provider.__productReferenceManifestWrapped = true;
    return provider;
  }

  function install() {
    if (!global.GeminiProvider || global.GeminiProvider.__productReferenceManifestInstalled) return false;
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
    global.GeminiProvider.__productReferenceManifestInstalled = true;
    return true;
  }

  let attempts = 0;
  const timer = setInterval(function () {
    attempts += 1;
    if (install() || attempts >= 100) clearInterval(timer);
  }, 50);
})(window);
