(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);

  function client() {
    try { return global.parent.AIUGCSupabase || null; }
    catch (_) { return null; }
  }

  function setField(id, value) {
    const el = $(id);
    if (el && value !== undefined && value !== null) el.value = value;
  }

  function applyState(payload) {
    const campaign = payload && payload.campaign;
    const revision = payload && payload.revision;
    if (!campaign) return false;
    const variables = (revision && revision.variables) || campaign.product_variables || {};
    const output = (revision && revision.output) || {};

    setField('name', variables.product_name || campaign.product_name || '');
    setField('category', variables.category);
    setField('platform', variables.platform);
    setField('language', variables.language);
    setField('style', variables.style);
    setField('camera', variables.camera);
    setField('location', variables.location);
    setField('action', variables.action);

    if ($('output')) $('output').textContent = output.prompt || 'Prompt will appear here.';
    if ($('scene1')) $('scene1').textContent = output.scene1 || '';
    if ($('scene2')) $('scene2').textContent = output.scene2 || '';
    if ($('scene3')) $('scene3').textContent = output.scene3 || '';
    if ($('cta')) $('cta').textContent = output.cta || '';
    if ($('hashtags')) $('hashtags').textContent = output.hashtags || '';
    const note = $('campaignRestoreState');
    if (note) note.textContent = `Opened from library: ${campaign.title || campaign.product_name || 'campaign'}`;
    return true;
  }

  async function openCampaign(id) {
    const sb = client();
    if (!sb || !id) return false;
    const { data, error } = await sb.rpc('campaign_state_by_id', { p_campaign_id: id });
    if (error) throw error;
    return applyState(data);
  }

  global.addEventListener('message', async event => {
    if (event.source !== global.parent || !event.data || event.data.type !== 'aiugc:open-campaign') return;
    try { await openCampaign(event.data.campaignId); }
    catch (error) { console.error('Could not open campaign from library:', error); }
  });

  global.AIUGCCampaignLibraryBridge = { openCampaign };
})(window);
