(() => {
  'use strict';
  // Monophonic arrangements of traditional melodies, within C4–C5.
  // R is a rest; numbers after a colon are lengths in quarter-note beats.
  const songs = {
    twinkle:{title:'きらきら星',bpm:100,melody:'C C G G A A G:2 F F E E D D C:2 G G F F E E D:2 G G F F E E D:2 C C G G A A G:2 F F E E D D C:2'},
    joy:{title:'歓喜の歌',bpm:110,melody:'E E F G G F E D C C D E E:1.5 D:0.5 D:2 E E F G G F E D C C D E D:1.5 C:0.5 C:2'},
    morning:{title:'朝のさんぽ',bpm:108,melody:'C C# D D# E F F# G G# A A# B c:2 B A# A G# G F# F E D# D C#:2 C:2 E F# G G# A G F# E D C:3'},
    frog:{title:'かえるの合唱',bpm:100,melody:'C D E F E D C R E F G A G F E R C R C R C R C R C:0.5 C:0.5 D:0.5 D:0.5 E:0.5 E:0.5 F:0.5 F:0.5 E D C R'},
    lamb:{title:'メリーさんのひつじ',bpm:104,melody:'E D C D E E E:2 D D D:2 E G G:2 E D C D E E E E D D E D C:4'},
    butterfly:{title:'ちょうちょう',bpm:104,melody:'G E E:2 F D D:2 C D E F G G G:2 G E E E F D D D C E G G E E E:2 D D D D D E F:2 E E E E E F G:2 G E E E F D D D C E G G E E E:2'},
    bee:{title:'ぶんぶんぶん',bpm:112,melody:'A G F#:2 E F#:0.5 G:0.5 E D F# G A F# E F# G E F# G A F# E F# G E A G F#:2 E F#:0.5 G:0.5 E D'},
    london:{title:'ロンドン橋',bpm:108,melody:'G:1.5 A:0.5 G F E F G:2 D E F:2 E F G:2 G:1.5 A:0.5 G F E F G:2 D:2 G:2 E C:2 R'},
    jacques:{title:'フレール・ジャック',bpm:108,melody:'F G A F F G A F A A# c:2 A A# c:2 c:0.5 A#:0.5 A:0.5 G:0.5 F C c:0.5 A#:0.5 A:0.5 G:0.5 F C F C F:2 F C F:2'},
    saints:{title:'聖者の行進',bpm:112,melody:'C E F G:4 R C E F G:4 R C E F G:2 E:2 C:2 E:2 D:4 R E E D C:4 R C E G G F:3 R E F G:2 E:2 C:2 D:2 C:4 R:2'},
    snail:{title:'かたつむり',bpm:120,melody:'G:1.5 G:0.5 G E C:1.5 C:0.5 C D E:1.5 E:0.5 D C D G G:2 E:1.5 E:0.5 F G A:1.5 A:0.5 G F E:1.5 E:0.5 D C D G C:2'},
    hands:{title:'むすんでひらいて',bpm:100,melody:'E E:0.5 D:0.5 C C D D E:0.5 D:0.5 C G G:0.5 F:0.5 E E D:0.5 C:0.5 D:0.5 E:0.5 C:2 E E:0.5 F:0.5 G G A A G:0.5 F:0.5 E E E:0.5 F:0.5 G G A A G:2 E E:0.5 D:0.5 C C D D E:0.5 D:0.5 C G G:0.5 F:0.5 E E D:0.5 C:0.5 D:0.5 E:0.5 C:2'},
    jingle:{title:'ジングルベル',bpm:120,melody:'E E E:2 E E E:2 E G C:1.5 D:0.5 E:4 F F F:1.5 F:0.5 F E E E:0.5 E:0.5 E D D E D:2 G:2 E E E:2 E E E:2 E G C:1.5 D:0.5 E:4 F F F:1.5 F:0.5 F E E E:0.5 E:0.5 G G F D C:4'}
  };
  const pitches = {C:60,'C#':61,D:62,'D#':63,E:64,F:65,'F#':66,G:67,'G#':68,A:69,'A#':70,B:71,c:72};
  function parseMelody(melody) {
    let beat=0;
    return melody.trim().split(/\s+/).map(token=>{
      const [pitch,length,...extra]=token.split(':');
      const duration=length===undefined?1:Number(length);
      if(extra.length||!Number.isFinite(duration)||duration<=0||(pitch!=='R'&&!Object.hasOwn(pitches,pitch)))throw new Error(`Invalid melody token: ${token}`);
      const event={beat,duration,midi:pitch==='R'?null:pitches[pitch]};
      beat+=duration;
      return event;
    });
  }
  const songbook={songs,parseMelody};
  if(typeof module!=='undefined'&&module.exports)module.exports=songbook;
  else window.PocoSongbook=songbook;
})();
