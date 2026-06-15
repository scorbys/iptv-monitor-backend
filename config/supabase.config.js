const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('⚠️ Supabase credentials not configured. Optional mirror sync disabled.');
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

    // Test connection. Ignore missing health-check table; Supabase is an
    // optional mirror and should not block the primary MongoDB-backed app.
    let error = null;
    try {
      const result = await supabaseClient
        .from('_health_check')
        .select('count()', { count: 'exact', head: true });
      error = result.error;
    } catch (_) {
      error = null;
    }

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
