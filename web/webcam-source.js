/** Local USB webcam acquisition. Camera/microphone data is never uploaded. */
export class BrowserCamera {
  constructor({onFrame,onEnded,onError}) {
    this.onFrame=onFrame;this.onEnded=onEnded;this.onError=onError;
    this.stream=null;this.video=null;this.generation=0;this.callback=null;
  }

  async start(deviceId) {
    this.stop();const generation=this.generation;
    if(!navigator.mediaDevices?.getUserMedia)throw Error('This browser does not expose webcams. Open the studio in Firefox, Chrome or Edge on this PC.');
    const video={width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}};
    if(deviceId)video.deviceId={exact:deviceId};
    const stream=await navigator.mediaDevices.getUserMedia({video,audio:false});
    if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());return null;}
    this.stream=stream;
    this.video=document.createElement('video');this.video.muted=true;this.video.playsInline=true;
    this.video.srcObject=stream;
    try {await this.video.play();}
    catch(error){this.stop();throw error;}
    if(generation!==this.generation)return null;
    const track=stream.getVideoTracks()[0];
    track.addEventListener('ended',()=>{if(generation===this.generation){this.stop();this.onEnded?.();}});
    this.schedule(generation);
    return {label:track.label,settings:track.getSettings(),width:this.video.videoWidth,height:this.video.videoHeight};
  }

  schedule(generation) {
    const video=this.video;
    if(!video||generation!==this.generation)return;
    const capture=async()=>{
      if(generation!==this.generation)return;
      try {
        const bitmap=await createImageBitmap(video);
        if(generation!==this.generation){bitmap.close();return;}
        await this.onFrame(bitmap,performance.now());
      }catch(error){if(generation===this.generation)this.onError?.(error);}
      if(generation===this.generation)this.schedule(generation);
    };
    if(video.requestVideoFrameCallback)this.callback=video.requestVideoFrameCallback(capture);
    else this.callback=requestAnimationFrame(capture);
  }

  stop() {
    this.generation++;
    if(this.callback!==null){
      if(this.video?.cancelVideoFrameCallback)this.video.cancelVideoFrameCallback(this.callback);
      else cancelAnimationFrame(this.callback);
    }
    this.stream?.getTracks().forEach(track=>track.stop());
    if(this.video){this.video.pause();this.video.srcObject=null;}
    this.stream=null;this.video=null;this.callback=null;
  }
}
