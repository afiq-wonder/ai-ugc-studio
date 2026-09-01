(function (global) {
  'use strict';

  const PACKAGES = Object.freeze({
    launch: Object.freeze({ id:'launch', priceRM:129, images:60, videos:20, videoMaxSeconds:8, label:'KakiUGC' }),
    reload_59: Object.freeze({ id:'reload_59', priceRM:59, images:30, videos:10, videoMaxSeconds:8, label:'Reload' }),
    reload_99: Object.freeze({ id:'reload_99', priceRM:99, images:60, videos:20, videoMaxSeconds:8, label:'Reload XL' })
  });

  async function getStatus() {
    const sb = global.AIUGCSupabase;
    if (!sb) return { plan:'free', generation:null, packages:PACKAGES };
    const [billing,generation] = await Promise.all([sb.rpc('my_billing_status'),sb.rpc('my_generation_entitlement')]);
    if (billing.error) throw billing.error;
    if (generation.error) throw generation.error;
    return { ...(billing.data||{plan:'free'}), generation:generation.data||null, packages:PACKAGES };
  }

  async function startCheckout(packageId) {
    const normalized=String(packageId||'').toLowerCase();
    const offer=PACKAGES[normalized];
    if(!offer) throw new Error('Unsupported KakiUGC package.');
    const event=new CustomEvent('aiugc:checkout-requested',{detail:{packageId:normalized,offer}});
    global.dispatchEvent(event);
    return {ok:false,pendingProvider:true,packageId:normalized,offer};
  }

  global.AIUGCBilling={ PACKAGES,getStatus,startCheckout };
})(window);
