/* ============================================================
   lock.js – PIN lock screen logic (FINAL FIXED)
   ============================================================ */

const LockScreen = (() => {
  let currentPin = '';
  let inactivityTimer = null;
  let onUnlockCallback = null;
  
  let isPinChangeMode = false;
  let pinChangeStep = 0;
  let newPinBuffer = '';
  
  let lastTap = 0; // 🔥 double tap guard
  
  function getStoredPin() {
    return localStorage.getItem('vaultx_pin') || DEFAULT_PIN;
  }
  
  function setStoredPin(pin) {
    localStorage.setItem('vaultx_pin', pin);
  }
  
  function renderDots(filled, total = 4) {
    const wrap = document.getElementById('pin-dots');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('div');
      dot.className = 'pin-dot' + (i < filled ? ' filled' : '');
      wrap.appendChild(dot);
    }
  }
  
  function showError(msg) {
    const el = document.getElementById('pin-error');
    if (!el) return;
    
    el.textContent = msg;
    el.classList.add('show');
    
    const dots = document.getElementById('pin-dots');
    if (dots) {
      dots.classList.add('shake');
      dots.addEventListener('animationend', () => dots.classList.remove('shake'), { once: true });
    }
    
    setTimeout(() => el.classList.remove('show'), 2000);
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
      setTimeout(checkPin, 120);
    }
  }
  
  function handleDelete() {
    if (!currentPin.length) return;
    
    currentPin = currentPin.slice(0, -1);
    renderDots(currentPin.length);
  }
  
  function checkPin() {
    if (isPinChangeMode) return handlePinChange();
    
    if (currentPin === getStoredPin()) {
      unlock();
    } else {
      showError('Incorrect PIN');
      clearInput();
    }
  }
  
  function handlePinChange() {
    if (pinChangeStep === 0) {
      if (currentPin !== getStoredPin()) {
        showError('Wrong current PIN');
        clearInput();
        return;
      }
      
      pinChangeStep = 1;
      clearInput();
      updateText('Enter New PIN', 'Choose a 4-digit PIN');
      
    } else if (pinChangeStep === 1) {
      
      newPinBuffer = currentPin;
      pinChangeStep = 2;
      clearInput();
      updateText('Confirm PIN', 'Re-enter PIN');
      
    } else if (pinChangeStep === 2) {
      
      if (currentPin !== newPinBuffer) {
        showError('PIN mismatch');
        pinChangeStep = 0;
        newPinBuffer = '';
        clearInput();
        updateText('Enter Current PIN', 'Verify identity');
        return;
      }
      
      setStoredPin(currentPin);
      isPinChangeMode = false;
      pinChangeStep = 0;
      newPinBuffer = '';
      
      unlock();
      showToast('PIN changed', 'success');
    }
  }
  
  function updateText(title, subtitle) {
    const t = document.querySelector('.lock-title');
    const s = document.querySelector('.lock-subtitle');
    if (t) t.textContent = title;
    if (s) s.textContent = subtitle;
  }
  
  function unlock() {
    const el = document.getElementById('lock-screen');
    if (!el) return;
    
    el.classList.add('hidden');
    setTimeout(() => el.style.display = 'none', 400);
    
    resetTimer();
    
    if (onUnlockCallback) onUnlockCallback();
  }
  
  function lock() {
    const el = document.getElementById('lock-screen');
    if (!el) return;
    
    el.style.display = '';
    requestAnimationFrame(() => el.classList.remove('hidden'));
    
    clearInput();
    clearTimer();
  }
  
  function resetTimer() {
    clearTimer();
    inactivityTimer = setTimeout(lock, INACTIVITY_TIMEOUT);
  }
  
  function clearTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
  }
  
  function setupPad() {
    const pad = document.getElementById('pin-pad');
    if (!pad) return;
    
    pad.addEventListener('pointerdown', e => {
      
      // 🔥 anti double click
      const now = Date.now();
      if (now - lastTap < 200) return;
      lastTap = now;
      
      const btn = e.target.closest('.pin-btn');
      if (!btn) return;
      
      const val = btn.dataset.val;
      
      if (val === 'del') return handleDelete();
      if (val === 'ok') return checkPin();
      
      if (val !== undefined) handleDigit(val);
    });
  }
  
  function init(cb) {
    onUnlockCallback = cb;
    renderDots(0);
    setupPad();
  }
  
  function startPinChange() {
    isPinChangeMode = true;
    pinChangeStep = 0;
    newPinBuffer = '';
    
    clearInput();
    updateText('Enter Current PIN', 'Verify identity');
    lock();
  }
  
  return { init, lock, unlock, startPinChange, resetTimer };
})();

/* ============================================================
   Secret Vault PIN (FIXED)
   ============================================================ */

const SecretLock = (() => {
  let currentPin = '';
  let onUnlock = null;
  let lastTap = 0;
  
  function getStoredPin() {
    return localStorage.getItem('vaultx_secret_pin') || DEFAULT_PIN;
  }
  
  function renderDots(n) {
    const wrap = document.getElementById('secret-pin-dots');
    if (!wrap) return;
    
    wrap.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const d = document.createElement('div');
      d.className = 'pin-dot' + (i < n ? ' filled' : '');
      wrap.appendChild(d);
    }
  }
  
  function handleDigit(d) {
    if (currentPin.length >= 4) return;
    
    currentPin += d;
    renderDots(currentPin.length);
    
    if (currentPin.length === 4) {
      setTimeout(checkPin, 120);
    }
  }
  
  function handleDelete() {
    currentPin = currentPin.slice(0, -1);
    renderDots(currentPin.length);
  }
  
  function checkPin() {
    if (currentPin === getStoredPin()) {
      document.getElementById('secret-lock-screen').classList.add('hidden');
      currentPin = '';
      renderDots(0);
      if (onUnlock) onUnlock();
    } else {
      currentPin = '';
      renderDots(0);
      alert("Wrong PIN");
    }
  }
  
  function setupPad() {
    const pad = document.getElementById('secret-pin-pad');
    if (!pad) return;
    
    pad.addEventListener('pointerdown', e => {
      
      const now = Date.now();
      if (now - lastTap < 200) return;
      lastTap = now;
      
      const btn = e.target.closest('.pin-btn');
      if (!btn) return;
      
      const val = btn.dataset.val;
      
      if (val === 'del') return handleDelete();
      if (val === 'ok') return checkPin();
      
      if (val !== undefined) handleDigit(val);
    });
  }
  
  function init() {
    setupPad();
  }
  
  return { init };
})();
