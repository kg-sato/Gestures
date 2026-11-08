import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserCamera} from '../web/webcam-source.js';

test('camera retries a busy driver once with a modest format on the same device',async()=>{
 const calls=[],original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getSupportedConstraints:()=>({resizeMode:true}),getUserMedia:async c=>{calls.push(c);throw Object.assign(new Error('busy'),{name:'NotReadableError'});}}}});
 try{const camera=new BrowserCamera({});await assert.rejects(camera.start('brio'),{name:'NotReadableError'});assert.equal(calls.length,2);assert.equal(calls[0].video.width.ideal,1920);assert.equal(calls[0].video.height.ideal,1080);assert.equal(calls[0].video.frameRate.ideal,30);assert.deepEqual(calls[0].video.resizeMode,{ideal:'none'});assert.equal(calls[1].video.width.ideal,640);assert.deepEqual(calls[1].video.deviceId,{exact:'brio'});assert.equal(calls[1].audio,false);assert.equal(camera.stream,null);}
 finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});

test('cancel during retry never reopens the camera',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let calls=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>{calls++;throw Object.assign(new Error('busy'),{name:'NotReadableError'});}}}});
 try{const camera=new BrowserCamera({}),pending=camera.start('brio');await new Promise(resolve=>setTimeout(resolve,20));camera.stop();assert.equal(await pending,null);assert.equal(calls,1);}
 finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});

test('permission failures are not retried',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let calls=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>{calls++;throw Object.assign(new Error('denied'),{name:'NotAllowedError'});}}}});
 try{await assert.rejects(new BrowserCamera({}).start('brio'),{name:'NotAllowedError'});assert.equal(calls,1);}
 finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function mockCapture(getUserMedia){
 const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator'),documentDescriptor=Object.getOwnPropertyDescriptor(globalThis,'document'),videos=[];
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia}}});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>{
  const playing=deferred(),video={playing,videoWidth:1280,videoHeight:720,srcObject:null,play:()=>playing.promise,pause(){},requestVideoFrameCallback:()=>1,cancelVideoFrameCallback(){}};
  videos.push(video);return video;
 }}});
 return{videos,restore(){
  if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;
  if(documentDescriptor)Object.defineProperty(globalThis,'document',documentDescriptor);else delete globalThis.document;
 }};
}
function fakeStream(label){
 const track={label,stopped:false,stop(){this.stopped=true;},addEventListener(){},getSettings:()=>({width:1280,height:720})};
 return{track,getTracks:()=>[track],getVideoTracks:()=>[track]};
}

test('a cancelled play rejection cannot stop a newer connected camera',async()=>{
 const streams=[fakeStream('first'),fakeStream('second')];let index=0;
 const mock=mockCapture(async()=>streams[index++]),camera=new BrowserCamera({});
 try{
  const first=camera.start('first');await Promise.resolve();
  camera.stop();const second=camera.start('second');await Promise.resolve();
  mock.videos[1].playing.resolve();await second;
  mock.videos[0].playing.reject(Object.assign(new Error('old playback aborted'),{name:'AbortError'}));
  assert.equal(await first,null);
  assert.equal(camera.stream,streams[1]);assert.equal(camera.video,mock.videos[1]);
  assert.equal(streams[0].track.stopped,true);assert.equal(streams[1].track.stopped,false);
 }finally{camera.stop();mock.restore();}
});

test('a stale permission result releases only its own tracks',async()=>{
 const oldPermission=deferred(),streams=[fakeStream('first'),fakeStream('second')];let index=0;
 const mock=mockCapture(()=>index++===0?oldPermission.promise:Promise.resolve(streams[1])),camera=new BrowserCamera({});
 try{
  const first=camera.start('first');
  camera.stop();const second=camera.start('second');await Promise.resolve();
  mock.videos[0].playing.resolve();await second;
  oldPermission.resolve(streams[0]);assert.equal(await first,null);
  assert.equal(camera.stream,streams[1]);assert.equal(streams[0].track.stopped,true);assert.equal(streams[1].track.stopped,false);
 }finally{camera.stop();mock.restore();}
});

test('a current playback failure still closes its own stream and rejects',async()=>{
 const stream=fakeStream('current'),mock=mockCapture(async()=>stream),camera=new BrowserCamera({});
 try{
  const pending=camera.start('current');await Promise.resolve();
  mock.videos[0].playing.reject(Object.assign(new Error('playback failed'),{name:'AbortError'}));
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(camera.stream,null);assert.equal(stream.track.stopped,true);
 }finally{camera.stop();mock.restore();}
});
