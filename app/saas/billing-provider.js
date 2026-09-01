(function (global) {
  'use strict';

  async function getStatus() {
    const sb = global.AIUGCSupabase;
    if (!sb) return { plan: 'starter', subscription: null };
    const { data, error } = await sb.rpc('my_billing_status');
    if (error) throw error;
    return data || { plan: 'starter', subscription: null };
  }

  async function startCheckout(plan) {
    const normalized = String(plan || '').toLowerCase();
    if (!['pro', 'agency'].includes(normalized)) throw new Error('Unsupported plan.');
    const event = new CustomEvent('aiugc:checkout-requested', { detail: { plan: normalized } });
    global.dispatchEvent(event);
    return { ok: false, pendingProvider: true, plan: normalized };
  }

  global.AIUGCBilling = { getStatus, startCheckout };
})(window);
