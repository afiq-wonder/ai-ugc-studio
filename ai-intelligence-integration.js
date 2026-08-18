(function (global) {
  'use strict';

  const POLL_MS = 80;
  const MAX_POLLS = 100;

  function ready() {
    return global.AIProviderAdapter && global.GeminiProvider && document.body;
  }

  function findCampaignCard() {
    const productName = document.getElementById('productName');
    return productName ? productName.closest('.card') : null;
  }

  function installMarketInput() {
    if (document.getElementById('market')) return;
    const platform = document.getElementById('platform');
    if (!platform) return;
    const grid = platform.closest('.form-grid');
    if (!grid) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = '<label>Market</label><input id="market" type="text" value="Malaysia" placeholder="Example: Malaysia" />';
    grid.appendChild(wrap);

    if (typeof global.getData === 'function' && !global.getData.__wonderlabsMarketPatched) {
      const originalGetData = global.getData;
      const patched = function () {
        const data = originalGetData();
        return { ...data, market: document.getElementById('market')?.value.trim() || 'Malaysia' };
      };
      patched.__wonderlabsMarketPatched = true;
      global.getData = patched;
    }
  }

  function installPanel() {
    if (document.getElementById('wonderlabsIntelligencePanel')) return;
    const campaignCard = findCampaignCard();
    if (!campaignCard) return;

    const panel = document.createElement('section');
    panel.id = 'wonderlabsIntelligencePanel';
    panel.className = 'card';
    panel.style.marginTop = '18px';
    panel.innerHTML = `
      <h3>Enhanced Intelligence <span style="font-size:11px;color:var(--good);font-weight:700">VALIDATED</span></h3>
      <div class="sub">Perception → Evidence → Discovery → Creative. Local campaign generation remains available automatically if the AI provider is unavailable.</div>
      <div class="form-grid">
        <div>
          <label>Gemini API key — session only</label>
          <input id="productGeminiKey" type="password" autocomplete="off" placeholder="Test key only" />
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
        Test integration only. The key stays in this tab's memory and is never saved. Production will move provider credentials behind the WonderLabs backend boundary.
      </div>
      <div class="actions" style="position:static;background:none;border:0;padding:0;margin-top:14px">
        <button class="secondary" id="enableProductIntelligence" type="button">Enable Enhanced Intelligence</button>
        <button class="ghost" id="disableProductIntelligence" type="button">Use Local Mode</button>
        <span id="productIntelligenceStatus" style="align-self:center;color:var(--muted);font-size:12px">Local mode</span>
      </div>`;

    campaignCard.insertAdjacentElement('afterend', panel);

    const key = document.getElementById('productGeminiKey');
    const model = document.getElementById('productGeminiModel');
    const status = document.getElementById('productIntelligenceStatus');

    document.getElementById('enableProductIntelligence').addEventListener('click', function () {
      const apiKey = key.value.trim();
      if (!apiKey) {
        status.textContent = 'Paste a test key first';
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
        status.textContent = `Enhanced · ${model.value}`;
      } catch (error) {
        status.textContent = error?.message || 'Could not enable provider';
      }
    });

    document.getElementById('disableProductIntelligence').addEventListener('click', function () {
      global.AIProviderAdapter.clearProvider();
      key.value = '';
      status.textContent = 'Local mode';
    });
  }

  function install() {
    installMarketInput();
    installPanel();
  }

  let polls = 0;
  const timer = setInterval(function () {
    polls += 1;
    if (ready()) {
      clearInterval(timer);
      install();
    } else if (polls >= MAX_POLLS) {
      clearInterval(timer);
      console.warn('Enhanced intelligence integration unavailable; local mode remains active.');
    }
  }, POLL_MS);
})(window);
