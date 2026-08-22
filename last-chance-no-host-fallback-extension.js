(function (global) {
  'use strict';

  function list(v) { return Array.isArray(v) ? v.filter(Boolean) : []; }

  function buildFallback(campaign) {
    const manifest = campaign?.analysis?.productReferenceManifest;
    if (!manifest || !Array.isArray(manifest.items) || !manifest.items.length) return null;

    const items = manifest.items.map((item, index) => ({
      id: String(item.id || `P${index + 1}`),
      name: String(item.name || `product_${index + 1}`),
      count: Math.max(1, Number(item.count) || 1),
      role: String(item.functionalRole || ''),
      components: list(item.components),
      relationships: list(item.relationships),
      confidence: String(item.confidence || 'low')
    }));

    // Pick a conservative hero: prefer an item whose role does not imply an external host.
    const hostWords = /phone|smartphone|tablet|laptop|monitor|camera|device|host|mount|attach|cooler|stand/i;
    const hero = items.find(x => !hostWords.test(`${x.role} ${x.relationships.join(' ')}`)) || items[0];

    return {
      mode: 'last-chance-no-host',
      heroId: hero?.id || '',
      items,
      ordinaryEnvironment: ['creator/person','table or counter','chair or sofa','walls','floor','windows','curtains','neutral shelves','plants','plain decor','ordinary room lighting']
    };
  }

  function fallbackLock(plan) {
    if (!plan) return '';
    const products = plan.items.map((p, i) => {
      const comps = p.components.length ? p.components.join(', ') : 'components stay contained/secondary unless naturally needed';
      return `${i + 1}. ${p.id}: ${p.name} | MAX=${p.count} | role=${p.role || 'reference-supported role'} | components=${comps}`;
    }).join('\n');

    return `LAST-CHANCE NO-HOST FALLBACK — FINAL OVERRIDE\nThis is the final rendering policy. It exists because previous generations hallucinated host devices. If any earlier instruction conflicts with this block, THIS BLOCK WINS.\n\nAUTHORIZED PRODUCT GROUPS\n${products}\n\nHERO GROUP\n${plan.heroId || 'first authorized product group'}\n\nNON-NEGOTIABLE RENDER POLICY\n- Do NOT invent or add ANY phone, smartphone, tablet, laptop, monitor, camera, console, display device, charger, extra stand, extra cooler, extra microphone, extra accessory, or other product-like host that is not itself one of the authorized product groups above.\n- Do NOT satisfy a product relationship by creating a missing host. If a relationship needs an unauthorized host, ABANDON that relationship for this image.\n- Reinterpret the authorized product instead: the creator may hold it at its real scale, wear it if appropriate, keep it inside its own case, place it naturally on the table, or leave it as a secondary object.\n- A product that normally attaches to a missing host must appear UNATTACHED rather than causing the host to be invented.\n- A stand with no independently authorized host must appear as the stand itself; do not add a device merely to demonstrate the stand.\n- A cooler with no independently authorized host must appear as the cooler itself; do not add a phone merely to demonstrate the cooler.\n- A microphone system may be worn/held only using its own authorized components; do not create additional receivers, transmitters or cases beyond its authorized structure/count.\n- Do not create visually similar substitutes or category lookalikes. Reinterpret the actual reference products, not the category.\n- Keep the creator as visual hero. Use ONE active hero product group only. All other authorized product groups should be naturally secondary, contained, resting, or partially occluded rather than independently showcased.\n- Do not line up every component. Do not create a catalog display. Do not add products for balance or composition.\n\nSCENE OBJECT LIST\nAllowed: creator/person; the authorized product groups above; ordinary room/table/chair/wall/window/plant/decor only.\nForbidden: every other product-like physical object.\n\nFINAL SELF-CHECK BEFORE RENDERING\nAsk: does every product-like object map exactly to an authorized group above? If NO, remove it. If removing it makes the intended demonstration impossible, simplify the demonstration instead of inventing anything.`;
  }

  function wrapProvider(provider) {
    if (!provider || provider.__lastChanceNoHostWrapped) return provider;
    const originalGenerateCampaign = provider.generateCampaign?.bind(provider);
    if (typeof originalGenerateCampaign !== 'function') return provider;

    provider.generateCampaign = async function (context) {
      const campaign = await originalGenerateCampaign(context);
      if (!campaign || context?.input?.category !== 'multi') return campaign;

      const plan = buildFallback(campaign);
      const lock = fallbackLock(plan);
      if (!lock) return campaign;

      campaign.productAccuracy = `${campaign.productAccuracy || ''}\n\n${lock}`.trim();
      if (Array.isArray(campaign.scenes)) {
        campaign.scenes = campaign.scenes.map(scene => ({
          ...scene,
          text: `${scene.text || ''}\n\n${lock}`.trim()
        }));
      }
      campaign.analysis = { ...(campaign.analysis || {}), lastChanceNoHostFallback: plan };
      return campaign;
    };

    provider.__lastChanceNoHostWrapped = true;
    return provider;
  }

  function install() {
    if (!global.GeminiProvider || global.GeminiProvider.__lastChanceNoHostInstalled) return false;
    const originalCreate = global.GeminiProvider.create;
    if (typeof originalCreate !== 'function') return false;

    global.GeminiProvider.create = function (options) {
      const provider = originalCreate.call(this, options || {});
      return wrapProvider(provider);
    };
    global.GeminiProvider.__lastChanceNoHostInstalled = true;
    return true;
  }

  let attempts = 0;
  const timer = setInterval(function () {
    attempts += 1;
    if (install() || attempts >= 100) clearInterval(timer);
  }, 50);
})(window);
