'use strict';

// home.js - client-side logic for the Home page
// Uses window.SUPABASE_ANON_KEY (set via assets/js/env.js or deploy-time generation)

const SUPABASE_URL = 'https://tqttpbhspgqwniwaokqh.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'REPLACE_WITH_ANON_KEY_OR_USE_SERVER_PROXY';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Exported functions that mirror inline behavior in Home.html
window.HomePage = window.HomePage || {};

window.HomePage.debounce = function (fn, wait) {
  let t;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
};

window.HomePage.initSearch = function (currentUserRef, allTracksRef, myMusicRef, discoverMusicRef, renderFn, handleSearchFn) {
  const input = document.getElementById('searchInput');
  if (!input) return;
  const debounced = window.HomePage.debounce(async (ev) => {
    const q = ev.target.value.trim();
    if (!q) { handleSearchFn({ target: { value: '' } }); return; }
    if (q.length >= 3) {
      try {
        const orFilter = `track_title.ilike.%${q}% ,artist_name.ilike.%${q}% ,genre.ilike.%${q}%`;
        const { data, error } = await supabase.from('music').select('*').or(orFilter).order('created_at', { ascending: false });
        if (error) throw error;
        const hits = data || [];
        const hitsMyMusic = hits.filter(t => t.user_id === currentUserRef.id);
        const hitsDiscover = hits.filter(t => t.privacy === 'public');
        renderFn(hitsMyMusic, hitsDiscover);
      } catch (err) {
        console.error('Search error:', err);
      }
    } else {
      // fallback to client-side filtering using originalTracks if available
      const source = window.originalTracks || [];
      const searchTerm = q.toLowerCase();
      const filterFn = track => (track.track_title || '').toLowerCase().includes(searchTerm)
        || (track.artist_name || '').toLowerCase().includes(searchTerm)
        || ((track.genre || '').toLowerCase().includes(searchTerm));
      const my = source.filter(t => t.user_id === currentUserRef.id).filter(filterFn);
      const disc = source.filter(t => t.privacy === 'public').filter(filterFn);
      renderFn(my, disc);
    }
  }, 300);
  input.addEventListener('input', debounced);
};
