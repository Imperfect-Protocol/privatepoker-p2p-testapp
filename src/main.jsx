import React from 'react';
import { createRoot } from 'react-dom/client';
import { VirtualNetwork, VirtualNetworkConsoleLogger, VirtualNetworkLogFormatter } from 'privatepoker-p2p';
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

class LobbyChannel {
  static tableId = '0';
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

class RouteKey {
  constructor(fields) {
    this.ownerAddress = TestPeers.peerAddress(fields.ownerAddress).toLowerCase();
    this.peerAddress = TestPeers.peerAddress(fields.peerAddress).toLowerCase();
    this.lobbyId = String(fields.lobbyId || '1');
    this.tableId = String(fields.tableId || '1');
  }

  toString() {
    return [
      this.ownerAddress,
      this.peerAddress,
      this.lobbyId,
      this.tableId,
    ].join(':');
  }
}

class BackgroundRouteStore {
  static storageKey = 'privatepoker-p2p-testapp:routes';

  static routeTtlMs = 15 * 60 * 1000;

  static read() {
    try {
      return JSON.parse(localStorage.getItem(BackgroundRouteStore.storageKey) || '{}');
    } catch {
      return {};
    }
  }

  static write(records) {
    localStorage.setItem(BackgroundRouteStore.storageKey, JSON.stringify(records));
  }

  static remember(fields) {
    const records = BackgroundRouteStore.read();
    const routeKey = new RouteKey(fields).toString();
    records[routeKey] = Date.now();
    BackgroundRouteStore.write(records);
  }

  static has(fields) {
    const records = BackgroundRouteStore.read();
    const routeKey = new RouteKey(fields).toString();
    const timestamp = Number(records[routeKey] || 0);
    return timestamp > 0 && Date.now() - timestamp < BackgroundRouteStore.routeTtlMs;
  }
}

class BackgroundRouteBus {
  constructor() {
    this.channel = new BroadcastChannel('privatepoker-p2p-testapp:background-routes');
  }

  publish(type, fields) {
    const message = {
      ...fields,
      type,
      sentAt: Date.now(),
    };
    VirtualNetworkConsoleLogger.log('testapp.background-route.publish', message);
    this.channel.postMessage(message);
  }

  listen(callback) {
    this.channel.onmessage = (event) => {
      VirtualNetworkConsoleLogger.log('testapp.background-route.recv', event.data);
      callback(event.data);
    };
  }

  close() {
    this.channel.close();
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
    VirtualNetworkConsoleLogger.log('testapp.event', event);
    eventState[1]((events) => [new EventRecord(event), ...events].slice(0, 300));
  }, []);
  return {
    events: eventState[0],
    append,
  };
}

function useVirtualNetwork(fields) {
  const handlerRef = React.useRef(fields.handler);
  const routeOracleRef = React.useRef(fields.routeOracle);
  const networkRef = React.useRef(null);
  const networkKey = [
    TestPeers.peerAddress(fields.address).toLowerCase(),
    fields.lobbyId,
    fields.tableId,
    fields.name,
  ].join(':');

  handlerRef.current = fields.handler;
  routeOracleRef.current = fields.routeOracle;

  if (!networkRef.current || networkRef.current.key !== networkKey) {
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
          broadcastPrefix: 'privatepoker-p2p-testapp',
          role: fields.role,
          routeOracle: (route) => routeOracleRef.current?.(route),
        },
      ),
    };
  }

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

function LobbyBackgroundNetwork(props) {
  const log = useEventLog();
  const connectedRef = React.useRef(false);
  const preservedRouteRef = React.useRef(null);
  const keepRouteRef = React.useRef(false);
  const handler = React.useCallback((event) => {
    log.append(event);
    if (event.type === 'PeerConnected') {
      connectedRef.current = true;
      if (keepRouteRef.current && preservedRouteRef.current) {
        BackgroundRouteStore.remember(preservedRouteRef.current);
      }
    }
    if (event.type === 'PeerDisconnected') connectedRef.current = false;
  }, [props.peerAddress, props.peerAddressToSubscribe, props.lobbyId, props.tableId]);
  const network = useVirtualNetwork({
    name: 'lobby',
    role: 'lobby',
    address: props.peerAddress,
    lobbyId: props.lobbyId,
    tableId: LobbyChannel.tableId,
    handler,
    routeOracle: (route) => (
      keepRouteRef.current
      && TestPeers.peerAddress(route.peerAddress).toLowerCase() === TestPeers.peerAddress(props.peerAddressToSubscribe).toLowerCase()
      && String(route.lobbyId) === String(props.lobbyId)
      && String(route.tableId) === LobbyChannel.tableId
    ),
  });

  React.useEffect(() => {
    const bus = new BackgroundRouteBus();
    const ensureBackgroundSubscription = () => {
      network.subscribe(
        'lobby-inbound',
        'lobby-outbound',
        props.peerAddressToSubscribe,
        10_000,
        props.lobbyId,
        LobbyChannel.tableId,
      );
    };

    bus.listen((message) => {
      if (message.type !== 'keep-route') return;
      if (TestPeers.peerAddress(message.ownerAddress).toLowerCase() !== TestPeers.peerAddress(props.peerAddress).toLowerCase()) return;
      if (String(message.lobbyId) !== String(props.lobbyId)) return;
      if (String(message.tableId) !== String(props.tableId)) return;

      keepRouteRef.current = true;
      preservedRouteRef.current = message;
      log.append({
        type: 'BackgroundRoute',
        step: 'PreserveRouteAccepted',
        ownerAddress: message.ownerAddress,
        peerAddress: message.peerAddress,
        lobbyId: message.lobbyId,
        tableId: message.tableId,
        backgroundTableId: LobbyChannel.tableId,
      });
      ensureBackgroundSubscription();
      if (connectedRef.current) {
        BackgroundRouteStore.remember(preservedRouteRef.current);
        bus.publish('route-available', message);
      }
    });

    return () => {
      network.unsubscribe('lobby-inbound');
      bus.close();
    };
  }, [network, props.peerAddress, props.peerAddressToSubscribe, props.lobbyId, props.tableId]);

  return (
    <section className="background-panel">
      <h2>Lobby Background Network</h2>
      <p>{TestPeers.label(props.peerAddress)} is ready to preserve table routes to {TestPeers.short(props.peerAddressToSubscribe)} on lobby channel table 0.</p>
      <EventLogPanel events={log.events} localAddress={props.peerAddress} />
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
  const peerAddressToSubscribe = TestPeers.otherPeerAddress(peerAddressState[0]);

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
        <LobbyBackgroundNetwork
          peerAddress={peerAddressState[0]}
          peerAddressToSubscribe={peerAddressToSubscribe}
          lobbyId={lobbyIdState[0]}
          tableId={tableIdState[0]}
        />
      )}
    </>
  );
}

function TableNetworkPanel(props) {
  const log = useEventLog();
  const routeAvailableState = React.useState(BackgroundRouteStore.has({
    ownerAddress: props.peerAddress,
    peerAddress: props.peerAddressToSubscribe,
    lobbyId: props.lobbyId,
    tableId: props.tableId,
  }));
  const busRef = React.useRef(null);
  const routeOracle = React.useCallback(() => BackgroundRouteStore.has({
    ownerAddress: props.peerAddress,
    peerAddress: props.peerAddressToSubscribe,
    lobbyId: props.lobbyId,
    tableId: props.tableId,
  }), [props.peerAddress, props.peerAddressToSubscribe, props.lobbyId, props.tableId]);
  const handler = React.useCallback((event) => {
    log.append(event);
    if (event.type !== 'PeerConnected') return;
    log.append({
      type: 'BackgroundRoute',
      step: 'PreserveRouteRequested',
      ownerAddress: props.peerAddress,
      peerAddress: props.peerAddressToSubscribe,
      lobbyId: props.lobbyId,
      tableId: props.tableId,
    });
    busRef.current?.publish('keep-route', {
      ownerAddress: props.peerAddress,
      peerAddress: props.peerAddressToSubscribe,
      lobbyId: props.lobbyId,
      tableId: props.tableId,
    });
  }, [props.peerAddress, props.peerAddressToSubscribe, props.lobbyId, props.tableId]);
  const network = useVirtualNetwork({
    name: 'table',
    role: 'table',
    address: props.peerAddress,
    lobbyId: props.lobbyId,
    tableId: props.tableId,
    handler,
    routeOracle,
  });

  React.useEffect(() => {
    const bus = new BackgroundRouteBus();
    busRef.current = bus;
    bus.listen((message) => {
      if (message.type !== 'route-available') return;
      if (TestPeers.peerAddress(message.ownerAddress).toLowerCase() !== TestPeers.peerAddress(props.peerAddress).toLowerCase()) return;
      if (TestPeers.peerAddress(message.peerAddress).toLowerCase() !== TestPeers.peerAddress(props.peerAddressToSubscribe).toLowerCase()) return;
      if (String(message.lobbyId) !== String(props.lobbyId)) return;
      if (String(message.tableId) !== String(props.tableId)) return;
      routeAvailableState[1](true);
    });
    return () => {
      busRef.current = null;
      network.unsubscribe('inbound');
      bus.close();
    };
  }, [network, props.peerAddress, props.peerAddressToSubscribe, props.lobbyId, props.tableId]);

  return (
    <section>
      <h2>{TestPeers.label(props.peerAddress)}: {TestPeers.short(props.peerAddress)}</h2>
      <p>Lobby {props.lobbyId}, table {props.tableId}. Background P2P route: {routeAvailableState[0] ? 'available' : 'not learned yet'}.</p>
      <button
        type="button"
        onClick={() => network.subscribe('inbound', 'outbound', props.peerAddressToSubscribe, 10_000, props.lobbyId, props.tableId)}
      >
        Subscribe to {TestPeers.short(props.peerAddressToSubscribe)}
      </button>
      <button
        type="button"
        onClick={() => network.send('outbound', {
          text: `hello from ${TestPeers.label(props.peerAddress)}`,
          sentAt: Date.now(),
        })}
      >
        Send Message
      </button>
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
