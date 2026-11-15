// Hand-checked "golden" lessons. They play instantly, never need the AI,
// and double as test fixtures (tests/lessons.test.mjs).
// Facts follow the cited sources; IPs come from documentation/private ranges.
import { SOURCE_LIBRARY } from "./core.js";

const cite = (...ids) => ids.map((id) => {
  const s = SOURCE_LIBRARY.find((x) => x.id === id);
  if (!s) throw new Error("unknown source " + id);
  return { ...s };
});

const websiteLesson = {
  version: 1,
  title: "What happens when you visit a website",
  question: "What happens when I type example.com into my browser?",
  devices: [
    { id: "laptop", kind: "laptop", label: "Your laptop" },
    { id: "router", kind: "router", label: "Home router" },
    { id: "resolver", kind: "dns_resolver", label: "DNS resolver" },
    { id: "root", kind: "dns_root", label: "Root server" },
    { id: "tld", kind: "dns_tld", label: ".com server" },
    { id: "auth", kind: "dns_authoritative", label: "example.com DNS" },
    { id: "web", kind: "web_server", label: "example.com server" },
  ],
  links: [
    { a: "laptop", b: "router" },
    { a: "router", b: "resolver" },
    { a: "router", b: "web" },
    { a: "resolver", b: "root" },
    { a: "resolver", b: "tld" },
    { a: "resolver", b: "auth" },
  ],
  steps: [
    {
      id: "dns_query",
      action: { type: "send", path: ["laptop", "router", "resolver"], packet: { protocol: "DNS", label: "Where is example.com?", fields: { type: "A record", name: "example.com" } } },
      narration: "Computers find each other by number, not by name. So first your laptop asks a DNS resolver: what is the IP address of example.com?",
      citationIds: ["rfc1034"],
    },
    {
      id: "ask_root",
      action: { type: "send", path: ["resolver", "root"], packet: { protocol: "DNS", label: "example.com?" } },
      narration: "If the resolver doesn't already know, it starts at the top of the DNS tree and asks a root server.",
      citationIds: ["rfc1034"],
    },
    {
      id: "root_referral",
      action: { type: "send", path: ["root", "resolver"], packet: { protocol: "DNS", label: "Ask the .com servers" } },
      narration: "The root server doesn't hold the answer, but it knows which servers handle .com, so it points the resolver there.",
      citationIds: ["rfc1034"],
    },
    {
      id: "ask_tld",
      action: { type: "send", path: ["resolver", "tld"], packet: { protocol: "DNS", label: "example.com?" } },
      narration: "The resolver asks the .com server the same question.",
      citationIds: ["rfc1034"],
    },
    {
      id: "tld_referral",
      action: { type: "send", path: ["tld", "resolver"], packet: { protocol: "DNS", label: "Ask example.com's DNS" } },
      narration: "The .com server points it to the name server that is in charge of example.com.",
      citationIds: ["rfc1034"],
    },
    {
      id: "ask_auth",
      action: { type: "send", path: ["resolver", "auth"], packet: { protocol: "DNS", label: "example.com?" } },
      narration: "Finally, the resolver asks the server that holds the real answer, called the authoritative server.",
      citationIds: ["rfc1034"],
    },
    {
      id: "auth_answer",
      action: { type: "send", path: ["auth", "resolver"], packet: { protocol: "DNS", label: "203.0.113.10", fields: { type: "A record", address: "203.0.113.10", ttl: "3600 seconds" } } },
      narration: "It replies with the IP address, plus a time to live that says how long the answer can be reused. We're using a sample address here.",
      citationIds: ["rfc1035", "rfc5737"],
    },
    {
      id: "resolver_cache",
      action: { type: "highlight", device: "resolver", caption: "Caches the answer until the TTL runs out" },
      narration: "The resolver saves the answer, so the next person who asks gets it straight away.",
      citationIds: ["rfc1034"],
    },
    {
      id: "dns_reply",
      action: { type: "send", path: ["resolver", "router", "laptop"], packet: { protocol: "DNS", label: "203.0.113.10" } },
      narration: "The resolver sends the address back to your laptop. Now it knows where to go.",
      citationIds: ["rfc1034"],
    },
    {
      id: "syn",
      action: { type: "send", path: ["laptop", "router", "web"], packet: { protocol: "TCP", label: "SYN", fields: { "dst port": "443" } } },
      narration: "Next your laptop opens a TCP connection with a three-way handshake. First it sends a SYN, which means: can we talk?",
      citationIds: ["rfc9293"],
    },
    {
      id: "syn_ack",
      action: { type: "send", path: ["web", "router", "laptop"], packet: { protocol: "TCP", label: "SYN-ACK" } },
      narration: "The server answers with a SYN-ACK: yes, and can you hear me too?",
      citationIds: ["rfc9293"],
    },
    {
      id: "ack",
      action: { type: "send", path: ["laptop", "router", "web"], packet: { protocol: "TCP", label: "ACK" } },
      narration: "Your laptop replies with an ACK. The connection is open.",
      citationIds: ["rfc9293"],
    },
    {
      id: "tls",
      action: { type: "send", path: ["laptop", "router", "web"], packet: { protocol: "TLS", label: "ClientHello", fields: { supported_versions: "TLS 1.3" } } },
      narration: "Because the site uses HTTPS, your laptop starts a TLS handshake. The two sides agree on keys, so nobody in between can read the traffic.",
      citationIds: ["rfc8446"],
    },
    {
      id: "tls_reply",
      action: { type: "send", path: ["web", "router", "laptop"], packet: { protocol: "TLS", label: "ServerHello + certificate" } },
      narration: "The server answers with its share of the key exchange, then its certificate. Your browser checks it was signed by an authority it trusts, and the server proves it owns it by signing the handshake.",
      citationIds: ["rfc8446"],
    },
    {
      id: "http_get",
      action: { type: "send", path: ["laptop", "router", "web"], packet: { protocol: "HTTP", label: "GET /", fields: { method: "GET", path: "/", host: "example.com" } } },
      narration: "Now, inside the encrypted connection, your browser asks for the page with an HTTP GET request.",
      citationIds: ["rfc9110"],
    },
    {
      id: "http_ok",
      action: { type: "send", path: ["web", "router", "laptop"], packet: { protocol: "HTTP", label: "200 OK + page", fields: { status: "200 OK" } } },
      narration: "The server sends back 200 OK with the page, and your browser draws it on the screen.",
      citationIds: ["rfc9110"],
    },
  ],
  citations: cite("rfc1034", "rfc1035", "rfc5737", "rfc9293", "rfc8446", "rfc9110"),
};

const firewallLesson = {
  version: 1,
  title: "How a firewall stops a port scan",
  question: "How does a firewall block a port scan but still let website visitors in?",
  devices: [
    { id: "scanner", kind: "laptop", label: "Scanner on the internet" },
    { id: "internet", kind: "internet", label: "Internet" },
    { id: "firewall", kind: "firewall", label: "Company firewall" },
    { id: "web", kind: "web_server", label: "Company web server" },
  ],
  links: [
    { a: "scanner", b: "internet" },
    { a: "internet", b: "firewall" },
    { a: "firewall", b: "web" },
  ],
  steps: [
    {
      id: "policy",
      action: { type: "highlight", device: "firewall", caption: "Allow TCP 443 in. Deny everything else." },
      narration: "This firewall has a simple policy: let web traffic on port 443 in, and block everything else. Blocking by default is the recommended approach.",
      citationIds: ["nist_sp800_41r1"],
    },
    {
      id: "probe_ssh",
      action: { type: "drop", path: ["scanner", "internet", "firewall"], packet: { protocol: "TCP", label: "SYN to port 22", fields: { src: "198.51.100.7", dst: "203.0.113.10", "dst port": "22 (SSH)" } }, reason: "No rule allows port 22, so the default deny blocks it" },
      narration: "A scanner tries to open a connection to port 22, used for remote logins with SSH. No rule allows it, so the firewall drops the packet.",
      citationIds: ["nist_sp800_41r1", "rfc9293"],
    },
    {
      id: "probe_rdp",
      action: { type: "drop", path: ["scanner", "internet", "firewall"], packet: { protocol: "TCP", label: "SYN to port 3389", fields: { "dst port": "3389 (Remote Desktop)" } }, reason: "Port 3389 is not allowed either" },
      narration: "It tries port 3389, used for Remote Desktop. Dropped again. Getting no answer at all tells the scanner these ports are filtered, but nothing about what is behind them.",
      citationIds: ["nist_sp800_41r1"],
    },
    {
      id: "log",
      action: { type: "highlight", device: "firewall", caption: "Logs the blocked attempts" },
      narration: "The firewall records the blocked attempts, so security staff can spot someone probing the network.",
      citationIds: ["nist_sp800_41r1"],
    },
    {
      id: "rules_not_intent",
      action: { type: "highlight", device: "firewall", caption: "Judges port, address and state, not intent" },
      narration: "A firewall can't read minds. It decides by address, port and connection state, so if the scanner tries port 443, the allow rule applies to it like anyone else.",
      citationIds: ["nist_sp800_41r1"],
    },
    {
      id: "visit_443",
      action: { type: "send", path: ["scanner", "internet", "firewall", "web"], packet: { protocol: "TCP", label: "SYN to port 443", fields: { "dst port": "443 (HTTPS)" } } },
      narration: "A connection to port 443 matches the allow rule, so the firewall passes it through to the web server.",
      citationIds: ["nist_sp800_41r1", "rfc9293"],
    },
    {
      id: "state",
      action: { type: "highlight", device: "firewall", caption: "Remembers this connection" },
      narration: "A stateful firewall remembers the connections it allowed, so it can recognise the replies that belong to them.",
      citationIds: ["nist_sp800_41r1"],
    },
    {
      id: "syn_ack",
      action: { type: "send", path: ["web", "firewall", "internet", "scanner"], packet: { protocol: "TCP", label: "SYN-ACK" } },
      narration: "The server answers with a SYN-ACK. The firewall lets it out because it belongs to a connection it already allowed. The scanner now knows port 443 is open, which is why the web server itself must be kept patched.",
      citationIds: ["rfc9293", "nist_sp800_41r1"],
    },
  ],
  citations: cite("nist_sp800_41r1", "rfc9293"),
};

const dhcpLesson = {
  version: 1,
  title: "How your laptop gets an IP address",
  question: "How does my laptop get an IP address when it joins Wi-Fi?",
  devices: [
    { id: "laptop", kind: "laptop", label: "Your laptop" },
    { id: "ap", kind: "access_point", label: "Wi-Fi access point" },
    { id: "router", kind: "router", label: "Home router (DHCP server)" },
  ],
  links: [
    { a: "laptop", b: "ap" },
    { a: "ap", b: "router" },
  ],
  steps: [
    {
      id: "no_address",
      action: { type: "highlight", device: "laptop", caption: "Joined Wi-Fi, but has no IP address yet" },
      narration: "Your laptop just joined the Wi-Fi, but it has no IP address, so nobody can reach it yet. It uses DHCP to ask for one.",
      citationIds: ["rfc2131"],
    },
    {
      id: "discover",
      action: { type: "send", path: ["laptop", "ap", "router"], packet: { protocol: "DHCP", label: "DISCOVER", fields: { from: "0.0.0.0", to: "255.255.255.255 (everyone)" } } },
      narration: "It broadcasts a DHCP Discover to the whole local network: is there a DHCP server out there?",
      citationIds: ["rfc2131"],
    },
    {
      id: "offer",
      action: { type: "send", path: ["router", "ap", "laptop"], packet: { protocol: "DHCP", label: "OFFER 192.168.1.23", fields: { address: "192.168.1.23", lease: "24 hours" } } },
      narration: "The router's DHCP server answers with an Offer: you can use 192.168.1.23, for a set lease time.",
      citationIds: ["rfc2131", "rfc1918"],
    },
    {
      id: "request",
      action: { type: "send", path: ["laptop", "ap", "router"], packet: { protocol: "DHCP", label: "REQUEST 192.168.1.23" } },
      narration: "Your laptop replies with a Request for that address. It broadcasts it, so any other DHCP server knows its offer wasn't taken.",
      citationIds: ["rfc2131"],
    },
    {
      id: "ack",
      action: { type: "send", path: ["router", "ap", "laptop"], packet: { protocol: "DHCP", label: "ACK", fields: { address: "192.168.1.23", router: "192.168.1.1", dns: "192.168.1.1" } } },
      narration: "The server confirms with an Ack. It also tells your laptop which router to use as its gateway and which DNS server to ask.",
      citationIds: ["rfc2131", "rfc2132"],
    },
    {
      id: "configured",
      action: { type: "highlight", device: "laptop", caption: "IP 192.168.1.23, gateway 192.168.1.1" },
      narration: "Your laptop is now configured. Discover, Offer, Request, Ack: people remember it as DORA. Before the lease runs out, the laptop asks to renew it.",
      citationIds: ["rfc2131"],
    },
  ],
  citations: cite("rfc2131", "rfc2132", "rfc1918"),
};

const arpLesson = {
  version: 1,
  title: "How ARP finds a device on your network",
  question: "How does my laptop find the router's MAC address?",
  devices: [
    { id: "laptop", kind: "laptop", label: "Your laptop 192.168.1.20" },
    { id: "switch", kind: "switch", label: "Network switch" },
    { id: "router", kind: "router", label: "Router 192.168.1.1" },
    { id: "printer", kind: "server", label: "Printer 192.168.1.30" },
  ],
  links: [
    { a: "laptop", b: "switch" },
    { a: "switch", b: "router" },
    { a: "switch", b: "printer" },
  ],
  steps: [
    {
      id: "need_mac",
      action: { type: "highlight", device: "laptop", caption: "Knows the router's IP, not its MAC" },
      narration: "Your laptop wants to send data to the router at 192.168.1.1. On the local network, frames are delivered by hardware MAC address, and the laptop doesn't know it yet.",
      citationIds: ["rfc826"],
    },
    {
      id: "request_router",
      action: { type: "send", path: ["laptop", "switch", "router"], packet: { protocol: "ARP", label: "Who has 192.168.1.1?", fields: { to: "ff:ff:ff:ff:ff:ff (everyone)" } } },
      narration: "So it broadcasts an ARP request to everyone on the network: who has 192.168.1.1? Tell 192.168.1.20.",
      citationIds: ["rfc826"],
    },
    {
      id: "request_printer",
      action: { type: "send", path: ["switch", "printer"], packet: { protocol: "ARP", label: "Who has 192.168.1.1?" } },
      narration: "Because it's a broadcast, every device on the local network receives a copy, including the printer.",
      citationIds: ["rfc826"],
    },
    {
      id: "printer_ignores",
      action: { type: "highlight", device: "printer", caption: "Not my address. Ignores it." },
      narration: "The printer sees the question isn't about its own address, so it stays quiet.",
      citationIds: ["rfc826"],
    },
    {
      id: "router_recognizes",
      action: { type: "highlight", device: "router", caption: "That's me!" },
      narration: "The router recognises its own IP address. It also notes the laptop's MAC address from the request.",
      citationIds: ["rfc826"],
    },
    {
      id: "reply",
      action: { type: "send", path: ["router", "switch", "laptop"], packet: { protocol: "ARP", label: "192.168.1.1 is at 02:1a:2b:3c:4d:5e", fields: { mac: "02:1a:2b:3c:4d:5e" } } },
      narration: "The router sends an ARP reply straight back to the laptop only: 192.168.1.1 is at this MAC address.",
      citationIds: ["rfc826"],
    },
    {
      id: "cache",
      action: { type: "highlight", device: "laptop", caption: "Saves it in the ARP cache" },
      narration: "The laptop stores the answer in its ARP cache, so it doesn't have to ask again for every packet.",
      citationIds: ["rfc826"],
    },
    {
      id: "send_data",
      action: { type: "send", path: ["laptop", "switch", "router"], packet: { protocol: "IP", label: "Data to the router", fields: { "dst MAC": "02:1a:2b:3c:4d:5e" } } },
      narration: "Now the laptop can wrap its data in a frame addressed to the router's MAC address and send it on its way.",
      citationIds: ["rfc826", "rfc791"],
    },
  ],
  citations: cite("rfc826", "rfc791"),
};

export const GOLDEN_LESSONS = [websiteLesson, firewallLesson, dhcpLesson, arpLesson];
