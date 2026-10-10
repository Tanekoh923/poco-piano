(() => {
  'use strict';
  const pitches=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B','c'];
  const labels=['ド','ド♯','レ','レ♯','ミ','ファ','ファ♯','ソ','ソ♯','ラ','ラ♯','シ','ド↑'];
  const storageKey='poco-compositions-v1',maxEvents=256,maxBeats=256,maxSongs=20;
  function validate(song) {
    if(!song||typeof song!=='object'||typeof song.id!=='string'||!/^custom-[a-z0-9-]{1,80}$/.test(song.id))throw new Error('曲のデータが正しくありません。');
    if(typeof song.title!=='string'||!song.title.trim()||song.title.trim().length>40)throw new Error('曲名は1〜40文字で入力してください。');
    if(!Number.isInteger(song.bpm)||song.bpm<40||song.bpm>200)throw new Error('テンポは40〜200で入力してください。');
    if(typeof song.melody!=='string'||song.melody.length>4096)throw new Error('音符のデータが正しくありません。');
    const tokens=song.melody.trim().split(/\s+/);
    let beats=0,sounding=0;
    if(tokens.length>maxEvents)throw new Error('音符と休符は合わせて256個までです。');
    for(const token of tokens){
      const [pitch,length,...extra]=token.split(':');const duration=length===undefined?1:Number(length);
      if(extra.length||(!pitches.includes(pitch)&&pitch!=='R')||!Number.isFinite(duration)||duration<.5||duration>maxBeats||!Number.isInteger(duration*2))throw new Error('音符のデータが正しくありません。');
      beats+=duration;if(pitch!=='R')sounding++;
    }
    if(!sounding)throw new Error('鍵盤で1音以上入力してください。');
    if(beats>maxBeats)throw new Error('曲の長さは256拍までです。');
    return {id:song.id,title:song.title.trim(),bpm:song.bpm,melody:tokens.join(' ')};
  }
  function load(storage) {
    const records=JSON.parse(storage.getItem(storageKey)||'[]');
    if(!Array.isArray(records))throw new Error('保存した曲のデータを読み込めませんでした。');
    const found=new Set(),songs=[];
    for(const record of records.slice(0,maxSongs)){try{const song=validate(record);if(!found.has(song.id)){songs.push(song);found.add(song.id);}}catch{}}
    return songs;
  }
  function persist(storage,songs){if(songs.length>maxSongs)throw new Error('保存は20曲までです。不要な曲を削除してください。');storage.setItem(storageKey,JSON.stringify(songs.map(validate)));}
  const melodyFromEvents=events=>events.map(n=>`${n.pitch}:${n.duration}`).join(' ');
  // One melody note per eighth-note grid position; a later tap on the same grid replaces it.
  function quantize(taps,stopAt,bpm){
    if(!taps.length)return [];
    const first=taps[0].at,seconds=60000/bpm,grid=[];
    for(const tap of taps){
      const beat=Math.max(0,Math.round((tap.at-first)/seconds*2)/2);
      if(beat>=maxBeats)break;
      if(grid.length&&grid[grid.length-1].beat===beat)grid[grid.length-1].pitch=tap.pitch;
      else if(grid.length<maxEvents)grid.push({pitch:tap.pitch,beat});
    }
    const end=Math.min(maxBeats,Math.max(grid[grid.length-1].beat+.5,Math.round((stopAt-first)/seconds*2)/2));
    return grid.map((n,i)=>({pitch:n.pitch,duration:(grid[i+1]?.beat??end)-n.beat}));
  }
  const api={pitches,labels,storageKey,maxEvents,maxBeats,maxSongs,validate,load,persist,melodyFromEvents,quantize};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else window.PocoComposition=api;
})();
