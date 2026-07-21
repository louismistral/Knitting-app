// Client Supabase du projet dédié "maille-organic" (isolé de l'app React principale).
// La clé publishable est sans danger à exposer : l'accès aux données est
// protégé par les règles RLS de Postgres (chaque utilisateur ne voit que ses lignes).
import { createClient } from './vendor/supabase.module.js';

const SUPABASE_URL = 'https://yvgefqeiawofngeatfci.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_sOKiFESHt3LZRLiI3rGOcg_Vlo_gh4N';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'pkce',
  },
});
