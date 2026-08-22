(function (global) {
  'use strict';

  let provider = null;

  function assertProvider(candidate) {
    if (!candidate || typeof candidate !== 'object') {
      throw new TypeError('AI provider must be an object.');
    }

    const supported = ['generateText', 'analyzeImages', 'analyzeDiscovery', 'generateCampaign'];
    if (!supported.some(method => typeof candidate[method] === 'function')) {
      throw new TypeError('AI provider must implement generateText(), analyzeImages(), analyzeDiscovery(), or generateCampaign().');
    }
  }

  function productName(context) {
    return String(context?.input?.product || '').trim().toLowerCase();
  }

  function isClothingProduct(context) {
    return /\b(shirt|baju|dress|gown|abaya|hijab|tudung|pants|trousers|jeans|skirt|blouse|top|jacket|hoodie|sweater|polo|kurung|kebaya|cardigan|clothing|apparel|garment|wear)\b/i.test(productName(context));
  }

  function isMultiProduct(context) {
    return /\b(kit|set|bundle|starter kit|accessories|collection|combo)\b/i.test(productName(context));
  }

  function isPortableAppliance(context) {
    return /\b(misting fan|mist fan|fan|air cooler|cooler|oven|air fryer|rice cooker|humidifier|heater|appliance)\b/i.test(productName(context));
  }

  function isHandheldProduct(context) {
    return /\b(microphone|mic|gimbal|selfie stick|remote|camera|bottle|mug|skincare|serum|phone)\b/i.test(productName(context));
  }

  function wardrobeLock(context) {
    if (isClothingProduct(context)) {
      return `Preserve the creator's identity and overall style direction. The promoted clothing becomes the wardrobe anchor for this scene. Reimagine the garment naturally on the creator while preserving the product's visible design, proportions, colorway and recognisable details. Allow realistic drape, folds, stretch, tension and movement so the clothing behaves like real fabric on this creator's body.`;
    }

    return `Preserve the creator's identity and overall style language. Wardrobe may adapt naturally to the requirements of this specific scene, including its location, activity and context, while still reading as the same person with the same established fashion identity. Avoid abrupt or unrelated styling changes that make the creator feel like a different character.`;
  }

  function locationLock(context) {
    const location = String(context?.input?.location || '').trim();
    if (/outdoor city street/i.test(location)) {
      return `Creator is physically outdoors on a real urban pedestrian street. Visible pavement, road edge, storefront exteriors and surrounding city architecture should establish the environment. Use natural outdoor daylight. The creator must be outside, not inside a shop, home, studio, showroom or interior space. Do not inherit the background from either reference image.`;
    }

    return `The selected campaign location is ${location || 'the requested location'}. Treat it as the actual physical environment of this scene. Establish it with believable environmental cues and matching light. Do not inherit the background from either reference image when it conflicts with the selected campaign location.`;
  }

  function singleSceneLock() {
    return `Generate ONE single image for this scene only. Do not create a collage, split-screen, storyboard, contact sheet, multi-panel composition, comparison layout, before-and-after layout, sequence of moments, or multiple scenes in one image. Show one creator, one product setup and one believable environment. Any campaign progression happens across separate generated images, never inside this image.`;
  }

  function sceneLogicLock() {
    return `Build one believable real-world UGC moment using only the creator, the promoted product and the environment needed for this scene. The product interaction must make physical and everyday sense for a normal person. Keep the visual clean and concise. Do not reproduce screenshot UI, reference-image captions, feature callouts, promotional banners, hashtags, collage layouts or unrelated text as visible elements in the generated scene.`;
  }

  function placementLock(context) {
    if (isMultiProduct(context)) {
      return `Treat every included product as a separate physical object. Preserve each item's own geometry, function and believable relative scale. Do not merge products, duplicate them, miniaturize them or enlarge them just to fit the composition. Arrange the kit as a cohesive real-world setup and let the creator interact with the items according to their actual use.`;
    }

    if (isClothingProduct(context)) {
      return `The creator should wear the promoted garment naturally. Preserve the intended silhouette and fit while allowing the garment to respond realistically to pose and movement. Show enough of the garment for its key visual details and overall fit to remain commercially readable.`;
    }

    if (isPortableAppliance(context)) {
      return `Choose a believable usage posture for the appliance. If it is structured, bulky or normally operated while stationary, place it securely on a logical support surface such as a table, counter, low platform, café table, market table or similar stable surface, with the creator standing or sitting beside it to point, adjust, operate or react to it. Do not force the creator to carry an operating appliance when stationary presentation would be more natural.`;
    }

    if (isHandheldProduct(context)) {
      return `Show the product being naturally held, presented or used by the creator at its normal real-world scale. Keep it clearly visible without awkward hand poses, face obstruction or implausible handling.`;
    }

    return `Choose the most believable real-world relationship between creator and product. Preserve normal product scale and function. The creator may wear, hold, place beside, operate or stand near the product depending on what a real person would naturally do with it. Do not force a generic hand-held pose.`;
  }

  function applyLocalDirectorFramework(context) {
    const campaign = context?.campaign;
    if (!campaign || typeof campaign !== 'object') return null;

    const wardrobe = wardrobeLock(context);
    const location = locationLock(context);
    const singleScene = singleSceneLock();
    const sceneLogic = sceneLogicLock();
    const placement = placementLock(context);

    const productAccuracy = `${campaign.productAccuracy || ''}\n\nWARDROBE / STYLE LOCK\n${wardrobe}`.trim();
    const scenes = Array.isArray(campaign.scenes)
      ? campaign.scenes.map(scene => ({
          ...scene,
          text: `${scene.text || ''}\n\nSINGLE SCENE OUTPUT\n${singleScene}\n\nLOCATION LOCK\n${location}\n\nSCENE LOGIC LOCK\n${sceneLogic}\n\nPLACEMENT LOGIC LOCK\n${placement}`.trim()
        }))
      : campaign.scenes;

    return {
      productAccuracy,
      scenes
    };
  }

  const adapter = {
    version: '0.5.1',

    registerProvider(candidate) {
      assertProvider(candidate);
      provider = candidate;
      return this.getProviderInfo();
    },

    clearProvider() {
      provider = null;
    },

    hasProvider() {
      return Boolean(provider);
    },

    getProviderInfo() {
      if (!provider) return { configured: false, name: null, model: null };
      return {
        configured: true,
        name: provider.name || 'custom',
        model: provider.model || null
      };
    },

    async generateText(request) {
      if (!provider || typeof provider.generateText !== 'function') return null;
      return provider.generateText(request);
    },

    async analyzeImages(request) {
      if (!provider || typeof provider.analyzeImages !== 'function') return null;
      return provider.analyzeImages(request);
    },

    async analyzeDiscovery(request) {
      if (!provider || typeof provider.analyzeDiscovery !== 'function') return null;
      return provider.analyzeDiscovery(request);
    },

    async enhanceCampaign(context) {
      if (!provider || typeof provider.generateCampaign !== 'function') {
        return applyLocalDirectorFramework(context);
      }
      return provider.generateCampaign(context);
    }
  };

  Object.freeze(adapter);
  global.AIProviderAdapter = adapter;

  function loadScript(src, onload) {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = onload || null;
    script.onerror = () => console.warn(`${src} unavailable; local mode remains active.`);
    document.head.appendChild(script);
  }

  loadScript('./gemini-provider.js', function () {
    loadScript('./ai-intelligence-integration.js', function () {
      loadScript('./inventory-fidelity-extension.js', function () {
        loadScript('./product-reference-manifest-extension.js', function () {
          loadScript('./product-existence-gate-extension.js', function () {
            loadScript('./strict-scene-preflight-extension.js');
          });
        });
      });
    });
  });
})(window);