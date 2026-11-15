// The sample class module and its pre-converted course, so "Try the sample module" plays
// without an AI connection. The module text is our own. The course was written by following
// the rules in buildOutlinePrompt and buildModuleLessonPrompt (core.js), then validated:
// tests/sample.test.mjs checks it with validateCourse and validateLesson.
// It is AI-style content, so it keeps the AI labels (spec decision 5).
import { SOURCE_LIBRARY } from "../core.js";

const cite = (...ids) => ids.map((id) => {
  const s = SOURCE_LIBRARY.find((x) => x.id === id);
  if (!s) throw new Error("unknown source " + id);
  return { ...s };
});

const LABEL_LESSON = "AI-built · structure checked, not hand-verified";
const LABEL_CARD = "From your module · AI summary";
const LABEL_OSI = "Built-in · reviewed";

const TEXT = `[page 1]
Module 1: How your laptop gets online
Networks are easier to understand in layers. The OSI model splits networking into seven layers: Application, Presentation, Session, Transport, Network, Data Link and Physical. When you send something, each layer wraps the data from the layer above with its own header. This is called encapsulation. The receiver unwraps the layers in reverse order. The OSI model is a teaching model; the real internet is built on the simpler TCP/IP model, which groups the work into four layers: application, transport, internet and link.

[page 2]
Joining a Wi-Fi network
Wi-Fi is defined by the IEEE 802.11 standard. An access point (AP) regularly broadcasts beacon frames that announce its network name (SSID) and capabilities, about ten times a second. A laptop can wait for beacons, or it can send a probe request and get a probe response. To join, the laptop first sends an authentication frame. On a WPA2-Personal network this is "open system" authentication, which is only a formality; WPA3 uses a stronger exchange called SAE instead. Next the laptop sends an association request, and the AP answers with an association response. On a protected network, the laptop and the AP then run the 4-way handshake to create the keys that encrypt the traffic.

[page 3]
Getting an IP address with DHCP
Once the laptop has joined, it still needs an IP address. DHCP hands one out in four messages, often remembered as DORA: Discover, Offer, Request, Acknowledge. The laptop broadcasts a DHCPDISCOVER because it does not know the server yet. In a home, the DHCP server usually runs on the router. The server offers an address, the laptop requests it, and the server confirms with a DHCPACK. The lease also tells the laptop its subnet mask, its default gateway (the router) and which DNS server to use. Home networks use private addresses such as 192.168.1.x.

[page 4]
Finding names with DNS
People type names like example.com, but packets need IP addresses. The laptop asks a DNS resolver, usually over UDP port 53. If the resolver has no cached answer, it walks the DNS tree: a root server points it to the .com servers, the .com servers point it to the domain's authoritative server, and that server returns the address. The resolver caches the answer for as long as its TTL allows.

[page 5]
Opening a connection with TCP
Web traffic usually runs over TCP, which gives a reliable, ordered stream. Before any data is sent, TCP sets up a connection with a three-way handshake. The client sends a SYN with its starting sequence number. The server answers with a SYN-ACK, which carries its own sequence number and acknowledges the client's. The client replies with an ACK. Now both sides know each other's starting numbers and data can flow. Secure websites use port 443.

[page 6]
Cables and radio: Ethernet vs Wi-Fi
Wired Ethernet usually runs over twisted-pair copper cable, such as Cat 5e or Cat 6, with an RJ45 plug; long or fast links often use fiber. Wi-Fi carries the same kind of layer 2 frames over radio, in the 2.4 GHz, 5 GHz and 6 GHz bands. A cable gives each device a dedicated link that is usually faster and more stable. Wi-Fi devices share the air with everything nearby, so walls, distance and busy channels slow it down. Both use MAC addresses to deliver frames on the local network.`;

export const SAMPLE_MODULE = {
  title: "Intro to Networking: How your laptop gets online",
  text: TEXT,
  pages: 6,
  slides: 0,
};

// ---------- Lessons (one per lesson item; each passes validateLesson with pages: 6) ----------

const wifiLesson = {
  version: 1,
  title: "How your laptop joins a Wi-Fi network",
  question: "How does my laptop join a Wi-Fi network?",
  devices: [
    { id: "laptop", kind: "laptop", label: "Your laptop" },
    { id: "ap", kind: "access_point", label: "Home Wi-Fi AP" },
  ],
  links: [{ a: "laptop", b: "ap" }],
  steps: [
    {
      id: "beacon",
      action: { type: "send", path: ["ap", "laptop"], packet: { protocol: "802.11", label: "Beacon: HomeNet is here", fields: { frame: "Beacon (management)", SSID: "HomeNet", sent: "about 10 times a second" } } },
      narration: "The access point keeps broadcasting beacon frames. Each one announces the network name, called the SSID, and what the network supports.",
      citationIds: ["ieee80211_2020", "module_p2"],
    },
    {
      id: "probe_req",
      action: { type: "send", path: ["laptop", "ap"], packet: { protocol: "802.11", label: "Probe request: HomeNet?", fields: { frame: "Probe request (management)", SSID: "HomeNet" } } },
      narration: "Instead of only waiting for beacons, your laptop can ask directly with a probe request: is the HomeNet network nearby?",
      citationIds: ["ieee80211_2020", "module_p2"],
    },
    {
      id: "probe_resp",
      action: { type: "send", path: ["ap", "laptop"], packet: { protocol: "802.11", label: "Probe response: yes", fields: { frame: "Probe response (management)", SSID: "HomeNet" } } },
      narration: "The access point answers with a probe response that carries the same kind of details as a beacon.",
      citationIds: ["ieee80211_2020"],
    },
    {
      id: "auth_req",
      action: { type: "send", path: ["laptop", "ap"], packet: { protocol: "802.11", label: "Authentication (open system)", fields: { frame: "Authentication (management)", algorithm: "Open System", sequence: "1" } } },
      narration: "To join, the laptop sends an authentication frame. On a WPA2-Personal network this is open system authentication, a formality. WPA3 uses a stronger exchange called SAE here.",
      citationIds: ["ieee80211_2020", "module_p2"],
    },
    {
      id: "auth_resp",
      action: { type: "send", path: ["ap", "laptop"], packet: { protocol: "802.11", label: "Authentication: success", fields: { frame: "Authentication (management)", sequence: "2", status: "success" } } },
      narration: "The access point replies that authentication succeeded. The laptop still has no encryption keys and cannot send normal traffic yet.",
      citationIds: ["ieee80211_2020"],
    },
    {
      id: "assoc_req",
      action: { type: "send", path: ["laptop", "ap"], packet: { protocol: "802.11", label: "Association request", fields: { frame: "Association request (management)", SSID: "HomeNet" } } },
      narration: "Next the laptop sends an association request, asking to become a member of this network and listing the features it supports.",
      citationIds: ["ieee80211_2020", "module_p2"],
    },
    {
      id: "assoc_resp",
      action: { type: "send", path: ["ap", "laptop"], packet: { protocol: "802.11", label: "Association response: OK", fields: { frame: "Association response (management)", status: "success", "association ID": "1" } } },
      narration: "The access point accepts with an association response and gives the laptop an association ID. The laptop is now connected to the access point.",
      citationIds: ["ieee80211_2020"],
    },
    {
      id: "four_way",
      action: { type: "highlight", device: "ap", caption: "4-way handshake: both sides build encryption keys" },
      narration: "On a protected network, the laptop and access point now run the 4-way handshake. They prove they share the Wi-Fi password and build fresh keys to encrypt traffic.",
      citationIds: ["ieee80211_2020", "module_p2"],
    },
  ],
  citations: cite("ieee80211_2020"),
};

const dhcpLesson = {
  version: 1,
  title: "How your laptop gets an IP address with DHCP",
  question: "How does my laptop get an IP address after joining Wi-Fi?",
  devices: [
    { id: "laptop", kind: "laptop", label: "Your laptop" },
    { id: "ap", kind: "access_point", label: "Home Wi-Fi AP" },
    { id: "router", kind: "router", label: "Home router (DHCP)" },
  ],
  links: [{ a: "laptop", b: "ap" }, { a: "ap", b: "router" }],
  steps: [
    {
      id: "discover",
      action: { type: "send", path: ["laptop", "ap", "router"], packet: { protocol: "DHCP", label: "DHCPDISCOVER", fields: { from: "0.0.0.0, UDP port 68", to: "255.255.255.255, UDP port 67" } } },
      narration: "Your laptop has no IP address yet and doesn't know where the DHCP server is, so it broadcasts a Discover message to the whole local network.",
      citationIds: ["rfc2131", "module_p3"],
    },
    {
      id: "offer",
      action: { type: "send", path: ["router", "ap", "laptop"], packet: { protocol: "DHCP", label: "DHCPOFFER: 192.168.1.23", fields: { "offered IP": "192.168.1.23", lease: "24 hours" } } },
      narration: "The DHCP server, which in a home usually runs on the router, offers a free address from its private range.",
      citationIds: ["rfc2131", "rfc1918", "module_p3"],
    },
    {
      id: "request",
      action: { type: "send", path: ["laptop", "ap", "router"], packet: { protocol: "DHCP", label: "DHCPREQUEST: 192.168.1.23", fields: { "requested IP": "192.168.1.23", to: "255.255.255.255" } } },
      narration: "The laptop asks for that address with a Request. It is broadcast too, so any other DHCP server knows its offer was not chosen.",
      citationIds: ["rfc2131"],
    },
    {
      id: "ack",
      action: { type: "send", path: ["router", "ap", "laptop"], packet: { protocol: "DHCP", label: "DHCPACK: it's yours", fields: { IP: "192.168.1.23", mask: "255.255.255.0", gateway: "192.168.1.1", DNS: "192.168.1.1" } } },
      narration: "The server confirms with an Acknowledge. Along with the address it sends options: the subnet mask, the default gateway and the DNS server to use.",
      citationIds: ["rfc2131", "rfc2132", "module_p3"],
    },
    {
      id: "configured",
      action: { type: "highlight", device: "laptop", caption: "Uses 192.168.1.23 until the lease runs out" },
      narration: "The laptop configures itself and can now talk on the network. Before the lease ends, it asks the server to renew it.",
      citationIds: ["rfc2131"],
    },
  ],
  citations: cite("rfc2131", "rfc2132", "rfc1918"),
};

const dnsLesson = {
  version: 1,
  title: "How DNS turns a name into an IP address",
  question: "How does my laptop find the IP address for example.com?",
  devices: [
    { id: "laptop", kind: "laptop", label: "Your laptop" },
    { id: "router", kind: "router", label: "Home router" },
    { id: "resolver", kind: "dns_resolver", label: "DNS resolver" },
    { id: "root", kind: "dns_root", label: "Root server" },
    { id: "tld", kind: "dns_tld", label: ".com server" },
    { id: "auth", kind: "dns_authoritative", label: "example.com DNS" },
  ],
  links: [
    { a: "laptop", b: "router" },
    { a: "router", b: "resolver" },
    { a: "resolver", b: "root" },
    { a: "resolver", b: "tld" },
    { a: "resolver", b: "auth" },
  ],
  steps: [
    {
      id: "query",
      action: { type: "send", path: ["laptop", "router", "resolver"], packet: { protocol: "DNS", label: "Where is example.com?", fields: { type: "A record", name: "example.com", transport: "UDP port 53" } } },
      narration: "Packets need an IP address, not a name. So your laptop asks a DNS resolver for the address of example.com, usually over UDP port 53.",
      citationIds: ["rfc1034", "rfc1035", "module_p4"],
    },
    {
      id: "cache_miss",
      action: { type: "highlight", device: "resolver", caption: "Not in its cache, so it has to look it up" },
      narration: "The resolver checks its cache first. Nobody has asked recently, so it starts at the top of the DNS tree.",
      citationIds: ["rfc1034"],
    },
    {
      id: "ask_root",
      action: { type: "send", path: ["resolver", "root"], packet: { protocol: "DNS", label: "example.com?" } },
      narration: "It asks a root server.",
      citationIds: ["rfc1034"],
    },
    {
      id: "root_ref",
      action: { type: "send", path: ["root", "resolver"], packet: { protocol: "DNS", label: "Ask the .com servers" } },
      narration: "The root server doesn't know the address, but it knows which servers run .com, and points the resolver to them.",
      citationIds: ["rfc1034", "module_p4"],
    },
    {
      id: "ask_tld",
      action: { type: "send", path: ["resolver", "tld"], packet: { protocol: "DNS", label: "example.com?" } },
      narration: "The resolver asks a .com server the same question.",
      citationIds: ["rfc1034"],
    },
    {
      id: "tld_ref",
      action: { type: "send", path: ["tld", "resolver"], packet: { protocol: "DNS", label: "Ask example.com's DNS" } },
      narration: "The .com server points it to the authoritative server, the one in charge of example.com.",
      citationIds: ["rfc1034"],
    },
    {
      id: "ask_auth",
      action: { type: "send", path: ["resolver", "auth"], packet: { protocol: "DNS", label: "example.com?" } },
      narration: "The resolver asks the authoritative server.",
      citationIds: ["rfc1034"],
    },
    {
      id: "answer",
      action: { type: "send", path: ["auth", "resolver"], packet: { protocol: "DNS", label: "203.0.113.10", fields: { type: "A record", address: "203.0.113.10", TTL: "3600 seconds" } } },
      narration: "It answers with the IP address and a time to live, which says how long the answer may be reused. This is a sample address.",
      citationIds: ["rfc1035", "rfc5737"],
    },
    {
      id: "cache",
      action: { type: "highlight", device: "resolver", caption: "Caches the answer until the TTL runs out" },
      narration: "The resolver saves the answer, so the next lookup for example.com is instant.",
      citationIds: ["rfc1034", "module_p4"],
    },
    {
      id: "reply",
      action: { type: "send", path: ["resolver", "router", "laptop"], packet: { protocol: "DNS", label: "example.com is 203.0.113.10" } },
      narration: "Finally the resolver sends the address back to your laptop, which can now contact the website.",
      citationIds: ["rfc1034"],
    },
  ],
  citations: cite("rfc1034", "rfc1035", "rfc5737"),
};

const tcpLesson = {
  version: 1,
  title: "The TCP three-way handshake",
  question: "How does TCP open a connection to a web server?",
  devices: [
    { id: "laptop", kind: "laptop", label: "Your laptop" },
    { id: "router", kind: "router", label: "Home router" },
    { id: "internet", kind: "internet", label: "Internet" },
    { id: "web", kind: "web_server", label: "example.com server" },
  ],
  links: [
    { a: "laptop", b: "router" },
    { a: "router", b: "internet" },
    { a: "internet", b: "web" },
  ],
  steps: [
    {
      id: "pick_isn",
      action: { type: "highlight", device: "laptop", caption: "Picks a starting sequence number" },
      narration: "Before sending any data, TCP sets up a connection. Your laptop picks a starting sequence number, used to number every byte it will send.",
      citationIds: ["rfc9293", "module_p5"],
    },
    {
      id: "syn",
      action: { type: "send", path: ["laptop", "router", "internet", "web"], packet: { protocol: "TCP", label: "SYN", fields: { flags: "SYN", seq: "1000 (example; real ones are random)", "to port": "443" } } },
      narration: "The laptop sends a SYN, short for synchronize, to the server's port 443. It carries the laptop's starting sequence number.",
      citationIds: ["rfc9293", "module_p5"],
    },
    {
      id: "syn_ack",
      action: { type: "send", path: ["web", "internet", "router", "laptop"], packet: { protocol: "TCP", label: "SYN-ACK", fields: { flags: "SYN, ACK", seq: "5000 (example)", ack: "1001" } } },
      narration: "The server answers with a SYN-ACK. It sends its own starting number and acknowledges the laptop's by asking for byte 1001 next.",
      citationIds: ["rfc9293"],
    },
    {
      id: "ack",
      action: { type: "send", path: ["laptop", "router", "internet", "web"], packet: { protocol: "TCP", label: "ACK", fields: { flags: "ACK", seq: "1001", ack: "5001" } } },
      narration: "The laptop replies with an ACK that acknowledges the server's number. That is the third and last message of the handshake.",
      citationIds: ["rfc9293", "module_p5"],
    },
    {
      id: "established",
      action: { type: "highlight", device: "web", caption: "Connection established: data can flow" },
      narration: "Both sides now know each other's starting numbers, so the connection is established and data can flow reliably and in order.",
      citationIds: ["rfc9293"],
    },
  ],
  citations: cite("rfc9293"),
};

// ---------- Course (what buildCourse returns: outline fields + full items with labels) ----------

const lesson = (topic, l) => ({ type: "lesson", topic, question: l.question, lesson: l, label: LABEL_LESSON });

export const SAMPLE_COURSE = {
  version: 1,
  title: "Intro to Networking: How your laptop gets online",
  source: "Intro to Networking: How your laptop gets online",
  items: [
    { type: "osi", focus: "encapsulation", label: LABEL_OSI },
    {
      type: "card",
      title: "OSI model vs TCP/IP model",
      points: [
        "The OSI model has seven layers and is used for teaching",
        "The real internet is built on the TCP/IP model",
        "TCP/IP groups the work into four layers: application, transport, internet, link",
      ],
      narration: "The OSI model is a teaching tool with seven layers. The internet itself runs on the TCP/IP model, which groups the same work into four layers.",
      citationIds: ["module_p1", "rfc1122"],
      label: LABEL_CARD,
    },
    lesson("Joining a Wi-Fi network", wifiLesson),
    lesson("Getting an IP address with DHCP", dhcpLesson),
    lesson("Finding names with DNS", dnsLesson),
    lesson("TCP three-way handshake", tcpLesson),
    {
      type: "card",
      title: "Ethernet vs Wi-Fi",
      points: [
        "Ethernet uses twisted-pair copper (Cat 5e, Cat 6) with RJ45 plugs, or fiber",
        "Wi-Fi sends the same kind of frames over radio: 2.4, 5 and 6 GHz",
        "A cable is a dedicated link, usually faster and more stable",
        "Wi-Fi devices share the air, so walls, distance and busy channels slow it down",
        "Both deliver frames on the local network using MAC addresses",
      ],
      narration: "Ethernet and Wi-Fi both carry frames addressed by MAC address. Ethernet uses a cable, which gives each device its own steady link. Wi-Fi uses radio waves that every nearby device shares.",
      citationIds: ["module_p6", "ieee80211_2020"],
      label: LABEL_CARD,
    },
  ],
  citations: cite("rfc1122", "ieee80211_2020"),
};
