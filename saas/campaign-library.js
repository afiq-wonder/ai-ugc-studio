(function (global) {
  'use strict';

  const list = document.getElementById('campaignLibraryList');
  const empty = document.getElementById('campaignLibraryEmpty');
  const refresh = document.getElementById('campaignLibraryRefresh');
  const frame = document.querySelector('#workspace iframe');

  if (!list || !frame) return;

  function formatDate(value) {
    try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch (_) { return value || ''; }
  }

  function styleLabel(vars) {
    const bits = [vars?.style, vars?.platform, vars?.language].filter(Boolean);
    return bits.join(' · ') || 'Saved campaign';
  }

  async function load() {
    const sb = global.AIUGCSupabase;
    if (!sb) return;
    list.innerHTML = '<div class="muted">Loading campaigns…</div>';
    if (empty) empty.classList.add('hidden');

    const { data, error } = await sb
      .from('campaigns')
      .select('id,title,product_name,product_variables,created_at,updated_at')
      .order('updated_at', { ascending: false });

    if (error) {
      list.innerHTML = `<div class="error">${error.message}</div>`;
      return;
    }

    if (!data || data.length === 0) {
      list.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }

    list.innerHTML = '';
    data.forEach(campaign => {
      const vars = campaign.product_variables || {};
      const item = document.createElement('article');
      item.className = 'campaign-library-item';
      item.innerHTML = `
        <div class="campaign-library-main">
          <strong>${campaign.title || campaign.product_name || 'Untitled campaign'}</strong>
          <div class="muted campaign-library-meta">${styleLabel(vars)}</div>
          <div class="muted campaign-library-meta">Updated ${formatDate(campaign.updated_at || campaign.created_at)}</div>
        </div>
        <button type="button" class="secondary campaign-library-open">Open / Continue</button>`;
      item.querySelector('button').addEventListener('click', () => {
        frame.contentWindow.postMessage({ type: 'aiugc:open-campaign', campaignId: campaign.id }, global.location.origin);
        frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      list.appendChild(item);
    });
  }

  if (refresh) refresh.addEventListener('click', load);
  global.addEventListener('aiugc:auth', event => {
    if (event.detail && event.detail.user) load();
    else list.innerHTML = '';
  });

  global.AIUGCCampaignLibrary = { load };
})(window);
