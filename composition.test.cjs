const assert=require('node:assert/strict');
const c=require('./composition.js');
const valid={id:'custom-example',title:' 小さなメロディ ',bpm:100,melody:'C:0.5 R:1 F#:2 c:4'};
assert.equal(c.validate(valid).title,'小さなメロディ');
for(const changes of [{id:'twinkle'},{title:''},{title:'a'.repeat(41)},{bpm:39},{bpm:201},{bpm:100.5},{melody:''},{melody:'R:4'},{melody:'H:1'},{melody:'C:0'},{melody:'C:.25'},{melody:'C:Infinity'},{melody:'C:1:2'},{melody:'C:256 D:.5'},{melody:Array(257).fill('C:.5').join(' ')}])assert.throws(()=>c.validate({...valid,...changes}));
assert.equal(c.validate({...valid,melody:'C:256'}).melody,'C:256');
const data={},storage={getItem:key=>data[key],setItem:(key,value)=>data[key]=value};
c.persist(storage,[valid]);assert.deepEqual(c.load(storage),[c.validate(valid)]);
data[c.storageKey]=JSON.stringify([valid,{...valid,id:'twinkle'},valid]);assert.equal(c.load(storage).length,1);
data[c.storageKey]='broken';assert.throws(()=>c.load(storage));
data[c.storageKey]='{}';assert.throws(()=>c.load(storage));
assert.throws(()=>c.persist(storage,Array(21).fill(valid)));
assert.throws(()=>c.persist({setItem(){throw new Error('storage unavailable');}},[valid]),/storage unavailable/);
assert.deepEqual(c.quantize([],1000,120),[]);
assert.deepEqual(c.quantize([{pitch:'C',at:1000},{pitch:'D#',at:1060},{pitch:'E',at:1500},{pitch:'R',at:1750},{pitch:'c',at:2000}],2500,120),[
 {pitch:'D#',duration:1},{pitch:'E',duration:.5},{pitch:'R',duration:.5},{pitch:'c',duration:1}
]);
assert.deepEqual(c.quantize([{pitch:'C',at:1000}],1000,120),[{pitch:'C',duration:.5}]);
assert.deepEqual(c.quantize([{pitch:'C',at:0},{pitch:'D',at:128000}],130000,120),[{pitch:'C',duration:256}]);
assert.equal(c.melodyFromEvents([{pitch:'C#',duration:.5},{pitch:'R',duration:2}]),'C#:.5 R:2'.replace(':.5',':0.5'));
console.log('PASS: composition validation, limits, persistence, malformed data and rhythm quantization');
