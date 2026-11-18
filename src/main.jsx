import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  LobbyRouteKeeper,
  RouteBus,
  RouteStore,
  VirtualNetwork,
  VirtualNetworkConsoleLogger,
  VirtualNetworkEventType,
  VirtualNetworkLogFormatter,
} from 'privatepoker-p2p';
import './style.css';

class TestPeers {
  static peerAAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  static peerBAddress = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

  static peerAMeshUrl = 'http://127.0.0.1:3001/mesh';

  static peerBMeshUrl = 'http://127.0.0.1:3002/mesh';

  static peerAddress(value) {
    return String(value || TestPeers.peerAAddress);
  }

  static isPeerA(value) {
    return TestPeers.peerAddress(value).toLowerCase() === TestPeers.peerAAddress.toLowerCase();
  }

  static isPeerB(value) {
    return TestPeers.peerAddress(value).toLowerCase() === TestPeers.peerBAddress.toLowerCase();
  }

  static otherPeerAddress(value) {
    if (TestPeers.isPeerA(value)) return TestPeers.peerBAddress;
    if (TestPeers.isPeerB(value)) return TestPeers.peerAAddress;
    return TestPeers.peerBAddress;
  }

  static meshUrls(value) {
    if (TestPeers.isPeerB(value)) return [TestPeers.peerBMeshUrl];
    return [TestPeers.peerAMeshUrl];
  }

  static label(value) {
    if (TestPeers.isPeerA(value)) return 'Peer A';
    if (TestPeers.isPeerB(value)) return 'Peer B';
    return 'Peer';
  }

  static short(value) {
    return String(value || '0x??').slice(0, 4);
  }
}

class TestScreens {
  static lobby = 'lobby';

  static table = 'table';
}

/** The lobby channel keeps a background P2P edge alive on table 0. */
class LobbyChannel {
  static tableId = '0';
}

/** One table tab owns exactly one direct subscription. */
class TableChannel {
  static inboundLabel = 'inbound';

  static outboundLabel = 'outbound';
}

/** Shared configuration for cross-tab route discovery. */
class TestRoutes {
  static broadcastPrefix = 'privatepoker-p2p-testapp';

  static backgroundTableId = '0';

  static liveRouteTtlMs = 120_000;

  static routeBusChannel = `${TestRoutes.broadcastPrefix}:routes`;

  static routeStoreKey = `${TestRoutes.broadcastPrefix}:routes`;
}

class TestUrl {
  constructor(location) {
    this.location = location;
    this.params = new URLSearchParams(location.search);
  }

  screen() {
    return this.params.get('screen') ?? TestScreens.lobby;
  }

  peerAddress() {
    return this.params.get('peerAddress') ?? TestPeers.peerAAddress;
  }

  lobbyId() {
    return this.params.get('lobbyId') ?? '1';
  }

  tableId() {
    return this.params.get('tableId') ?? '1';
  }

  tableHref(form) {
    const params = new URLSearchParams();
    params.set('screen', TestScreens.table);
    params.set('peerAddress', TestPeers.peerAddress(form.peerAddress));
    params.set('lobbyId', String(form.lobbyId || '1'));
    params.set('tableId', String(form.tableId || '1'));
    return `${this.location.pathname}?${params.toString()}`;
  }
}

class PrivateKeyFactory {
  static create() {
    return crypto.getRandomValues(new Uint8Array(32));
  }
}

/**
 * Keeps the lobby's background edge in step with the table tabs.
 *
 * The keeper starts idle: it only listens on the route bus until a table tab
 * announces that it has a live P2P edge. Then it subscribes on the background
 * table so the lobby keeps a route after that table tab closes.
 */
class LobbyBackgroundSession {
  constructor(fields) {
    this.onEvent = fields.onEvent;
    this.ownerAddress = TestPeers.peerAddress(fields.ownerAddress);
    this.lobbyId = String(fields.lobbyId || '1');
    this.waitingRequest = null;
    this.keeper = new LobbyRouteKeeper(
      (event) => this.handleEvent(event),
      this.ownerAddress,
      PrivateKeyFactory.create(),
      {
        lobbyId: this.lobbyId,
        backgroundTableId: TestRoutes.backgroundTableId,
        timeoutMs: 20_000,
        meshUrls: TestPeers.meshUrls(this.ownerAddress),
        broadcastPrefix: TestRoutes.broadcastPrefix,
        role: 'lobby',
        liveRouteTtlMs: TestRoutes.liveRouteTtlMs,
      },
    );
  }

  start() {
    this.keeper.start();
  }

  stop() {
    this.keeper.stop();
  }

  acceptWaiting(request) {
    this.keeper.acceptWaitingRequest(request ?? this.waitingRequest);
    this.waitingRequest = null;
  }

  rejectWaiting(request) {
    this.keeper.rejectWaitingRequest(request ?? this.waitingRequest);
    this.waitingRequest = null;
  }

  handleEvent(event) {
    if (event.type === 'PeerWaitRequest') this.waitingRequest = event;
    this.onEvent?.(event);
  }
}

/**
 * Publishes a table's live P2P edge to the lobby and answers route questions
 * from the shared store. The table never talks to the lobby directly.
 */
class TableRoutePublisher {
  constructor(fields) {
    this.ownerAddress = TestPeers.peerAddress(fields.ownerAddress);
    this.lobbyId = String(fields.lobbyId || '1');
    this.tableId = String(fields.tableId || '1');
    this.bus = new RouteBus({ channelName: TestRoutes.routeBusChannel });
    this.store = new RouteStore({
      storageKey: TestRoutes.routeStoreKey,
      liveRouteTtlMs: TestRoutes.liveRouteTtlMs,
    });
  }

  routeOracle(route) {
    return this.store.hasLivePeerRoute({
      ownerAddress: this.ownerAddress,
      peerAddress: route.peerAddress,
      lobbyId: route.lobbyId,
      backgroundTableId: TestRoutes.backgroundTableId,
    });
  }

  handleEvent(event) {
    if (event.type !== VirtualNetworkEventType.PEER_CONNECTED) return;
    VirtualNetworkConsoleLogger.log('testapp.table.keep-route', {
      ownerAddress: this.ownerAddress,
      peerAddress: event.peerAddress,
      lobbyId: this.lobbyId,
      tableId: this.tableId,
    });
    this.bus.publishKeepRoute({
      ownerAddress: this.ownerAddress,
      peerAddress: event.peerAddress,
      lobbyId: this.lobbyId,
      tableId: this.tableId,
    });
  }

  close() {
    this.bus.close();
  }
}

class JsonValueFormatter {
  static format(value) {
    if (value instanceof Error) return value.message;
    if (value && typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}

class EventRecord {
  constructor(event) {
    this.id = crypto.randomUUID();
    this.event = event;
  }
}

function useEventLog() {
  const eventState = React.useState([]);
  const append = React.useCallback((event) => {
    VirtualNetworkConsoleLogger.log('testapp.connection', {
      type: event.type,
      step: event.step,
      via: event.via,
      state: event.state,
      peerAddress: event.peerAddress,
      from: event.from,
      to: event.to,
      lobbyId: event.lobbyId,
      tableId: event.tableId,
    });
    eventState[1]((events) => [new EventRecord(event), ...events].slice(0, 300));
  }, []);
  return {
    events: eventState[0],
    append,
  };
}

function useVirtualNetwork(fields) {
  const handlerRef = React.useRef(fields.handler);
  const networkRef = React.useRef(null);
  const networkKey = [
    TestPeers.peerAddress(fields.address).toLowerCase(),
    fields.role,
    fields.lobbyId,
    fields.tableId,
    fields.name,
  ].join(':');

  handlerRef.current = fields.handler;

  if (!networkRef.current || networkRef.current.key !== networkKey) {
    VirtualNetworkConsoleLogger.log('testapp.network.create', {
      key: networkKey,
      address: TestPeers.peerAddress(fields.address),
      role: fields.role,
      lobbyId: fields.lobbyId,
      tableId: fields.tableId,
      meshUrls: TestPeers.meshUrls(fields.address),
    });
    networkRef.current = {
      key: networkKey,
      network: new VirtualNetwork(
        (event) => handlerRef.current(event),
        TestPeers.peerAddress(fields.address),
        PrivateKeyFactory.create(),
        {
          lobbyId: fields.lobbyId,
          tableId: fields.tableId,
          meshUrls: TestPeers.meshUrls(fields.address),
          broadcastPrefix: TestRoutes.broadcastPrefix,
          role: fields.role,
          routeOracle: fields.routeOracle,
        },
      ),
    };
  }

  React.useEffect(() => {
    const created = networkRef.current;
    return () => created?.network.close();
  }, [networkKey]);

  return networkRef.current.network;
}

function Logo() {
  return (
    <div className="logo">
      <div className="logo-brand">PRIVATE POKER</div>
      <div className="logo-protocol">IMPERFECT PROTOCOL</div>
    </div>
  );
}

function JsonFieldTable(props) {
  return (
    <table>
      <tbody>
        {Object.keys(props.event).map((key) => (
          <tr key={key}>
            <th>{key}</th>
            <td>{JsonValueFormatter.format(props.event[key])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LogRow(props) {
  const expandedState = React.useState(false);
  const formatter = new VirtualNetworkLogFormatter(props.localAddress, props.record.event);
  const eventJson = JSON.stringify(props.record.event, null, 2);
  const className = expandedState[0] ? 'log-entry expanded' : 'log-entry';

  return (
    <div className={className}>
      <div
        className="log-summary"
        title={eventJson}
        role="button"
        tabIndex={0}
        onClick={() => expandedState[1](!expandedState[0])}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') expandedState[1](!expandedState[0]);
        }}
      >
        {formatter.text()}
      </div>
      {expandedState[0] && (
        <div className="log-details">
          <JsonFieldTable event={props.record.event} />
        </div>
      )}
    </div>
  );
}

function EventLogPanel(props) {
  return (
    <div className="log-panel">
      {props.events.map((record) => (
        <LogRow key={record.id} record={record} localAddress={props.localAddress} />
      ))}
    </div>
  );
}

function ReceivedMessages(props) {
  return (
    <div className="received-messages">
      {props.messages.length === 0
        ? <p className="received-empty">No messages received.</p>
        : props.messages.map((message) => (
          <div className="received-message" key={message.id}>{message.text}</div>
        ))}
    </div>
  );
}

function Field(props) {
  return (
    <label>
      {props.label}
      <input
        type="text"
        value={props.value}
        readOnly={Boolean(props.readOnly)}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function PeerAddressField(props) {
  return (
    <div className="peer-selector">
      <Field label="Peer address" value={props.peerAddress} readOnly onChange={() => {}} />
      <button type="button" onClick={props.onChoosePeer}>
        Choose Peer
      </button>
    </div>
  );
}

function PeerSelectionDialog(props) {
  const draftState = React.useState(props.peerAddress);

  React.useEffect(() => {
    draftState[1](props.peerAddress);
  }, [props.peerAddress]);

  if (!props.open) return null;

  return (
    <div className="modal-backdrop">
      <section className="peer-dialog" role="dialog" aria-modal="true" aria-labelledby="peer-dialog-title">
        <h2 id="peer-dialog-title">Select Peer</h2>
        <Field label="Peer Address" value={draftState[0]} onChange={draftState[1]} />
        <div className="dialog-button-row">
          <button type="button" onClick={() => draftState[1](TestPeers.peerAAddress)}>
            Peer A
          </button>
          <button type="button" onClick={() => draftState[1](TestPeers.peerBAddress)}>
            Peer B
          </button>
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={() => props.onConfirm(draftState[0])}>
            OK
          </button>
        </div>
      </section>
    </div>
  );
}

function useConnectionStatus(log) {
  const statusState = React.useState('idle');
  const handler = React.useCallback((event) => {
    log.append(event);
    if (event.type === VirtualNetworkEventType.PEER_CONNECTED) statusState[1]('connected');
    if (event.type === VirtualNetworkEventType.PEER_DISCONNECTED) statusState[1]('disconnected');
    if (event.type === VirtualNetworkEventType.CONNECTION_TIMEOUT) statusState[1]('timeout');
    if (event.type === VirtualNetworkEventType.CONNECTION_FAILED) statusState[1]('failed');
    if (event.type === VirtualNetworkEventType.PEER_WAITING) statusState[1]('waiting');
  }, [log.append]);
  return {
    status: statusState[0],
    handler,
  };
}

function useLobbyRouteKeeper(fields) {
  const log = useEventLog();
  const connection = useConnectionStatus(log);
  const waitingState = React.useState(null);
  const sessionRef = React.useRef(null);
  const handlerRef = React.useRef(null);

  handlerRef.current = (event) => {
    connection.handler(event);
    if (event.type === 'PeerWaitRequest') waitingState[1](event);
  };

  React.useEffect(() => {
    const session = new LobbyBackgroundSession({
      ownerAddress: fields.peerAddress,
      lobbyId: fields.lobbyId,
      onEvent: (event) => handlerRef.current(event),
    });
    sessionRef.current = session;
    VirtualNetworkConsoleLogger.log('testapp.lobby.keeper.start', {
      peerAddress: session.ownerAddress,
      lobbyId: session.lobbyId,
      backgroundTableId: TestRoutes.backgroundTableId,
    });
    session.start();
    return () => {
      VirtualNetworkConsoleLogger.log('testapp.lobby.keeper.stop', {
        peerAddress: session.ownerAddress,
        lobbyId: session.lobbyId,
      });
      session.stop();
      if (sessionRef.current === session) sessionRef.current = null;
      waitingState[1](null);
    };
  }, [fields.peerAddress, fields.lobbyId]);

  return {
    events: log.events,
    status: connection.status,
    waitingRequest: waitingState[0],
    acceptWaiting: (request) => sessionRef.current?.acceptWaiting(request),
    rejectWaiting: (request) => sessionRef.current?.rejectWaiting(request),
  };
}

function LobbyBackgroundKeeper(props) {
  const keeper = useLobbyRouteKeeper({
    peerAddress: props.peerAddress,
    lobbyId: props.lobbyId,
  });

  return (
    <section className="background-panel">
      <h2>Lobby Background Network</h2>
      <p>
        {TestPeers.label(props.peerAddress)} keeps a background P2P edge on lobby
        channel table {LobbyChannel.tableId}, but only after a table tab reports a
        live edge.
        {' '}
        Status: {keeper.status}.
      </p>
      {keeper.waitingRequest && (
        <div className="peer-waiting">
          <p>
            {TestPeers.short(keeper.waitingRequest.peerAddress)} wants a P2P route on
            table {keeper.waitingRequest.tableId}.
          </p>
          <div className="dialog-button-row">
            <button type="button" onClick={() => keeper.acceptWaiting(keeper.waitingRequest)}>
              Accept
            </button>
            <button type="button" onClick={() => keeper.rejectWaiting(keeper.waitingRequest)}>
              Later
            </button>
          </div>
        </div>
      )}
      <EventLogPanel events={keeper.events} localAddress={props.peerAddress} />
    </section>
  );
}

function LobbyScreen() {
  const url = new TestUrl(window.location);
  const peerAddressState = React.useState(url.peerAddress());
  const peerDialogOpenState = React.useState(!url.params.has('peerAddress'));
  const peerSelectedState = React.useState(url.params.has('peerAddress'));
  const lobbyIdState = React.useState(url.lobbyId());
  const tableIdState = React.useState(url.tableId());

  const confirmPeer = (peerAddress) => {
    peerAddressState[1](TestPeers.peerAddress(peerAddress));
    peerSelectedState[1](true);
    peerDialogOpenState[1](false);
  };

  const joinTable = () => {
    if (!peerSelectedState[0]) {
      peerDialogOpenState[1](true);
      return;
    }
    const href = url.tableHref({
      peerAddress: peerAddressState[0],
      lobbyId: lobbyIdState[0],
      tableId: tableIdState[0],
    });
    VirtualNetworkConsoleLogger.log('testapp.table.open', { href });
    window.open(href, '_blank');
  };

  return (
    <>
      <Logo />
      <PeerSelectionDialog
        open={peerDialogOpenState[0]}
        peerAddress={peerAddressState[0]}
        onConfirm={confirmPeer}
      />
      <section>
        <h2>Lobby</h2>
        <div className="lobby-form">
          <PeerAddressField
            peerAddress={peerAddressState[0]}
            onChoosePeer={() => peerDialogOpenState[1](true)}
          />
          <Field label="Lobby" value={lobbyIdState[0]} onChange={lobbyIdState[1]} />
          <div className="join-row">
            <button type="button" onClick={joinTable}>Join Table</button>
            <Field label="Table" value={tableIdState[0]} onChange={tableIdState[1]} />
          </div>
        </div>
      </section>
      {peerSelectedState[0] && (
        <LobbyBackgroundKeeper
          peerAddress={peerAddressState[0]}
          lobbyId={lobbyIdState[0]}
        />
      )}
    </>
  );
}

function TableNetworkPanel(props) {
  const log = useEventLog();
  const connection = useConnectionStatus(log);
  const messageState = React.useState([]);
  const publisher = React.useMemo(() => new TableRoutePublisher({
    ownerAddress: props.peerAddress,
    lobbyId: props.lobbyId,
    tableId: props.tableId,
  }), [props.peerAddress, props.lobbyId, props.tableId]);
  const handler = React.useCallback((event) => {
    connection.handler(event);
    publisher.handleEvent(event);
    if (event.type === VirtualNetworkEventType.MESSAGE_RECEIVED) {
      messageState[1]((messages) => [{
        id: crypto.randomUUID(),
        text: JsonValueFormatter.format(event.messageData?.text ?? event.messageData),
      }, ...messages].slice(0, 20));
    }
  }, [connection.handler, publisher]);
  const network = useVirtualNetwork({
    name: 'table',
    role: 'table',
    address: props.peerAddress,
    lobbyId: props.lobbyId,
    tableId: props.tableId,
    handler,
    routeOracle: (route) => publisher.routeOracle(route),
  });

  React.useEffect(() => () => publisher.close(), [publisher]);

  const subscribe = React.useCallback(() => {
    VirtualNetworkConsoleLogger.log('testapp.table.subscribe', {
      peerAddress: props.peerAddress,
      peerAddressToSubscribe: props.peerAddressToSubscribe,
      lobbyId: props.lobbyId,
      tableId: props.tableId,
    });
    network.subscribe(
      TableChannel.inboundLabel,
      TableChannel.outboundLabel,
      props.peerAddressToSubscribe,
      20_000,
      props.lobbyId,
      props.tableId,
    );
  }, [network, props.peerAddress, props.peerAddressToSubscribe, props.lobbyId, props.tableId]);

  React.useEffect(() => {
    subscribe();
    return () => network.unsubscribe(TableChannel.inboundLabel);
  }, [network, subscribe]);

  const sendMessage = () => {
    VirtualNetworkConsoleLogger.log('testapp.table.send', {
      peerAddress: props.peerAddress,
      peerAddressToSubscribe: props.peerAddressToSubscribe,
      lobbyId: props.lobbyId,
      tableId: props.tableId,
    });
    network.send(TableChannel.outboundLabel, {
      text: `hello from ${TestPeers.label(props.peerAddress)}`,
      lobbyId: props.lobbyId,
      tableId: props.tableId,
      sentAt: Date.now(),
    });
  };

  return (
    <section>
      <h2>{TestPeers.label(props.peerAddress)}: {TestPeers.short(props.peerAddress)}</h2>
      <p>
        Lobby {props.lobbyId}, table {props.tableId}.
        {' '}
        Direct P2P edge to {TestPeers.short(props.peerAddressToSubscribe)}: {connection.status}.
      </p>
      <button type="button" onClick={subscribe}>
        Reconnect to {TestPeers.short(props.peerAddressToSubscribe)}
      </button>
      <button type="button" onClick={sendMessage}>
        Send Message
      </button>
      <ReceivedMessages messages={messageState[0]} />
      <EventLogPanel events={log.events} localAddress={props.peerAddress} />
    </section>
  );
}

function TableScreen() {
  const url = new TestUrl(window.location);
  const peerAddress = url.peerAddress();
  const peerAddressToSubscribe = TestPeers.otherPeerAddress(peerAddress);

  return (
    <>
      <Logo />
      <nav>
        <a href={window.location.pathname}>Lobby</a>
      </nav>
      <div className="grid single">
        <TableNetworkPanel
          peerAddress={peerAddress}
          peerAddressToSubscribe={peerAddressToSubscribe}
          lobbyId={url.lobbyId()}
          tableId={url.tableId()}
        />
      </div>
    </>
  );
}

function App() {
  const url = new TestUrl(window.location);
  if (url.screen() === TestScreens.table) return <TableScreen />;
  return <LobbyScreen />;
}

createRoot(document.getElementById('app')).render(<App />);
