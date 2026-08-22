(function (global) {
  'use strict';

  const PRODUCT_CLASSES = [
    'phone','smartphone','tablet','laptop','monitor','camera','microphone','mic','cooler','fan','stand',
    'keyboard','mouse','charger','case','earbuds','headphones','speaker','watch','wearable','remote',
    'gimbal','tripod','light','ring light','appliance','tool','device','console','controller'
  ];

  function norm(value) {
    return String(value || '').toLowerCase();
  }

  function allowedClassSet(manifest) {
    const allowed = new Set();
    for (const item of (manifest?.items || [])) {
      const hay = [item.name, item.category, item.description, ...(item.components || [])].map(norm).join(' ');
      for (const cls of PRODUCT_CLASSES) {
        if (hay.includes(cls)) allowed.add(cls);
      }
    }
    return allowed;
  }

  function buildPreflight(manifest) {
    if (!manifest || !Array.isArray(manifest.items) || !manifest.items.length) return null;

    const authorizedProducts = manifest.items.map((item, index) => ({
      id: String(item.id || `P${index + 1}`),
      name: String(item.name || `product_${index + 1}`),
      count: Math.max(1, Number(item.count) || 1),
      components: Array.isArray(item.components) ? item.components.filter(Boolean) : [],
      role: String(item.functionalRole || ''),
      confidence: String(item.confidence || 'low')
    }));

    const allowedClasses = allowedClassSet(manifest);
    const blockedClasses = PRODUCT_CLASSES.filter(cls => !allowedClasses.has(cls));

    return {
      mode: 'strict',
      authorizedProducts,
      allowedEnvironmentalObjects: [
        'creator/person','table or counter','chair or sofa','walls','floor','windows','curtains',
        'neutral shelves','plants','plain decor','ordinary room lighting'
      ],
      blockedProductLikeClasses: blockedClasses,
      validation: 'pass'
    };
  }

  function preflightLock(preflight) {
    if (!preflight) return '';
    const products = preflight.authorizedProducts.map((p, i) => {
      const components = p.components.length ? p.components.join(', ') : 'no separate component needs independent display';
      return `${i + 1}. ${p.id}: ${p.name} | MAX=${p.count} | role=${p.role || 'preserve reference-supported role'} | components=${components} | confidence=${p.confidence}`;
    }).join('\n');
    const env = preflight.allowedEnvironmentalObjects.map(x => `- ${x}`).join('\n');
    const blocked = preflight.blockedProductLikeClasses.map(x => `- ${x}`).join('\n');

    return `STRICT SCENE OBJECT PREFLIGHT — DETERMINISTIC GATE\nSTATUS: PASSED\nThis block is the FINAL authority for what physical objects may exist in the generated scene. If any earlier instruction conflicts with this block, THIS BLOCK WINS.\n\nAUTHORIZED PROMOTED OBJECTS\n${products}\n\nALLOWED ENVIRONMENTAL OBJECTS\n${env}\n\nBLOCKED PRODUCT-LIKE OBJECT CLASSES\n${blocked || '- None beyond the authorized manifest groups.'}\n\nRENDER CONTRACT\n- Render the creator plus only the authorized promoted object groups above and ordinary environmental objects above.\n- Do not render any blocked product-like object, even if it would normally be useful as a host, support, prop, or context device.\n- Do not add a phone, tablet, laptop, monitor, camera, charger, stand, accessory, case, or other device unless that object itself maps to an authorized manifest group above.\n- Compatibility does NOT authorize existence. A product being made for a phone/tablet/laptop does not permit that host to appear unless the host is independently authorized above.\n- If a promoted item normally requires an unauthorized host, reinterpret the demonstration: hold it, wear it, keep it contained, place it naturally at rest, or show it interacting only with another authorized promoted group.\n- Do not duplicate an authorized product beyond MAX.\n- Do not convert components into extra product instances.\n- Do not line products up like a catalog unless the scene intent explicitly requires a catalog.\n- The creator remains the visual hero; authorized products appear in natural use or natural secondary placement.\n\nFINAL MACHINE CHECK\nEvery product-like object in the rendered scene must map to one and only one AUTHORIZED PROMOTED OBJECT above. If it cannot be mapped, it must not exist in the image.`;
  }

  function wrapProvider(provider) {
    if (!provider || provider.__strictScenePreflightWrapped) return provider;
    const originalGenerateCampaign = provider.generateCampaign?.bind(provider);
    if (typeof originalGenerateCampaign !== 'function') return provider;

    provider.generateCampaign = async function (context) {
      const campaign = await originalGenerateCampaign(context);
      if (!campaign || context?.input?.category !== 'multi') return campaign;

      const manifest = campaign.analysis?.productReferenceManifest;
      const preflight = buildPreflight(manifest);
      const lock = preflightLock(preflight);
      if (!lock) return campaign;

      campaign.productAccuracy = `${campaign.productAccuracy || ''}\n\n${lock}`.trim();
      if (Array.isArray(campaign.scenes)) {
        campaign.scenes = campaign.scenes.map(scene => ({
          ...scene,
          text: `${scene.text || ''}\n\n${lock}`.trim()
        }));
      }
      campaign.analysis = { ...(campaign.analysis || {}), strictScenePreflight: preflight };
      return campaign;
    };

    provider.__strictScenePreflightWrapped = true;
    return provider;
  }

  function install() {
    if (!global.GeminiProvider || global.GeminiProvider.__strictScenePreflightInstalled) return false;
    const originalCreate = global.GeminiProvider.create;
    if (typeof originalCreate !== 'function') return false;

    global.GeminiProvider.create = function (options) {
      const provider = originalCreate.call(this, options || {});
      return wrapProvider(provider);
    };
    global.GeminiProvider.__strictScenePreflightInstalled = true;
    return true;
  }

  let attempts = 0;
  const timer = setInterval(function () {
    attempts += 1;
    if (install() || attempts >= 100) clearInterval(timer);
  }, 50);
})(window);
