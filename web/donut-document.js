import {DEFAULT_DONUT,sanitizeDonut} from './donut-shape.js';
export const DEFAULT_APPEARANCE=Object.freeze({color:'#a5e3ca',finish:'chrome',wire:false});
export function validateDonutDocument(input){
 if(!input||input.version!==1||input.kind!=='gestures-donut')throw Error('Choose a Donut Lab scene.');
 const shape=sanitizeDonut(input.shape),a=input.appearance;
 if(!a||!/^#[\da-f]{6}$/i.test(a.color||'')||!['clay','chrome','glass','hologram'].includes(a.finish)||typeof a.wire!=='boolean')throw Error('Invalid donut appearance.');
 return{version:1,kind:'gestures-donut',shape,appearance:{color:a.color.toLowerCase(),finish:a.finish,wire:a.wire}};
}
export function defaultDonutDocument(){return{version:1,kind:'gestures-donut',shape:{...DEFAULT_DONUT},appearance:{...DEFAULT_APPEARANCE}};}
