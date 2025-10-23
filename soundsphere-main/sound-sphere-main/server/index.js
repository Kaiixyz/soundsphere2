require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

// Admin client using service role key (server only)
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const app = express();

// SECURITY MIDDLEWARE
app.use(helmet({
  contentSecurityPolicy: false // recommend configuring CSP in the HTML for fine control
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // tweak for your traffic
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Restrict CORS to your frontends (set ALLOWED_ORIGINS in .env as comma separated list)
const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: allowed,
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Cookie options helper
const isProd = process.env.NODE_ENV === 'production';
function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: isProd,            // true in production (requires HTTPS)
    sameSite: 'Strict',
    maxAge: maxAgeMs,
    path: '/'
  };
}

/*
  Auth endpoints:
  - POST /auth/signin  { email, password }  -> sets HttpOnly cookies: access_token (short), refresh_token (long)
  - POST /auth/refresh                        -> uses refresh_token cookie to get new tokens from Supabase and reset cookies
  - POST /auth/signout                        -> clears cookies
*/

// Sign-in: exchange credentials for session (server-side)
app.post('/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).send('email and password required');

    // Use admin client to sign in (server-side)
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (error || !data?.session) {
      return res.status(401).send(error?.message || 'Authentication failed');
    }

    const session = data.session;
    // access_token short lived, refresh_token longer lived
    // set cookies (adjust expiry as you prefer)
    res.cookie('access_token', session.access_token, cookieOptions(15 * 60 * 1000)); // 15 minutes
    res.cookie('refresh_token', session.refresh_token, cookieOptions(30 * 24 * 60 * 60 * 1000)); // 30 days

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server error');
  }
});

// Refresh tokens: use refresh_token cookie and call Supabase token endpoint with service role key
app.post('/auth/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies['refresh_token'];
    if (!refreshToken) return res.status(401).send('No refresh token');

    // Call Supabase /auth/v1/token endpoint to exchange refresh token for new session
    const tokenUrl = `${SUPABASE_URL.replace(/\/$/,'')}/auth/v1/token`;
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);

    const r = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
      },
      body: params
    });

    if (!r.ok) {
      const txt = await r.text();
      console.error('Refresh failed', txt);
      // clear cookies when refresh fails
      res.clearCookie('access_token', { path: '/' });
      res.clearCookie('refresh_token', { path: '/' });
      return res.status(401).send('Refresh failed');
    }

    const newSession = await r.json();
    // newSession should contain access_token and refresh_token
    res.cookie('access_token', newSession.access_token, cookieOptions(15 * 60 * 1000));
    // rotate refresh token if returned; otherwise reuse existing one
    if (newSession.refresh_token) {
      res.cookie('refresh_token', newSession.refresh_token, cookieOptions(30 * 24 * 60 * 60 * 1000));
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server error');
  }
});

// Sign-out: clear cookies (you can also revoke refresh token server-side if desired)
app.post('/auth/signout', async (req, res) => {
  try {
    // Optionally revoke refresh token via Supabase API if you have it
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server error');
  }
});

// Handshake: client posts the user's session (after signing in with the anon key)
// This lets the client perform sign-in (so Supabase can enforce MFA), then hand
// the session tokens to the server to set HttpOnly cookies for later requests.


// Example protected endpoint that validates user's access token forwarded in Authorization header
app.post('/api/profile/update', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) return res.status(401).send('Missing bearer token');

    const userToken = match[1];
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(userToken);
    if (userError || !userData?.user) return res.status(401).send('Invalid token');
    const user = userData.user;

    const { username } = req.body || {};
    if (!username) return res.status(400).send('username required');

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ username })
      .eq('id', user.id);

    if (updateError) return res.status(500).send(updateError.message);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server error');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy server listening on ${PORT}`));