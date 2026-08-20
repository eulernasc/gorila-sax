(() => {
  'use strict';

  const game = document.getElementById('game');
  const stage = document.getElementById('stage');
  const banana = document.getElementById('banana');
  const bananaHome = document.getElementById('bananaHome');
  const gorillaTarget = document.getElementById('gorillaTarget');
  const mouthRig = document.getElementById('mouthRig');
  const sceneButtons = [...document.querySelectorAll('.scene-btn')];
  const sceneName = document.getElementById('sceneName');
  const instructionText = document.getElementById('instructionText');
  const modeLabel = document.getElementById('modeLabel');
  const modeAction = document.getElementById('modeAction');
  const scoreEl = document.getElementById('score');
  const resetBtn = document.getElementById('resetBtn');
  const soundToggle = document.getElementById('soundToggle');
  const soundLabel = document.getElementById('soundLabel');
  const actionMessage = document.getElementById('actionMessage');
  const hitFlash = document.getElementById('hitFlash');
  const speechBubble = document.getElementById('brunoSpeech');
  const noteCloud = document.getElementById('noteCloud');
  const saxAudio = document.getElementById('saxAudio');
  const voiceAudio = document.getElementById('voiceAudio');
  const telemetryModule = document.getElementById('telemetryModule');
  const shippingBox = document.getElementById('shippingBox');
  const leftArm = document.getElementById('leftArmRig');
  const rightArm = document.getElementById('rightArmRig');
  const headRig = document.getElementById('headRig');

  let scene = localStorage.getItem('brunoSceneV5') || 'warehouse';
  let score = Number(localStorage.getItem('brunoScoreV5') || 0);
  let soundOn = localStorage.getItem('brunoSoundV5') !== 'off';
  let dragging = false;
  let busy = false;
  let voices = [];
  let audioUnlocked = false;
  let audioCtx = null;
  let voiceBuffer = null;
  let voiceBufferPromise = null;
  let saxBuffer = null;
  let saxBufferPromise = null;
  let saxBufferSource = null;
  let audioUnlockPromise = null;
  let lastDrop = null;

  scoreEl.textContent = String(score);
  applyScene(scene, true);
  updateSoundUI();

  if ('speechSynthesis' in window) {
    const refreshVoices = () => { voices = speechSynthesis.getVoices(); };
    refreshVoices();
    speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
  }

  // Preload both clips. iOS may ignore preload, so we also prime them on the first touch.
  saxAudio.load();
  voiceAudio?.load();

  function applyScene(next, force = false) {
    if (!force && (busy || next === scene)) return;
    scene = next;
    localStorage.setItem('brunoSceneV5', scene);
    game.classList.toggle('warehouse', scene === 'warehouse');
    game.classList.toggle('church', scene === 'church');
    sceneButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.scene === scene));
    resetPose();
    if (scene === 'warehouse') {
      sceneName.textContent = 'Armazém de Telemetria';
      instructionText.textContent = 'Arraste a banana até o Bruno. Depois ele guarda o módulo de telemetria na caixa.';
      modeLabel.textContent = 'MODO ARMAZÉM';
      modeAction.textContent = 'Bruno come a banana e organiza a expedição';
    } else {
      sceneName.textContent = 'Igreja do Sax';
      instructionText.textContent = 'Arraste a banana até o Bruno. Depois ele pega o sax, leva à boca e toca um solo real.';
      modeLabel.textContent = 'MODO IGREJA';
      modeAction.textContent = 'Bruno come a banana e faz o solo de sax';
    }
  }

  sceneButtons.forEach(btn => btn.addEventListener('click', () => applyScene(btn.dataset.scene)));

  function updateSoundUI() {
    soundToggle.classList.toggle('muted', !soundOn);
    soundLabel.textContent = soundOn ? 'Som' : 'Mudo';
  }

  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem('brunoSoundV5', soundOn ? 'on' : 'off');
    updateSoundUI();
    if (soundOn) unlockAudio();
    else {
      saxAudio.pause();
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    }
  });

  resetBtn.addEventListener('click', () => {
    score = 0;
    localStorage.setItem('brunoScoreV5', '0');
    scoreEl.textContent = '0';
    resetPose();
    showMessage('Bruno está pronto de novo!');
  });

  function unlockAudio() {
    if (!soundOn) return Promise.resolve(false);
    if (audioUnlockPromise) return audioUnlockPromise;

    // iPhone/Safari: o primeiro toque na banana vira o "gesto mestre" de áudio.
    // Nele abrimos o AudioContext e já começamos a preparar os DOIS sons que serão
    // usados mais tarde (solo e fala). Depois disso todo o fluxo usa o mesmo contexto.
    audioUnlockPromise = (async () => {
      try {
        const ctx = ensureAudioContext();
        if (!ctx) throw new Error('WebAudio indisponível');
        if (ctx.state === 'suspended') await ctx.resume();

        // Pulso praticamente mudo para garantir a abertura da saída de áudio do iOS.
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.000001;
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.025);

        // Decodifica antecipadamente. A voz é local; o sax real é buscado uma única vez
        // e passa a tocar pelo WebAudio, começando exatamente no primeiro sample.
        await Promise.allSettled([prepareVoiceBuffer(), prepareSaxBuffer()]);
        audioUnlocked = true;
        return true;
      } catch (_) {
        // Fallback: libera também os <audio> tradicionais no próprio gesto.
        const prime = el => {
          if (!el) return;
          try {
            el.pause();
            el.currentTime = 0;
            el.muted = true;
            const p = el.play();
            Promise.resolve(p).then(() => {
              setTimeout(() => {
                el.pause();
                try { el.currentTime = 0; } catch (_) {}
                el.muted = false;
              }, 80);
            }).catch(() => { el.muted = false; });
          } catch (_) { try { el.muted = false; } catch (_) {} }
        };
        prime(saxAudio);
        prime(voiceAudio);
        audioUnlocked = true;
        return false;
      }
    })();

    return audioUnlockPromise;
  }

  banana.addEventListener('pointerdown', e => {
    if (busy) return;
    e.preventDefault();
    unlockAudio();
    dragging = true;
    banana.classList.add('dragging');
    banana.setPointerCapture?.(e.pointerId);
    moveBanana(e.clientX, e.clientY);
  });

  banana.addEventListener('pointermove', e => {
    if (!dragging) return;
    e.preventDefault();
    moveBanana(e.clientX, e.clientY);
  });

  banana.addEventListener('pointerup', e => {
    if (!dragging) return;
    e.preventDefault();
    finishDrag(e.clientX, e.clientY);
  });

  banana.addEventListener('pointercancel', e => {
    if (!dragging) return;
    finishDrag(e.clientX, e.clientY, true);
  });

  banana.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && !busy) {
      e.preventDefault();
      unlockAudio();
      success();
    }
  });

  function moveBanana(x, y) {
    banana.style.left = `${x}px`;
    banana.style.top = `${y}px`;
  }

  function finishDrag(x, y, cancelled = false) {
    dragging = false;
    banana.classList.remove('dragging');
    banana.style.left = '';
    banana.style.top = '';
    if (cancelled) return;

    const target = gorillaTarget.getBoundingClientRect();
    const padX = target.width * .13;
    const padY = target.height * .12;
    const hit = x >= target.left + padX && x <= target.right - padX && y >= target.top + padY && y <= target.bottom - padY;
    if (hit) { lastDrop = { x, y }; success(); } else miss();
  }

  function miss() {
    showMessage('Quase! Jogue a banana bem no Bruno.');
    banana.animate([
      { transform:'translateY(0) rotate(0)' },
      { transform:'translateY(8px) rotate(7deg)' },
      { transform:'translateY(0) rotate(0)' }
    ], { duration:360, easing:'ease-out' });
  }

  async function success() {
    if (busy) return;
    busy = true;
    sceneButtons.forEach(btn => btn.disabled = true);
    score += 1;
    scoreEl.textContent = String(score);
    localStorage.setItem('brunoScoreV5', String(score));
    flashHit();

    await feedBruno();
    if (scene === 'church') await churchSequence();
    else await warehouseSequence();
    await brunoSays();

    resetPose();
    busy = false;
    sceneButtons.forEach(btn => btn.disabled = false);
  }

  async function feedBruno() {
    showMessage('Bruno pegou a banana!');
    const from = bananaHome.getBoundingClientRect();
    const mouth = mouthRig.getBoundingClientRect();
    const startX = lastDrop?.x ?? (from.left + from.width * .5);
    const startY = lastDrop?.y ?? (from.top + from.height * .42);
    lastDrop = null;
    const clone = banana.cloneNode(true);
    clone.removeAttribute('id');
    clone.classList.add('banana-flight');
    clone.style.position = 'fixed';
    clone.style.left = `${startX}px`;
    clone.style.top = `${startY}px`;
    clone.style.width = `${Math.max(90, banana.getBoundingClientRect().width)}px`;
    document.body.appendChild(clone);
    banana.style.opacity = '0';

    const dx = mouth.left + mouth.width/2 - startX;
    const dy = mouth.top + mouth.height/2 - startY;
    const anim = clone.animate([
      { transform:'translate(-50%,-50%) rotate(-8deg) scale(1)' },
      { transform:`translate(calc(-50% + ${dx*.55}px), calc(-50% + ${dy*.55 - 45}px)) rotate(16deg) scale(.85)`, offset:.55 },
      { transform:`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(24deg) scale(.34)` }
    ], { duration:700, easing:'cubic-bezier(.2,.8,.2,1)', fill:'forwards' });

    await anim.finished.catch(() => {});
    game.classList.add('bruno-chew');
    playBiteSound();
    clone.remove();
    await wait(420);
    game.classList.remove('bruno-chew');
    banana.style.opacity = '';
  }

  async function churchSequence() {
    showMessage('Bruno vai pegar o sax…');
    game.classList.add('sax-ready');
    await wait(780);

    // Antes da animação de tocar, aguarda a preparação do áudio iniciada no primeiro toque.
    // No celular isso evita começar no meio do arquivo por streaming tardio.
    if (soundOn) await waitForAudioReady(3200);

    showMessage('Agora sim: solo de sax!');
    game.classList.add('sax-playing');
    noteCloud.classList.add('playing');
    const started = await playRealSax();
    if (!started) playFallbackRiff();
    await wait(6100);
    stopSaxPlayback();
    game.classList.remove('sax-playing');
    noteCloud.classList.remove('playing');
    await wait(300);
    game.classList.remove('sax-ready');

    // Pequeno respiro natural entre o último sopro do sax e a fala.
    await wait(400);
  }

  async function playRealSax() {
    if (!soundOn) return true;

    // Principal: buffer WebAudio. Como o arquivo inteiro já foi decodificado, não existe
    // "stream começando atrasado" e o solo sempre inicia em 0.000 s.
    try {
      const ctx = ensureAudioContext();
      if (ctx) {
        if (ctx.state === 'suspended') await ctx.resume();
        const buffer = saxBuffer || await prepareSaxBuffer();
        if (buffer) {
          stopSaxPlayback();
          const source = ctx.createBufferSource();
          const gain = ctx.createGain();
          source.buffer = buffer;
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.035);
          source.connect(gain).connect(ctx.destination);
          source.start(0, 0);
          saxBufferSource = source;
          source.onended = () => { if (saxBufferSource === source) saxBufferSource = null; };
          return true;
        }
      }
    } catch (_) {}

    // Fallback para navegadores sem WebAudio/CORS.
    try {
      saxAudio.pause();
      try { saxAudio.currentTime = 0; } catch (_) {}
      saxAudio.muted = false;
      saxAudio.volume = 1;
      await saxAudio.play();
      return true;
    } catch (_) {
      return false;
    }
  }

  function stopSaxPlayback() {
    if (saxBufferSource) {
      try { saxBufferSource.stop(); } catch (_) {}
      try { saxBufferSource.disconnect(); } catch (_) {}
      saxBufferSource = null;
    }
    saxAudio.pause();
    try { saxAudio.currentTime = 0; } catch (_) {}
  }

  async function warehouseSequence() {
    showMessage('Bruno vai guardar o módulo…');
    game.classList.add('packing-grab');
    const moduleRect = telemetryModule.getBoundingClientRect();
    const handRect = rightArm.getBoundingClientRect();
    const boxRect = shippingBox.getBoundingClientRect();

    const ghost = telemetryModule.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.classList.add('module-flight');
    ghost.style.position = 'fixed';
    ghost.style.left = `${moduleRect.left}px`;
    ghost.style.top = `${moduleRect.top}px`;
    ghost.style.width = `${moduleRect.width}px`;
    ghost.style.height = `${moduleRect.height}px`;
    ghost.style.margin = '0';
    ghost.style.zIndex = '1001';
    document.body.appendChild(ghost);
    telemetryModule.style.opacity = '0';

    const hdx = handRect.right - moduleRect.left - moduleRect.width * .8;
    const hdy = handRect.bottom - moduleRect.top - moduleRect.height * 1.15;
    await ghost.animate([
      { transform:'translate(0,0) scale(1)' },
      { transform:`translate(${hdx}px,${hdy}px) scale(.72) rotate(-8deg)` }
    ], { duration:650, easing:'cubic-bezier(.2,.8,.2,1)', fill:'forwards' }).finished.catch(()=>{});

    game.classList.remove('packing-grab');
    game.classList.add('packing-box');
    shippingBox.classList.add('receive');
    const bdx = boxRect.left + boxRect.width/2 - (moduleRect.left + moduleRect.width/2);
    const bdy = boxRect.top + boxRect.height*.32 - (moduleRect.top + moduleRect.height/2);
    await ghost.animate([
      { transform:`translate(${hdx}px,${hdy}px) scale(.72) rotate(-8deg)` },
      { transform:`translate(${bdx}px,${bdy}px) scale(.28) rotate(16deg)`, opacity:0 }
    ], { duration:720, easing:'cubic-bezier(.4,0,.2,1)', fill:'forwards' }).finished.catch(()=>{});

    playWarehouseClick();
    ghost.remove();
    telemetryModule.style.opacity = '';
    await wait(350);
    game.classList.remove('packing-box');
    shippingBox.classList.remove('receive');
    showMessage('Módulo guardado na expedição!');
    await wait(400);
  }

  async function brunoSays() {
    const phrase = 'Bruno é demais!';
    speechBubble.textContent = phrase;
    speechBubble.classList.add('show');
    game.classList.add('bruno-speaking');
    showMessage(phrase);

    if (soundOn) {
      const played = await playBrunoVoice();
      if (!played) {
        speakPhrase(phrase);
        await wait(1850);
      }
    } else {
      await wait(1650);
    }

    speechBubble.classList.remove('show');
    game.classList.remove('bruno-speaking');
  }

  async function playBrunoVoice() {
    if (!soundOn) return false;

    // Primeiro tenta o mesmo AudioContext já desbloqueado pela banana.
    // Esperamos explicitamente o context ficar "running" antes de disparar a voz.
    try {
      const ctx = ensureAudioContext();
      if (ctx) {
        if (ctx.state === 'suspended') await ctx.resume();
        const buffer = voiceBuffer || await prepareVoiceBuffer();
        if (buffer && ctx.state === 'running') {
          const source = ctx.createBufferSource();
          const gain = ctx.createGain();
          source.buffer = buffer;
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.02);
          source.connect(gain).connect(ctx.destination);
          await new Promise(resolve => {
            let finished = false;
            const done = () => { if (!finished) { finished = true; resolve(); } };
            source.onended = done;
            source.start(0, 0);
            setTimeout(done, Math.max(2400, buffer.duration * 1000 + 500));
          });
          return true;
        }
      }
    } catch (_) {}

    // Fallback: elemento local previamente liberado no primeiro toque.
    if (!voiceAudio) return false;
    try {
      voiceAudio.pause();
      try { voiceAudio.currentTime = 0; } catch (_) {}
      voiceAudio.muted = false;
      voiceAudio.volume = 1;
      const ended = new Promise(resolve => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          voiceAudio.removeEventListener('ended', finish);
          voiceAudio.removeEventListener('error', finish);
          resolve();
        };
        voiceAudio.addEventListener('ended', finish, { once: true });
        voiceAudio.addEventListener('error', finish, { once: true });
        setTimeout(finish, 2600);
      });
      await voiceAudio.play();
      await ended;
      return true;
    } catch (_) {
      return false;
    }
  }

  function prepareSaxBuffer() {
    if (saxBuffer) return Promise.resolve(saxBuffer);
    if (saxBufferPromise) return saxBufferPromise;
    const ctx = ensureAudioContext();
    if (!ctx) return Promise.resolve(null);
    const sourceUrl = saxAudio?.querySelector('source[type="audio/mpeg"]')?.src || saxAudio?.currentSrc;
    if (!sourceUrl) return Promise.resolve(null);
    saxBufferPromise = fetch(sourceUrl, { mode: 'cors', cache: 'force-cache' })
      .then(r => { if (!r.ok) throw new Error('sax fetch'); return r.arrayBuffer(); })
      .then(buf => ctx.decodeAudioData(buf.slice(0)))
      .then(decoded => (saxBuffer = decoded))
      .catch(() => null);
    return saxBufferPromise;
  }

  async function waitForAudioReady(timeoutMs = 3000) {
    if (!soundOn) return;
    const timeout = new Promise(resolve => setTimeout(resolve, timeoutMs));
    try {
      await Promise.race([
        Promise.allSettled([unlockAudio(), prepareVoiceBuffer(), prepareSaxBuffer()]),
        timeout
      ]);
    } catch (_) {}
  }

  function prepareVoiceBuffer() {
    if (voiceBuffer) return Promise.resolve(voiceBuffer);
    if (voiceBufferPromise) return voiceBufferPromise;
    const ctx = ensureAudioContext();
    if (!ctx) return Promise.resolve(null);
    voiceBufferPromise = fetch('./assets/bruno-e-demais.mp3', { cache: 'force-cache' })
      .then(r => { if (!r.ok) throw new Error('voice fetch'); return r.arrayBuffer(); })
      .then(buf => ctx.decodeAudioData(buf.slice(0)))
      .then(decoded => (voiceBuffer = decoded))
      .catch(() => null);
    return voiceBufferPromise;
  }

  function speakPhrase(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'pt-BR';
      u.rate = .92;
      u.pitch = .78;
      u.volume = 1;
      const pt = (voices.length ? voices : speechSynthesis.getVoices()).filter(v => /^pt(-|_)/i.test(v.lang || ''));
      u.voice = pt.find(v => /brasil|brazil|antonio|antônio|daniel|ricardo/i.test(v.name || '')) || pt[0] || null;
      speechSynthesis.speak(u);
    } catch (_) {}
  }

  function resetPose() {
    game.classList.remove('sax-ready','sax-playing','packing-grab','packing-box','bruno-chew','bruno-speaking');
    noteCloud.classList.remove('playing');
    shippingBox.classList.remove('receive');
    telemetryModule.style.opacity = '';
    stopSaxPlayback();
    if (voiceAudio) {
      voiceAudio.pause();
      try { voiceAudio.currentTime = 0; } catch (_) {}
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    speechBubble.classList.remove('show');
    banana.style.opacity = '';
  }

  function flashHit() {
    hitFlash.classList.remove('active');
    void hitFlash.offsetWidth;
    hitFlash.classList.add('active');
  }

  function showMessage(text) {
    actionMessage.textContent = text;
    actionMessage.classList.add('show');
    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => actionMessage.classList.remove('show'), 1800);
  }

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function playBiteSound() {
    if (!soundOn) return;
    try {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 650;
      gain.gain.setValueAtTime(.0001,t); gain.gain.exponentialRampToValueAtTime(.13,t+.015); gain.gain.exponentialRampToValueAtTime(.0001,t+.18);
      const osc = ctx.createOscillator(); osc.type='triangle'; osc.frequency.setValueAtTime(150,t); osc.frequency.exponentialRampToValueAtTime(75,t+.16);
      osc.connect(filter).connect(gain).connect(ctx.destination); osc.start(t); osc.stop(t+.2);
    } catch (_) {}
  }

  function playWarehouseClick() {
    if (!soundOn) return;
    try {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      const t=ctx.currentTime;
      [190,105].forEach((freq,i)=>{
        const osc=ctx.createOscillator(), gain=ctx.createGain();
        osc.type=i?'sine':'triangle'; osc.frequency.setValueAtTime(freq,t+i*.03); osc.frequency.exponentialRampToValueAtTime(freq*.55,t+.3);
        gain.gain.setValueAtTime(.0001,t); gain.gain.exponentialRampToValueAtTime(.12,t+.015); gain.gain.exponentialRampToValueAtTime(.0001,t+.32);
        osc.connect(gain).connect(ctx.destination); osc.start(t+i*.03); osc.stop(t+.34);
      });
    } catch (_) {}
  }

  function ensureAudioContext(){
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)return null;
      audioCtx ||= new Ctx();
      return audioCtx;
    }catch(_){return null;}
  }

  function playFallbackRiff(){
    if(!soundOn)return;
    const ctx=ensureAudioContext(); if(!ctx)return;
    const notes=[233.08,277.18,311.13,349.23,415.30,369.99,311.13,277.18,233.08];
    let t=ctx.currentTime;
    notes.forEach((freq,i)=>{
      const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
      o.type='sawtooth'; o.frequency.value=freq; f.type='lowpass';f.frequency.value=1300;f.Q.value=2.2;
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.055,t+.025);g.gain.exponentialRampToValueAtTime(.0001,t+.31);
      o.connect(f).connect(g).connect(ctx.destination);o.start(t);o.stop(t+.33);t+=i===4?.36:.27;
    });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
})();
