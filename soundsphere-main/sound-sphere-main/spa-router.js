// ### Accept the currentUser object as a parameter ###
function initAccountPage(currentUser) {
    const accountForm = document.getElementById('accountForm');
    const emailInput = document.getElementById('email');
    const usernameInput = document.getElementById('username');
    const publicTracksList = document.getElementById('publicTracksList');
    const privateTracksList = document.getElementById('privateTracksList');
    
    const kebabIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>`;

    async function loadProfile() {
        emailInput.value = currentUser.email;
        const { data: profile } = await supabase.from('profiles').select('username').eq('id', currentUser.id).single();
        if (profile) usernameInput.value = profile.username || '';
    }

    async function loadUserMusic() {
        const { data: tracks, error } = await supabase.from('music').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
        if (error) { console.error('Error fetching user music:', error); return; }
        
        const publicTracks = tracks.filter(track => track.privacy === 'public');
        const privateTracks = tracks.filter(track => track.privacy === 'private');

        renderTrackList(publicTracks, publicTracksList, '🎵');
        renderTrackList(privateTracks, privateTracksList, '🔒');
    }

    function renderTrackList(trackArray, listElement, icon) {
        listElement.innerHTML = '';
        if (trackArray.length > 0) {
            trackArray.forEach(track => {
                const li = document.createElement('li');
                li.className = 'track-item';
                li.innerHTML = `
                    <div class="track-info">
                        <span class="track-icon">${icon}</span>
                        <div>
                            <div class="track-title">${track.track_title}</div>
                            <div class="track-artist">${track.artist_name}</div>
                        </div>
                    </div>
                    <div class="track-actions">
                        <div class="track-stats">
                            <div class="play-count">${track.play_count.toLocaleString()}</div>
                            <div class="play-count-label">plays</div>
                        </div>
                        <button class="kebab-menu-button">${kebabIconSVG}</button>
                        <ul class="kebab-menu">
                            <li><button class="kebab-menu-item" data-action="edit-track" data-track-id="${track.id}"><span>✏️</span> Edit Details</button></li>
                            <li><button class="kebab-menu-item" data-action="toggle-privacy" data-track-id="${track.id}"><span>🔄</span> Make ${track.privacy === 'public' ? 'Private' : 'Public'}</button></li>
                            <li><button class="kebab-menu-item danger-action" data-action="delete-track" data-track-id="${track.id}"><span>🗑️</span> Delete Track</button></li>
                        </ul>
                    </div>
                `;
                listElement.appendChild(li);
            });
        } else {
            listElement.innerHTML = `<li class="no-tracks-message">You have no ${icon === '🎵' ? 'public' : 'private'} tracks.</li>`;
        }
    }
    
    accountForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('profiles').update({ username: usernameInput.value.trim() }).eq('id', currentUser.id);
        if (error) { alert('Error: ' + error.message); } 
        else { 
            await supabase.auth.updateUser({ data: { username: usernameInput.value.trim() } });
            alert('Profile updated!'); 
        }
    });

    loadProfile();
    loadUserMusic();
}

function initSettingsPage() {
    const passwordForm = document.getElementById('passwordForm');
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');

    passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPass = document.getElementById('newPassword').value;
        const confirmPass = document.getElementById('confirmPassword').value;
        try {
            if (typeof window.updatePasswordWithConfirmation === 'function') {
                // Prefer the shared helper if present
                await window.updatePasswordWithConfirmation(newPass, confirmPass);
            } else {
                // Fallback: perform the same validation locally and call Supabase
                if (!newPass || !confirmPass) throw new Error('Both password fields are required');
                if (newPass !== confirmPass) throw new Error('Passwords do not match');
                if (newPass.length < 8) throw new Error('Password must be at least 8 characters');
                const { error } = await supabase.auth.updateUser({ password: newPass });
                if (error) throw error;
            }
            alert('Password updated successfully!');
            passwordForm.reset();
        } catch (err) {
            console.error('Password update error', err);
            alert('Error updating password: ' + (err.message || err));
        }
    });

    deleteAccountBtn.addEventListener('click', async () => {
        alert("Account deletion is a highly sensitive operation and has been disabled in this demo. A real implementation would call a secure Edge Function.");
    });
}

// ### Accept the currentUser object as a parameter ###
function initUploadPage(currentUser) {
    const uploadForm = document.getElementById('uploadForm');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const progressFill = document.getElementById('progressFill');
    const progressBar = document.getElementById('progressBar');
    const uploadBox = document.getElementById('uploadBox');
    const genreSelect = document.getElementById('genre');
    const otherGenreGroup = document.getElementById('otherGenreGroup');
    const otherGenreInput = document.getElementById('otherGenre');
    const coverArtInput = document.getElementById('coverArt');
    const coverArtPreview = document.getElementById('coverArtPreview');

    // --- HELPER FUNCTION TO RESET THE FORM AFTER UPLOAD ---
    function resetUploadForm() {
        uploadForm.reset(); // This clears all standard form fields.
        fileInfo.textContent = 'No file selected'; // Reset custom file info display.
        
        // Reset the cover art preview image and show the placeholder icon again.
        coverArtPreview.style.backgroundImage = 'none';
        const placeholder = coverArtPreview.querySelector('.preview-placeholder');
        if (placeholder) {
            placeholder.style.display = 'flex';
        }

        // Hide the "Other Genre" input field if it was visible.
        otherGenreGroup.style.display = 'none';
    }

    function sanitizeFilename(filename) {
        return filename.replace(/['’()]/g, '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '').replace(/__+/g, '_');
    }

    uploadBox.addEventListener('dragover', (e) => { e.preventDefault(); uploadBox.classList.add('dragover'); });
    uploadBox.addEventListener('dragleave', () => { uploadBox.classList.remove('dragover'); });
    uploadBox.addEventListener('drop', (e) => { e.preventDefault(); uploadBox.classList.remove('dragover'); if (e.dataTransfer.files.length > 0) { fileInput.files = e.dataTransfer.files; handleFileSelect(); } });
    fileInput.addEventListener('change', handleFileSelect);
    function handleFileSelect() { const file = fileInput.files[0]; if (file) { fileInfo.textContent = file.name; } }
    coverArtInput.addEventListener('change', () => {
        const file = coverArtInput.files[0];
        if (file) { const reader = new FileReader(); reader.onload = (e) => { coverArtPreview.style.backgroundImage = `url('${e.target.result}')`; const placeholder = coverArtPreview.querySelector('.preview-placeholder'); if (placeholder) placeholder.style.display = 'none'; }; reader.readAsDataURL(file); }
    });
    genreSelect.addEventListener('change', () => { if (genreSelect.value === 'Other') { otherGenreGroup.style.display = 'block'; otherGenreInput.required = true; } else { otherGenreGroup.style.display = 'none'; otherGenreInput.required = false; } });

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) { alert('Authentication Error. Please refresh and log in again.'); return; }
        
        
    
        const audioFile = fileInput.files[0];
        if (!audioFile) { alert('Please select an audio file.'); return; }
        
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';
        progressBar.style.display = 'block';
    
        try {
            let finalGenre = genreSelect.value;
            if (finalGenre === 'Other') finalGenre = otherGenreInput.value.trim();
            if (!finalGenre) throw new Error("Genre is required.");
    
            const privacy = document.getElementById('privacy').value;
            const targetBucket = privacy === 'public' ? 'music-files' : 'private-music';
    
            const timestamp = Date.now();
            let coverArtPath = null;
            const coverArtFile = coverArtInput.files[0];
            if (coverArtFile) {
                const cleanCoverName = sanitizeFilename(coverArtFile.name);
                const coverArtFileName = `${currentUser.id}/${timestamp}_${cleanCoverName}`; 
                const { data, error } = await supabase.storage.from('cover-art').upload(coverArtFileName, coverArtFile);
                if (error) throw error;
                coverArtPath = data.path;
            }
            progressFill.style.width = '30%';
    
            const cleanAudioName = sanitizeFilename(audioFile.name);
            const audioFileName = `${currentUser.id}/${timestamp}_${cleanAudioName}`; 
            
            const { data: audioData, error: audioError } = await supabase.storage
                .from(targetBucket)
                .upload(audioFileName, audioFile);
            if (audioError) throw audioError;
            
            progressFill.style.width = '70%';
    
            const { error: insertError } = await supabase.from('music').insert([{ 
                user_id: currentUser.id, 
                track_title: document.getElementById('trackTitle').value, 
                artist_name: document.getElementById('artistName').value, 
                genre: finalGenre, 
                album: document.getElementById('album').value, 
                privacy: privacy, 
                file_path: audioData.path, 
                cover_art_path: coverArtPath,
                storage_bucket: targetBucket 
            }]);
            
            if (insertError) throw insertError;
            
            progressFill.style.width = '100%';
            alert('Track uploaded successfully!');

            
            resetUploadForm(); 
            
        } catch (error) {
            alert('Upload failed: ' + error.message);
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Save and Upload';
            progressBar.style.display = 'none';
            progressFill.style.width = '0%';
        }
    });
}