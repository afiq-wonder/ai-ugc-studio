(function (global) {
  'use strict';

  let provider = null;

  function assertProvider(candidate) {
    if (!candidate || typeof candidate !== 'object') {
      throw new TypeError('AI provider must be an object.');
    }

    const supported = ['generateText', 'analyzeImages', 'generateCampaign'];
    if (!supported.some(method => typeof candidate[method] === 'function')) {
      throw new TypeError('AI provider must implement generateText(), analyzeImages(), or generateCampaign().');
    }
  }

  const adapter = {
    version: '0.1.0',

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

    async enhanceCampaign(context) {
      if (!provider || typeof provider.generateCampaign !== 'function') return null;
      return provider.generateCampaign(context);
    }
  };

  Object.freeze(adapter);
  global.AIProviderAdapter = adapter;
})(window);
