(function (global) {
  'use strict';

  const POLL_MS = 80;
  const MAX_POLLS = 100;

  function ready() {
    return global.AIProviderAdapter && global.GeminiProvider && document.body;
  }

  function findCampaignCard() {
    const productName = document.getElementById('name');
    return productName ? productName.closest('.card') : null;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function localCampaignSnapshot() {
    return {
      identity: document.getElementById('output')?.textContent || '',
      productAccuracy: document.getElementById('output')?.textContent || '',
      scenes: ['scene1','scene2','scene3'].map((id, index) => ({
        title: `Scene ${index + 1}`,
        text: document.getElementById(id)?.textContent || ''
      })),
      cta: document.getElementById('cta')?.textContent || '',
      hashtags: document.getElementById('hashtags')?.textContent || ''
    };
  }

  async function buildEnhancedCampaign(status) {
    if (!global.AIProviderAdapter.hasProvider()) {
      status.textContent = 'Enable Enhanced first';
      return;
    }

    const creatorFile = document.getElementById('creator')?.files?.[0];
    const productFile = document.getElementById('product')?.files?.[0];
    if (!creatorFile || !productFile) {
      status.textContent = 'Upload creator + product first';
      return;
    }

    if (typeof global.build === 'function') global.build();

    const snapshot = {
      output: document.getElementById('output')?.textContent || '',
      scene1: document.getElementById('scene1')?.textContent || '',
      scene2: document.getElementById('scene2')?.textContent || '',
      scene3: document.getElementById('scene3')?.textContent || '',
      cta: document.getElementById('cta')?.textContent || '',
      hashtags: document.getElementById('hashtags')?.textContent || ''
    };

    status.textContent = 'Enhanced Intelligence working…';

    try {
      const [character, product] = await Promise.all([
        fileToDataUrl(creatorFile),
        fileToDataUrl(productFile)
      ]);

      const context = {
        input: {
          product: document.getElementById('name')?.value.trim() || 'the promoted product',
          platform: document.getElementById('platform')?.value || 'TikTok',
          market: 'Malaysia',
          language: document.getElementById('language')?.value || 'English',
          style: document.getElementById('style')?.value || 'Authentic UGC review',
          location: document.getElementById('location')?.value || 'Unspecified',
          scenes: 3,
          sellingPoints: document.getElementById('action')?.value.trim() || ''
        },
        references: { character, product },
        campaign: localCampaignSnapshot()
      };

      const enhanced = await global.AIProviderAdapter.enhanceCampaign(context);
      if (!enhanced) throw new Error('Enhanced provider returned no campaign.');

      const scenes = Array.isArray(enhanced.scenes) ? enhanced.scenes : [];
      const summary = [
        enhanced.identity ? `IDENTITY LOCK:\n${enhanced.identity}` : '',
        enhanced.productAccuracy ? `PRODUCT ACCURACY:\n${enhanced.productAccuracy}` : '',
        enhanced.hook ? `HOOK:\n${enhanced.hook}` : '',
        enhanced.caption ? `CAPTION:\n${enhanced.caption}` : ''
      ].filter(Boolean).join('\n\n');

      if (summary) document.getElementById('output').textContent = summary;
      if (scenes[0]?.text) document.getElementById('scene1').textContent = scenes[0].text;
      if (scenes[1]?.text) document.getElementById('scene2').textContent = scenes[1].text;
      if (scenes[2]?.text) document.getElementById('scene3').textContent = scenes[2].text;
      if (enhanced.cta) document.getElementById('cta').textContent = enhanced.cta;
      if (enhanced.hashtags) document.getElementById('hashtags').textContent = enhanced.hashtags;

      status.textContent = `Enhanced complete · ${global.AIProviderAdapter.getProviderInfo().model || 'Gemini'}`;
    } catch (error) {
      document.getElementById('output').textContent = snapshot.output;
      document.getElementById('scene1').textContent = snapshot.scene1;
      document.getElementById('scene2').textContent = snapshot.scene2;
      document.getElementById('scene3').textContent = snapshot.scene3;
      document.getElementById('cta').textContent = snapshot.cta;
      document.getElementById('hashtags').textContent = snapshot.hashtags;
      status.textContent = `Enhanced failed · local campaign preserved`;
      console.warn('Enhanced Intelligence failed; local output preserved.', error);
    }
  }

  function installPanel() {
    if (document.getElementById('wonderlabsIntelligencePanel')) return;
    const campaignCard = findCampaignCard();
    if (!campaignCard) return;

    const panel = document.createElement('section');
    panel.id = 'wonderlabsIntelligencePanel';
    panel.className = 'card';
    panel.style.marginTop = '16px';
    panel.innerHTML = `
      <h3>Enhanced — USE YOUR OWN API KEY <span style="font-size:11px;color:var(--good);font-weight:700">OPTIONAL</span></h3>
      <div class="sub">Director v1.3.3 Local Mode remains the default full engine. Enhanced Intelligence is an optional BYOK comparison path for users who want Gemini perception, evidence and discovery on top of the Director.</div>
      <div class="form">
        <div>
          <label>Gemini API key — session only</label>
          <input id="productGeminiKey" type="password" autocomplete="off" placeholder="Paste your own API key" />
        </div>
        <div>
          <label>Intelligence model</label>
          <select id="productGeminiModel">
            <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite</option>
            <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
          </select>
        </div>
      </div>
      <div style="margin-top:12px;color:var(--muted);font-size:12px;line-height:1.5">
        Your key is kept only in this browser tab's memory and is never saved by AI UGC Studio. Local Mode requires no API key.
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="secondary" id="enableProductIntelligence" type="button">Enable Enhanced Intelligence</button>
        <button class="secondary" id="buildEnhancedCampaign" type="button" disabled>Build Enhanced Campaign</button>
        <button class="secondary" id="disableProductIntelligence" type="button">Use Local Mode</button>
        <span id="productIntelligenceStatus" style="align-self:center;color:var(--muted);font-size:12px">Local Mode · Director v1.3.3</span>
      </div>`;

    campaignCard.insertAdjacentElement('afterend', panel);

    const key = document.getElementById('productGeminiKey');
    const model = document.getElementById('productGeminiModel');
    const status = document.getElementById('productIntelligenceStatus');
    const enhancedBuild = document.getElementById('buildEnhancedCampaign');

    document.getElementById('enableProductIntelligence').addEventListener('click', function () {
      const apiKey = key.value.trim();
      if (!apiKey) {
        status.textContent = 'Paste your API key first';
        return;
      }
      try {
        const provider = global.GeminiProvider.create({
          apiKey,
          model: model.value,
          mode: 'direct-test',
          useSearchGrounding: true
        });
        global.AIProviderAdapter.registerProvider(provider);
        key.value = '';
        enhancedBuild.disabled = false;
        status.textContent = `Enhanced ready · ${model.value}`;
      } catch (error) {
        status.textContent = error?.message || 'Could not enable Enhanced Intelligence';
      }
    });

    enhancedBuild.addEventListener('click', function () {
      buildEnhancedCampaign(status);
    });

    document.getElementById('disableProductIntelligence').addEventListener('click', function () {
      global.AIProviderAdapter.clearProvider();
      key.value = '';
      enhancedBuild.disabled = true;
      status.textContent = 'Local Mode · Director v1.3.3';
    });
  }

  let polls = 0;
  const timer = setInterval(function () {
    polls += 1;
    if (ready()) {
      clearInterval(timer);
      installPanel();
    } else if (polls >= MAX_POLLS) {
      clearInterval(timer);
      console.warn('Enhanced Intelligence unavailable; Director v1.3.3 Local Mode remains active.');
    }
  }, POLL_MS);
})(window);
