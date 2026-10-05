(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('notes'), ctx = canvas.getContext('2d');
  const keys = [...document.querySelectorAll('.key')];
  const pitches = { C:60,D:62,E:64,F:65,G:67,A:69,B:71,c:72 };
  const songs = {
    twinkle:{title:'きらきら星',bpm:100,melody:'C C G G A A G:2 F F E E D D C:2 G G F F E E D:2 G G F F E E D:2 C C G G A A G:2 F F E E D D C:2'},
    joy:{title:'歓喜の歌',bpm:110,melody:'E E F G G F E D C C D E E:1.5 D:0.5 D:2 E E F G G F E D C C D E D:1.5 C:0.5 C:2'},
    morning:{title:'朝のさんぽ',bpm:108,melody:'C E G E D F A:2 G E D C:2 E G c G A G E:2 D E F D G E C:2 C E G c:2 A G E D C:3'}
  };
  const levels = {easy:{speed:.83,travel:2.7,window:.25},normal:{speed:1,travel:2.2,window:.19},hard:{speed:1.25,travel:1.65,window:.14}};
  let selected='twinkle', level='easy', state='idle', notes=[], duration=0;
  let score=0,combo=0,maxCombo=0,judged=0,quality=0,misses=0;
  let startAt=0,resumeUntil=0,time=-3,width=0,height=0,feedbackUntil=0;
  let audio=null,master=null,sound=true,runToken=0,lastCountdown=0;
  let flashes=[0,0,0,0], particles=[], best={};
  try { best=JSON.parse(localStorage.getItem('poco-bests-v1')||'{}')||{}; } catch {}
  const bestKey=()=>`${selected}:${level}`;
  function updateBest(){ $('best').textContent=best[bestKey()]?Number(best[bestKey()]).toLocaleString():'—'; }
  function updateDurations(){document.querySelectorAll('[data-song]').forEach(button=>{const song=songs[button.dataset.song];const beats=song.melody.split(' ').reduce((sum,n)=>sum+Number(n.split(':')[1]||1),0);button.querySelector('.song-tail small').textContent=`約 ${Math.ceil(1.6+beats*60/(song.bpm*levels[level].speed))} 秒`;});}
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
    let beat=0;const seconds=60/(songs[selected].bpm*levels[level].speed);
    notes=songs[selected].melody.split(' ').map((token,index)=>{const [pitch,length]=token.split(':');const midi=pitches[pitch];const degree=['C','D','E','F','G','A','B','c'].indexOf(pitch);const n={at:.8+beat*seconds,lane:degree%4,midi,label:pitch.toUpperCase(),done:false,index};beat+=Number(length||1);return n;});
    duration=.8+beat*seconds+.8;
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
    chart();score=combo=maxCombo=judged=quality=misses=0;particles=[];flashes=[0,0,0,0];hud();
    document.body.classList.add('playing');$('overlay').hidden=true;$('countdown').hidden=false;$('feedback').classList.remove('show');
    state='countdown';time=-3;resumeUntil=0;startAt=performance.now()+3000;lastCountdown=0;
    $('pause').disabled=false;$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-label','一時停止');$('status').textContent='GET READY';resize();
  }
  function idle(){++runToken;state='idle';time=-3;resumeUntil=0;document.body.classList.remove('playing');$('countdown').hidden=true;$('pause').disabled=true;$('progress').style.width='0%';$('feedback').classList.remove('show');$('status').textContent='READY WHEN YOU ARE';score=combo=maxCombo=judged=quality=misses=0;hud();showStart();resize();}
  function showStart(){
    $('overlay').hidden=false;$('overlay-inner').innerHTML='<span class="overlay-symbol" aria-hidden="true">♫</span><h3>あなたの指先が、<br>メロディになる。</h3><p>音符が下のラインに重なったら<br>同じ列の鍵盤をタップ。</p><button class="primary-button" id="start">演奏をはじめる <span>↗</span></button><small>音が出ます。音量を調整してね。</small>';
    $('start').addEventListener('click',start);
  }
  function pause(){
    if(state!=='playing'&&state!=='countdown')return;
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
    const record=score>Number(best[bestKey()]||0);if(record){best[bestKey()]=score;try{localStorage.setItem('poco-bests-v1',JSON.stringify(best));}catch{}updateBest();}
    const rank=accuracy>=95?'S':accuracy>=85?'A':accuracy>=70?'B':accuracy>=50?'C':'D';
    $('overlay').hidden=false;$('overlay-inner').innerHTML=`<span class="result-rank">${rank}</span><h3 class="result-title">${misses===0?'FULL COMBO · ':''}演奏、おつかれさま。</h3><strong class="result-score">${score.toLocaleString()}</strong><div class="result-details"><span>正確さ ${accuracy}%</span><span>最大コンボ ${maxCombo}</span></div><button class="primary-button" id="again">もう一度あそぶ <span>↻</span></button><button class="secondary-button" id="back">曲選択にもどる</button>${record?'<small class="new-best">✦ 自己ベスト更新！</small>':''}`;
    $('again').addEventListener('click',start);$('back').addEventListener('click',idle);
  }
  function hit(lane){
    if(state==='paused'||state==='starting'||state==='resuming'||state==='countdown'||state==='finished')return;
    if(state==='idle'){initAudio().then(()=>tone([60,64,67,72][lane]));flashes[lane]=performance.now();return;}
    const now=performance.now();time=(now-startAt)/1000;const window=levels[level].window;
    const note=notes.find(n=>!n.done&&n.lane===lane&&Math.abs(n.at-time)<=window);
    flashes[lane]=now;
    if(!note){tone([60,64,67,72][lane],.35);if(combo){combo=0;hud();}feedback('Early / Late','#9aa58e');return;}
    note.done=true;const offset=Math.abs(note.at-time);const perfect=offset<=window*.46;
    combo++;maxCombo=Math.max(combo,maxCombo);judged++;quality+=perfect?1:.75;score+=(perfect?1000:700)+Math.min(combo,50)*10;
    tone(note.midi);feedback(perfect?'Perfect':'Good',perfect?'#efa97a':'#c0d1ad');
    for(let i=0;i<9;i++)particles.push({x:(lane+.5)*width/4,y:height-20,vx:(Math.random()-.5)*2.3,vy:-Math.random()*2.9-1,life:1});
    if(navigator.vibrate)navigator.vibrate(8);hud();
  }
  function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function draw(now){
    ctx.clearRect(0,0,width,height);const laneWidth=width/4,target=height-20;
    for(let i=0;i<4;i++){
      ctx.fillStyle=i%2?'#1c231c':'#192019';ctx.fillRect(i*laneWidth,0,laneWidth,height);
      ctx.strokeStyle='#30392b';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo((i+1)*laneWidth,0);ctx.lineTo((i+1)*laneWidth,height);ctx.stroke();
      const fade=Math.max(0,1-(now-flashes[i])/350);if(fade){const g=ctx.createLinearGradient(0,target-130,0,height);g.addColorStop(0,'#efa97a00');g.addColorStop(1,`rgba(239,169,122,${fade*.3})`);ctx.fillStyle=g;ctx.fillRect(i*laneWidth,target-130,laneWidth,150);}
    }
    const display=state==='idle'?[{lane:0,y:75},{lane:2,y:32},{lane:1,y:177},{lane:3,y:260}]:notes.filter(n=>!n.done&&n.at-time<=levels[level].travel&&n.at-time>-.3).map(n=>({...n,y:target-(n.at-time)/levels[level].travel*target}));
    display.forEach(n=>{const x=n.lane*laneWidth+12,y=n.y-26;const g=ctx.createLinearGradient(x,y,x,y+29);g.addColorStop(0,'#c9d4ac');g.addColorStop(1,'#98af7f');ctx.fillStyle=g;roundRect(x,y,laneWidth-24,29,5);ctx.fill();ctx.fillStyle='#e4ebd4';roundRect(x+4,y+4,laneWidth-32,2,1);ctx.fill();if(state!=='idle'){ctx.fillStyle='#42513a';ctx.font='10px Georgia';ctx.textAlign='center';ctx.fillText(n.label,x+(laneWidth-24)/2,y+19);}});
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
  const pointerLanes=new Map();
  function release(e){const lane=pointerLanes.get(e.pointerId);pointerLanes.delete(e.pointerId);if(lane!==undefined&&![...pointerLanes.values()].includes(lane))keys[lane].classList.remove('active');}
  keys.forEach((key,lane)=>{
    key.addEventListener('pointerdown',e=>{e.preventDefault();if(e.pointerType==='mouse'&&e.button!==0)return;key.setPointerCapture(e.pointerId);pointerLanes.set(e.pointerId,lane);key.classList.add('active');hit(lane);});
    key.addEventListener('pointerup',release);key.addEventListener('pointercancel',release);key.addEventListener('lostpointercapture',release);
    key.addEventListener('click',e=>{if(e.detail===0)hit(lane);});
  });
  document.addEventListener('keydown',e=>{
    if(e.repeat)return;const lane=['a','s','d','f'].indexOf(e.key.toLowerCase());
    if(lane>=0&&!['INPUT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();keys[lane].classList.add('active');hit(lane);}
    if(e.code==='Escape'){if(state==='paused')resume();else pause();}
  });
  document.addEventListener('keyup',e=>{const lane=['a','s','d','f'].indexOf(e.key.toLowerCase());if(lane>=0)keys[lane].classList.remove('active');});
  function backgroundPause(){keys.forEach(k=>k.classList.remove('active'));pointerLanes.clear();pause();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)backgroundPause();});window.addEventListener('blur',backgroundPause);
  $('sound').addEventListener('click',()=>{sound=!sound;if(master)master.gain.value=sound?.65:0;$('sound-icon').textContent=sound?'♫':'♩';document.querySelector('.sound-label').textContent=sound?'SOUND ON':'SOUND OFF';$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'音をオフにする':'音をオンにする');});
  $('pause').addEventListener('click',()=>state==='paused'?resume():pause());$('reset').addEventListener('click',idle);$('start').addEventListener('click',start);
  updateBest();updateDurations();resize();requestAnimationFrame(frame);
})();
