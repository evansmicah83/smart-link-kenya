import { supabase } from '../supabase/client';

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: 'google' | 'apple' | 'microsoft', opts?: { redirect_uri?: string }) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider === 'microsoft' ? 'azure' : provider,
        options: { redirectTo: opts?.redirect_uri },
      });
      if (error) return { error, redirected: false };
      return { error: null, redirected: true };
    },
  },
};
