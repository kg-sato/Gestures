import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultDonutDocument,validateDonutDocument} from '../web/donut-document.js';
test('donut documents round-trip editable geometry and appearance',()=>{const d=defaultDonutDocument();d.shape.twist=1.2;d.shape.ripple=.8;d.appearance.wire=true;assert.deepEqual(validateDonutDocument(JSON.parse(JSON.stringify(d))),d);});
test('foreign scenes and invalid materials/numbers are rejected',()=>{const d=defaultDonutDocument();for(const bad of [{version:1,parts:[]},{...d,shape:{...d.shape,tube:NaN}},{...d,appearance:{...d.appearance,color:'url(bad)'}},{...d,appearance:{...d.appearance,wire:'true'}}])assert.throws(()=>validateDonutDocument(bad));});

test('Comic finish round-trips without changing editable geometry',()=>{
 const document=defaultDonutDocument();document.appearance.finish='comic';const restored=validateDonutDocument(JSON.parse(JSON.stringify(document)));assert.deepEqual(restored,document);
});
