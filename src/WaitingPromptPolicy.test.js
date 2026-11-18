import assert from 'node:assert/strict';
import test from 'node:test';
import { WaitingPromptPolicy } from './WaitingPromptPolicy.js';

const PEER_A = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function waitRequest(requestId, tableId = '151') {
  return {
    type: 'PeerWaitRequest',
    requestId,
    peerAddress: PEER_A,
    lobbyId: '1',
    tableId,
  };
}

function preserveRoute(tableId = '151') {
  return {
    type: 'BackgroundRoute',
    step: 'PreserveRouteAccepted',
    peerAddress: PEER_A,
    lobbyId: '1',
    tableId,
  };
}

test('a fresh request overrides a previously accepted scope', () => {
  const policy = new WaitingPromptPolicy();

  assert.equal(policy.apply(waitRequest('request-1')).kind, 'request');
  assert.equal(policy.apply(preserveRoute()).kind, 'clear');
  assert.equal(policy.apply(waitRequest('request-2')).kind, 'request');
  assert.equal(policy.request.requestId, 'request-2');
});

test('a fresh request overrides a previously dismissed scope', () => {
  const policy = new WaitingPromptPolicy();

  assert.equal(policy.apply(waitRequest('request-1')).kind, 'request');
  assert.equal(policy.apply({ ...waitRequest('request-1'), type: 'PeerWaitRejected' }).kind, 'clear');
  assert.equal(policy.apply(waitRequest('request-2')).kind, 'request');
  assert.equal(policy.request.requestId, 'request-2');
});

test('a repeated request id stays suppressed after Later', () => {
  const policy = new WaitingPromptPolicy();
  const request = waitRequest('request-1');

  assert.equal(policy.apply(request).kind, 'request');
  policy.dismiss({ peerAddress: PEER_A, lobbyId: '1', tableId: '151' });
  assert.equal(policy.apply(request).kind, 'ignore');
  assert.equal(policy.request, null);
});

test('a connected route only clears its own prompt', () => {
  const policy = new WaitingPromptPolicy();

  policy.apply(waitRequest('request-1', '151'));
  const decision = policy.apply(preserveRoute('152'));

  assert.equal(decision.kind, 'ignore');
  assert.equal(policy.request.requestId, 'request-1');
});
