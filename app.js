(() => {
  const game = document.getElementById('game');
  const gorilla = document.getElementById('gorillaTarget');
  const banana = document.getElementById('banana');
  const bananaHome = document.getElementById('bananaHome');
  const sceneButtons = [...document.querySelectorAll('.scene-btn')];
  const sceneName = document.getElementById('sceneName');
  const instructionText = document.getElementById('instructionText');
  const modeLabel = document.getElementById('modeLabel');
  const modeAction = document.getElementById('modeAction');
  const scoreEl = document.getElementById('score');
  const actionMessage = document.getElementById('actionMessage');
  const hitFlash = document.getElementById('hitFlash');
  const noteCloud = document.getElementById('noteCloud');
  const telemetryModule = document.getElementById('telemetryModule');
  const shippingBox = document.getElementById('shippingBox');
  const soundToggle = document.getElementById('soundToggle');
  const soundIcon = document.getElementById('soundIcon');
  const resetBtn = document.getElementById('resetBtn');
  const saxAudio = document.getElementById('saxAudio');

  let scene = 'warehouse';
  let score = Number(localStorage.getItem('gorillaSaxScore') || 0);
  let soundOn = localStorage.getItem('gorillaSaxSound') !== 'off';
  let dragging = false;
  let busy = false;
  let dragOffset = { x: 0, y: 0 };

  scoreEl.textContent = score;
  updateSoundUI();

  function updateSoundUI() {
    soundIcon.textContent = soundOn ? '🔊' : '🔇';
    soundToggle.title = soundOn ? 'Som ligado' : 'Som desligado';
  }

  function setScene(next) {
    if (busy || next === scene) return;
    scene = next;
    game.classList.toggle('warehouse', scene === 'warehouse');
    game.classList.toggle('church', scene === 'church');
    sceneButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.scene === scene));
    if (scene === 'warehouse') {
      sceneName.textContent = 'Armazém de Telemetria';
      instructionText.textContent = 'Arraste a banana até o gorila para ele guardar um módulo de telemetria na caixa.';
      modeLabel.textContent = 'MODO ARMAZÉM';
      modeAction.textContent = 'Banana → módulo guardado';
    } else {
      sceneName.textContent = 'Igreja do Sax';
      instructionText.textContent = 'Arraste a banana até o gorila. Se acertar, ele começa a tocar saxofone.';
      modeLabel.textContent = 'MODO IGREJA';
      modeAction.textContent = 'Banana → sax tocando';
    }
    resetProps();
  }

  sceneButtons.forEach(btn => btn.addEventListener('click', () => setScene(btn.dataset.scene)));

  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem('gorillaSaxSound', soundOn ? 'on' : 'off');
    updateSoundUI();
    if (!soundOn) {
      saxAudio.pause();
      saxAudio.currentTime = 0;
    }
  });

  resetBtn.addEventListener('click', () => {
    score = 0;
    localStorage.setItem('gorillaSaxScore', '0');
    scoreEl.textContent = '0';
    resetProps();
    showMessage('Placar reiniciado');
  });

  function resetProps() {
    game.classList.remove('sax-playing', 'packing');
    noteCloud.classList.remove('playing');
    telemetryModule.classList.remove('packed');
    shippingBox.classList.remove('receive');
    saxAudio.pause();
    saxAudio.currentTime = 0;
  }

  function beginDrag(clientX, clientY) {
    if (busy) return;
    dragging = true;
    const rect = banana.getBoundingClientRect();
    dragOffset.x = clientX - rect.left - rect.width / 2;
    dragOffset.y = clientY - rect.top - rect.height / 2;
    banana.classList.add('dragging');
    moveBanana(clientX, clientY);
  }

  function moveBanana(clientX, clientY) {
    if (!dragging) return;
    banana.style.left = `${clientX - dragOffset.x}px`;
    banana.style.top = `${clientY - dragOffset.y}px`;
  }

  function endDrag(clientX, clientY) {
    if (!dragging) return;
    dragging = false;
    banana.classList.remove('dragging');
    banana.style.left = '';
    banana.style.top = '';

    const targetRect = gorilla.getBoundingClientRect();
    const targetPadX = targetRect.width * 0.12;
    const targetPadY = targetRect.height * 0.12;
    const hit = clientX >= targetRect.left + targetPadX && clientX <= targetRect.right - targetPadX &&
                clientY >= targetRect.top + targetPadY && clientY <= targetRect.bottom - targetPadY;

    if (hit) success();
    else miss(clientX, clientY);
  }

  banana.addEventListener('pointerdown', e => {
    e.preventDefault();
    banana.setPointerCapture?.(e.pointerId);
    beginDrag(e.clientX, e.clientY);
  });
  banana.addEventListener('pointermove', e => moveBanana(e.clientX, e.clientY));
  banana.addEventListener('pointerup', e => endDrag(e.clientX, e.clientY));
  banana.addEventListener('pointercancel', e => endDrag(e.clientX, e.clientY));

  banana.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && !busy) {
      e.preventDefault();
      success();
    }
  });

  function miss() {
    showMessage('Quase! Joga a banana no gorila 😅');
    banana.animate([
      { transform: 'translateY(0) rotate(0)' },
      { transform: 'translateY(8px) rotate(8deg)' },
      { transform: 'translateY(0) rotate(0)' }
    ], { duration: 380, easing: 'ease-out' });
  }

  async function success() {
    if (busy) return;
    busy = true;
    score += 1;
    scoreEl.textContent = score;
    localStorage.setItem('gorillaSaxScore', String(score));
    hitFlash.classList.remove('active');
    void hitFlash.offsetWidth;
    hitFlash.classList.add('active');

    if (scene === 'church') await churchAction();
    else await warehouseAction();

    busy = false;
  }

  async function churchAction() {
    showMessage('🎷 Gorila do sax!');
    game.classList.add('sax-playing');
    noteCloud.classList.add('playing');
    if (soundOn) {
      try {
        saxAudio.currentTime = 0;
        await saxAudio.play();
      } catch (_) {
        playFallbackRiff();
      }
    }
    await wait(3400);
    game.classList.remove('sax-playing');
    noteCloud.classList.remove('playing');
  }

  async function warehouseAction() {
    showMessage('📦 Módulo guardado na caixa!');
    game.classList.add('packing');
    shippingBox.classList.add('receive');
    await wait(250);
    telemetryModule.classList.add('packed');
    if (soundOn) playWarehouseClick();
    await wait(1300);
    game.classList.remove('packing');
    shippingBox.classList.remove('receive');
    telemetryModule.classList.remove('packed');
  }

  function showMessage(text) {
    actionMessage.textContent = text;
    actionMessage.classList.add('show');
    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => actionMessage.classList.remove('show'), 1700);
  }

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function playWarehouseClick() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + .18);
      gain.gain.setValueAtTime(.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.22, ctx.currentTime + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + .26);
    } catch (_) {}
  }

  function playFallbackRiff() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const notes = [261.63, 311.13, 349.23, 392.00, 349.23, 311.13, 261.63];
      let t = ctx.currentTime;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1600, t);
        gain.gain.setValueAtTime(.0001, t);
        gain.gain.exponentialRampToValueAtTime(.09, t + .025);
        gain.gain.exponentialRampToValueAtTime(.0001, t + .32);
        osc.connect(filter).connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + .34);
        t += i === 3 ? .34 : .28;
      });
    } catch (_) {}
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
