import test from 'node:test';
import assert from 'node:assert/strict';
import {truenasTestError} from '../src/truenas-test-error.js';

test('TrueNAS diagnostics distinguish trust, identity, authentication, permissions and connectivity without reflecting secrets',()=>{
 for(const [error,expected] of [
  [{code:'ERR_TLS_CERT_ALTNAME_INVALID'},/hostname mismatch.*Subject Alternative Names/],
  [{code:'DEPTH_ZERO_SELF_SIGNED_CERT'},/not trusted.*exact certificate/],
  [{cause:{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'}},/not trusted/],
  [{code:'CERT_HAS_EXPIRED'},/expired.*Renew/],
  [{code:'CERT_NOT_YET_VALID'},/not valid yet/],
  [{code:'ENOTFOUND'},/could not resolve/],
  [{code:'ECONNREFUSED'},/refused.*port/],
  [{code:'EHOSTUNREACH'},/cannot reach/],
  [{code:'ETIMEDOUT'},/timeout/],
  [{truenasFailure:'authentication'},/rejected API authentication.*not the VM or node password/],
  [{code:-32601,truenasFailure:'authentication'},/protocol.*current.*legacy/],
  [{code:-32000,truenasFailure:'authentication'},/limiting concurrent API requests/],
  [{providerStatus:404},/WebSocket endpoint/],
  [{providerStatus:403},/denied access/],
  [{providerErrno:13},/permission to call system.info/],
  [{code:'ECONNRESET'},/closed the connection/],
  [{truenasFailure:'response'},/invalid TrueNAS/],
  [{code:'ERR_SSL_WRONG_VERSION_NUMBER'},/TLS handshake/],
  [{},/not return a recognised failure reason/]
 ]){
  const message=truenasTestError({...error,message:'api-key-SECRET https://private-secret/path',reason:'certificate-SECRET'});
  assert.match(message,expected);assert.doesNotMatch(message,/SECRET|private-secret/);
 }
});
