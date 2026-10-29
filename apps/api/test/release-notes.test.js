import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseNotes} from '../../../deployment/release-notes.mjs';

test('release notes render repository links for v1.0.0 and historical candidates',()=>{
 for(const tag of ['v1.0.0','v1.0.1','v1.1.0-rc.1','v3.1.0-rc.3']){
  const result=releaseNotes('[Security](../../SECURITY.md) [Guide](../compatibility.md) [External](https://example.test/guide) [Section](#scope)',{file:`docs/releases/${tag}.md`,repository:'theadekola/i-clusters',tag});
  assert.ok(result.includes(`https://github.com/theadekola/i-clusters/blob/${tag}/SECURITY.md`));assert.ok(result.includes(`https://github.com/theadekola/i-clusters/blob/${tag}/docs/compatibility.md`));assert.ok(result.includes('[External](https://example.test/guide)'));assert.ok(result.includes('[Section](#scope)'));
 }
});
test('release identities and links cannot escape the selected repository',()=>{
 for(const tag of ['v1.0.0/other','v1.0','v1.0.0-rc.x','v1.0.0?next=other'])assert.throws(()=>releaseNotes('notes',{file:'docs/releases/v1.0.0.md',repository:'theadekola/i-clusters',tag}),/Invalid release identity/);
 assert.throws(()=>releaseNotes('notes',{file:'docs/releases/v1.0.0.md',repository:'theadekola/i-clusters/other',tag:'v1.0.0'}),/Invalid release identity/);
 assert.throws(()=>releaseNotes('[Outside](../../../secret)',{file:'docs/releases/v1.0.0.md',repository:'theadekola/i-clusters',tag:'v1.0.0'}),/leaves the repository/);
});
