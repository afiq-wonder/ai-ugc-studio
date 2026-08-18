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
    version: '0.2.0',

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

  // Provider modules load independently so AI UGC Studio still works if a
  // provider script is missing, offline, or disabled. No provider is active
  // until explicitly registered.
  const geminiScript = document.createElement('script');
  geminiScript.src = './gemini-provider.js';
  geminiScript.async = true;
  geminiScript.onerror = () => console.warn('Gemini provider module unavailable; local mode remains active.');
  document.head.appendChild(geminiScript);
})(window);
