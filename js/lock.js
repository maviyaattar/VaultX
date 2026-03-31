/* ============================================================
   lock.js – PIN lock screen logic
   ============================================================ */

const LockScreen = (() => {
  let currentPin    = '';
  let inactivityTimer = null;
  let onUnlockCallback = null;
  let overlayId    = 'lock-screen';
  let dotsId       = 'pin-dots';
  let padId        = 'pin-pad';
  let errorId      = 'pin-error';
  let isPinChangeMode = false;
  let pinChangeStep   = 0;
  let newPinBuffer    = '';

  function getStoredPin() {
    return localStorage.getItem('vaultx_pin') || DEFAULT_PIN;
  }

  function setStoredPin(pin) {
    localStorage.setItem('vaultx_pin', pin);
  }

  function getOverlay()  { return document.getElementById(overlayId); }
  function getDots()     { return document.getElementById(dotsId); }
  function getPad()      { return document.getElementById(padId); }
  function getError()    { return document.getElementById(errorId); }

  function renderDots(filled, total = 4) {
    const wrap = getDots();
    if (!wrap) return;
    wrap.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('div');
      dot.className = 'pin-dot' + (i < filled ? ' filled' : '');
      wrap.appendChild(dot);
    }
  }

  function showError(msg) {
    const el = getError();
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    const dots = getDots();
    if (dots) {
      dots.classList.add('shake');
      dots.addEventListener('animationend', () => dots.classList.remove('shake'), { once: true });
    }
    setTimeout(() => { el.classList.remove('show'); }, 2000);
  }

  function clearInput() {
    currentPin = '';
    renderDots(0);
  }

  function handleDigit(d) {
    if (currentPin.length >= 4) return;
    currentPin += d;
    renderDots(currentPin.length);
    if (currentPin.length === 4) {
      setTimeout(() => checkPin(), 120);
    }
  }

  function handleDelete() {
    if (!currentPin.length) return;
    currentPin = currentPin.slice(0, -1);
    renderDots(currentPin.length);
  }

  function checkPin() {
    if (isPinChangeMode) {
      handlePinChange();
      return;
    }
    if (currentPin === getStoredPin()) {
      unlock();
    } else {
      showError('Incorrect PIN. Try again.');
      clearInput();
    }
  }

  function handlePinChange() {
    if (pinChangeStep === 0) {
      if (currentPin !== getStoredPin()) {
        showError('Incorrect current PIN.');
        clearInput();
        return;
      }
      pinChangeStep = 1;
      clearInput();
      updateLockTitle('Enter New PIN');
      updateLockSubtitle('Choose a 4-digit PIN');
    } else if (pinChangeStep === 1) {
      newPinBuffer = currentPin;
      pinChangeStep = 2;
      clearInput();
      updateLockTitle('Confirm New PIN');
      updateLockSubtitle('Re-enter the new PIN');
    } else if (pinChangeStep === 2) {
      if (currentPin !== newPinBuffer) {
        showError('PINs do not match. Start over.');
        pinChangeStep = 0;
        newPinBuffer  = '';
        clearInput();
        updateLockTitle('Enter Current PIN');
        updateLockSubtitle('Verify your identity');
        return;
      }
      setStoredPin(currentPin);
      isPinChangeMode = false;
      pinChangeStep   = 0;
      newPinBuffer    = '';
      unlock();
      showToast('PIN changed successfully!', 'success');
    }
  }

  function updateLockTitle(t)    { const el = document.querySelector('#lock-screen .lock-title');    if (el) el.textContent = t; }
  function updateLockSubtitle(s) { const el = document.querySelector('#lock-screen .lock-subtitle'); if (el) el.textContent = s; }

  function unlock() {
    const overlay = getOverlay();
    if (!overlay) return;
    overlay.classList.add('hidden');
    setTimeout(() => { overlay.style.display = 'none'; }, 420);
    resetInactivityTimer();
    if (typeof onUnlockCallback === 'function') onUnlockCallback();
  }

  function lock() {
    const overlay = getOverlay();
    if (!overlay) return;
    overlay.style.display = '';
    requestAnimationFrame(() => overlay.classList.remove('hidden'));
    clearInput();
    clearInactivityTimer();
  }

  function resetInactivityTimer() {
    clearInactivityTimer();
    inactivityTimer = setTimeout(() => lock(), INACTIVITY_TIMEOUT);
  }

  function clearInactivityTimer() {
    if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
  }

  function setupActivityListeners() {
    const events = ['touchstart', 'touchmove', 'click', 'keydown', 'scroll'];
    events.forEach(e => document.addEventListener(e, resetInactivityTimer, { passive: true }));
  }

  function setupPad(padEl) {
    if (!padEl) return;
    padEl.addEventListener('click', e => {
      const btn = e.target.closest('.pin-btn');
      if (!btn) return;
      const val = btn.dataset.val;
      if (val === 'del') { handleDelete(); return; }
      if (val === 'ok')  { if (currentPin.length > 0) checkPin(); return; }
      if (val !== undefined) handleDigit(val);
    });
  }

  function init(unlockCb) {
    onUnlockCallback = unlockCb;
    renderDots(0);
    setupPad(getPad());
    setupActivityListeners();
  }

  function startPinChange() {
    isPinChangeMode = true;
    pinChangeStep   = 0;
    newPinBuffer    = '';
    clearInput();
    updateLockTitle('Enter Current PIN');
    updateLockSubtitle('Verify your identity');
    lock();
  }

  return { init, lock, unlock, startPinChange, resetInactivityTimer };
})();

/* ── Secret Vault PIN ───────────────────────────────────────── */
const SecretLock = (() => {
  let currentPin = '';
  let onUnlock   = null;

  function getStoredPin() {
    return localStorage.getItem('vaultx_secret_pin') || DEFAULT_PIN;
  }

  function setStoredPin(pin) {
    localStorage.setItem('vaultx_secret_pin', pin);
  }

  function renderDots(n) {
    const wrap = document.getElementById('secret-pin-dots');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const d = document.createElement('div');
      d.className = 'pin-dot secret-pin-dot' + (i < n ? ' filled' : '');
      wrap.appendChild(d);
    }
  }

  function showError(msg) {
    const el = document.getElementById('secret-pin-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    const dots = document.getElementById('secret-pin-dots');
    if (dots) { dots.classList.add('shake'); dots.addEventListener('animationend', () => dots.classList.remove('shake'), { once: true }); }
    setTimeout(() => el.classList.remove('show'), 2000);
  }

  function handleDigit(d) {
    if (currentPin.length >= 4) return;
    currentPin += d;
    renderDots(currentPin.length);
    if (currentPin.length === 4) setTimeout(() => checkPin(), 120);
  }

  function handleDelete() {
    if (!currentPin.length) return;
    currentPin = currentPin.slice(0, -1);
    renderDots(currentPin.length);
  }

  function checkPin() {
    if (currentPin === getStoredPin()) {
      document.getElementById('secret-lock-screen').classList.add('hidden');
      currentPin = '';
      renderDots(0);
      if (typeof onUnlock === 'function') onUnlock();
    } else {
      showError('Wrong PIN. Try again.');
      currentPin = '';
      renderDots(0);
    }
  }

  function show(cb) {
    onUnlock = cb;
    currentPin = '';
    renderDots(0);
    const ls = document.getElementById('secret-lock-screen');
    if (ls) { ls.style.display = ''; requestAnimationFrame(() => ls.classList.remove('hidden')); }
  }

  function setupPad(padEl) {
    if (!padEl) return;
    padEl.addEventListener('click', e => {
      const btn = e.target.closest('.pin-btn');
      if (!btn) return;
      const val = btn.dataset.val;
      if (val === 'del') { handleDelete(); return; }
      if (val === 'ok')  { if (currentPin.length > 0) checkPin(); return; }
      if (val !== undefined) handleDigit(val);
    });
  }

  function init() {
    setupPad(document.getElementById('secret-pin-pad'));
  }

  return { init, show, getStoredPin, setStoredPin };
})();
