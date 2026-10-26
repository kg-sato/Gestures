/** Create a static, self-contained site suitable for a portfolio subpath. */
import {cp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'dist');
// The generated output is always exactly this project's dist directory.
if(path.dirname(target)!==root||path.basename(target)!=='dist')throw Error('Invalid build destination');
await readFile(path.join(root,'models/hand_landmarker.task')).catch(()=>{throw Error('Hand model missing. Run npm run setup:model before building.');});
await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
await cp(path.join(root,'web'),target,{recursive:true});
const model=path.join(target,'workbench-model.js');await writeFile(model,(await readFile(model,'utf8')).replace('../node_modules/cannon-es/dist/cannon-es.js','./vendor/cannon-es.js'));
const copy=async(source,destination)=>{await mkdir(path.dirname(path.join(target,destination)),{recursive:true});await cp(path.join(root,source),path.join(target,destination),{recursive:true});};
for(const file of ['three.module.js','three.core.js'])await copy('node_modules/three/build/'+file,'vendor/three/'+file);
for(const file of ['controls/OrbitControls.js','controls/TransformControls.js','exporters/GLTFExporter.js','environments/RoomEnvironment.js'])await copy('node_modules/three/examples/jsm/'+file,'vendor/addons/'+file);
await copy('node_modules/cannon-es/dist/cannon-es.js','vendor/cannon-es.js');await copy('node_modules/@mediapipe/tasks-vision/vision_bundle.mjs','vendor/vision_bundle.mjs');
for(const file of await readdir(path.join(root,'node_modules/@mediapipe/tasks-vision/wasm')))if(/\.(js|wasm)$/.test(file))await copy('node_modules/@mediapipe/tasks-vision/wasm/'+file,'vendor/wasm/'+file);
await copy('models/hand_landmarker.task','models/hand_landmarker.task');await copy('models/manifest.json','models/manifest.json');await copy('licenses','licenses');await copy('THIRD_PARTY_NOTICES.md','THIRD_PARTY_NOTICES.md');await writeFile(path.join(target,'.nojekyll'),'');
console.log('Built dist/: static studio + local hand tracker, ready for root or subpath hosting.');
