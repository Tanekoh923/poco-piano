(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('notes'), ctx = canvas.getContext('2d');
  const keys = [...document.querySelectorAll('.key')].sort((a,b)=>Number(a.dataset.lane)-Number(b.dataset.lane));
  const keyDefinitions = [
    {label:'ド',position:.5,binding:'a'}, {label:'ド♯',position:1,binding:'w',black:true},
    {label:'レ',position:1.5,binding:'s'}, {label:'レ♯',position:2,binding:'e',black:true},
    {label:'ミ',position:2.5,binding:'d'}, {label:'ファ',position:3.5,binding:'f'},
    {label:'ファ♯',position:4,binding:'t',black:true}, {label:'ソ',position:4.5,binding:'g'},
    {label:'ソ♯',position:5,binding:'y',black:true}, {label:'ラ',position:5.5,binding:'h'},
    {label:'ラ♯',position:6,binding:'u',black:true}, {label:'シ',position:6.5,binding:'j'},
    {label:'ド↑',position:7.5,binding:'k'}
  ];
  const {songs,parseMelody} = window.PocoSongbook;
  const levels = {easy:{speed:.83,travel:2.7,window:.25},normal:{speed:1,travel:2.2,window:.19},hard:{speed:1.25,travel:1.65,window:.14}};
  let selected='twinkle', level='easy', state='idle', notes=[], duration=0;
  let score=0,combo=0,maxCombo=0,judged=0,quality=0,misses=0;
  let startAt=0,resumeUntil=0,time=-3,width=0,height=0,feedbackUntil=0;
  let audio=null,master=null,sound=true,runToken=0,lastCountdown=0;
  let flashes=Array(13).fill(-Infinity), particles=[], best={};
  // Separate 13-key records from scores earned with the earlier four-lane game.
  try { best=JSON.parse(localStorage.getItem('poco-bests-v2')||'{}')||{}; } catch {}
  const bestKey=()=>`${selected}:${level}`;
  function updateBest(){ $('best').textContent=best[bestKey()]?Number(best[bestKey()]).toLocaleString():'—'; }
  function updateDurations(){document.querySelectorAll('[data-song]').forEach(button=>{const song=songs[button.dataset.song];const beats=parseMelody(song.melody).reduce((sum,event)=>sum+event.duration,0);button.querySelector('.song-tail small').textContent=`約 ${Math.ceil(1.6+beats*60/(song.bpm*levels[level].speed))} 秒`;});}
  function resize(){const r=canvas.getBoundingClientRect();width=r.width;height=r.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
  new ResizeObserver(resize).observe(canvas);
  function initAudio(){
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio) return Promise.resolve();
    if(!audio){audio=new Audio();master=audio.createGain();master.gain.value=sound?.65:0;master.connect(audio.destination);}
    return audio.state==='suspended'?audio.resume():Promise.resolve();
  }
  function tone(midi,velocity=.7){
    if(!audio||audio.state!=='running'||!sound)return;
    const now=audio.currentTime, frequency=440*2**((midi-69)/12);
    const envelope=audio.createGain();envelope.gain.setValueAtTime(0,now);envelope.gain.linearRampToValueAtTime(velocity*.19,now+.008);envelope.gain.exponentialRampToValueAtTime(.001,now+1.35);envelope.connect(master);
    [1,2,3,4].forEach((harmonic,i)=>{const osc=audio.createOscillator();const gain=audio.createGain();osc.type='sine';osc.frequency.value=frequency*harmonic;gain.gain.value=[1,.28,.1,.035][i];osc.connect(gain);gain.connect(envelope);osc.start(now);osc.stop(now+1.4);osc.onended=()=>{osc.disconnect();gain.disconnect();};});
    setTimeout(()=>envelope.disconnect(),1600);
  }
  function chart(){
    const events=parseMelody(songs[selected].melody),seconds=60/(songs[selected].bpm*levels[level].speed);
    notes=events.filter(event=>event.midi!==null).map(({beat,midi},index)=>{const lane=midi-60;return {at:.8+beat*seconds,lane,midi,label:keyDefinitions[lane].label,done:false,index};});
    duration=1.6+events.reduce((sum,event)=>sum+event.duration,0)*seconds;
  }
  function hud(){
    $('score').textContent=String(score).padStart(6,'0');
    $('combo').innerHTML=`${combo}<span> ×</span>`;
    $('accuracy').textContent=judged?`${Math.round(quality/judged*100)}%`:'—';
  }
  function feedback(text,color){const el=$('feedback');el.textContent=text;el.style.color=color||'#efa97a';el.classList.add('show');feedbackUntil=performance.now()+650;}
  async function start(){
    const token=++runToken; state='starting';
    try{await initAudio();}catch{}
    if(token!==runToken)return;
    chart();score=combo=maxCombo=judged=quality=misses=0;particles=[];flashes=Array(13).fill(-Infinity);clearInput();hud();
    document.body.classList.add('playing');$('overlay').hidden=true;$('countdown').hidden=false;$('feedback').classList.remove('show');
    state='countdown';time=-3;resumeUntil=0;startAt=performance.now()+3000;lastCountdown=0;
    $('pause').disabled=false;$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-label','一時停止');$('status').textContent='GET READY';resize();
  }
  function idle(){++runToken;state='idle';time=-3;resumeUntil=0;clearInput();document.body.classList.remove('playing');$('countdown').hidden=true;$('pause').disabled=true;$('progress').style.width='0%';$('feedback').classList.remove('show');$('status').textContent='READY WHEN YOU ARE';score=combo=maxCombo=judged=quality=misses=0;hud();showStart();resize();}
  function showStart(){
    $('overlay').hidden=false;$('overlay-inner').innerHTML='<span class="overlay-symbol" aria-hidden="true">♫</span><h3>あなたの指先が、<br>メロディになる。</h3><p>音符が下のラインに重なったら<br>同じ音の鍵盤をタップ。橙色の音符は黒鍵。</p><button class="primary-button" id="start">演奏をはじめる <span>↗</span></button><small>音が出ます。音量を調整してね。</small>';
    $('start').addEventListener('click',start);
  }
  function pause(){
    if(state!=='playing'&&state!=='countdown')return;
    clearInput();
    const now=performance.now();if(!resumeUntil||now>=resumeUntil)time=(now-startAt)/1000;resumeUntil=0;state='paused';$('countdown').hidden=true;$('overlay').hidden=false;$('status').textContent='TAKE A BREATH';$('pause').textContent='▶';$('pause').setAttribute('aria-label','演奏を再開');
    $('overlay-inner').innerHTML='<span class="overlay-symbol">Ⅱ</span><h3>ひとやすみ。</h3><p>好きなタイミングで、続きをどうぞ。</p><button class="primary-button" id="resume">演奏をつづける <span>▶</span></button><button class="secondary-button" id="back">曲選択にもどる</button>';
    $('resume').addEventListener('click',resume);$('back').addEventListener('click',idle);
  }
  async function resume(){
    if(state!=='paused')return;const token=++runToken;state='resuming';
    try{await initAudio();}catch{}
    if(token!==runToken)return;
    resumeUntil=performance.now()+1500;startAt=resumeUntil-time*1000;state='countdown';lastCountdown=0;$('overlay').hidden=true;$('countdown').hidden=false;
    $('pause').textContent='Ⅱ';$('pause').setAttribute('aria-label','一時停止');$('status').textContent='GET READY';
    // A short frozen countdown prevents notes jumping ahead while the player resumes.
  }
  function finish(){
    state='finished';$('pause').disabled=true;$('countdown').hidden=true;$('progress').style.width='100%';$('status').textContent='A LITTLE ENCORE';
    const accuracy=judged?Math.round(quality/judged*100):0;
    const record=score>Number(best[bestKey()]||0);if(record){best[bestKey()]=score;try{localStorage.setItem('poco-bests-v2',JSON.stringify(best));}catch{}updateBest();}
    const rank=accuracy>=95?'S':accuracy>=85?'A':accuracy>=70?'B':accuracy>=50?'C':'D';
    $('overlay').hidden=false;$('overlay-inner').innerHTML=`<span class="result-rank">${rank}</span><h3 class="result-title">${misses===0?'FULL COMBO · ':''}演奏、おつかれさま。</h3><strong class="result-score">${score.toLocaleString()}</strong><div class="result-details"><span>正確さ ${accuracy}%</span><span>最大コンボ ${maxCombo}</span></div><button class="primary-button" id="again">もう一度あそぶ <span>↻</span></button><button class="secondary-button" id="back">曲選択にもどる</button>${record?'<small class="new-best">✦ 自己ベスト更新！</small>':''}`;
    $('again').addEventListener('click',start);$('back').addEventListener('click',idle);
  }
  function hit(lane){
    if(state==='paused'||state==='starting'||state==='resuming'||state==='countdown'||state==='finished')return;
    if(state==='idle'){initAudio().then(()=>tone(60+lane));flashes[lane]=performance.now();return;}
    const now=performance.now();time=(now-startAt)/1000;const window=levels[level].window;
    const note=notes.find(n=>!n.done&&n.lane===lane&&Math.abs(n.at-time)<=window);
    flashes[lane]=now;
    if(!note){tone(60+lane,.35);if(combo){combo=0;hud();}feedback('Early / Late','#9aa58e');return;}
    note.done=true;const offset=Math.abs(note.at-time);const perfect=offset<=window*.46;
    combo++;maxCombo=Math.max(combo,maxCombo);judged++;quality+=perfect?1:.75;score+=(perfect?1000:700)+Math.min(combo,50)*10;
    tone(note.midi);feedback(perfect?'Perfect':'Good',perfect?'#efa97a':'#c0d1ad');
    for(let i=0;i<9;i++)particles.push({x:keyDefinitions[lane].position*width/8,y:height-20,vx:(Math.random()-.5)*2.3,vy:-Math.random()*2.9-1,life:1});
    if(navigator.vibrate)navigator.vibrate(8);hud();
  }
  function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function draw(now){
    ctx.clearRect(0,0,width,height);const laneWidth=width/8,target=height-20;
    for(let i=0;i<8;i++){
      ctx.fillStyle=i%2?'#1c231c':'#192019';ctx.fillRect(i*laneWidth,0,laneWidth,height);
      ctx.strokeStyle='#30392b';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo((i+1)*laneWidth,0);ctx.lineTo((i+1)*laneWidth,height);ctx.stroke();
    }
    keyDefinitions.forEach((key,lane)=>{
      const center=key.position*laneWidth,span=laneWidth*(key.black?.64:1);
      if(key.black){ctx.fillStyle='#efa97a09';ctx.fillRect(center-span/2,0,span,height);}
      const fade=Math.max(0,1-(now-flashes[lane])/350);if(fade){const g=ctx.createLinearGradient(0,target-130,0,height);g.addColorStop(0,'#efa97a00');g.addColorStop(1,`rgba(239,169,122,${fade*.3})`);ctx.fillStyle=g;ctx.fillRect(center-span/2,target-130,span,150);}
    });
    const display=state==='idle'?[{lane:0,y:75},{lane:7,y:32},{lane:6,y:177},{lane:12,y:260}]:notes.filter(n=>!n.done&&n.at-time<=levels[level].travel&&n.at-time>-.3).map(n=>({...n,y:target-(n.at-time)/levels[level].travel*target}));
    // Draw black-key notes last so their narrower paths remain visible between white keys.
    display.sort((a,b)=>Number(!!keyDefinitions[a.lane].black)-Number(!!keyDefinitions[b.lane].black));
    display.forEach(n=>{const key=keyDefinitions[n.lane];const noteWidth=laneWidth*(key.black?.60:.82),x=key.position*laneWidth-noteWidth/2,y=n.y-29;const g=ctx.createLinearGradient(x,y,x,y+29);g.addColorStop(0,key.black?'#f3bd91':'#c9d4ac');g.addColorStop(1,key.black?'#d68f5b':'#98af7f');ctx.fillStyle=g;roundRect(x,y,noteWidth,29,4);ctx.fill();ctx.fillStyle=key.black?'#ffe1c9':'#e4ebd4';roundRect(x+3,y+4,noteWidth-6,2,1);ctx.fill();if(state!=='idle'){ctx.fillStyle=key.black?'#4a2c1c':'#42513a';ctx.font=`${Math.max(7,Math.min(10,noteWidth/(n.label.length+1)))}px Meiryo,sans-serif`;ctx.textAlign='center';ctx.fillText(n.label,x+noteWidth/2,y+20);}});
    particles=particles.filter(p=>p.life>0);particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.life-=.035;ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle='#efa97a';ctx.fillRect(p.x,p.y,3,3);});ctx.globalAlpha=1;
  }
  function frame(now){
    if(state==='countdown'||state==='playing'){
      // Keep note time frozen during the resume countdown, including repeated pauses.
      const resuming=resumeUntil>now;
      if(!resuming)time=(now-startAt)/1000;
      if(state==='countdown'){
        const remaining=resuming?Math.ceil((resumeUntil-now)/1000):Math.ceil(-time);
        if(remaining>0){$('countdown').textContent=remaining;if(remaining!==lastCountdown){lastCountdown=remaining;tone(remaining===1?79:72,.3);}}
        else{state='playing';$('countdown').hidden=true;$('status').textContent='MAKE YOUR LITTLE MUSIC';}
      }
      if(state==='playing'){
        const window=levels[level].window;let changed=false;
        notes.forEach(n=>{if(!n.done&&time-n.at>window){n.done=true;judged++;misses++;combo=0;changed=true;}});
        if(changed){feedback('Miss','#909c86');hud();}
        $('progress').style.width=`${Math.min(100,Math.max(0,time/duration*100))}%`;
        if(time>=duration)finish();
      }
    }
    if(now>feedbackUntil)$('feedback').classList.remove('show');draw(now);requestAnimationFrame(frame);
  }
  document.querySelectorAll('[data-song]').forEach(button=>button.addEventListener('click',()=>{
    if(state!=='idle')idle();selected=button.dataset.song;
    document.querySelectorAll('[data-song]').forEach(b=>{const active=b===button;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
    $('current-song').textContent=songs[selected].title;updateBest();
  }));
  document.querySelectorAll('[data-level]').forEach(button=>button.addEventListener('click',()=>{
    if(state!=='idle')idle();level=button.dataset.level;
    document.querySelectorAll('[data-level]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});updateBest();updateDurations();
  }));
  const pointerLanes=new Map(), keyboardLanes=new Set();
  function updatePressed(lane){if(lane!==undefined&&lane!==null)keys[lane].classList.toggle('active',keyboardLanes.has(lane)||[...pointerLanes.values()].includes(lane));}
  function clearInput(){pointerLanes.clear();keyboardLanes.clear();keys.forEach(k=>k.classList.remove('active'));}
  function release(e){const lane=pointerLanes.get(e.pointerId);pointerLanes.delete(e.pointerId);updatePressed(lane);}
  keys.forEach((key,lane)=>{
    key.addEventListener('pointerdown',e=>{e.preventDefault();if(e.pointerType==='mouse'&&e.button!==0)return;key.setPointerCapture(e.pointerId);pointerLanes.set(e.pointerId,lane);updatePressed(lane);hit(lane);});
    key.addEventListener('pointermove',e=>{
      if(!pointerLanes.has(e.pointerId))return;
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.key');
      const next=keys.includes(target)?Number(target.dataset.lane):null,previous=pointerLanes.get(e.pointerId);
      if(next===previous)return;pointerLanes.set(e.pointerId,next);updatePressed(previous);updatePressed(next);if(next!==null)hit(next);
    });
    key.addEventListener('pointerup',release);key.addEventListener('pointercancel',release);key.addEventListener('lostpointercapture',release);
    key.addEventListener('click',e=>{if(e.detail===0)hit(lane);});
  });
  document.addEventListener('keydown',e=>{
    if(e.repeat||e.ctrlKey||e.metaKey||e.altKey)return;const lane=keyDefinitions.findIndex(key=>key.binding===e.key.toLowerCase());
    if(lane>=0&&!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)&&!e.target.isContentEditable){e.preventDefault();keyboardLanes.add(lane);updatePressed(lane);hit(lane);}
    if(e.code==='Escape'){if(state==='paused')resume();else pause();}
  });
  document.addEventListener('keyup',e=>{const lane=keyDefinitions.findIndex(key=>key.binding===e.key.toLowerCase());if(lane>=0){keyboardLanes.delete(lane);updatePressed(lane);}});
  function backgroundPause(){clearInput();pause();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)backgroundPause();});window.addEventListener('blur',backgroundPause);
  $('sound').addEventListener('click',()=>{sound=!sound;if(master)master.gain.value=sound?.65:0;$('sound-icon').textContent=sound?'♫':'♩';document.querySelector('.sound-label').textContent=sound?'SOUND ON':'SOUND OFF';$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'音をオフにする':'音をオンにする');});
  $('pause').addEventListener('click',()=>state==='paused'?resume():pause());$('reset').addEventListener('click',idle);$('start').addEventListener('click',start);$('library-start').addEventListener('click',start);
  updateBest();updateDurations();resize();requestAnimationFrame(frame);
})();
