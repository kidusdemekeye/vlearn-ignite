// Built-in, hand-written OSI teaching scene data. No DOM. Labelled "Built-in · reviewed" in the app.
// The OSI model is a teaching reference model; the real internet uses the TCP/IP model (RFC 1122).
import { SOURCE_LIBRARY } from "./core.js";

export const OSI_LAYERS = [
  { n: 7, name: "Application", pdu: "data", example: "HTTP, DNS",
    narration: "Layer 7 is where programs ask the network for something, like a browser requesting a web page over HTTP or looking up a name with DNS. The data starts here." },
  { n: 6, name: "Presentation", pdu: "data", example: "TLS encryption, character encoding",
    narration: "Layer 6 shapes how data is represented: character encoding and encryption. TLS is often placed at this layer, though it does not map cleanly onto any single OSI layer." },
  { n: 5, name: "Session", pdu: "data", example: "session setup and teardown",
    narration: "Layer 5 sets up, manages and tears down conversations between two programs. In the real internet, applications and transport protocols usually handle this work." },
  { n: 4, name: "Transport", pdu: "segment", example: "TCP, UDP",
    narration: "Layer 4 splits data into segments (UDP calls its unit a datagram) and adds a header with port numbers. TCP also adds numbering and acknowledgements for reliable delivery." },
  { n: 3, name: "Network", pdu: "packet", example: "IP",
    narration: "Layer 3 wraps the segment in a packet with an IP header holding source and destination addresses, so routers can forward it across networks toward its destination." },
  { n: 2, name: "Data Link", pdu: "frame", example: "Ethernet, Wi-Fi (802.11) MAC",
    narration: "Layer 2 wraps the packet in a frame for one local hop. It adds a header with MAC addresses and a trailer, the FCS, which lets the receiver detect damaged frames." },
  { n: 1, name: "Physical", pdu: "bits", example: "cables, radio signals",
    narration: "Layer 1 turns the frame into bits and sends them as electrical signals, light pulses or radio waves. It has no addressing and does not understand the data it carries." },
];

const ids = ["rfc1122", "rfc9293", "rfc791", "ieee80211_2020"];
export const OSI_CITATIONS = ids.map((id) => {
  const s = SOURCE_LIBRARY.find((x) => x.id === id);
  if (!s) throw new Error("missing library source " + id);
  return { ...s };
});

const DOWN = {
  7: ["Layer 7: the app creates data", "The application creates the data to send, such as an HTTP request. No lower-layer headers exist yet."],
  6: ["Layer 6: encode and encrypt the data", "Presentation prepares the data: character encoding and encryption. TLS is often placed here, though it does not map cleanly onto one OSI layer."],
  5: ["Layer 5: manage the session", "Session keeps track of the conversation between the two programs. In practice this is mostly handled by applications and the transport protocol."],
  4: ["Layer 4: add a transport header (segment)", "Transport adds a header with port numbers, making a segment. TCP segments also carry sequence numbers; with UDP the unit is called a datagram."],
  3: ["Layer 3: add an IP header (packet)", "Network adds an IP header with source and destination IP addresses. The result is a packet that routers can forward between networks."],
  2: ["Layer 2: add header and trailer (frame)", "Data Link adds a header with MAC addresses and a trailer with the FCS, a check value. The result is a frame for the next hop."],
  1: ["Layer 1: convert the frame to bits", "Physical turns the frame into bits and encodes them as electrical, light or radio signals ready to leave the device."],
};
const UP = {
  1: ["Layer 1: receive the signal as bits", "The receiver's physical layer detects the electrical, light or radio signal and turns it back into bits."],
  2: ["Layer 2: check the FCS, remove header and trailer", "Data Link checks the FCS to detect damage, checks the MAC address, then removes the frame header and trailer, leaving the packet."],
  3: ["Layer 3: remove the IP header", "Network checks the destination IP address, then removes the IP header (decapsulation), leaving the segment."],
  4: ["Layer 4: remove the transport header", "Transport uses the port number to find the right program and removes its header. TCP also checks numbering and acknowledges receipt."],
  5: ["Layer 5: hand data to the session", "Session matches the data to the ongoing conversation between the two programs, then passes it upward."],
  6: ["Layer 6: decrypt and decode the data", "Presentation reverses the encoding and decrypts the data, so the application receives readable content."],
  7: ["Layer 7: the app receives the data", "The application gets the original data, such as the HTTP request. Each layer removed its own header on the way up."],
};

const step = (side, layer, [caption, narration]) => ({ side, layer, caption, narration });
const LAYERS_DOWN = [7, 6, 5, 4, 3, 2, 1];

export function osiSteps(focus) {
  if (focus === "layers") {
    return OSI_LAYERS.map((l) => ({
      side: "sender", layer: l.n, caption: `Layer ${l.n}: ${l.name} (${l.pdu})`, narration: l.narration,
    }));
  }
  if (focus === "encapsulation") {
    return [
      ...LAYERS_DOWN.map((n) => step("sender", n, DOWN[n])),
      step("medium", 1, ["Across the medium: bits travel", "The bits travel over the cable or through the air as radio signals to the receiving device. The network medium only carries bits."]),
      ...[...LAYERS_DOWN].reverse().map((n) => step("receiver", n, UP[n])),
    ];
  }
  throw new Error(`Unknown OSI focus: ${focus}`);
}
