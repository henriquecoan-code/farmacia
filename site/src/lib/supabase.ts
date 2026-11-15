import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

// Cliente público (chave publishable): o RLS do banco decide o que cada um pode ler/gravar.
// A sessão de login fica no localStorage do navegador (citado na Política de Privacidade).
export const supabase = url && anonKey
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  : null;
