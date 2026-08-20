(function (global) {
  'use strict';

  if (global.top === global.self) return;

  const parentWindow = global.parent;
  const BUCKET = 'campaign-references';
  const pending = { creator: null, product: null };
  const objectUrls = { creator: null, product: null };
  let persisting = false;

  const $ = id => document.getElementById(id);

  function client() {
    try { return parentWindow.AIUGCSupabase || null; }
    catch (_) { return null; }
  }

  function extensionFor(file) {
    const fromName = String(file?.name || '').split('.').pop().toLowerCase();
    const clean = fromName.replace(/[^a-z0-9]/g, '');
    if (clean && clean.length <= 8) return clean;
    const type = String(file?.type || '');
    if (type === 'image/png') return 'png';
    if (type === 'image/webp') return 'webp';
    if (type === 'image/heic') return 'heic';
    return 'jpg';
  }

  function renderBlob(role, blob) {
    const box = $(role === 'creator' ? 'creatorBox' : 'productBox');
    if (!box || !blob) return;
    if (objectUrls[role]) URL.revokeObjectURL(objectUrls[role]);
    const url = URL.createObjectURL(blob);
    objectUrls[role] = url;
    const img = new Image();
    img.src = url;
    img.alt = role === 'creator' ? 'Saved creator reference' : 'Saved product reference';
    box.querySelectorAll('img').forEach(node => node.remove());
    box.appendChild(img);
  }

  async function latestState() {
    const sb = client();
    if (!sb) return null;
    const { data, error } = await sb.rpc('latest_campaign_state');
    if (error) throw error;
    return data || null;
  }

  async function downloadInto(role, path) {
    if (!path) return false;
    const sb = client();
    const { data, error } = await sb.storage.from(BUCKET).download(path);
    if (error) throw error;
    renderBlob(role, data);
    return true;
  }

  async function restoreReferences() {
    const payload = await latestState();
    const campaign = payload?.campaign;
    if (!campaign) return false;
    const tasks = [];
    if (campaign.creator_ref_path) tasks.push(downloadInto('creator', campaign.creator_ref_path));
    if (campaign.product_ref_path) tasks.push(downloadInto('product', campaign.product_ref_path));
    if (!tasks.length) return false;
    await Promise.all(tasks);
    const note = $('campaignRestoreState');
    if (note) note.textContent = `Restored with references: ${campaign.title || campaign.product_name || 'latest campaign'}`;
    return true;
  }

  async function uploadReference(role, file, campaignId) {
    const sb = client();
    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError) throw userError;
    const userId = userData?.user?.id;
    if (!userId) throw new Error('authentication_required');
    const path = `${userId}/${campaignId}/${role}.${extensionFor(file)}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
      cacheControl: '3600'
    });
    if (error) throw error;
    return path;
  }

  async function persistPendingReferences() {
    if (persisting || (!pending.creator && !pending.product)) return false;
    persisting = true;
    try {
      const sb = client();
      if (!sb) return false;
      const payload = await latestState();
      const campaign = payload?.campaign;
      if (!campaign?.id) return false;

      let creatorPath = null;
      let productPath = null;
      if (pending.creator) creatorPath = await uploadReference('creator', pending.creator, campaign.id);
      if (pending.product) productPath = await uploadReference('product', pending.product, campaign.id);

      const { error } = await sb.rpc('set_campaign_reference_paths', {
        p_campaign_id: campaign.id,
        p_creator_ref_path: creatorPath,
        p_product_ref_path: productPath
      });
      if (error) throw error;

      pending.creator = null;
      pending.product = null;
      const note = $('campaignRestoreState');
      if (note) note.textContent = `Saved with references: ${campaign.title || campaign.product_name || 'current campaign'}`;
      return true;
    } catch (error) {
      console.error('Reference persistence failed:', error);
      const note = $('campaignRestoreState');
      if (note) note.textContent = 'Campaign saved; reference image upload needs retry.';
      return false;
    } finally {
      persisting = false;
    }
  }

  function watchInputs() {
    const creator = $('creator');
    const product = $('product');
    if (creator) creator.addEventListener('change', () => { pending.creator = creator.files?.[0] || null; });
    if (product) product.addEventListener('change', () => { pending.product = product.files?.[0] || null; });
  }

  function watchSaveState() {
    const start = () => {
      const note = $('campaignRestoreState');
      if (!note) return false;
      let last = note.textContent;
      new MutationObserver(() => {
        const current = note.textContent;
        if (current !== last) {
          last = current;
          if (current.startsWith('Saved:')) persistPendingReferences();
        }
      }).observe(note, { childList: true, characterData: true, subtree: true });
      return true;
    };
    if (!start()) {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        if (start() || attempts >= 30) clearInterval(timer);
      }, 200);
    }
  }

  async function boot() {
    watchInputs();
    watchSaveState();
    let attempts = 0;
    const tryRestore = async () => {
      attempts += 1;
      try {
        if (client()) {
          await restoreReferences();
          return;
        }
      } catch (error) {
        console.warn('Saved reference restore unavailable:', error?.message || error);
      }
      if (attempts < 20) setTimeout(tryRestore, 250);
    };
    tryRestore();
  }

  boot();
})(window);
