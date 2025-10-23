'use strict';

// CLIENT: extracted application logic
// IMPORTANT: do NOT hardcode secrets here. Either set window.SUPABASE_ANON_KEY at runtime
// or route privileged operations through the server proxy (see server/ example).

const SUPABASE_URL = 'https://tqttpbhspgqwniwaokqh.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'REPLACE_WITH_ANON_KEY_OR_USE_SERVER_PROXY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const accountForm = document.getElementById('accountForm');
const updateBtn = document.getElementById('updateBtn');
const emailInput = document.getElementById('email');
const usernameInput = document.getElementById('username');
const logoutBtn = document.getElementById('logoutBtn');
const publicTracksList = document.getElementById('publicTracksList');
const privateTracksList = document.getElementById('privateTracksList');
// MFA UI elements we'll inject
let mfaSectionEl = null;

let currentUser = null;

async function loadPageData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.replace('SignIn.html');
        return;
    }
    currentUser = user;
    await Promise.all([ loadProfile(), loadUserMusic() ]);
}

async function loadProfile() {
    emailInput.value = currentUser.email;
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', currentUser.id)
        .single();

    if (error) console.error('Error fetching profile:', error);
    else if (profile) usernameInput.value = profile.username || '';
}

async function loadUserMusic() {
    const { data: tracks, error } = await supabase
        .from('music')
        .select('track_title, artist_name, privacy')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching user music:', error);
        return;
    }

    const publicTracks = tracks.filter(t => t.privacy === 'public');
    const privateTracks = tracks.filter(t => t.privacy === 'private');

    publicTracksList.innerHTML = '';
    if (publicTracks.length) {
        publicTracks.forEach(track => {
            const li = document.createElement('li');
            li.className = 'track-item';
            li.innerHTML = `
                <div class="track-info">
                    <span class="track-icon">🎵</span>
                    <div>
                        <div class="track-title">${track.track_title}</div>
                        <div class="track-artist">${track.artist_name}</div>
                    </div>
                </div>
            `;
            publicTracksList.appendChild(li);
        });
    } else {
        publicTracksList.innerHTML = '<li class="no-tracks-message">You have not uploaded any public tracks.</li>';
    }

    privateTracksList.innerHTML = '';
    if (privateTracks.length) {
        privateTracks.forEach(track => {
            const li = document.createElement('li');
            li.className = 'track-item';
            li.innerHTML = `
                <div class="track-info">
                    <span class="track-icon">🔒</span>
                    <div>
                        <div class="track-title">${track.track_title}</div>
                        <div class="track-artist">${track.artist_name}</div>
                    </div>
                </div>
            `;
            privateTracksList.appendChild(li);
        });
    } else {
        privateTracksList.innerHTML = '<li class="no-tracks-message">You have not uploaded any private tracks.</li>';
    }
}

async function updateProfileServerProxy(newUsername) {
    // Example: proxy update to server-side endpoint which uses service role key.
    // Server must validate the Authorization Bearer <access_token> you forward.
    const session = await supabase.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) throw new Error('No access token');

    const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ username: newUsername })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(err || 'Server proxy error');
    }
    return res.json();
}

accountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    updateBtn.disabled = true;
    updateBtn.textContent = 'Updating...';
    const newUsername = usernameInput.value.trim();

    try {
        if (window.USE_SERVER_PROXY) {
            // Preferred: perform privileged writes via server proxy
            await updateProfileServerProxy(newUsername);
        } else {
            // Client update: requires anon key (less secure)
            const { error } = await supabase.from('profiles').update({ username: newUsername }).eq('id', currentUser.id);
            if (error) throw error;
            await supabase.auth.updateUser({ data: { username: newUsername } });
        }
        alert('Profile updated successfully!');
    } catch (err) {
        console.error(err);
        alert('Error updating profile: ' + (err.message || err));
    } finally {
        updateBtn.disabled = false;
        updateBtn.textContent = 'Update Profile';
    }
});

logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.replace('SignIn.html');
});

// Update password with retype/confirmation check
// This helper validates that `newPassword` and `confirmPassword` match and then
// calls Supabase to update the user's password. Errors are thrown for caller
// to handle (so UI can show messages consistently).
async function updatePasswordWithConfirmation(newPassword, confirmPassword) {
    if (!newPassword || !confirmPassword) throw new Error('Both password fields are required');
    if (newPassword.length < 8) throw new Error('Password must be at least 8 characters');
    if (newPassword !== confirmPassword) throw new Error('Passwords do not match');

    // Call Supabase to update the user's password. supabase.auth.updateUser will
    // validate the current session and perform the change.
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return true;
}

// Expose for other client code (SPA router) to use
window.updatePasswordWithConfirmation = updatePasswordWithConfirmation;

document.addEventListener('DOMContentLoaded', loadPageData);

// --- MFA: Enroll / Unenroll TOTP ---
async function ensureMfaUi() {
    if (mfaSectionEl) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
        <h2 class="section-header">Multi-factor authentication (MFA)</h2>
        <div id="mfaStatus">Checking MFA status...</div>
        <div id="mfaControls" style="margin-top:1rem"></div>
    `;
    const container = document.querySelector('.container');
    container.appendChild(card);
    mfaSectionEl = card;
    await refreshMfaStatus();
}

async function refreshMfaStatus() {
    const statusEl = document.getElementById('mfaStatus');
    const controlsEl = document.getElementById('mfaControls');
    controlsEl.innerHTML = '';
    try {
        // get AAL
        const aal = await supabase.auth.mfa.getAal();
        if (aal === 'aal2') {
            statusEl.textContent = 'MFA is enabled on this account (AAL2).';
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.textContent = 'Disable MFA (unenroll)';
            btn.addEventListener('click', async () => {
                if (!confirm('Are you sure you want to unenroll MFA?')) return;
                try {
                    // We need a factorId to unenroll - list user's factors via admin endpoints isn't available client-side
                    // Instead, call unenroll() with no args to unenroll current factor if SDK supports it.
                    const { data, error } = await supabase.auth.mfa.unenroll({});
                    if (error) throw error;
                    alert('MFA disabled');
                    await refreshMfaStatus();
                } catch (err) {
                    console.error('Unenroll error', err);
                    alert('Unable to unenroll: ' + (err.message || err));
                }
            });
            controlsEl.appendChild(btn);
        } else {
            statusEl.textContent = 'MFA is not enabled for this account.';
            const enableBtn = document.createElement('button');
            enableBtn.className = 'btn';
            enableBtn.textContent = 'Enable TOTP (Authenticator app)';
            enableBtn.addEventListener('click', enrollTotpFlow);
            controlsEl.appendChild(enableBtn);
        }
    } catch (err) {
        console.error('MFA status error', err);
        statusEl.textContent = 'Unable to determine MFA status.';
        const enableBtn = document.createElement('button');
        enableBtn.className = 'btn';
        enableBtn.textContent = 'Enable TOTP (Authenticator app)';
        enableBtn.addEventListener('click', enrollTotpFlow);
        controlsEl.appendChild(enableBtn);
    }
}

async function enrollTotpFlow() {
    try {
        // Start enrollment
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Primary device' });
        if (error) throw error;
        // data contains totp: { qr_code, secret, uri } and id
        const totp = data.totp;
        // show QR and secret and ask for code
        const modalHtml = `
            <div id="mfaEnrollModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;">
              <div style="background:#fff;padding:1rem;border-radius:12px;max-width:420px;width:92%;">
                <h3>Set up Authenticator</h3>
                <p>Scan the QR code with your authenticator app or enter the secret manually.</p>
                <div style="display:flex;gap:1rem;align-items:center;margin:0.5rem 0;">
                  <img src="${totp.qr_code}" alt="qr" style="width:120px;height:120px;border:1px solid #eee;border-radius:8px;" />
                  <div style="flex:1;">
                    <div style="word-break:break-all;background:#f8f9fa;padding:0.5rem;border-radius:8px;border:1px solid #eee">Secret: <strong id="mfaSecret">${totp.secret}</strong></div>
                    <div style="margin-top:0.5rem">After adding the account in your authenticator app, enter the 6-digit code below to verify.</div>
                    <input id="mfaEnrollCode" placeholder="123456" style="width:100%;padding:0.5rem;margin-top:0.5rem;border:1px solid #ddd;border-radius:6px;" />
                  </div>
                </div>
                <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:0.75rem;">
                  <button id="mfaEnrollCancel" style="padding:0.45rem 0.8rem;border-radius:8px;border:1px solid #ccc;background:#fff;">Cancel</button>
                  <button id="mfaEnrollVerify" class="btn" style="padding:0.45rem 0.8rem;">Verify</button>
                </div>
              </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.getElementById('mfaEnrollCancel').addEventListener('click', () => document.getElementById('mfaEnrollModal')?.remove());
        document.getElementById('mfaEnrollVerify').addEventListener('click', async () => {
            const code = document.getElementById('mfaEnrollCode').value.trim();
            if (!code) return alert('Enter the code from your authenticator');
            try {
                // verify using challengeAndVerify if supported
                const { data: verifyData, error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({ factorId: data.id, code });
                if (verifyErr) throw verifyErr;
                alert('MFA enrolled successfully');
                document.getElementById('mfaEnrollModal')?.remove();
                await refreshMfaStatus();
            } catch (err) {
                console.error('Verify enroll error', err);
                alert('Verification failed: ' + (err.message || err));
            }
        });
    } catch (err) {
        console.error('Enroll error', err);
        alert('Unable to start MFA enrollment: ' + (err.message || err));
    }
}

// Try to add MFA UI after profile loads
const origLoadProfile = loadProfile;
loadProfile = async function () {
    await origLoadProfile();
    ensureMfaUi().catch(console.error);
};