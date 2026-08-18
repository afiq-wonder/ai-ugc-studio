(function (global) {
  'use strict';

  let provider = null;

  function assertProvider(candidate) {
    if (!candidate || typeof candidate !== 'object') {
      throw new TypeError('AI provider must be an object.');
    }

    const supported = ['generateText', 'analyzeImages', 'analyzeDiscovery', 'generateCampaign'];
    if (!supported.some(method => typeof candidate[method] === 'function')) {
      throw new TypeError('AI provider must implement generateText(), analyzeImages(), analyzeDiscovery(), or generateCampaign().');
    }
  }

  const adapter = {
    version: '0.4.0',

    registerProvider(candidate) {
      assertProvider(candidate);
      provider = candidate;
      return this.getProviderInfo();
    },

    clearProvider() {
      provider = null;
    },

    hasProvider() {
      return Boolean(provider);
    },

    getProviderInfo() {
      if (!provider) return { configured: false, name: null, model: null };
      return {
        configured: true,
        name: provider.name || 'custom',
        model: provider.model || null
      };
    },

    async generateText(request) {
      if (!provider || typeof provider.generateText !== 'function') return null;
      return provider.generateText(request);
    },

    async analyzeImages(request) {
      if (!provider || typeof provider.analyzeImages !== 'function') return null;
      return provider.analyzeImages(request);
    },

    async analyzeDiscovery(request) {
      if (!provider || typeof provider.analyzeDiscovery !== 'function') return null;
      return provider.analyzeDiscovery(request);
    },

    async enhanceCampaign(context) {
      if (!provider || typeof provider.generateCampaign !== 'function') return null;
      return provider.generateCampaign(context);
    }
  };

  Object.freeze(adapter);
  global.AIProviderAdapter = adapter;

  function loadScript(src, onload) {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = onload || null;
    script.onerror = () => console.warn(`${src} unavailable; local mode remains active.`);
    document.head.appendChild(script);
  }

  // Provider modules remain independent so the core product keeps working
  // when a provider is missing, disabled, out of quota, or temporarily down.
  loadScript('./gemini-provider.js', function () {
    loadScript('./ai-intelligence-integration.js');
  });
})(window);
