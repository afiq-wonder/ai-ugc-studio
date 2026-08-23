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
    const offer = await getOffer();
    const event = new CustomEvent('aiugc:checkout-requested', { detail: { offer } });
    global.dispatchEvent(event);
    return { ok: false, pendingProvider: true, offer };
  }

  global.AIUGCBilling = { getStatus, getOffer, startCheckout };
})(window);
