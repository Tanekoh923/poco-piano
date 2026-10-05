const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const songbook = require('./songbook.js');
const html = fs.readFileSync(__dirname+'/index.html','utf8');
const songIds = [...html.matchAll(/data-song="([^"]+)"/g)].map(match=>match[1]);

// Deterministic clock and input events exercise the real game without waiting for songs.
function setup(storage = {}) {
  let clock = 0, animation;
  const elements = new Map();
  class Element {
    constructor(id) { this.id=id;this.textContent='';this.style={};this.dataset={};this.listeners={};this.attributes={};this.disabled=false;this.hidden=false;this.tagName='BUTTON';this.classes=new Set();this.classList={add:(x)=>this.classes.add(x),remove:(x)=>this.classes.delete(x),toggle:(x,v)=>v?this.classes.add(x):this.classes.delete(x)}; }
    addEventListener(name,fn) { (this.listeners[name] ||= []).push(fn); }
    async emit(name,props={}) { for(const fn of this.listeners[name]||[])await fn({target:this,preventDefault(){},...props}); }
    setAttribute(name,value) { this.attributes[name]=value; }
    setPointerCapture() {}
    querySelector() { return this.duration ||= new Element(); }
    set innerHTML(value) { this.html=value;for(const match of value.matchAll(/id="([^"]+)"/g))elements.set(match[1],new Element(match[1])); }
    get innerHTML() { return this.html||''; }
    getBoundingClientRect() { return {width:360,height:400}; }
  }
  const get=(id)=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const songButtons=songIds.map(song=>{const el=new Element();el.dataset.song=song;return el;});
  const levels=['easy','normal','hard'].map(level=>{const el=new Element();el.dataset.level=level;return el;});
  const domKeys=[0,2,4,5,7,9,11,12,1,3,6,8,10].map(lane=>{const el=new Element();el.dataset.lane=lane;el.closest=()=>el;return el;});
  const keys=[...domKeys].sort((a,b)=>a.dataset.lane-b.dataset.lane);
  const noOp=()=>{};
  const drawing = new Proxy({}, {get:(_,name)=>name==='createLinearGradient'?()=>({addColorStop:noOp}):noOp,set:()=>true});
  get('notes').getContext=()=>drawing;
  const document = new Element();document.body=new Element();document.getElementById=get;
  document.querySelector=()=>get('sound-label');
  document.querySelectorAll=(selector)=>selector==='.key'?domKeys:selector==='[data-song]'?songButtons:levels;
  let pointerTarget=null;document.elementFromPoint=()=>pointerTarget;
  const window = new Element();
  window.PocoSongbook= songbook;
  const frequencies=[];
  window.AudioContext=class {
    constructor(){this.state='running';this.currentTime=0;this.destination={};}
    createGain(){return {gain:{value:0,setValueAtTime:noOp,linearRampToValueAtTime:noOp,exponentialRampToValueAtTime:noOp},connect:noOp,disconnect:noOp};}
    createOscillator(){return {frequency:{set value(v){frequencies.push(v);}},connect:noOp,disconnect:noOp,start:noOp,stop:noOp};}
    resume(){return Promise.resolve();}
  };
  vm.runInNewContext(fs.readFileSync(__dirname+'/game.js','utf8'),{
    document,window,performance:{now:()=>clock},devicePixelRatio:1,
    ResizeObserver:class {constructor(fn){this.fn=fn;}observe(){this.fn();}},
    localStorage:{getItem:k=>storage[k],setItem:(k,v)=>storage[k]=v},
    navigator:{},requestAnimationFrame:fn=>animation=fn,setTimeout:noOp,console
  });
  return {get,keys,songButtons,levels,document,storage,frequencies,pointAt:lane=>pointerTarget=lane===null?null:keys[lane],now:()=>clock,
    frame:(at)=>{clock=at;animation(clock);},click:id=>get(id).emit('click'),
    hit:lane=>keys[lane].emit('pointerdown',{pointerId:lane,pointerType:'touch',button:0})};
}

(async()=>{
  let g=setup();await g.click('start');g.frame(3800);await g.hit(0);
  assert.equal(g.get('score').textContent,'001010','exact note scores Perfect');
  await g.hit(0);assert.equal(g.get('score').textContent,'001010','one note cannot be scored twice');
  assert.match(g.get('combo').innerHTML,/^0</,'empty tap breaks combo');
  g.frame(3800+600/0.83+200);await g.hit(0);
  assert.equal(g.get('feedback').textContent,'Good','edge of the timing window scores Good');
  assert.equal(g.get('accuracy').textContent,'88%');
  g.frame(7000);assert.equal(g.get('feedback').textContent,'Miss');
  await g.click('pause');const pausedScore=g.get('score').textContent;
  g.frame(40000);assert.equal(g.get('score').textContent,pausedScore,'pause freezes judging');
  await g.click('resume');g.frame(40500);await g.click('pause');
  await g.click('resume');g.frame(42000);
  assert.equal(g.get('score').textContent,pausedScore,'repeated pause during resume preserves the timeline');
  await g.click('reset');assert.equal(g.get('score').textContent,'000000');
  await g.click('start');await g.click('reset');g.frame(50000);
  assert.equal(g.get('status').textContent,'READY WHEN YOU ARE','reset cancels countdown');

  g=setup();await g.click('start');
  // The known 42-note melody includes six two-beat closing notes.
  const melody='C C G G A A G:2 F F E E D D C:2 G G F F E E D:2 G G F F E E D:2 C C G G A A G:2 F F E E D D C:2'.split(' ');
  const lanes={C:0,D:2,E:4,F:5,G:7,A:9};let beats=0;
  for(const token of melody){const [pitch,length]=token.split(':');g.frame(3800+beats*600/0.83);await g.hit(lanes[pitch]);beats+=Number(length||1);}
  g.frame(3000+(.8+beats*.6/.83+.8)*1000+1);
  assert.match(g.get('overlay-inner').innerHTML,/FULL COMBO/);
  assert.match(g.get('overlay-inner').innerHTML,/正確さ 100%/);
  assert.match(g.get('overlay-inner').innerHTML,/最大コンボ 42/);
  assert.equal(g.get('score').textContent,'051030');
  assert.equal(JSON.parse(g.storage['poco-bests-v2'])['twinkle:easy'],51030);
  const saved=setup(g.storage);assert.equal(saved.get('best').textContent,'51,030','record survives a new session');
  await saved.levels[1].emit('click');assert.equal(saved.get('best').textContent,'—','records belong to each difficulty');
  await saved.songButtons[1].emit('click');assert.equal(saved.get('current-song').textContent,'歓喜の歌');
  await saved.click('sound');assert.equal(saved.get('sound').attributes['aria-pressed'],'false');
  await saved.click('start');saved.frame(4200);await saved.document.emit('visibilitychange');
  // Hidden-tab events are covered via the same pause entry point in the real page.
  saved.document.hidden=true;await saved.document.emit('visibilitychange');
  assert.equal(saved.get('status').textContent,'TAKE A BREATH');
  // Every white and black key must play its own semitone, regardless of DOM order.
  const free=setup();
  for(let lane=0;lane<13;lane++)await free.hit(lane);
  assert.equal(free.frequencies.length,52);
  for(let lane=0;lane<13;lane++)assert.ok(Math.abs(free.frequencies[lane*4]-440*2**((60+lane-69)/12))<.00001,`key ${lane} produces its actual pitch`);
  await free.document.emit('keydown',{key:'w'});assert.equal(free.keys[1].classes.has('active'),true);
  await free.keys[1].emit('pointerup',{pointerId:1});assert.equal(free.keys[1].classes.has('active'),true,'hardware input remains held when a touch lifts');
  await free.document.emit('keyup',{key:'w'});assert.equal(free.keys[1].classes.has('active'),false);
  await free.keys[0].emit('pointerup',{pointerId:0});
  await free.keys[0].emit('pointerdown',{pointerId:99,pointerType:'touch'});
  free.pointAt(1);await free.keys[0].emit('pointermove',{pointerId:99,clientX:30,clientY:20});
  assert.equal(free.keys[0].classes.has('active'),false,'sliding releases the previous key');
  assert.equal(free.keys[1].classes.has('active'),true,'sliding presses the black key');
  await free.keys[0].emit('pointercancel',{pointerId:99});assert.equal(free.keys[1].classes.has('active'),false);

  const chromatic=setup();await chromatic.songButtons[2].emit('click');await chromatic.click('start');
  for(let lane=0;lane<13;lane++){
    chromatic.frame(3800+lane*60000/(108*.83));await chromatic.hit(lane);
    assert.equal(chromatic.get('feedback').textContent,'Perfect',`chromatic note ${lane} matches its key`);
  }
  assert.equal(chromatic.get('score').textContent,'013910');
  assert.equal(chromatic.get('accuracy').textContent,'100%');
  const wrong=setup();await wrong.songButtons[2].emit('click');await wrong.click('start');wrong.frame(3800+60000/(108*.83));await wrong.hit(2);
  assert.equal(wrong.get('score').textContent,'000000','adjacent white key does not score a black-key note');
  await wrong.hit(1);assert.equal(wrong.get('score').textContent,'001010','correct black key scores');
  const old=setup({'poco-bests-v1':JSON.stringify({'twinkle:easy':999999})});assert.equal(old.get('best').textContent,'—','four-key records are separate');
  assert.equal(songIds.length,13,'ten additional songs are available');
  assert.deepEqual(songIds,Object.keys(songbook.songs),'every song is reachable from the UI');
  assert.ok(html.indexOf('src="songbook.js')<html.indexOf('src="game.js'),'catalog loads before the game');
  assert.deepEqual(songbook.parseMelody('C:0.5 R:2 F#:1.5'),[
    {beat:0,duration:.5,midi:60},{beat:.5,duration:2,midi:null},{beat:2.5,duration:1.5,midi:66}
  ],'rests advance the timeline without a pitch');
  for(const bad of ['X','C:0','C:-1','D:NaN','R:Infinity','C:1:2',''])assert.throws(()=>songbook.parseMelody(bad));
  const frog=songbook.parseMelody(songbook.songs.frog.melody);
  assert.equal(frog.length,36);assert.equal(frog.filter(n=>n.midi!==null).length,29);
  assert.equal(frog.reduce((sum,n)=>sum+n.duration,0),32,'frog includes seven silent beats');
  for(const id of ['bee','jacques'])assert.ok(songbook.parseMelody(songbook.songs[id].melody).some(n=>[61,63,66,68,70].includes(n.midi)),'black-key arrangements contain accidentals');
  // Exercise every chart at every difficulty through actual taps, including gaps and subdivisions.
  for(const [id,song] of Object.entries(songbook.songs)){
    const events=songbook.parseMelody(song.melody),sounding=events.filter(n=>n.midi!==null);
    assert.ok(sounding.length>=20,`${id} has a playable melody`);
    assert.ok(sounding.every(n=>Number.isInteger(n.midi)&&n.midi>=60&&n.midi<=72),`${id} fits all thirteen keys`);
    for(const [index,speed] of [.83,1,1.25].entries()){
      const game=setup();await game.songButtons[songIds.indexOf(id)].emit('click');await game.levels[index].emit('click');
      assert.equal(game.get('current-song').textContent,song.title);
      await game.click(index===0?'library-start':'start');
      let expectedScore=0,count=0;
      for(const note of sounding){game.frame(3800+note.beat*60000/(song.bpm*speed));await game.hit(note.midi-60);count++;expectedScore+=1000+Math.min(count,50)*10;}
      const beats=events.reduce((sum,n)=>sum+n.duration,0);
      game.frame(3000+(1.6+beats*60/(song.bpm*speed))*1000+1);
      assert.match(game.get('overlay-inner').innerHTML,/FULL COMBO/,`${id}/${index} has no missed notes or rests`);
      assert.match(game.get('overlay-inner').innerHTML,/正確さ 100%/);
      assert.equal(Number(game.get('score').textContent),expectedScore);
      const level=['easy','normal','hard'][index];
      assert.equal(JSON.parse(game.storage['poco-bests-v2'])[`${id}:${level}`],expectedScore,'each song/difficulty saves independently');
      assert.equal(game.songButtons[songIds.indexOf(id)].duration.textContent,`約 ${Math.ceil(1.6+beats*60/(song.bpm*speed))} 秒`,'duration includes rests and difficulty speed');
    }
  }
  console.log('PASS: 13 songs × 3 difficulties, rests, subdivisions, durations, full combos, per-song records, pause/reset and thirteen-key input');
})().catch(err=>{console.error(err);process.exitCode=1;});
