import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  LobbyP2PSession,
  TableP2PSession,
  VirtualNetworkConsoleLogger,
  VirtualNetworkEventType,
  VirtualNetworkLogFormatter,
} from 'privatepoker-p2p';
import { InternalMessageSummary } from './InternalMessageSummary.js';
import { WaitingPromptPolicy, WaitingScope } from './WaitingPromptPolicy.js';
import './style.css';

class TestPeers {
  static choices = ['A', 'B', 'C', 'D'];

  static peerAAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  static peerBAddress = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

  static peerAMeshUrl = 'http://127.0.0.1:3001/mesh';

  static peerBMeshUrl = 'http://127.0.0.1:3002/mesh';

  static peerCAddress = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

  static peerDAddress = '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD';

  static peerAddress(value) {
    return String(value || TestPeers.peerAAddress);
  }

  static isSame(first, second) {
    return TestPeers.peerAddress(first).toLowerCase() === TestPeers.peerAddress(second).toLowerCase();
  }

  static addressForChoice(choice) {
    return TestPeers[`peer${choice}Address`] ?? TestPeers.peerAAddress;
  }

  static choiceLabel(choice) {
    return `Peer ${choice}`;
  }

  static isPeerA(value) {
    return TestPeers.peerAddress(value).toLowerCase() === TestPeers.peerAAddress.toLowerCase();
  }

  static isPeerB(value) {
    return TestPeers.peerAddress(value).toLowerCase() === TestPeers.peerBAddress.toLowerCase();
  }

  static isPeerC(value) {
    return TestPeers.peerAddress(value).toLowerCase() === TestPeers.peerCAddress.toLowerCase();
  }

  static isPeerD(value) {
    return TestPeers.peerAddress(value).toLowerCase() === TestPeers.peerDAddress.toLowerCase();
  }

  static otherPeerAddress(value) {
    if (TestPeers.isPeerA(value)) return TestPeers.peerBAddress;
    if (TestPeers.isPeerB(value)) return TestPeers.peerAAddress;
    if (TestPeers.isPeerC(value)) return TestPeers.peerDAddress;
    if (TestPeers.isPeerD(value)) return TestPeers.peerCAddress;
    return TestPeers.peerBAddress;
  }

  static meshUrls() {
    return [TestPeers.peerAMeshUrl, TestPeers.peerBMeshUrl];
  }

  static label(value) {
    if (TestPeers.isPeerA(value)) return 'Peer A';
    if (TestPeers.isPeerB(value)) return 'Peer B';
    if (TestPeers.isPeerC(value)) return 'Peer C';
    if (TestPeers.isPeerD(value)) return 'Peer D';
    return 'Peer';
  }

  static short(value) {
    return String(value || '0x??').slice(0, 4);
  }
}

class TestScreens {
  static start = 'start';

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

/** Shared configuration for the library-owned Lobby/Table tab sessions. */
class TestP2P {
  static broadcastPrefix = 'privatepoker-p2p-testapp';

  static backgroundTableId = '0';
}

class TestUrl {
  constructor(location) {
    this.location = location;
    this.params = new URLSearchParams(location.search);
  }

  screen() {
    const screen = this.params.get('screen');
    if (screen) return screen;
    return this.params.has('peerAddress') ? TestScreens.lobby : TestScreens.start;
  }

  peerAddress() {
    return this.params.get('peerAddress') ?? TestPeers.peerAAddress;
  }

  peerAddressToSubscribe() {
    return this.params.get('peerAddressToSubscribe');
  }

  lobbyHref(peerAddress) {
    const params = new URLSearchParams();
    params.set('screen', TestScreens.lobby);
    params.set('peerAddress', TestPeers.peerAddress(peerAddress));
    params.set('lobbyId', this.lobbyId());
    return `${this.location.pathname}?${params.toString()}`;
  }

  lobbyId() {
    return this.params.get('lobbyId') ?? '1';
  }

  tableId() {
    return this.params.get('tableId') ?? '1';
  }

  peerId() {
    return this.params.get('peerId');
  }

  tableHref(form) {
    const params = new URLSearchParams();
    params.set('screen', TestScreens.table);
    params.set('peerAddress', TestPeers.peerAddress(form.peerAddress));
    params.set('peerAddressToSubscribe', TestPeers.peerAddress(form.peerAddressToSubscribe));
    params.set('lobbyId', String(form.lobbyId || '1'));
    params.set('tableId', String(form.tableId || '1'));
    params.set('peerId', String(form.peerId));
    return `${this.location.pathname}?${params.toString()}`;
  }
}

class PrivateKeyFactory {
  static create() {
    return crypto.getRandomValues(new Uint8Array(32));
  }
}

class JsonValueFormatter {
  static format(value) {
    if (value instanceof Error) return value.message;
    if (value && typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}

class BrowserClipboard {
  static async write(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Some browsers deny the async API on non-secure origins; fall through.
      }
    }
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      if (!document.execCommand('copy')) throw new Error('Clipboard copy was rejected');
    } finally {
      textArea.remove();
    }
  }
}

class EventLogExporter {
  static text(context, records, filterLabel) {
    const lines = [
      `=== ${context.tabLabel.toUpperCase()} | ${context.peerLabel} | ${context.localAddress} ===`,
      `Role: ${context.role}`,
      `Lobby: ${context.lobbyId}`,
      `Table: ${context.tableId}`,
      `Context: ${context.detail}`,
      `Filter: ${filterLabel}`,
      `URL: ${window.location.href}`,
      `Captured: ${new Date().toISOString()}`,
      `Logs: ${records.length} record(s), newest first as displayed`,
      '',
    ];
    records.forEach((record, index) => {
      lines.push(`[${index + 1}] ${record.summary(context.localAddress)}`);
      lines.push(JSON.stringify(record.details(), null, 2));
      lines.push('');
    });
    return lines.join('\n');
  }

  static async copy(context, records, filterLabel) {
    await BrowserClipboard.write(EventLogExporter.text(context, records, filterLabel));
  }
}

class EventRecord {
  constructor(event) {
    this.id = crypto.randomUUID();
    this.kind = 'connection';
    this.label = 'testapp.connection';
    this.event = event;
  }

  summary(localAddress) {
    return new VirtualNetworkLogFormatter(localAddress, this.event).text();
  }

  details() {
    return this.event;
  }
}

class ConsoleLogRecord {
  constructor(record) {
    this.id = record.id;
    this.kind = 'message';
    this.label = record.label;
    this.event = record.event;
    this.at = record.at;
  }

  summary() {
    return InternalMessageSummary.text(this.label, this.event);
  }

  details() {
    if (this.event && typeof this.event === 'object') return { label: this.label, ...this.event };
    return { label: this.label, value: this.event };
  }
}

function useEventLog() {
  const eventState = React.useState([]);
  React.useEffect(() => VirtualNetworkConsoleLogger.subscribe((record) => {
    if (record.label === 'testapp.connection') return;
    eventState[1]((events) => [new ConsoleLogRecord(record), ...events].slice(0, 10_000));
  }), []);
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
    eventState[1]((events) => [new EventRecord(event), ...events].slice(0, 10_000));
  }, []);
  return {
    events: eventState[0],
    append,
  };
}

function useTableP2PSession(fields) {
  const handlerRef = React.useRef(fields.handler);
  const sessionRef = React.useRef(null);
  const sessionKey = [
    TestPeers.peerAddress(fields.address).toLowerCase(),
    fields.lobbyId,
    fields.tableId,
    fields.peerId,
  ].join(':');

  handlerRef.current = fields.handler;

  if (!sessionRef.current || sessionRef.current.key !== sessionKey) {
    VirtualNetworkConsoleLogger.log('testapp.table.session.create', {
      key: sessionKey,
      address: TestPeers.peerAddress(fields.address),
      lobbyId: fields.lobbyId,
      tableId: fields.tableId,
    });
    sessionRef.current = {
      key: sessionKey,
      session: new TableP2PSession({
        handler: (event) => handlerRef.current(event),
        address: TestPeers.peerAddress(fields.address),
        privateKey: PrivateKeyFactory.create(),
        peerId: fields.peerId,
        lobbyId: fields.lobbyId,
        tableId: fields.tableId,
        inboundLabel: TableChannel.inboundLabel,
        outboundLabel: TableChannel.outboundLabel,
        broadcastPrefix: TestP2P.broadcastPrefix,
      }),
    };
  }

  React.useEffect(() => {
    const created = sessionRef.current;
    return () => created?.session.close();
  }, [sessionKey]);

  return sessionRef.current.session;
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
  const summaryRef = React.useRef(null);
  const details = props.record.details();
  const eventJson = JSON.stringify(details, null, 2);
  const isExpanded = props.isExpanded;
  const className = isExpanded ? 'log-entry expanded' : 'log-entry';

  React.useEffect(() => {
    if (!isExpanded) return;
    const node = summaryRef.current;
    if (!node) return;
    node.scrollIntoView({ block: 'center', inline: 'nearest' });
    node.focus({ preventScroll: true });
  }, [isExpanded]);

  return (
    <div className={className} data-kind={props.record.kind}>
      <div
        ref={summaryRef}
        className="log-summary"
        title={eventJson}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={() => props.onToggle(props.record)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') props.onToggle(props.record);
        }}
      >
        {props.record.summary(props.localAddress)}
      </div>
      {isExpanded && (
        <div className="log-details">
          <JsonFieldTable event={details} />
        </div>
      )}
    </div>
  );
}

const ALL_RECORDS_FILTER_LABEL = 'all records (including internal messages)';

function EventLogPanel(props) {
  const hideInternalState = React.useState(true);
  const copyState = React.useState('idle');
  const expandedState = React.useState(null);
  const hideInternal = hideInternalState[0];
  const expandedId = expandedState[0];
  const toggleExpanded = React.useCallback((record) => {
    expandedState[1]((current) => (current === record.id ? null : record.id));
  }, []);
  const visibleEvents = React.useMemo(
    () => (hideInternal ? props.events.filter((record) => record.kind !== 'message') : props.events),
    [hideInternal, props.events],
  );
  const copyLogs = React.useCallback(async () => {
    try {
      await EventLogExporter.copy(props.context, props.events, ALL_RECORDS_FILTER_LABEL);
      copyState[1]('copied');
    } catch (error) {
      VirtualNetworkConsoleLogger.log('testapp.copy-logs.failed', {
        error: error?.message ?? String(error),
      });
      copyState[1]('failed');
    }
  }, [props.context, props.events]);
  const copyLabel = copyState[0] === 'copied'
    ? 'Copied'
    : copyState[0] === 'failed'
      ? 'Copy failed'
      : 'Copy logs';

  return (
    <>
      <div className="log-toolbar">
        <span className="log-context">
          {props.context.tabLabel} · {props.context.peerLabel} · {props.context.role}
        </span>
        <button
          type="button"
          className={hideInternal ? 'log-toggle-button active' : 'log-toggle-button'}
          aria-pressed={hideInternal}
          onClick={() => hideInternalState[1](!hideInternal)}
        >
          Hide internal
        </button>
        <button type="button" className="log-copy-button" onClick={copyLogs}>
          {copyLabel}
        </button>
      </div>
      <div className="log-panel">
        {visibleEvents.map((record) => (
          <LogRow
            key={record.id}
            record={record}
            localAddress={props.localAddress}
            isExpanded={record.id === expandedId}
            onToggle={toggleExpanded}
          />
        ))}
      </div>
    </>
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

function StartScreen() {
  const url = new TestUrl(window.location);
  const customAddressState = React.useState('');

  const goToLobby = (peerAddress) => {
    window.location.href = url.lobbyHref(peerAddress);
  };

  return (
    <>
      <Logo />
      <section>
        <h2>Choose Current Peer</h2>
        <div className="start-peer-grid">
          {TestPeers.choices.map((choice) => (
            <button
              type="button"
              key={choice}
              onClick={() => goToLobby(TestPeers.addressForChoice(choice))}
            >
              {TestPeers.choiceLabel(choice)}
            </button>
          ))}
        </div>
        <form
          className="custom-peer-form"
          onSubmit={(event) => {
            event.preventDefault();
            const peerAddress = customAddressState[0].trim();
            if (peerAddress) goToLobby(peerAddress);
          }}
        >
          <input
            type="text"
            aria-label="Custom peer address"
            placeholder="0x012345678..."
            value={customAddressState[0]}
            onChange={(event) => customAddressState[1](event.target.value)}
          />
          <button type="submit" disabled={customAddressState[0].trim().length === 0}>
            Ok
          </button>
        </form>
      </section>
    </>
  );
}

function TargetPeerSelector(props) {
  return (
    <div className="target-peer-selector">
      <Field label="Other Peer" value={props.peerAddress} onChange={props.onChange} />
      <div className="peer-choice-row">
        {TestPeers.choices.map((choice) => {
          const peerAddress = TestPeers.addressForChoice(choice);
          const isCurrentPeer = TestPeers.isSame(peerAddress, props.currentPeerAddress);
          return (
            <button
              type="button"
              key={choice}
              className={`peer-choice${TestPeers.isSame(peerAddress, props.peerAddress) ? ' active' : ''}`}
              disabled={isCurrentPeer}
              onClick={() => props.onChange(peerAddress)}
            >
              {TestPeers.choiceLabel(choice)}
            </button>
          );
        })}
      </div>
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

function useLobbyP2PSession(fields) {
  const log = useEventLog();
  const connection = useConnectionStatus(log);
  const waitingState = React.useState(null);
  const handlerRef = React.useRef(null);
  const policyRef = React.useRef(null);
  if (policyRef.current === null) policyRef.current = new WaitingPromptPolicy();

  handlerRef.current = (event) => {
    connection.handler(event);
    const decision = policyRef.current.apply(event);
    if (decision.kind === 'request') waitingState[1](decision.request);
    if (decision.kind === 'clear') waitingState[1](null);
  };

  const session = React.useMemo(() => new LobbyP2PSession({
    handler: (event) => handlerRef.current(event),
    address: fields.peerAddress,
    privateKey: PrivateKeyFactory.create(),
    lobbyId: fields.lobbyId,
    backgroundTableId: TestP2P.backgroundTableId,
    meshUrls: TestPeers.meshUrls(fields.peerAddress),
    broadcastPrefix: TestP2P.broadcastPrefix,
  }), [fields.peerAddress, fields.lobbyId]);

  React.useEffect(() => {
    VirtualNetworkConsoleLogger.log('testapp.lobby.session.start', {
      peerAddress: fields.peerAddress,
      peerId: session.peerId,
      lobbyId: fields.lobbyId,
      backgroundTableId: TestP2P.backgroundTableId,
    });
    session.start();
    return () => {
      VirtualNetworkConsoleLogger.log('testapp.lobby.session.stop', {
        peerAddress: fields.peerAddress,
        peerId: session.peerId,
        lobbyId: fields.lobbyId,
      });
      session.close();
      waitingState[1](null);
      policyRef.current.reset();
    };
  }, [session]);

  const acceptWaiting = (request) => {
    const target = request ?? waitingState[0];
    if (target === null) return;
    session.acceptWaitingRequest(target);
    fields.onAcceptWaiting?.(target, session.peerId);
  };

  const rejectWaiting = (request) => {
    const target = request ?? waitingState[0];
    if (target === null) return;
    policyRef.current.dismiss(WaitingScope.from(target));
    session.rejectWaitingRequest(target);
    waitingState[1](null);
  };

  return {
    events: log.events,
    status: connection.status,
    peerId: session.peerId,
    waitingRequest: waitingState[0],
    acceptWaiting,
    rejectWaiting,
  };
}

function LobbyBackgroundKeeper(props) {
  const keeper = useLobbyP2PSession({
    peerAddress: props.peerAddress,
    lobbyId: props.lobbyId,
    onAcceptWaiting: props.onAcceptWaiting,
  });

  React.useEffect(() => {
    props.onPeerId?.(keeper.peerId);
  }, [keeper.peerId, props.onPeerId]);

  return (
    <section className="background-panel">
      <h2>Lobby Background Network</h2>
      <p>
        {TestPeers.label(props.peerAddress)} establishes and keeps background P2P
        edges on lobby channel table {LobbyChannel.tableId} whenever a table tab
        asks for a peer. Closing a table tab leaves these edges alive.
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
      <EventLogPanel
        events={keeper.events}
        localAddress={props.peerAddress}
        context={{
          tabLabel: 'Lobby tab',
          peerLabel: TestPeers.label(props.peerAddress),
          role: 'lobby',
          localAddress: props.peerAddress,
          lobbyId: props.lobbyId,
          tableId: LobbyChannel.tableId,
          detail: 'Lobby background network',
        }}
      />
    </section>
  );
}

function LobbyScreen() {
  const url = new TestUrl(window.location);
  const currentPeerAddress = TestPeers.peerAddress(url.peerAddress());
  const targetPeerAddressState = React.useState(TestPeers.otherPeerAddress(currentPeerAddress));
  const lobbyIdState = React.useState(url.lobbyId());
  const tableIdState = React.useState(url.tableId());
  const parentPeerIdState = React.useState(null);

  const openTableTab = (fields, label) => {
    const href = url.tableHref(fields);
    const target = [
      'privatepoker-table',
      TestPeers.short(fields.peerAddress).toLowerCase(),
      TestPeers.short(fields.peerAddressToSubscribe).toLowerCase(),
      String(fields.lobbyId),
      String(fields.tableId),
      fields.peerId,
    ].join('-');
    VirtualNetworkConsoleLogger.log(label, { href, target });
    window.open(href, target);
  };

  const joinTable = () => {
    if (TestPeers.isSame(targetPeerAddressState[0], currentPeerAddress)) return;
    openTableTab({
      peerAddress: currentPeerAddress,
      peerAddressToSubscribe: targetPeerAddressState[0],
      lobbyId: lobbyIdState[0],
      tableId: tableIdState[0],
      peerId: parentPeerIdState[0],
    }, 'testapp.table.open');
  };

  const openWaitingTable = (request, peerId) => {
    openTableTab({
      peerAddress: currentPeerAddress,
      peerAddressToSubscribe: request.peerAddress,
      lobbyId: request.lobbyId,
      tableId: request.tableId,
      peerId,
    }, 'testapp.table.open-from-wait');
  };

  return (
    <>
      <Logo />
      <nav>
        <a href={window.location.pathname}>Choose Peer</a>
      </nav>
      <section>
        <h2>Lobby · {TestPeers.label(currentPeerAddress)}</h2>
        <div className="lobby-form">
          <Field label="Current Peer" value={currentPeerAddress} readOnly onChange={() => {}} />
          <Field label="Lobby" value={lobbyIdState[0]} onChange={lobbyIdState[1]} />
          <Field label="Table" value={tableIdState[0]} onChange={tableIdState[1]} />
          <TargetPeerSelector
            currentPeerAddress={currentPeerAddress}
            peerAddress={targetPeerAddressState[0]}
            onChange={targetPeerAddressState[1]}
          />
          <button
            type="button"
            disabled={TestPeers.isSame(targetPeerAddressState[0], currentPeerAddress)}
            onClick={joinTable}
          >
            Join Table
          </button>
        </div>
      </section>
      <LobbyBackgroundKeeper
        peerAddress={currentPeerAddress}
        lobbyId={lobbyIdState[0]}
        onPeerId={parentPeerIdState[1]}
        onAcceptWaiting={openWaitingTable}
      />
    </>
  );
}

function TableNetworkPanel(props) {
  const log = useEventLog();
  const connection = useConnectionStatus(log);
  const messageState = React.useState([]);
  const handler = React.useCallback((event) => {
    connection.handler(event);
    if (event.type === VirtualNetworkEventType.MESSAGE_RECEIVED) {
      messageState[1]((messages) => [{
        id: crypto.randomUUID(),
        text: JsonValueFormatter.format(event.messageData?.text ?? event.messageData),
      }, ...messages].slice(0, 20));
    }
  }, [connection.handler]);
  const session = useTableP2PSession({
    address: props.peerAddress,
    lobbyId: props.lobbyId,
    tableId: props.tableId,
    peerId: props.peerId,
    handler,
  });

  const subscribe = React.useCallback(() => {
    VirtualNetworkConsoleLogger.log('testapp.table.subscribe', {
      peerAddress: props.peerAddress,
      peerAddressToSubscribe: props.peerAddressToSubscribe,
      lobbyId: props.lobbyId,
      tableId: props.tableId,
    });
    session.subscribe(
      props.peerAddressToSubscribe,
      props.lobbyId,
      props.tableId,
    );
  }, [session, props.peerAddress, props.peerAddressToSubscribe, props.lobbyId, props.tableId]);

  React.useEffect(() => {
    subscribe();
    return () => session.unsubscribe();
  }, [session, subscribe]);

  const sendMessage = () => {
    VirtualNetworkConsoleLogger.log('testapp.table.send', {
      peerAddress: props.peerAddress,
      peerAddressToSubscribe: props.peerAddressToSubscribe,
      lobbyId: props.lobbyId,
      tableId: props.tableId,
    });
    session.send({
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
      <EventLogPanel
        events={log.events}
        localAddress={props.peerAddress}
        context={{
          tabLabel: 'Table tab',
          peerLabel: TestPeers.label(props.peerAddress),
          role: 'table',
          localAddress: props.peerAddress,
          lobbyId: props.lobbyId,
          tableId: props.tableId,
          detail: `Direct P2P edge toward ${TestPeers.label(props.peerAddressToSubscribe)} (${props.peerAddressToSubscribe})`,
        }}
      />
    </section>
  );
}

function TableScreen() {
  const url = new TestUrl(window.location);
  const peerAddress = url.peerAddress();
  const peerAddressToSubscribe = url.peerAddressToSubscribe()
    ?? TestPeers.otherPeerAddress(peerAddress);

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
          peerId={url.peerId()}
        />
      </div>
    </>
  );
}

function App() {
  const url = new TestUrl(window.location);
  if (url.screen() === TestScreens.start) return <StartScreen />;
  if (url.screen() === TestScreens.table) return <TableScreen />;
  return <LobbyScreen />;
}

createRoot(document.getElementById('app')).render(<App />);
