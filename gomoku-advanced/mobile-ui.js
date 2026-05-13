(function setupMobileGomokuUI() {
    'use strict';

    const openBtn = document.getElementById('settings-open-btn');
    const closeBtn = document.getElementById('settings-close-btn');
    const doneBtn = document.getElementById('settings-done-btn');
    const panel = document.getElementById('mobile-settings-panel');
    const backdrop = document.getElementById('mobile-settings-backdrop');

    if (!openBtn || !panel || !backdrop) {
        return;
    }

    function setSettingsOpen(isOpen) {
        panel.classList.toggle('is-open', isOpen);
        panel.setAttribute('aria-hidden', String(!isOpen));
        openBtn.setAttribute('aria-expanded', String(isOpen));
        backdrop.classList.toggle('hidden', !isOpen);
        document.body.classList.toggle('settings-open', isOpen);
    }

    openBtn.addEventListener('click', function() {
        setSettingsOpen(true);
    });

    [closeBtn, doneBtn, backdrop].forEach(function(element) {
        if (!element) return;
        element.addEventListener('click', function() {
            setSettingsOpen(false);
        });
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            setSettingsOpen(false);
        }
    });
})();
