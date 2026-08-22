(function (global) {
  'use strict';

  function textList(values) {
    return (Array.isArray(values) ? values : []).filter(Boolean);
  }

  function buildGate(manifest, scenePlan) {
    if (!manifest || !Array.isArray(manifest.items) || !manifest.items.length) return null;

    const allowedProducts = manifest.items.map((item, index) => ({
      id: String(item.id || `P${index + 1}`),
      name: String(item.name || `product_${index + 1}`),
      category: String(item.category || 'unknown'),
      count: Math.max(1, Number(item.count) || 1),
      components: textList(item.components),
      relationships: textList(item.relationships),
      confidence: String(item.confidence || 'low')
    }));

    const allowedIds = new Set(allowedProducts.map(x => x.id));
    const heroId = String(scenePlan?.heroItemId || '');
    const supporting = textList(scenePlan?.supportingItems).filter(x => x && allowedIds.has(String(x.id)));
    const secondary = textList(scenePlan?.containedOrSecondaryItems).filter(x => x && allowedIds.has(String(x.id)));

    return {
      allowedProducts,
      heroId: allowedIds.has(heroId) ? heroId : '',
      supporting,
      secondary,
      blockedProductLikeClasses: [
        'unlisted phones', 'unlisted tablets', 'unlisted laptops', 'unlisted monitors',
        'unlisted cameras', 'unlisted microphones', 'unlisted coolers', 'unlisted stands',
        'unlisted keyboards', 'unlisted mice', 'unlisted chargers', 'unlisted cases',
        'unlisted electronic accessories', 'unlisted wearables', 'unlisted tools',
        'unlisted appliances', 'unlisted branded or product-like devices'
      ]
    };
  }

  function gateLock(gate) {
    if (!gate) return '';
    const products = gate.allowedProducts.map((item, index) => {
      const components = item.components.length ? item.components.join(', ') : 'no separate components confirmed';
      const relationships = item.relationships.length ? item.relationships.join('; ') : 'no additional relationship assumed';
      return `${index + 1}. ${item.id} = ${item.name} | category=${item.category} | MAX PHYSICAL INSTANCES=${item.count} | components=${components} | relationships=${relationships} | confidence=${item.confidence}`;
    }).join('\n');

    const blocked = gate.blockedProductLikeClasses.map(x => `- ${x}`).join('\n');

    return `PRODUCT EXISTENCE GATE — HARD CLOSED-WORLD CONTRACT\nGeneration is NOT allowed to decide what products or product-like devices exist. The perception manifest above is the sole authority.\n\nAUTHORIZED PROMOTED PRODUCT GROUPS\n${products}\n\nHARD EXISTENCE RULES\n- Render ONLY the authorized promoted product groups listed above.\n- Never create a fifth product group, replacement product, substitute device, lookalike, convenience prop, or extra accessory simply because it would make the scene easier to compose.\n- Never turn a relationship into a new object unless that object itself is authorized by the manifest.\n- A product component is part of its parent product system, not permission to create another product instance.\n- Respect each group's MAX PHYSICAL INSTANCES. One product shown in use cannot also appear again elsewhere in the same scene unless its authorized count is greater than one.\n- If a natural interaction would normally require an unlisted product-like host, DO NOT invent the host. Reinterpret the scene using only the authorized inventory: show the promoted item naturally at rest, held, worn, contained, or interacting only with an authorized item.\n- Ordinary non-product scenery is allowed only when it is clearly environmental: walls, floor, table/counter, chair/sofa, neutral shelving, plants, windows, curtains, generic lighting and similar architecture/decor. Such scenery must never become a promoted or tech/product-like object.\n\nBLOCKED UNLESS EXPLICITLY AUTHORIZED ABOVE\n${blocked}\n\nFINAL EXISTENCE AUDIT BEFORE RENDERING\nMentally enumerate every product-like physical object that will appear. Every one must map to exactly one authorized product group above. If any product-like object cannot be mapped, REMOVE IT before rendering. Do not compensate by inventing a substitute. Functional reinterpretation is required; product invention is forbidden.`;
  }

  function wrapProvider(provider) {
    if (!provider || provider.__productExistenceGateWrapped) return provider;
    const originalGenerateCampaign = provider.generateCampaign?.bind(provider);
    if (typeof originalGenerateCampaign !== 'function') return provider;

    provider.generateCampaign = async function (context) {
      const campaign = await originalGenerateCampaign(context);
      if (!campaign || context?.input?.category !== 'multi') return campaign;

      const manifest = campaign.analysis?.productReferenceManifest;
      const scenePlan = campaign.analysis?.naturalScenePlan;
      const gate = buildGate(manifest, scenePlan);
      const lock = gateLock(gate);
      if (!lock) return campaign;

      campaign.productAccuracy = `${campaign.productAccuracy || ''}\n\n${lock}`.trim();
      if (Array.isArray(campaign.scenes)) {
        campaign.scenes = campaign.scenes.map(scene => ({
          ...scene,
          text: `${scene.text || ''}\n\n${lock}`.trim()
        }));
      }
      campaign.analysis = { ...(campaign.analysis || {}), productExistenceGate: gate };
      return campaign;
    };

    provider.__productExistenceGateWrapped = true;
    return provider;
  }

  function install() {
    if (!global.GeminiProvider || global.GeminiProvider.__productExistenceGateInstalled) return false;
    const originalCreate = global.GeminiProvider.create;
    if (typeof originalCreate !== 'function') return false;

    global.GeminiProvider.create = function (options) {
      const provider = originalCreate.call(this, options || {});
      return wrapProvider(provider);
    };
    global.GeminiProvider.__productExistenceGateInstalled = true;
    return true;
  }

  let attempts = 0;
  const timer = setInterval(function () {
    attempts += 1;
    if (install() || attempts >= 100) clearInterval(timer);
  }, 50);
})(window);
