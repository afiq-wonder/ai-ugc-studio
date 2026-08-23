(function (global) {
  'use strict';

  async function getStatus() {
    const sb = global.AIUGCSupabase;
    if (!sb) return { plan: 'free', paid_at: null, founder_number: null, purchase_price_rm: null };
    const { data, error } = await sb.rpc('my_billing_status');
    if (error) throw error;
    return data || { plan: 'free', paid_at: null, founder_number: null, purchase_price_rm: null };
  }

  async function getOffer() {
    const sb = global.AIUGCSupabase;
    if (!sb) throw new Error('Billing provider is unavailable.');
    const { data, error } = await sb.rpc('current_checkout_offer');
    if (error) throw error;
    return data;
  }

  async function startCheckout() {
    const sb = global.AIUGCSupabase;
    if (!sb) throw new Error('Billing provider is unavailable.');

    const offer = await getOffer();
    const { data, error } = await sb.functions.invoke('create-kakiugc-checkout', {
      body: { site_url: global.location.origin }
    });
    if (error) throw error;
    if (!data?.url) {
      const reason = data?.error === 'stripe_not_configured'
        ? 'Checkout is not live yet. Stripe configuration is still required.'
        : (data?.detail || data?.error || 'Could not start checkout.');
      throw new Error(reason);
    }

    global.dispatchEvent(new CustomEvent('aiugc:checkout-started', { detail: { offer, session_id: data.session_id } }));
    global.location.assign(data.url);
    return { ok: true, offer, session_id: data.session_id };
  }

  global.AIUGCBilling = { getStatus, getOffer, startCheckout };
})(window);
