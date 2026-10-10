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
  const {parseMelody} = window.PocoSongbook;
  const songs={...window.PocoSongbook.songs},composition=window.PocoComposition;
  let customSongs=[],composing=false,draft=[],draftSelected=null,editingId=null,recording=null,preview=null,composerToken=0;
  const previewVoices=new Set();
  let storageFailed=false;
  try{customSongs=composition.load(localStorage);customSongs.forEach(song=>songs[song.id]=song);}catch{storageFailed=true;}
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
  function tone(midi,velocity=.7,delay=0){
    if(!audio||audio.state!=='running'||!sound)return;
    const now=audio.currentTime+delay, frequency=440*2**((midi-69)/12),oscillators=[];
    const envelope=audio.createGain();envelope.gain.setValueAtTime(0,now);envelope.gain.linearRampToValueAtTime(velocity*.19,now+.008);envelope.gain.exponentialRampToValueAtTime(.001,now+1.35);envelope.connect(master);
    [1,2,3,4].forEach((harmonic,i)=>{const osc=audio.createOscillator();oscillators.push(osc);const gain=audio.createGain();osc.type='sine';osc.frequency.value=frequency*harmonic;gain.gain.value=[1,.28,.1,.035][i];osc.connect(gain);gain.connect(envelope);osc.start(now);osc.stop(now+1.4);osc.onended=()=>{osc.disconnect();gain.disconnect();};});
    setTimeout(()=>envelope.disconnect(),1600+delay*1000);
    return {stop(){envelope.gain.cancelScheduledValues(audio.currentTime);envelope.gain.setValueAtTime(0,audio.currentTime);oscillators.forEach(osc=>{try{osc.stop();}catch{}});}};
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
    if(composing)closeComposer();
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
    if(composing){composeHit(composition.pitches[lane]);initAudio().then(()=>{if(composing)tone(60+lane);}).catch(()=>{});flashes[lane]=performance.now();return;}
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
    composerFrame(now);
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
  function selectSong(id){
    if(composing)closeComposer();if(state!=='idle')idle();selected=id;
    document.querySelectorAll('[data-song]').forEach(b=>{const active=b.dataset.song===id;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
    $('current-song').textContent=songs[selected].title;$('compose-edit-current').hidden=!customSongs.some(song=>song.id===id);updateBest();
  }
  document.querySelectorAll('[data-song]').forEach(button=>button.addEventListener('click',()=>selectSong(button.dataset.song)));
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
  function backgroundPause(){clearInput();pause();if(composing){if(recording)stopRecording();stopPreview();}}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)backgroundPause();});window.addEventListener('blur',backgroundPause);
  $('sound').addEventListener('click',()=>{sound=!sound;if(master)master.gain.value=sound?.65:0;$('sound-icon').textContent=sound?'♫':'♩';document.querySelector('.sound-label').textContent=sound?'SOUND ON':'SOUND OFF';$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'音をオフにする':'音をオンにする');});
  function composerMessage(text){$('compose-message').textContent=text;}
  function renderCustomSongs(){
    $('my-songs').replaceChildren();$('my-songs-section').hidden=!customSongs.length;$('my-songs-count').textContent=`${customSongs.length} / 20曲`;
    customSongs.forEach(song=>{
      const button=document.createElement('button');button.className='song';button.dataset.song=song.id;button.setAttribute('aria-pressed',String(selected===song.id));button.classList.toggle('selected',selected===song.id);
      button.innerHTML='<span class="song-art sun" aria-hidden="true">♪</span><span class="song-info"><strong></strong><small>わたしのメロディ</small></span><span class="song-tail"><small></small><span class="select-mark">↗</span></span>';
      button.querySelector('.song-info strong').textContent=song.title;button.addEventListener('click',()=>selectSong(song.id));$('my-songs').append(button);
    });
    updateDurations();
  }
  function renderDraft(){
    const beats=draft.reduce((sum,n)=>sum+n.duration,0),sounding=draft.filter(n=>n.pitch!=='R').length;
    $('compose-notes').replaceChildren();
    draft.forEach((n,index)=>{
      const chip=document.createElement('button');chip.className='compose-note';chip.classList.toggle('chosen',index===draftSelected);chip.classList.toggle('rest-note',n.pitch==='R');chip.classList.toggle('accidental',n.pitch.includes('#'));chip.setAttribute('aria-pressed',String(index===draftSelected));
      const label=n.pitch==='R'?'休符':composition.labels[composition.pitches.indexOf(n.pitch)];chip.textContent=`${label} · ${n.duration}拍`;chip.setAttribute('aria-label',`${index+1}番目、${label}、${n.duration}拍`);
      chip.addEventListener('click',()=>{if(recording)return;stopPreview();draftSelected=draftSelected===index?null:index;if(draftSelected!==null){const value=draft[index].duration;const option=document.createElement('option');option.value=String(value);option.textContent=`${value}拍`;$('compose-length').replaceChildren(...[.5,1,2,4].map(length=>{const o=document.createElement('option');o.value=String(length);o.textContent=`${length}拍`;return o;}));if(![.5,1,2,4].includes(value))$('compose-length').append(option);$('compose-length').value=String(value);}renderDraft();});
      $('compose-notes').append(chip);
    });
    $('compose-summary').textContent=`${sounding}音 · ${beats}拍`;
    $('compose-edit-hint').textContent=draftSelected!==null?`${draftSelected+1}番目を編集中`:'鍵盤で末尾に追加';
    $('compose-undo').textContent=draftSelected===null?'1音もどす':'この音を削除';$('compose-undo').disabled=!draft.length||!!recording;
    $('compose-append').disabled=draftSelected===null||!!recording;$('compose-length').disabled=!!recording;
    $('compose-preview').disabled=!sounding||!!recording;$('compose-save').disabled=!sounding||!!recording;
    $('compose-title').disabled=!!recording;$('compose-bpm').disabled=!!recording;$('compose-delete').hidden=!editingId;$('compose-delete').disabled=!!recording;
    $('compose-record').textContent=recording?'■ 録音を止める':'● リズム録音';
  }
  function openComposer(id=null){
    idle();composing=true;document.body.classList.add('composing');$('composer').hidden=false;$('compose-delete-confirm').hidden=true;
    if(id){const song=songs[id];editingId=id;draft=parseMelody(song.melody).map(n=>({pitch:n.midi===null?'R':composition.pitches[n.midi-60],duration:n.duration}));$('compose-title').value=song.title;$('compose-bpm').value=String(song.bpm);}
    else if(editingId){editingId=null;draft=[];$('compose-title').value=`わたしの曲 ${customSongs.length+1}`;$('compose-bpm').value='100';}
    draftSelected=null;composerMessage('');$('status').textContent='MAKE YOUR OWN MELODY';$('reset').textContent='曲選択にもどる';renderDraft();resize();$('composer').scrollIntoView({block:'start'});
  }
  function closeComposer(){
    if(recording)stopRecording();stopPreview();composing=false;document.body.classList.remove('composing');$('composer').hidden=true;$('reset').textContent='最初から ↻';$('status').textContent='READY WHEN YOU ARE';clearInput();resize();
  }
  function stopPreview(){++composerToken;preview=null;previewVoices.forEach(voice=>voice.stop());previewVoices.clear();$('compose-preview').textContent='▶ 試聴';}
  function composeHit(pitch){
    stopPreview();$('compose-delete-confirm').hidden=true;composerMessage('');
    if(recording){
      if(recording.taps.length>=composition.maxEvents-recording.base.length){stopRecording();composerMessage('音符は256個までです。');return;}
      recording.taps.push({pitch,at:performance.now()});refreshRecording(performance.now());renderDraft();return;
    }
    const duration=Number($('compose-length').value),next=draft.map(n=>({...n}));
    if(draftSelected===null)next.push({pitch,duration});else next[draftSelected]={pitch,duration};
    if(next.length>composition.maxEvents||next.reduce((sum,n)=>sum+n.duration,0)>composition.maxBeats){composerMessage('音符は256個・曲の長さは256拍までです。');return;}
    draft=next;renderDraft();
  }
  function refreshRecording(now){
    const base=recording.base,room=composition.maxBeats-base.reduce((sum,n)=>sum+n.duration,0);let used=0;
    const captured=composition.quantize(recording.taps,now,recording.bpm).filter(n=>{if(used>=room)return false;n.duration=Math.min(n.duration,room-used);used+=n.duration;return true;});
    draft=[...base,...captured];
  }
  function stopRecording(){if(!recording)return;refreshRecording(performance.now());recording=null;renderDraft();composerMessage('録音しました。音符を選んで調整できます。');}
  async function record(){
    if(recording){stopRecording();return;}
    const bpm=Number($('compose-bpm').value),beats=draft.reduce((sum,n)=>sum+n.duration,0);
    if(!Number.isInteger(bpm)||bpm<40||bpm>200){composerMessage('テンポは40〜200で入力してください。');return;}
    if(beats>=composition.maxBeats||draft.length>=composition.maxEvents){composerMessage('曲の長さは256拍・音符は256個までです。');return;}
    stopPreview();const token=++composerToken;
    try{await initAudio();}catch{}
    if(!composing||token!==composerToken)return;
    recording={base:draft.map(n=>({...n})),taps:[],bpm,startedAt:performance.now(),room:composition.maxBeats-beats};draftSelected=null;$('compose-delete-confirm').hidden=true;clearInput();renderDraft();composerMessage('録音中。鍵盤を弾いて、終わったら停止してください。');
  }
  async function previewDraft(){
    if(preview){stopPreview();composerMessage('試聴を止めました。');return;}
    let song;try{song=composition.validate({id:'custom-preview',title:$('compose-title').value,bpm:Number($('compose-bpm').value),melody:composition.melodyFromEvents(draft)});}catch(error){composerMessage(error.message);return;}
    stopPreview();const token=++composerToken;
    try{await initAudio();}catch{composerMessage('音声を準備できませんでした。');return;}
    if(!composing||token!==composerToken)return;
    if(!audio){composerMessage('このブラウザでは試聴できません。');return;}
    const events=parseMelody(song.melody);preview={events,start:performance.now()+100,next:0,seconds:60/song.bpm,end:events.reduce((sum,n)=>sum+n.duration,0)*60/song.bpm};$('compose-preview').textContent='■ 試聴を止める';composerMessage(sound?'試聴中です。':'音がオフです。右上の音ボタンでオンにできます。');
  }
  function composerFrame(now){
    if(recording){const first=recording.taps[0]?.at;if((first!==undefined&&(now-first)*recording.bpm/60000>=recording.room)||(!recording.taps.length&&now-recording.startedAt>=60000)){stopRecording();composerMessage('録音を停止しました。内容を確認してください。');}}
    if(!preview)return;
    const elapsed=(now-preview.start)/1000;
    while(preview.next<preview.events.length&&preview.events[preview.next].beat*preview.seconds<=elapsed+.1){
      const n=preview.events[preview.next++];if(n.midi!==null){const voice=tone(n.midi,.7,Math.max(0,n.beat*preview.seconds-elapsed));if(voice)previewVoices.add(voice);}
    }
    if(elapsed>=preview.end){stopPreview();composerMessage('試聴が終わりました。');}
  }
  function saveDraft(){
    stopPreview();let song;
    try{song=composition.validate({id:editingId||`custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`,title:$('compose-title').value,bpm:Number($('compose-bpm').value),melody:composition.melodyFromEvents(draft)});
      const next=customSongs.filter(n=>n.id!==song.id);next.push(song);composition.persist(localStorage,next);
      const previous=songs[song.id];if(previous&&(previous.melody!==song.melody||previous.bpm!==song.bpm)){Object.keys(best).filter(key=>key.startsWith(`${song.id}:`)).forEach(key=>delete best[key]);try{localStorage.setItem('poco-bests-v2',JSON.stringify(best));}catch{}}
      customSongs=next;songs[song.id]=song;editingId=song.id;
    }catch(error){composerMessage(error.name==='QuotaExceededError'?'保存容量が足りません。不要な曲を削除してから試してください。':error.name==='SecurityError'?'保存が許可されていません。ブラウザの保存設定を確認してください。':error.message);return;}
    renderCustomSongs();closeComposer();selectSong(song.id);start();
  }
  function deleteComposition(){
    if(!editingId)return;const id=editingId,next=customSongs.filter(song=>song.id!==id);
    try{composition.persist(localStorage,next);}catch{composerMessage('削除を保存できませんでした。もう一度試してください。');return;}
    customSongs=next;delete songs[id];Object.keys(best).filter(key=>key.startsWith(`${id}:`)).forEach(key=>delete best[key]);try{localStorage.setItem('poco-bests-v2',JSON.stringify(best));}catch{}
    editingId=null;draft=[];renderCustomSongs();closeComposer();selectSong('twinkle');
  }
  $('compose-open').addEventListener('click',()=>openComposer());$('compose-edit-current').addEventListener('click',()=>openComposer(selected));$('compose-close').addEventListener('click',closeComposer);
  $('compose-rest').addEventListener('click',()=>composeHit('R'));
  $('compose-undo').addEventListener('click',()=>{if(recording)return;stopPreview();draft.splice(draftSelected===null?draft.length-1:draftSelected,1);draftSelected=null;renderDraft();composerMessage('');});
  $('compose-append').addEventListener('click',()=>{draftSelected=null;renderDraft();});
  $('compose-length').addEventListener('change',()=>{stopPreview();if(draftSelected!==null)composeHit(draft[draftSelected].pitch);});
  $('compose-bpm').addEventListener('input',stopPreview);$('compose-record').addEventListener('click',record);$('compose-preview').addEventListener('click',previewDraft);$('compose-save').addEventListener('click',saveDraft);
  $('compose-delete').addEventListener('click',()=>{stopPreview();$('compose-delete-confirm').hidden=false;});$('compose-delete-yes').addEventListener('click',deleteComposition);$('compose-delete-no').addEventListener('click',()=>$('compose-delete-confirm').hidden=true);
  $('pause').addEventListener('click',()=>state==='paused'?resume():pause());$('reset').addEventListener('click',()=>composing?closeComposer():idle());$('start').addEventListener('click',start);$('library-start').addEventListener('click',start);
  if(storageFailed){$('storage-notice').hidden=false;$('storage-notice').textContent='保存曲を読み込めませんでした。ブラウザの保存設定を確認してください。';}
  renderCustomSongs();updateBest();updateDurations();resize();requestAnimationFrame(frame);
})();
