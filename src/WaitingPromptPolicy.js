export class WaitingScope {
  static from(value) {
    return new WaitingScope({
      peerAddress: value?.peerAddress ?? value?.from,
      lobbyId: value?.lobbyId,
      tableId: value?.tableId,
    });
  }

  constructor(fields) {
    this.peerAddress = String(fields.peerAddress ?? '').toLowerCase();
    this.lobbyId = String(fields.lobbyId ?? '');
    this.tableId = String(fields.tableId ?? '');
  }

  get key() {
    return `${this.peerAddress}:${this.lobbyId}:${this.tableId}`;
  }

  matches(value) {
    return this.key === WaitingScope.from(value).key;
  }
}

/**
 * Decides when a lobby shows the "peer is waiting" prompt.
 *
 * A request id identifies one announcement. A new id for an existing scope is
 * a fresh request, even when that scope was previously accepted or dismissed;
 * repeating the same id is only a retry and stays suppressed.
 */
export class WaitingPromptPolicy {
  constructor() {
    this.reset();
  }

  reset() {
    this.request = null;
    this.connectedScopes = new Set();
    this.dismissedScopes = new Set();
    this.requestIds = new Map();
  }

  apply(event) {
    const scope = WaitingScope.from(event);
    if (event.type === 'PeerWaitRequest') return this.receiveRequest(event, scope);
    if (event.type === 'BackgroundRoute' && event.step === 'PreserveRouteAccepted') {
      return this.accept(scope);
    }
    if (event.type === 'PeerWaitRejected') return this.dismiss(scope);
    return { kind: 'ignore' };
  }

  receiveRequest(event, scope) {
    if (this.requestIds.get(scope.key) === event.requestId) return { kind: 'ignore' };
    this.requestIds.set(scope.key, event.requestId);
    this.connectedScopes.delete(scope.key);
    this.dismissedScopes.delete(scope.key);
    this.request = event;
    return { kind: 'request', request: event };
  }

  accept(scope) {
    this.connectedScopes.add(scope.key);
    this.dismissedScopes.delete(scope.key);
    return this.clearMatching(scope);
  }

  dismiss(value) {
    const scope = value instanceof WaitingScope ? value : WaitingScope.from(value);
    this.dismissedScopes.add(scope.key);
    return this.clearMatching(scope);
  }

  clearMatching(scope) {
    if (this.request === null || !scope.matches(this.request)) return { kind: 'ignore' };
    this.request = null;
    return { kind: 'clear' };
  }
}
