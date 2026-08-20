(() => {
  'use strict';

  const game = document.getElementById('game');
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
  const telemetryModule = document.getElementById('telemetryModule');
  const shippingBox = document.getElementById('shippingBox');
  const rightArm = document.getElementById('rightArmRig');

  let scene = localStorage.getItem('brunoSceneV5') || 'warehouse';
  let score = Number(localStorage.getItem('brunoScoreV5') || 0);
  let soundOn = localStorage.getItem('brunoSoundV5') !== 'off';
  let dragging = false;
  let busy = false;
  let lastDrop = null;
  let audioCtx = null;
  let saxBuffer = null;
  let saxBufferPromise = null;
  let saxSource = null;
  let saxGain = null;
  let saxFallbackPlaying = false;

  scoreEl.textContent = String(score);
  applyScene(scene, true);
  updateSoundUI();

  // Áudio v10: tudo local e sem voz sintetizada.
  // O arquivo do sax fica dentro do próprio PWA e é pré-carregado.
  // No primeiro toque do usuário, o AudioContext é desbloqueado; depois o
  // solo pode começar alguns segundos mais tarde sem depender de autoplay.
  preloadSaxBytes();

  function preloadSaxBytes() {
    if (saxBufferPromise) return saxBufferPromise;
    saxBufferPromise = fetch('./assets/sax-solo.m4a', { cache: 'force-cache' })
      .then(r => { if (!r.ok) throw new Error(`sax HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(bytes => decodeSax(bytes))
      .catch(async err => {
        console.warn('M4A do sax não carregou; tentando MP3 local.', err);
        const r = await fetch('./assets/sax-solo.mp3', { cache: 'force-cache' });
        if (!r.ok) throw new Error(`sax MP3 HTTP ${r.status}`);
        return decodeSax(await r.arrayBuffer());
      })
      .catch(err => { console.error('Falha ao preparar sax local:', err); return null; });
    return saxBufferPromise;
  }

  function getAudioContext() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }

  async function decodeSax(bytes) {
    const ctx = getAudioContext();
    if (!ctx) return null;
    // slice evita problemas de buffer reutilizado em alguns Safaris.
    saxBuffer = await ctx.decodeAudioData(bytes.slice(0));
    return saxBuffer;
  }

  function unlockMobileAudio() {
    if (!soundOn) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      // Pulso silencioso curto para efetivamente abrir a saída de áudio no iOS.
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = 0;
      src.buffer = b; src.connect(g).connect(ctx.destination); src.start(0);
    } catch (_) {}
    preloadSaxBytes();
  }

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
    if (!soundOn) stopAllAudio();
    else unlockMobileAudio();
  });

  resetBtn.addEventListener('click', () => {
    score = 0;
    localStorage.setItem('brunoScoreV5', '0');
    scoreEl.textContent = '0';
    resetPose();
    showMessage('Bruno está pronto de novo!');
  });


  banana.addEventListener('pointerdown', e => {
    if (busy) return;
    unlockMobileAudio();
    e.preventDefault();
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
      unlockMobileAudio();
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
    if (hit) {
      lastDrop = { x, y };
      // IMPORTANTE: ainda estamos dentro do pointerup do usuário.
      unlockMobileAudio();
      success();
    } else miss();
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

    try {
      await feedBruno();
      if (scene === 'church') await churchSequence();
      else await warehouseSequence();
      await brunoSays();
    } catch (err) {
      console.error('Sequência do Bruno:', err);
      showMessage('Bruno se atrapalhou. Tente novamente!');
    } finally {
      resetPose();
      busy = false;
      sceneButtons.forEach(btn => btn.disabled = false);
    }
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
    await Promise.race([anim.finished.catch(()=>{}), wait(850)]);
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
    await wait(520);

    showMessage('Agora sim: solo de sax!');
    game.classList.add('sax-playing');
    noteCloud.classList.add('playing');
    await startSaxNow();

    await wait(6100);
    stopSaxOnly();
    game.classList.remove('sax-playing');
    noteCloud.classList.remove('playing');
    await wait(300);
    game.classList.remove('sax-ready');
    await wait(400);
  }

  async function startSaxNow() {
    if (!soundOn) return false;
    unlockMobileAudio();
    const ctx = getAudioContext();
    try {
      const buffer = saxBuffer || await Promise.race([preloadSaxBytes(), wait(1400).then(() => null)]);
      if (buffer && ctx) {
        if (ctx.state !== 'running') await ctx.resume().catch(() => {});
        if (ctx.state === 'running') {
          stopSaxOnly();
          saxGain = ctx.createGain();
          saxGain.gain.value = 0.95;
          saxSource = ctx.createBufferSource();
          saxSource.buffer = buffer;
          saxSource.connect(saxGain).connect(ctx.destination);
          saxSource.start(0);
          return true;
        }
      }
    } catch (err) { console.warn('WebAudio sax falhou:', err); }

    // Fallback local simples. Como o arquivo já foi carregado pelo PWA,
    // evita depender de internet e nunca trava a animação.
    try {
      saxAudio.pause();
      saxAudio.currentTime = 0;
      saxAudio.muted = false;
      const playPromise = saxAudio.play();
      if (playPromise) await Promise.race([playPromise, wait(900)]);
      saxFallbackPlaying = !saxAudio.paused;
      if (saxFallbackPlaying) return true;
    } catch (err) { console.warn('HTMLAudio sax falhou:', err); }

    playFallbackRiff();
    return false;
  }

  function stopSaxOnly() {
    if (saxSource) { try { saxSource.stop(); } catch (_) {} try { saxSource.disconnect(); } catch (_) {} saxSource = null; }
    if (saxGain) { try { saxGain.disconnect(); } catch (_) {} saxGain = null; }
    try { saxAudio.pause(); saxAudio.currentTime = 0; saxAudio.muted = false; } catch (_) {}
    saxFallbackPlaying = false;
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
    const a1 = ghost.animate([
      { transform:'translate(0,0) scale(1)' },
      { transform:`translate(${hdx}px,${hdy}px) scale(.72) rotate(-8deg)` }
    ], { duration:650, easing:'cubic-bezier(.2,.8,.2,1)', fill:'forwards' });
    await Promise.race([a1.finished.catch(()=>{}), wait(800)]);

    game.classList.remove('packing-grab');
    game.classList.add('packing-box');
    shippingBox.classList.add('receive');
    const bdx = boxRect.left + boxRect.width/2 - (moduleRect.left + moduleRect.width/2);
    const bdy = boxRect.top + boxRect.height*.32 - (moduleRect.top + moduleRect.height/2);
    const a2 = ghost.animate([
      { transform:`translate(${hdx}px,${hdy}px) scale(.72) rotate(-8deg)` },
      { transform:`translate(${bdx}px,${bdy}px) scale(.28) rotate(16deg)`, opacity:0 }
    ], { duration:720, easing:'cubic-bezier(.4,0,.2,1)', fill:'forwards' });
    await Promise.race([a2.finished.catch(()=>{}), wait(900)]);

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
    // A fala foi removida de propósito na v10: era o segundo gatilho de áudio
    // que mais falhava no Safari/iPhone. Mantemos só o balão visual.
    const phrase = 'Bruno é demais!';
    speechBubble.textContent = phrase;
    speechBubble.classList.add('show');
    game.classList.add('bruno-speaking');
    showMessage(phrase);
    await wait(1200);
    speechBubble.classList.remove('show');
    game.classList.remove('bruno-speaking');
  }

  function resetPose() {
    game.classList.remove('sax-ready','sax-playing','packing-grab','packing-box','bruno-chew','bruno-speaking');
    noteCloud.classList.remove('playing');
    shippingBox.classList.remove('receive');
    telemetryModule.style.opacity = '';
    stopAllAudio();
    speechBubble.classList.remove('show');
    banana.style.opacity = '';
  }

  function stopAllAudio() {
    stopSaxOnly();
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
    if (!soundOn || !audioCtx || audioCtx.state !== 'running') return;
    try {
      const t = audioCtx.currentTime;
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      filter.type='lowpass'; filter.frequency.value=650;
      gain.gain.setValueAtTime(.0001,t); gain.gain.exponentialRampToValueAtTime(.13,t+.015); gain.gain.exponentialRampToValueAtTime(.0001,t+.18);
      const osc=audioCtx.createOscillator(); osc.type='triangle'; osc.frequency.setValueAtTime(150,t); osc.frequency.exponentialRampToValueAtTime(75,t+.16);
      osc.connect(filter).connect(gain).connect(audioCtx.destination); osc.start(t); osc.stop(t+.2);
    } catch (_) {}
  }

  function playWarehouseClick() {
    if (!soundOn || !audioCtx || audioCtx.state !== 'running') return;
    try {
      const t=audioCtx.currentTime;
      [190,105].forEach((freq,i)=>{
        const osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
        osc.type=i?'sine':'triangle'; osc.frequency.setValueAtTime(freq,t+i*.03); osc.frequency.exponentialRampToValueAtTime(freq*.55,t+.3);
        gain.gain.setValueAtTime(.0001,t); gain.gain.exponentialRampToValueAtTime(.12,t+.015); gain.gain.exponentialRampToValueAtTime(.0001,t+.32);
        osc.connect(gain).connect(audioCtx.destination); osc.start(t+i*.03); osc.stop(t+.34);
      });
    } catch (_) {}
  }

  function playFallbackRiff() {
    if (!soundOn || !audioCtx || audioCtx.state !== 'running') return;
    const notes=[233.08,277.18,311.13,349.23,415.30,369.99,311.13,277.18,233.08];
    let t=audioCtx.currentTime;
    notes.forEach((freq,i)=>{
      const o=audioCtx.createOscillator(),g=audioCtx.createGain(),f=audioCtx.createBiquadFilter();
      o.type='sawtooth'; o.frequency.value=freq; f.type='lowpass';f.frequency.value=1300;f.Q.value=2.2;
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.055,t+.025);g.gain.exponentialRampToValueAtTime(.0001,t+.31);
      o.connect(f).connect(g).connect(audioCtx.destination);o.start(t);o.stop(t+.33);t+=i===4?.36:.27;
    });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
})();
