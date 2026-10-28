import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserCamera} from '../web/webcam-source.js';

test('camera retries a busy driver once with a modest format on the same device',async()=>{
 const calls=[],original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async c=>{calls.push(c);throw Object.assign(new Error('busy'),{name:'NotReadableError'});}}}});
 try{const camera=new BrowserCamera({});await assert.rejects(camera.start('brio'),{name:'NotReadableError'});assert.equal(calls.length,2);assert.equal(calls[1].video.width.ideal,640);assert.deepEqual(calls[1].video.deviceId,{exact:'brio'});assert.equal(calls[1].audio,false);assert.equal(camera.stream,null);}
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
