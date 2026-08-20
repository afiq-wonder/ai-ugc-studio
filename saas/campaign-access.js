(function (global) {
  'use strict';

  if (global.top === global.self) {
    global.location.replace('./saas/');
    return;
  }

  const parentWindow = global.parent;
  const state = {
    context: null,
    currentCampaignId: null,
    currentFingerprint: null,
    busy: false,
    bypass: false
  };

  const $ = id => document.getElementById(id);

  function client() {
    try { return parentWindow.AIUGCSupabase || null; }
    catch (_) { return null; }
  }

  function normalize(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  async function fileDigest(file) {
    if (!file) return 'no-image';
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function productFingerprint() {
    const file = $('product')?.files?.[0] || null;
    const digest = await fileDigest(file);
    const basis = [digest, normalize($('name')?.value), normalize($('category')?.value)].join('|');
    const bytes = new TextEncoder().encode(basis);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function productVariables() {
    return {
      product_name: $('name')?.value?.trim() || '',
      category: $('category')?.value || '',
      platform: $('platform')?.value || '',
      language: $('language')?.value || '',
      style: $('style')?.value || '',
      camera: $('camera')?.value || '',
      location: $('location')?.value || '',
      action: $('action')?.value?.trim() || ''
    };
  }

  function campaignOutput() {
    return {
      prompt: $('output')?.textContent || '',
      scene1: $('scene1')?.textContent || '',
      scene2: $('scene2')?.textContent || '',
      scene3: $('scene3')?.textContent || '',
      cta: $('cta')?.textContent || '',
      hashtags: $('hashtags')?.textContent || ''
    };
  }

  function resetAutoOutput() {
    if ($('output')) $('output').textContent = 'Prompt will appear here.';
    ['scene1','scene2','scene3','cta','hashtags'].forEach(id => { if ($(id)) $(id).textContent = ''; });
  }

  function injectUI() {
    if ($('campaignUsageBar')) return;
    const card = $('build')?.closest('.card');
    if (!card) return;

    const style = document.createElement('style');
    style.textContent = `
      .campaign-usage{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 16px;padding:11px 13px;border:1px solid var(--line);border-radius:14px;background:#0f131b;color:var(--muted);font-size:12px}.campaign-usage strong{color:var(--text)}
      .slot-modal-backdrop{position:fixed;inset:0;z-index:999;background:rgba(5,7,11,.78);display:grid;place-items:center;padding:18px}.slot-modal{width:min(520px,100%);background:var(--panel);border:1px solid var(--line);border-radius:22px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.45)}.slot-modal h3{margin:0 0 10px;font-size:24px}.slot-modal p{color:var(--muted);line-height:1.55}.slot-modal .slot-count{padding:11px 13px;border:1px solid var(--line);border-radius:12px;background:#0f131b;margin:14px 0}.slot-modal-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}.slot-modal-actions button{min-width:140px}
    `;
    document.head.appendChild(style);

    const bar = document.createElement('div');
    bar.id = 'campaignUsageBar';
    bar.className = 'campaign-usage';
    bar.innerHTML = '<span><strong>Account campaign</strong> · revisions stay in the same campaign</span><span id="campaignUsageState">Checking…</span>';
    card.insertBefore(bar, card.children[1] || null);
  }

  function renderUsage() {
    const label = $('campaignUsageState');
    if (!label) return;
    const c = state.context;
    if (!c) { label.textContent = 'Unavailable'; return; }
    const plan = String(c.plan || 'starter');
    if (plan === 'starter') label.textContent = `${c.used || 0} of ${c.limit || 3} used this month`;
    else label.textContent = `${plan.charAt(0).toUpperCase() + plan.slice(1)} · unlimited campaigns`;
  }

  async function loadContext() {
    const sb = client();
    if (!sb) throw new Error('Sign in through AI UGC Studio before using Director.');
    const profileResult = await sb.rpc('ensure_my_profile');
    if (profileResult.error) throw profileResult.error;
    const { data, error } = await sb.rpc('my_campaign_context');
    if (error) throw error;
    state.context = data || { plan: 'starter', used: 0, limit: 3, latest_campaign: null };
    if (!state.currentCampaignId && state.context.latest_campaign) {
      state.currentCampaignId = state.context.latest_campaign.id;
      state.currentFingerprint = state.context.latest_campaign.product_fingerprint;
    }
    renderUsage();
    return state.context;
  }

  function modal({ title, body, usage, confirmLabel, confirmDisabled }) {
    return new Promise(resolve => {
      const backdrop = document.createElement('div');
      backdrop.className = 'slot-modal-backdrop';
      backdrop.innerHTML = `<div class="slot-modal" role="dialog" aria-modal="true"><h3>${title}</h3><p>${body}</p><div class="slot-count">${usage}</div><div class="slot-modal-actions"><button type="button" class="secondary" data-cancel>Keep Editing</button><button type="button" class="primary" data-confirm ${confirmDisabled ? 'disabled' : ''}>${confirmLabel}</button></div></div>`;
      document.body.appendChild(backdrop);
      const finish = value => { backdrop.remove(); resolve(value); };
      backdrop.querySelector('[data-cancel]').addEventListener('click', () => finish(false));
      backdrop.querySelector('[data-confirm]').addEventListener('click', () => finish(true));
    });
  }

  async function confirmNewCampaign(context) {
    if (context.plan !== 'starter') return true;
    const used = Number(context.used || 0), limit = Number(context.limit || 3);
    if (used >= limit) {
      await modal({
        title: 'Starter campaign limit reached',
        body: 'You can keep revising your existing campaigns, but starting another product campaign requires a new monthly slot or an upgrade.',
        usage: `<strong>Starter:</strong> ${used} of ${limit} campaigns used this month`,
        confirmLabel: 'No slots remaining',
        confirmDisabled: true
      });
      return false;
    }
    const remainingAfter = limit - used - 1;
    const finalNote = remainingAfter === 0 ? '<br><br>This will use your final Starter campaign for this month. You can still revise it afterward without using another slot.' : '';
    return modal({
      title: 'You are about to generate a new campaign',
      body: `You changed the product or key product details from your current campaign. If you proceed, this will consume one Starter campaign slot.${finalNote}`,
      usage: `<strong>Starter:</strong> ${used} of ${limit} campaigns used this month`,
      confirmLabel: 'Start New Campaign',
      confirmDisabled: false
    });
  }

  async function createCampaign(fingerprint, variables) {
    const sb = client();
    const { data, error } = await sb.rpc('create_campaign_if_allowed', {
      p_title: variables.product_name || 'Untitled campaign',
      p_product_name: variables.product_name || 'Untitled product',
      p_product_fingerprint: fingerprint,
      p_product_variables: variables
    });
    if (error) throw error;
    state.currentCampaignId = data.id;
    state.currentFingerprint = fingerprint;
    return data;
  }

  async function recordRevision(variables, output) {
    if (!state.currentCampaignId) return;
    const sb = client();
    const { error } = await sb.rpc('record_campaign_revision', {
      p_campaign_id: state.currentCampaignId,
      p_variables: variables,
      p_output: output
    });
    if (error) throw error;
  }

  async function runLocalBuild() {
    if (state.busy || state.bypass) return false;
    state.busy = true;
    try {
      const context = await loadContext();
      const fingerprint = await productFingerprint();
      const variables = productVariables();
      const existingFingerprint = state.currentFingerprint || context.latest_campaign?.product_fingerprint || null;
      const isNewCampaign = !state.currentCampaignId || !existingFingerprint || fingerprint !== existingFingerprint;

      if (isNewCampaign) {
        const approved = await confirmNewCampaign(context);
        if (!approved) return false;
      }

      state.bypass = true;
      try { global.build(); }
      finally { state.bypass = false; }

      if (isNewCampaign) await createCampaign(fingerprint, variables);
      await recordRevision(variables, campaignOutput());
      await loadContext();
      return true;
    } catch (error) {
      console.error('Campaign access control failed:', error);
      alert(error?.message || 'Could not verify your campaign allowance. No campaign slot was consumed.');
      return false;
    } finally {
      state.busy = false;
    }
  }

  function attachBuildGate() {
    const button = $('build');
    if (!button || button.dataset.campaignGate === '1') return;
    button.dataset.campaignGate = '1';
    button.addEventListener('click', event => {
      if (state.bypass) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      runLocalBuild();
    }, true);
  }

  function attachCopyGate() {
    const button = $('copy');
    if (!button || button.dataset.campaignGate === '1') return;
    button.dataset.campaignGate = '1';
    button.addEventListener('click', event => {
      if ($('output')?.textContent !== 'Prompt will appear here.') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      runLocalBuild();
    }, true);
    document.querySelectorAll('[data-target]').forEach(btn => {
      btn.addEventListener('click', event => {
        const target = $(btn.dataset.target);
        if (target && !target.textContent.trim()) {
          event.preventDefault();
          event.stopImmediatePropagation();
          alert('Build the campaign first.');
        }
      }, true);
    });
  }

  function boot() {
    resetAutoOutput();
    injectUI();
    attachBuildGate();
    attachCopyGate();
    loadContext().catch(error => {
      console.warn(error?.message || error);
      const label = $('campaignUsageState');
      if (label) label.textContent = 'Sign in required';
    });
  }

  boot();
})(window);
