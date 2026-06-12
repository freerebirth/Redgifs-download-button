document.addEventListener('DOMContentLoaded', () => {
    // ── Ad-skip toggle ──────────────────────────────────────────────
    const skipToggle = document.getElementById('auto-skip-toggle');

    chrome.storage.local.get(['autoSkipAds'], (result) => {
        skipToggle.checked = result.autoSkipAds || false;
    });

    skipToggle.addEventListener('change', (e) => {
        chrome.storage.local.set({ autoSkipAds: e.target.checked });
    });

    // ── Download Location ───────────────────────────────────────────
    const radioNone    = document.getElementById('folder-mode-none');
    const radioSub     = document.getElementById('folder-mode-sub');
    const inputRow     = document.getElementById('folder-input-row');
    const folderInput  = document.getElementById('folder-name-input');
    const folderHint   = document.getElementById('folder-hint');

    function updateHint(folderName) {
        if (radioSub.checked && folderName) {
            folderHint.textContent = 'Saves to: Downloads/' + folderName.trim().replace(/\/+$/, '') + '/';
        } else if (radioNone.checked) {
            folderHint.textContent = 'Saves directly to: Downloads/';
        } else {
            folderHint.textContent = '';
        }
    }

    function applySubfolderMode(folderName) {
        inputRow.classList.add('visible');
        folderInput.value = folderName;
        updateHint(folderName);
    }

    function applyNoFolderMode() {
        inputRow.classList.remove('visible');
        updateHint('');
    }

    // Load saved state
    chrome.storage.local.get(['downloadFolder'], (result) => {
        // null/undefined = first install → default to subfolder "Redgifs"
        // "" = user explicitly chose no subfolder
        if (result.downloadFolder === '') {
            radioNone.checked = true;
            applyNoFolderMode();
        } else {
            const name = (result.downloadFolder || 'Redgifs/').replace(/\/$/, '');
            radioSub.checked = true;
            applySubfolderMode(name);
        }
    });

    // Radio: Downloads folder
    radioNone.addEventListener('change', () => {
        if (radioNone.checked) {
            applyNoFolderMode();
            chrome.storage.local.set({ downloadFolder: '' });
        }
    });

    // Radio: Subfolder
    radioSub.addEventListener('change', () => {
        if (radioSub.checked) {
            const name = folderInput.value.trim() || 'Redgifs';
            folderInput.value = name;
            applySubfolderMode(name);
            chrome.storage.local.set({ downloadFolder: name + '/' });
        }
    });

    // Debounced folder name input
    let debounceTimer = null;
    folderInput.addEventListener('input', () => {
        updateHint(folderInput.value);
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const name = folderInput.value.trim();
            if (name) {
                chrome.storage.local.set({ downloadFolder: name + '/' });
            }
        }, 600);
    });
});
