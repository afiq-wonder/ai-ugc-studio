(function (global) {
  'use strict';

  let provider = null;
  let listener = null;

  function assertProvider(candidate) {
    const required = ['getSession', 'signIn', 'signOut', 'onAuthStateChange'];
    if (!candidate || required.some(k => typeof candidate[k] !== 'function')) {
      throw new TypeError('Auth provider must implement getSession(), signIn(), signOut(), and onAuthStateChange().');
    }
  }

  const auth = {
    version: '0.1.1',
    registerProvider(candidate) {
      assertProvider(candidate);
      provider = candidate;
      if (listener) listener();
      listener = provider.onAuthStateChange(session => {
        global.dispatchEvent(new CustomEvent('aiugc:auth', { detail: session || null }));
      });
      return this.getProviderInfo();
    },
    hasProvider() { return Boolean(provider); },
    getProviderInfo() { return provider ? { configured: true, name: provider.name || 'custom' } : { configured: false, name: null }; },
    async getSession() { return provider ? provider.getSession() : null; },
    async signIn(credentials) {
      if (!provider) throw new Error('Authentication provider is not configured yet.');
      return provider.signIn(credentials);
    },
    async signUp(credentials) {
      if (!provider) throw new Error('Authentication provider is not configured yet.');
      if (typeof provider.signUp !== 'function') throw new Error('Sign-up is not supported by this authentication provider.');
      return provider.signUp(credentials);
    },
    async signOut() {
      if (!provider) return;
      return provider.signOut();
    }
  };

  Object.freeze(auth);
  global.AIUGCAuth = auth;

  if (global.AIUGCAuthProvider) {
    try { auth.registerProvider(global.AIUGCAuthProvider); }
    catch (error) { console.error('Auth provider registration failed:', error); }
  }
})(window);
