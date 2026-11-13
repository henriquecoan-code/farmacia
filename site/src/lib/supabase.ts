import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

// Cliente público (anon): RLS decide o que cada um pode ler/gravar.
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
