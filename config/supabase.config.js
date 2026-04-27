const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('⚠️ Supabase credentials not configured. Backup sync disabled.');
}

let supabaseClient = null;

/**
 * Initialize Supabase connection
 */
async function initSupabase() {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('⚠️ Cannot initialize Supabase: Missing credentials');
    return null;
  }

  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
        detectSessionInUrl: false,
      },
      db: {
        schema: 'public'
      }
    });

    // Test connection
    const { error } = await supabaseClient
      .from('_health_check')
      .select('count()', { count: 'exact', head: true })
      .catch(() => ({ error: null })); // Ignore if table doesn't exist

    if (!error) {
      console.log('✅ Connected to Supabase');
    }

    return supabaseClient;
  } catch (error) {
    console.error('❌ Error initializing Supabase:', error.message);
    return null;
  }
}

/**
 * Get Supabase client (lazy init)
 */
async function getSupabaseClient() {
  if (!supabaseClient) {
    await initSupabase();
  }
  return supabaseClient;
}

module.exports = {
  initSupabase,
  getSupabaseClient,
  SUPABASE_URL,
  SUPABASE_KEY
};
