(() => {
  const game = document.getElementById('game');
  const gorilla = document.getElementById('gorillaTarget');
  const banana = document.getElementById('banana');
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
  const soundLabel = document.getElementById('soundLabel');
  const resetBtn = document.getElementById('resetBtn');
  const saxAudio = document.getElementById('saxAudio');
  const brunoSpeech = document.getElementById('brunoSpeech');

  let scene = localStorage.getItem('brunoScene') || 'warehouse';
  let score = Number(localStorage.getItem('gorillaSaxScore') || 0);
  let soundOn = localStorage.getItem('gorillaSaxSound') !== 'off';
  let dragging = false;
  let busy = false;
  let dragOffset = { x: 0, y: 0 };
  let voices = [];

  scoreEl.textContent = score;
  updateSoundUI();
  applyScene(scene, true);

  if ('speechSynthesis' in window) {
    const loadVoices = () => { voices = speechSynthesis.getVoices(); };
    loadVoices();
    speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
  }

  function updateSoundUI() {
    soundToggle.classList.toggle('muted', !soundOn);
    soundToggle.title = soundOn ? 'Som e voz ligados' : 'Som e voz desligados';
    soundLabel.textContent = soundOn ? 'Som' : 'Mudo';
  }

  function applyScene(next, force = false) {
    if (!force && (busy || next === scene)) return;
    scene = next;
    localStorage.setItem('brunoScene', scene);
    game.classList.toggle('warehouse', scene === 'warehouse');
    game.classList.toggle('church', scene === 'church');
    sceneButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.scene === scene));
    if (scene === 'warehouse') {
      sceneName.textContent = 'Armazém de Telemetria';
      instructionText.textContent = 'Jogue a banana no Bruno para ele guardar um módulo de telemetria na caixa de expedição.';
      modeLabel.textContent = 'MODO ARMAZÉM';
      modeAction.textContent = 'Bruno guarda o módulo na expedição';
    } else {
      sceneName.textContent = 'Igreja do Sax';
      instructionText.textContent = 'Jogue a banana no Bruno. Se acertar, ele pega o sax e faz a apresentação.';
      modeLabel.textContent = 'MODO IGREJA';
      modeAction.textContent = 'Bruno toca sax e faz o show';
    }
    resetProps();
  }

  sceneButtons.forEach(btn => btn.addEventListener('click', () => applyScene(btn.dataset.scene)));

  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem('gorillaSaxSound', soundOn ? 'on' : 'off');
    updateSoundUI();
    if (!soundOn) {
      saxAudio.pause();
      saxAudio.currentTime = 0;
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    }
  });

  resetBtn.addEventListener('click', () => {
    score = 0;
    localStorage.setItem('gorillaSaxScore', '0');
    scoreEl.textContent = '0';
    resetProps();
    showMessage('Bananas zeradas. Bruno está pronto!');
  });

  function resetProps() {
    game.classList.remove('sax-playing', 'packing', 'bruno-speaking');
    noteCloud.classList.remove('playing');
    telemetryModule.classList.remove('packed');
    shippingBox.classList.remove('receive');
    brunoSpeech.classList.remove('show');
    saxAudio.pause();
    saxAudio.currentTime = 0;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
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
    const targetPadY = targetRect.height * 0.13;
    const hit = clientX >= targetRect.left + targetPadX && clientX <= targetRect.right - targetPadX &&
                clientY >= targetRect.top + targetPadY && clientY <= targetRect.bottom - targetPadY;

    if (hit) success();
    else miss();
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
    showMessage('Quase! A banana precisa acertar o Bruno.');
    banana.animate([
      { transform: 'translateY(0) rotate(0)' },
      { transform: 'translateY(9px) rotate(8deg)' },
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

    await brunoSays();
    busy = false;
  }

  async function churchAction() {
    showMessage('Bruno entrou no solo de sax!');
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
    await wait(3200);
    game.classList.remove('sax-playing');
    noteCloud.classList.remove('playing');
  }

  async function warehouseAction() {
    showMessage('Bruno guardou o módulo de telemetria!');
    game.classList.add('packing');
    shippingBox.classList.add('receive');
    await wait(250);
    telemetryModule.classList.add('packed');
    if (soundOn) playWarehouseClick();
    await wait(1350);
    game.classList.remove('packing');
    shippingBox.classList.remove('receive');
    telemetryModule.classList.remove('packed');
  }

  async function brunoSays() {
    const phrase = 'Bruno é demais!';
    brunoSpeech.textContent = phrase;
    brunoSpeech.classList.add('show');
    game.classList.add('bruno-speaking');
    showMessage(phrase);

    if (soundOn) speakPhrase(phrase);
    await wait(1750);
    brunoSpeech.classList.remove('show');
    game.classList.remove('bruno-speaking');
  }

  function speakPhrase(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'pt-BR';
      utter.rate = 0.93;
      utter.pitch = 0.78;
      utter.volume = 1;
      const selected = choosePortugueseVoice();
      if (selected) utter.voice = selected;
      speechSynthesis.speak(utter);
    } catch (_) {}
  }

  function choosePortugueseVoice() {
    const list = voices.length ? voices : (speechSynthesis.getVoices?.() || []);
    const pt = list.filter(v => /^pt(-|_)/i.test(v.lang || ''));
    if (!pt.length) return null;
    const preferred = ['antonio', 'antônio', 'daniel', 'ricardo', 'male', 'mascul'];
    return pt.find(v => preferred.some(k => (v.name || '').toLowerCase().includes(k))) ||
           pt.find(v => /pt-br/i.test(v.lang || '')) || pt[0];
  }

  function showMessage(text) {
    actionMessage.textContent = text;
    actionMessage.classList.add('show');
    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => actionMessage.classList.remove('show'), 1850);
  }

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function playWarehouseClick() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.2, now + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .34);
      [180, 115].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = i ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * .55, now + .25);
        osc.connect(gain);
        osc.start(now + i * .035);
        osc.stop(now + .34);
      });
    } catch (_) {}
  }

  function playFallbackRiff() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const notes = [261.63, 311.13, 349.23, 392, 466.16, 392, 349.23, 311.13, 261.63];
      let t = ctx.currentTime;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1450, t);
        filter.Q.value = 2.8;
        gain.gain.setValueAtTime(.0001, t);
        gain.gain.exponentialRampToValueAtTime(.075, t + .025);
        gain.gain.exponentialRampToValueAtTime(.0001, t + .29);
        osc.connect(filter).connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + .31);
        t += i === 4 ? .33 : .25;
      });
    } catch (_) {}
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
