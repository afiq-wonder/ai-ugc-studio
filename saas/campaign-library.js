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

  function setFrameField(doc, id, value) {
    const el = doc.getElementById(id);
    if (el && value !== undefined && value !== null) el.value = value;
  }

  function ensureBetaDashboard() {
    let card = document.getElementById('betaTesterDashboard');
    if (card) return card;
    const library = document.getElementById('campaignLibrary');
    if (!library) return null;
    card = document.createElement('section');
    card.id = 'betaTesterDashboard';
    card.className = 'card library hidden';
    card.innerHTML = `
      <div class="library-head">
        <div>
          <h2>🐟 KakiUGC Beta Tester Dashboard</h2>
          <div class="muted">Full testing access. Help us make the launch build stronger.</div>
        </div>
        <span class="badge" id="betaTesterBadge">BETA TESTER</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
        <div class="campaign-library-item"><div class="campaign-library-main"><strong>Access</strong><div class="muted campaign-library-meta">Unlimited campaigns + revisions</div></div></div>
        <div class="campaign-library-item"><div class="campaign-library-main"><strong>Campaigns tested</strong><div class="muted campaign-library-meta" id="betaCampaignCount">0 campaigns</div></div></div>
        <div class="campaign-library-item"><div class="campaign-library-main"><strong>Beta window</strong><div class="muted campaign-library-meta" id="betaExpiry">Active</div></div></div>
      </div>
      <div class="access-note" style="margin-top:14px">Beta access does not consume a Founding 100 slot and does not count as a paid purchase. Test freely and share failures, confusing flows, and outputs that need improvement.</div>`;
    library.parentNode.insertBefore(card, library);
    return card;
  }

  async function applyBetaAccessUI(campaignCount) {
    if (!global.AIUGCBilling) return;
    try {
      const billing = await global.AIUGCBilling.getStatus();
      const card = ensureBetaDashboard();
      const active = billing?.plan === 'beta' && billing?.beta_active !== false;
      if (card) card.classList.toggle('hidden', !active);
      if (!active) return;

      const accessTitle = document.getElementById('accessTitle');
      const accessMeta = document.getElementById('accessMeta');
      const accessPrice = document.getElementById('accessPrice');
      const accessNote = document.getElementById('accessNote');
      const upgradeButton = document.getElementById('upgradeButton');
      const accessPanel = document.getElementById('accessPanel');
      if (accessPanel) accessPanel.classList.remove('hidden');
      if (accessTitle) accessTitle.textContent = 'Beta Tester';
      if (accessMeta) accessMeta.textContent = 'Unlimited testing access';
      if (accessPrice) accessPrice.textContent = 'BETA';
      if (accessNote) accessNote.textContent = 'No payment required · Does not use a Founding 100 slot.';
      if (upgradeButton) upgradeButton.classList.add('hidden');

      const count = document.getElementById('betaCampaignCount');
      if (count) count.textContent = `${campaignCount || 0} campaign${campaignCount === 1 ? '' : 's'}`;
      const expiry = document.getElementById('betaExpiry');
      if (expiry) expiry.textContent = billing.beta_expires_at ? `Until ${formatDate(billing.beta_expires_at)}` : 'Active until revoked';
    } catch (err) {
      console.warn('Could not render beta tester status:', err?.message || err);
    }
  }

  async function openCampaign(id) {
    const sb = global.AIUGCSupabase;
    if (!sb || !id) return;
    const { data, error } = await sb.rpc('campaign_state_by_id', { p_campaign_id: id });
    if (error) throw error;
    if (!data || !data.campaign) throw new Error('Campaign not found.');

    const doc = frame.contentDocument;
    if (!doc) throw new Error('Director is not ready yet.');
    const campaign = data.campaign;
    const revision = data.revision;
    const variables = (revision && revision.variables) || campaign.product_variables || {};
    const output = (revision && revision.output) || {};

    setFrameField(doc, 'name', variables.product_name || campaign.product_name || '');
    setFrameField(doc, 'category', variables.category);
    setFrameField(doc, 'platform', variables.platform);
    setFrameField(doc, 'language', variables.language);
    setFrameField(doc, 'style', variables.style);
    setFrameField(doc, 'camera', variables.camera);
    setFrameField(doc, 'location', variables.location);
    setFrameField(doc, 'action', variables.action);

    const text = (id, value) => { const el = doc.getElementById(id); if (el) el.textContent = value || ''; };
    text('output', output.prompt || 'Prompt will appear here.');
    text('scene1', output.scene1);
    text('scene2', output.scene2);
    text('scene3', output.scene3);
    text('cta', output.cta);
    text('hashtags', output.hashtags);
    text('campaignRestoreState', `Opened from library: ${campaign.title || campaign.product_name || 'campaign'}`);
    frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    await applyBetaAccessUI(data?.length || 0);

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
      item.querySelector('button').addEventListener('click', async () => {
        try { await openCampaign(campaign.id); }
        catch (err) { console.error(err); alert(err.message || 'Could not open campaign.'); }
      });
      list.appendChild(item);
    });
  }

  if (refresh) refresh.addEventListener('click', load);
  global.addEventListener('aiugc:auth', event => {
    if (event.detail && event.detail.user) load();
    else {
      list.innerHTML = '';
      const card = document.getElementById('betaTesterDashboard');
      if (card) card.classList.add('hidden');
    }
  });

  global.AIUGCCampaignLibrary = { load, openCampaign };
})(window);
