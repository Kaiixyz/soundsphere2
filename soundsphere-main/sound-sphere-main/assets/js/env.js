// env.js - placeholder for runtime environment values
// DO NOT commit real secrets into source control. In production, generate this file at deploy
// time from environment variables and do NOT store the service role key here.

// Example usage (uncomment and set at deploy-time):
// window.SUPABASE_ANON_KEY = 'your-actual-anon-key-here';

// For local development you can create a separate local file (e.g. env.local.js) and add it to .gitignore
// then set window.SUPABASE_ANON_KEY there.

// Leave undefined by default to force developers to explicitly provide the anon key at runtime.
window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || undefined;
