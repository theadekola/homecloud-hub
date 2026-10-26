import test from 'node:test';
import assert from 'node:assert/strict';
import {upgradeBrandSettings} from '../src/product-brand.js';
test('rebranding upgrades historical defaults without changing custom names or other settings',()=>{
 for(const siteName of ['HomeCloud','HomeCloud Hub']){const settings={siteName,description:'Homelab management',refresh:45};upgradeBrandSettings(settings);assert.deepEqual(settings,{siteName:'i-Clusters',description:'Your infrastructure, connected.',refresh:45});upgradeBrandSettings(settings);assert.equal(settings.siteName,'i-Clusters')}
 const settings={siteName:'The Adekola Lab',description:'Private infrastructure',refresh:30};const before=structuredClone(settings);upgradeBrandSettings(settings);assert.deepEqual(settings,before);
 const customDescription={siteName:'i-Clusters',description:'My lab'};upgradeBrandSettings(customDescription);assert.equal(customDescription.description,'My lab');upgradeBrandSettings(null);
});
