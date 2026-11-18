/**
 * One-line explanations for internal protocol records.
 *
 * The expanded row remains the raw event; this only makes the collapsed row
 * answer "why did this message happen?" without reading the JSON payload.
 */
export class InternalMessageSummary {
  static PREFIXES = ['neural.routing.', 'neural.', 'tab-bus.', 'lobby.', 'testapp.'];

  static short(value) {
    const text = String(value ?? '');
    if (text.length === 0) return '—';
    if (text.length <= 12) return text;
    return `${text.slice(0, 6)}…${text.slice(-4)}`;
  }

  static id(value) {
    const text = String(value ?? '');
    if (text.length === 0) return '—';
    if (text.length <= 18) return text;
    return `${text.slice(0, 10)}…${text.slice(-6)}`;
  }

  static text(label, event) {
    return new InternalMessageSummary(label, event).text();
  }

  constructor(label, event) {
    this.label = String(label ?? '');
    this.fields = event && typeof event === 'object' ? event : {};
  }

  text() {
    const rule = InternalMessageSummary.RULES[this.stage()];
    return rule ? rule(this) : this.fallback();
  }

  stage() {
    const prefix = InternalMessageSummary.PREFIXES.find((value) => this.label.startsWith(value));
    if (!prefix) return this.label;
    const group = prefix.slice(0, -1).split('.').pop();
    return `${group}/${this.label.slice(prefix.length)}`;
  }

  addr(name) {
    return InternalMessageSummary.short(this.fields[name]);
  }

  peer() {
    const value = this.fields.peerAddress ?? this.fields.target ?? this.fields.to
      ?? this.fields.sender ?? this.fields.destination ?? this.fields.origin ?? this.fields.from;
    return InternalMessageSummary.short(value);
  }

  seq() {
    return this.fields.sequenceId === undefined ? '' : ` #${this.fields.sequenceId}`;
  }

  num(name, fallback = '?') {
    return this.fields[name] ?? fallback;
  }

  attempt() {
    return this.fields.attempt ?? this.fields.routeAttempt ?? this.fields.attempts ?? '?';
  }

  payload() {
    const value = this.fields.payloadType ?? this.fields.messageType ?? this.fields.type;
    return value ? ` ${value}` : '';
  }

  error() {
    return this.fields.error ?? String(this.fields);
  }

  id(name) {
    return InternalMessageSummary.id(this.fields[name]);
  }

  signalId() {
    const text = String(this.fields.signal ?? '');
    const kind = String(this.fields.kind ?? '');
    if (kind && text.startsWith(`${kind}:`)) {
      return InternalMessageSummary.id(text.slice(kind.length + 1));
    }
    return InternalMessageSummary.id(text);
  }

  list(name) {
    const values = this.fields[name];
    if (!Array.isArray(values) || values.length === 0) return 'none';
    return values.map((value) => InternalMessageSummary.short(value)).join(', ');
  }

  kinds() {
    const values = this.fields.kinds;
    if (!Array.isArray(values) || values.length === 0) return 'signals';
    return values.map((value) => String(value)).join(', ');
  }

  sessionLabel() {
    return this.fields.session?.subscriptionLabel ?? 'session';
  }

  stored() {
    return this.fields.metrics?.storedCombinations ?? this.fields.storedCombinations ?? '?';
  }

  fallback() {
    try {
      return `${this.label} ${JSON.stringify(this.fields)}`;
    } catch {
      return this.label;
    }
  }
}

InternalMessageSummary.RULES = {
  'routing/node.start': (s) => `Neural node started with ${s.num('neighbours', 0)} direct neighbour(s)`,
  'routing/node.stop': (s) => `Neural node stopped; tensor holds ${s.stored()} stored combination(s)`,
  'routing/beacon.emit': (s) => `Beacon${s.seq()}: publish my whole A→* row so neighbours can choose a next hop for every target`,
  'routing/announce.request': (s) => `Announce${s.seq()} →${s.addr('target')}: ask the overlay to find a peer with no direct edge yet (attempt ${s.attempt()}${s.payload()})`,
  'routing/relay.request': (s) => `Relay${s.seq()} →${s.addr('target')}: send${s.payload()} through the learned route`,
  'routing/neighbour.confirmed': (s) => `Direct edge to ${s.addr('peer')} confirmed; warm-start its tensor cell`,
  'routing/neighbour.removed': (s) => `Direct edge to ${s.addr('peer')} removed; drop its route reminder`,
  'routing/receive.failed': (s) => `Bundle from ${s.addr('sender')} failed to process: ${s.error()}`,
  'routing/receive.decode-failed': (s) => `Tensor from ${s.addr('sender')} could not be decoded: ${s.error()}`,
  'routing/receive.duplicate': (s) => `Duplicate signal ${s.signalId()} from ${s.addr('sender')} ignored`,
  'routing/receive.signal': (s) => `Accepted ${s.fields.kind ?? 'signal'} ${s.signalId()} from ${s.addr('sender')}: ${s.num('hopCount')} hop(s), ${s.num('paths')} path(s)`,
  'routing/feedback.delivered': (s) => `Feedback ${s.signalId()} reached its origin; the reverse route is now confirmed`,
  'routing/announce.discovered': (s) => `Announce from ${s.addr('origin')} reached me over ${s.num('hopCount')} hop(s); remember ${s.num('paths')} path(s) back${s.payload()}`,
  'routing/signal.coalesce': (s) => `${s.fields.replaced ? 'Replace' : 'Keep'} one pending copy of ${s.id('key')}; queue size ${s.num('queue')}`,
  'routing/signal.coalesce.kept': (s) => `Keep the existing copy of ${s.id('key')}; queue size ${s.num('queue')}`,
  'routing/announce.coalesce': (s) => `Merge announce ${s.id('key')}; attempt ${s.attempt()}, ${s.num('paths')} distinct path(s) kept`,
  'routing/beacon.merge': (s) => `Merge ${s.addr('origin')}'s row from ${s.list('arrivals')}: ${s.num('paths')} remembered path(s)`,
  'routing/tensor.reward': (s) => `Reward ${s.fields.kind ?? 'signal'} cell ${s.signalId()} toward ${s.addr('neighbour')} by ${s.num('reward')}; tensor has ${s.num('combinations')} combination(s)`,
  'routing/tensor.row-reward': (s) => `Reward ${s.addr('origin')}'s whole row toward ${s.addr('neighbour')} by ${s.num('reward')} because its beacon arrived`,
  'routing/flush.start': (s) => `Stun window closed at timer ${s.num('timerFires')}: route ${s.num('work')} work item(s) across ${s.num('neighbours')} neighbour(s), ${s.num('pending')} pending`,
  'routing/announce.deliver': (s) => `Announce from ${s.addr('origin')} delivered after ${s.num('hopCount')} hop(s); send feedback down ${s.num('paths')} arrival path(s)${s.payload()}`,
  'routing/relay.deliver': (s) => `Relay${s.seq()} from ${s.addr('origin')} delivered; run${s.payload()} locally`,
  'routing/announce.exhausted': (s) => `Announce to ${s.addr('target')} exhausted after ${s.attempt()} attempt(s); hand off to mesh fallback`,
  'routing/announce.retry': (s) => `Retry announce to ${s.addr('target')} with attempt ${s.attempt()} because no learned route answered`,
  'routing/route.choice': (s) => `${s.fields.kind ?? 'signal'} ${s.signalId()} → ${s.list('destinations')}: chose ${s.fields.reason ?? 'unknown'}${s.fields.smart ? ' from tensor' : ' by ripple'}`,
  'routing/route.drop.ttl': (s) => `Drop signal ${s.signalId()}: TTL reached ${s.num('ttl')}`,
  'routing/route.drop.return-path': (s) => `Drop feedback ${s.signalId()}: next hop ${s.addr('next')} is no longer connected`,
  'routing/route.drop.no-route': (s) => `Drop signal ${s.signalId()}: no eligible neighbour remains`,
  'routing/beacon.split': (s) => `Split ${s.addr('origin')}'s row ${s.fields.own ? '(own)' : '(forwarded)'} into ${s.list('destinations')}; never echo to ${s.list('arrivals')}`,
  'routing/bundle.encode-failed': (s) => `Bundle to ${s.addr('destination')} could not be encoded: ${s.error()}`,
  'routing/bundle.send': (s) => `Flush ${s.num('signals')} signal(s) to ${s.addr('destination')} in one ${s.fields.codec ?? 'compressed'} bundle (${s.kinds()}, ${s.num('paths')} path(s))`,
  'routing/tensor.denoise': (s) => `Wavelet-threshold tensor: ${s.num('pruned')} coefficient(s) pruned, ${s.num('coefficientCount')} kept`,
  'routing/wake.scheduled': (s) => `Schedule the next beacon/retry wake in ${s.num('inMs')}ms`,
  'routing/stun.armed': (s) => `Coalesce ${s.num('count')} signal(s) into one flush after ${s.num('delayMs')}ms`,
  'routing/codec.encoded': (s) => `Compress ${s.num('signals')} signal embedding(s) into ${s.num('coefficientCount')} coefficient(s) for transport`,
  'routing/codec.decoded': (s) => `Decompress ${s.num('signals')} signal embedding(s) from ${s.num('coefficientCount')} coefficient(s)`,
  'neural/relay.control': (s) => `Relay ${s.fields.messageType ?? 'control'} from the ${s.fields.senderRole ?? 'peer'} tab → ${s.addr('peerAddress')} because that tab has no direct edge`,
  'neural/transport.unreachable': (s) => `Neural bundle to ${s.addr('peerAddress')} dropped: ${s.num('signals')} signal(s) but no connected WebRTC edge`,
  'neural/fallback.known-route': (s) => `Skip mesh fallback for ${s.addr('peerAddress')}: a live lobby route already exists`,
  'neural/fallback.request': (s) => `Ask mesh to reconnect ${s.addr('peerAddress')}: neural retries were exhausted`,
  'neural/transport.receive': (s) => `Neural bundle from ${s.addr('sender')} accepted: ${s.num('signals')} signal(s) to learn and merge`,
  'tab-bus/broadcast.ready': () => 'Open BroadcastChannel so the Lobby and Table tabs exchange messages',
  'tab-bus/session.register': (s) => `Register ${s.sessionLabel()} (${s.fields.role ?? 'peer'}) in this tab's control bus`,
  'tab-bus/session.unregister': (s) => `Unregister ${s.sessionLabel()} (${s.fields.role ?? 'peer'}) from this tab's control bus`,
  'tab-bus/post': (s) => `Publish ${s.fields.messageType ?? 'control'} from ${s.addr('from')} → ${s.addr('to')} to the Lobby/Table tab channel`,
  'lobby/tunnel.forward': (s) => `Tunnel ${s.fields.messageType ?? 'control'} from the Table tab → ${s.addr('peerAddress')} over the Lobby's background edge`,
  'lobby/find.gossip': (s) => `Ask the Lobby to find ${s.addr('peerAddress')} through P2P gossip first`,
  'lobby/find.mesh-fallback': (s) => `Fall back to MeshServer for ${s.addr('peerAddress')} because gossip was exhausted`,
  'lobby/find.route-ready': (s) => `Lobby background route to ${s.addr('peerAddress')} is ready for the Table tab`,
  'lobby/find.route-failed': (s) => `Lobby could not establish a background route to ${s.addr('peerAddress')}`,
  'lobby/route.request': (s) => `Table tab asks its Lobby for a background route to ${s.addr('peerAddress')}`,
  'lobby/route.ready': (s) => `Lobby answered with a live background route to ${s.addr('peerAddress')}`,
  'lobby/route.failed': (s) => `Table tab was told that no Lobby background route exists to ${s.addr('peerAddress')}`,
  'testapp/table.session.create': (s) => `Create the Table tab session for lobby ${s.num('lobbyId')}, table ${s.num('tableId')}`,
  'testapp/lobby.session.start': () => 'Lobby tab starts idle; it connects only when a Table tab asks for a peer',
  'testapp/lobby.session.stop': () => 'Lobby tab closes and drops all in-memory background state',
  'testapp/table.open': () => 'Open a table tab that asks its Lobby for the first peer route',
  'testapp/table.open-from-wait': () => 'Open the waiting table tab through the live Lobby background route',
  'testapp/table.subscribe': (s) => `Ask the protocol to establish the table channel toward ${s.addr('peerAddressToSubscribe')}`,
  'testapp/table.send': () => 'Send a test chat message through the table channel',
  'testapp/copy-logs.failed': (s) => `Clipboard copy failed: ${s.error()}`,
};
