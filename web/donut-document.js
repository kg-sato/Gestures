import {DEFAULT_DONUT,sanitizeDonut} from './donut-shape.js';
export const DEFAULT_APPEARANCE=Object.freeze({color:'#ff9d86',finish:'comic',wire:false});
export function validateDonutDocument(input){
 if(!input||input.version!==1||input.kind!=='gestures-donut')throw Error('Choose a Donut Lab scene.');
 const shape=sanitizeDonut(input.shape),a=input.appearance;
 if(!a||!/^#[\da-f]{6}$/i.test(a.color||'')||!['clay','chrome','glass','hologram','comic'].includes(a.finish)||typeof a.wire!=='boolean')throw Error('Invalid donut appearance.');
 return{version:1,kind:'gestures-donut',shape,appearance:{color:a.color.toLowerCase(),finish:a.finish,wire:a.wire}};
}
export function defaultDonutDocument(){return{version:1,kind:'gestures-donut',shape:{...DEFAULT_DONUT},appearance:{...DEFAULT_APPEARANCE}};}
