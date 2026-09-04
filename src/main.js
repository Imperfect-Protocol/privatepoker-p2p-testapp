import { VirtualNetwork } from 'privatepoker-p2p';
import './style.css';

class LogEventDirection {
  static for(event) {
    if (event.type === 'MessageDelivered') return '>>';
    if (event.type === 'MessageReceived') return '<<';
    if (event.type === 'PeerConnected') return '==';
    if (event.type === 'PeerDisconnected') return '--';
    if (event.type === 'ConnectionTimeout') return '!!';
    if (event.type === 'ConnectionFailed') return '!!';
    if (event.type === 'MeshPollError') return '!!';
    if (event.step === 'AttemptStarted') return '..';
    if (event.step === 'AnnounceSent') return '>>';
    if (event.step === 'AnnounceReceived') return '<<';
    if (event.step === 'OfferRequested') return '<<';
    if (event.step === 'OfferSent') return '>>';
    if (event.step === 'OfferReceived') return '<<';
    if (event.step === 'AnswerSent') return '>>';
    if (event.step === 'AnswerReceived') return '<<';
    if (event.step === 'RouteAvailable') return '<<';
    return '..';
  }
}

class LogEventName {
  static for(event) {
    if (event.type === 'MessageDelivered') return 'Message';
    if (event.type === 'MessageReceived') return 'Message';
    if (event.type === 'PeerConnected') return 'Connected';
    if (event.type === 'PeerDisconnected') return 'Disconnected';
    if (event.type === 'ConnectionTimeout') return 'Timeout';
    if (event.type === 'ConnectionFailed') return 'Failed';
    if (event.type === 'MeshPollError') return 'Mesh Error';
    if (event.step === 'AttemptStarted') return event.state ?? 'Attempt';
    if (event.step === 'AnnounceSent') return 'Announce';
    if (event.step === 'AnnounceReceived') return 'Announce';
    if (event.step === 'OfferRequested') return 'Offer Request';
    if (event.step === 'OfferSent') return 'Offer';
    if (event.step === 'OfferReceived') return 'Offer';
    if (event.step === 'AnswerSent') return 'Answer';
    if (event.step === 'AnswerReceived') return 'Answer';
    if (event.step === 'RouteAvailable') return 'Route';
    return event.step ?? event.type ?? 'Event';
  }
}

class LogPeerTag {
  static for(localAddress, event) {
    const address = event.peerAddress ?? event.from ?? event.to ?? localAddress;
    if (!address) return '??';
    return String(address).slice(2, 4).toUpperCase();
  }
}

class LogEventSummary {
  constructor(localAddress, label, event) {
    this.localAddress = localAddress;
    this.label = label;
    this.event = event;
  }

  text() {
    const peer = LogPeerTag.for(this.localAddress, this.event);
    const direction = LogEventDirection.for(this.event);
    const name = LogEventName.for(this.event);
    const via = this.event.via ? ` via ${this.event.via}` : '';
    return `[${peer}] ${direction} ${name}${via}`;
  }
}

class JsonFieldTable {
  constructor(event) {
    this.event = event;
  }

  render() {
    const table = document.createElement('table');
    const body = document.createElement('tbody');
    for (const key of Object.keys(this.event)) {
      const row = document.createElement('tr');
      const name = document.createElement('th');
      const value = document.createElement('td');
      name.textContent = key;
      value.textContent = this.formatValue(this.event[key]);
      row.append(name, value);
      body.append(row);
    }
    table.append(body);
    return table;
  }

  formatValue(value) {
    if (value instanceof Error) return value.message;
    if (value && typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}

class LogRow {
  constructor(fields) {
    this.label = fields.label;
    this.localAddress = fields.localAddress;
    this.event = fields.event;
    this.expanded = false;
    this.root = document.createElement('div');
    this.summary = document.createElement('div');
    this.details = document.createElement('div');
  }

  render() {
    const formatter = new LogEventSummary(this.localAddress, this.label, this.event);
    this.root.className = 'log-entry';
    this.summary.className = 'log-summary';
    this.details.className = 'log-details';
    this.details.hidden = true;
    this.summary.textContent = formatter.text();
    this.summary.title = JSON.stringify(this.event, null, 2);
    this.summary.onclick = () => this.toggle();
    this.root.append(this.summary, this.details);
    return this.root;
  }

  toggle() {
    this.expanded = !this.expanded;
    this.root.classList.toggle('expanded', this.expanded);
    this.details.hidden = !this.expanded;
    if (!this.expanded || this.details.childElementCount > 0) return;
    this.details.append(new JsonFieldTable(this.event).render());
  }
}

class EventLog {
  constructor(element) {
    this.element = element;
  }

  write(label, event, localAddress) {
    const row = new LogRow({
      label,
      localAddress,
      event,
    });
    this.element.prepend(row.render());
  }
}

class TestLogo {
  constructor(root) {
    this.root = root;
  }

  render() {
    const logo = document.createElement('div');
    const brand = document.createElement('div');
    const protocol = document.createElement('div');

    logo.className = 'logo';
    brand.className = 'logo-brand';
    protocol.className = 'logo-protocol';
    brand.textContent = 'PRIVATE POKER';
    protocol.textContent = 'IMPERFECT PROTOCOL';

    logo.append(brand, protocol);
    this.root.append(logo);
  }
}

class PeerPanel {
  constructor(fields) {
    this.root = fields.root;
    this.label = fields.label;
    this.address = fields.address;
    this.peerAddress = fields.peerAddress;
    this.context = fields.context;
    this.log = fields.log;
    this.network = new VirtualNetwork(
      (event) => this.log.write(this.label, event, this.address),
      this.address,
      crypto.getRandomValues(new Uint8Array(32)),
      {
        lobbyId: this.context.lobbyId,
        tableId: this.context.tableId,
        meshUrls: fields.meshUrls,
      },
    );
  }

  render() {
    const section = document.createElement('section');
    const title = document.createElement('h2');
    const connect = document.createElement('button');
    const send = document.createElement('button');

    title.textContent = `${this.label}: ${this.address.slice(0, 4)}`;
    connect.textContent = `Subscribe to ${this.peerAddress.slice(0, 4)}`;
    send.textContent = 'Send Message';

    connect.onclick = () => {
      this.context.writeToUrl(window.history);
      this.network.subscribe('inbound', 'outbound', this.peerAddress, 10_000, this.context.lobbyId, this.context.tableId);
    };
    send.onclick = () => {
      this.network.send('outbound', {
        text: `hello from ${this.label}`,
        sentAt: Date.now(),
      });
    };

    section.append(title, connect, send);
    this.root.append(section);
  }
}

class TestContext {
  constructor(location) {
    this.params = new URLSearchParams(location.search);
    this.lobbyId = this.params.get('lobbyId') ?? '1';
    this.tableId = this.params.get('tableId') ?? '1';
    this.peer = this.params.get('peer') ?? 'all';
  }

  writeToUrl(history) {
    this.params.set('lobbyId', this.lobbyId);
    this.params.set('tableId', this.tableId);
    const query = this.params.toString();
    history.replaceState(null, '', `${window.location.pathname}?${query}`);
  }

  setLobbyId(value) {
    this.lobbyId = String(value || '1');
  }

  setTableId(value) {
    this.tableId = String(value || '1');
  }

  shouldRenderPeer(value) {
    return this.peer === 'all' || this.peer === value;
  }

  peerUrl(value) {
    const params = new URLSearchParams();
    params.set('lobbyId', this.lobbyId);
    params.set('tableId', this.tableId);
    params.set('peer', value);
    return `${window.location.pathname}?${params.toString()}`;
  }

  freshRunUrl() {
    const timestamp = Date.now();
    const params = new URLSearchParams();
    params.set('lobbyId', `1-${timestamp}`);
    params.set('tableId', `1-${timestamp}`);
    params.set('peer', this.peer);
    return `${window.location.pathname}?${params.toString()}`;
  }
}

class TestContextForm {
  constructor(fields) {
    this.root = fields.root;
    this.context = fields.context;
    this.onChange = fields.onChange;
  }

  render() {
    const form = document.createElement('div');
    const lobbyLabel = document.createElement('label');
    const tableLabel = document.createElement('label');
    const lobbyInput = document.createElement('input');
    const tableInput = document.createElement('input');

    form.className = 'context-form';
    lobbyInput.value = this.context.lobbyId;
    tableInput.value = this.context.tableId;
    lobbyInput.type = 'text';
    tableInput.type = 'text';
    lobbyLabel.textContent = 'Lobby ID';
    tableLabel.textContent = 'Table ID';

    lobbyInput.oninput = () => {
      this.context.setLobbyId(lobbyInput.value);
      this.context.writeToUrl(window.history);
      this.onChange?.();
    };
    tableInput.oninput = () => {
      this.context.setTableId(tableInput.value);
      this.context.writeToUrl(window.history);
      this.onChange?.();
    };

    lobbyLabel.append(lobbyInput);
    tableLabel.append(tableInput);
    form.append(lobbyLabel, tableLabel);
    this.root.append(form);
  }
}

class TestLinks {
  constructor(fields) {
    this.root = fields.root;
    this.context = fields.context;
    this.links = [];
  }

  render() {
    const nav = document.createElement('nav');
    const peerA = document.createElement('a');
    const peerB = document.createElement('a');
    const both = document.createElement('a');
    const fresh = document.createElement('a');

    peerA.textContent = 'Peer A';
    peerB.textContent = 'Peer B';
    both.textContent = 'Two Peers';
    fresh.textContent = 'Fresh Context';
    this.links = [
      { element: peerA, peer: 'a' },
      { element: peerB, peer: 'b' },
      { element: both, peer: 'all' },
    ];
    this.fresh = fresh;
    this.update();

    nav.append(peerA, peerB, both, fresh);
    this.root.append(nav);
  }

  update() {
    for (const link of this.links) {
      link.element.href = this.context.peerUrl(link.peer);
    }
    this.fresh.href = this.context.freshRunUrl();
  }
}

class TestApp {
  constructor(root) {
    this.root = root;
    this.logElement = document.createElement('div');
    this.logElement.className = 'log-panel';
    this.log = new EventLog(this.logElement);
    this.context = new TestContext(window.location);
    this.context.writeToUrl(window.history);
  }

  render() {
    const grid = document.createElement('div');
    const links = new TestLinks({
      root: this.root,
      context: this.context,
    });

    grid.className = 'grid';

    new TestLogo(this.root).render();
    links.render();
    new TestContextForm({
      root: this.root,
      context: this.context,
      onChange: () => links.update(),
    }).render();
    this.root.append(grid, this.logElement);

    if (this.context.shouldRenderPeer('a')) {
      new PeerPanel({
        root: grid,
        label: 'Peer A',
        address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        peerAddress: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        context: this.context,
        meshUrls: ['http://127.0.0.1:3001/mesh'],
        log: this.log,
      }).render();
    }

    if (this.context.shouldRenderPeer('b')) {
      new PeerPanel({
        root: grid,
        label: 'Peer B',
        address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        peerAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        context: this.context,
        meshUrls: ['http://127.0.0.1:3002/mesh'],
        log: this.log,
      }).render();
    }
  }
}

new TestApp(document.getElementById('app')).render();
