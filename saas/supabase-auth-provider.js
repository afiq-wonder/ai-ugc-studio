(function (global) {
  'use strict';

  const SUPABASE_URL = 'https://rbwmwpjokshisqbfkmqt.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_sCaAjdzQ3uEggJw7NV-wPg_pxXBHcXk';

  if (!global.supabase || typeof global.supabase.createClient !== 'function') {
    console.error('Supabase client library is unavailable.');
    return;
  }

  const client = global.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  const provider = {
    name: 'supabase',

    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session || null;
    },

    async signIn({ email, password }) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.session || null;
    },

    async signUp({ email, password }) {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      return { session: data.session || null, user: data.user || null };
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },

    onAuthStateChange(callback) {
      const { data } = client.auth.onAuthStateChange((_event, session) => callback(session || null));
      return function unsubscribe() {
        data && data.subscription && data.subscription.unsubscribe();
      };
    }
  };

  global.AIUGCAuthProvider = provider;
  global.AIUGCSupabase = client;
})(window);
