/**
 * V Learn — Lesson Script Contract (v1)
 *
 * This is the one format every part of V Learn agrees on:
 *   - the AI brain WRITES lessons in this format
 *   - the validator CHECKS them
 *   - the animation engine (2D or 3D) PLAYS them
 *   - the narrator SPEAKS each step's narration
 *
 * Put this file at: src/contract/lesson.ts
 * Requires: npm install zod
 */
import { z } from "zod";

/* ---------- Building blocks ---------- */

export const DeviceKind = z.enum([
  "laptop",
  "phone",
  "router",
  "switch",
  "firewall",
  "dns_resolver",
  "dns_root",
  "dns_tld",
  "dns_authoritative",
  "web_server",
  "internet",
]);
export type DeviceKind = z.infer<typeof DeviceKind>;

export const Protocol = z.enum(["DNS", "TCP", "TLS", "HTTP", "ARP", "ICMP", "DHCP"]);
export type Protocol = z.infer<typeof Protocol>;

const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, "ids are lowercase_snake_case");

export const Device = z.object({
  id: Id,
  kind: DeviceKind,
  label: z.string().min(1).max(40), // shown under the icon, e.g. "Your laptop"
});
export type Device = z.infer<typeof Device>;

export const Link = z.object({
  a: Id,
  b: Id, // links are two-way cables/connections
});
export type Link = z.infer<typeof Link>;

export const Packet = z.object({
  protocol: Protocol,
  label: z.string().min(1).max(40), // shown on the moving packet, e.g. "SYN"
  fields: z.record(z.string(), z.string()).optional(), // shown when the packet is clicked
});
export type Packet = z.infer<typeof Packet>;

export const Citation = z.object({
  id: Id,
  title: z.string().min(1),
  url: z.string().url(),
});
export type Citation = z.infer<typeof Citation>;

/* ---------- Steps (what happens, in order) ---------- */

const SendAction = z.object({
  type: z.literal("send"),
  path: z.array(Id).min(2), // device ids the packet travels through, in order
  packet: Packet,
});

const DropAction = z.object({
  type: z.literal("drop"), // e.g. a firewall blocking traffic
  path: z.array(Id).min(2), // packet stops at the LAST device in the path
  packet: Packet,
  reason: z.string().min(1).max(120),
});

const HighlightAction = z.object({
  type: z.literal("highlight"), // something happens inside one device
  device: Id,
  caption: z.string().min(1).max(80), // e.g. "Saves the IP in its cache"
});

export const Action = z.discriminatedUnion("type", [SendAction, DropAction, HighlightAction]);
export type Action = z.infer<typeof Action>;

export const Step = z.object({
  id: Id,
  action: Action,
  narration: z.string().min(1).max(300), // what the tutor voice says
  citationIds: z.array(Id).min(1), // every step must be backed by a source
});
export type Step = z.infer<typeof Step>;

/* ---------- The lesson ---------- */

export const Lesson = z.object({
  version: z.literal(1),
  title: z.string().min(1).max(80),
  question: z.string().min(1), // what the student asked
  devices: z.array(Device).min(2).max(12),
  links: z.array(Link).min(1),
  steps: z.array(Step).min(1).max(40),
  citations: z.array(Citation).min(1),
});
export type Lesson = z.infer<typeof Lesson>;

/* ---------- Validator ---------- */

export type ValidationResult =
  | { ok: true; lesson: Lesson }
  | { ok: false; errors: string[] }; // errors go back to the AI so it can fix them

export function validateLesson(input: unknown): ValidationResult {
  const parsed = Lesson.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }

  const lesson = parsed.data;
  const errors: string[] = [];

  const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
  for (const d of dupes(lesson.devices.map((d) => d.id))) errors.push(`duplicate device id "${d}"`);
  for (const d of dupes(lesson.steps.map((s) => s.id))) errors.push(`duplicate step id "${d}"`);
  for (const d of dupes(lesson.citations.map((c) => c.id))) errors.push(`duplicate citation id "${d}"`);

  const deviceIds = new Set(lesson.devices.map((d) => d.id));
  const citationIds = new Set(lesson.citations.map((c) => c.id));
  const linked = new Set<string>();

  for (const l of lesson.links) {
    if (!deviceIds.has(l.a)) errors.push(`link uses unknown device "${l.a}"`);
    if (!deviceIds.has(l.b)) errors.push(`link uses unknown device "${l.b}"`);
    if (l.a === l.b) errors.push(`link connects "${l.a}" to itself`);
    linked.add(`${l.a}|${l.b}`).add(`${l.b}|${l.a}`);
  }

  for (const step of lesson.steps) {
    const where = `step "${step.id}"`;
    const a = step.action;

    if (a.type === "highlight") {
      if (!deviceIds.has(a.device)) errors.push(`${where}: unknown device "${a.device}"`);
    } else {
      a.path.forEach((id, i) => {
        if (!deviceIds.has(id)) errors.push(`${where}: unknown device "${id}" in path`);
        const next = a.path[i + 1];
        if (next !== undefined && !linked.has(`${id}|${next}`)) {
          errors.push(`${where}: no link between "${id}" and "${next}"`);
        }
      });
    }

    for (const c of step.citationIds) {
      if (!citationIds.has(c)) errors.push(`${where}: unknown citation "${c}"`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, lesson };
}

/* ---------- Golden example: what happens when you visit a website ---------- */

export const exampleLesson: Lesson = {
  version: 1,
  title: "What happens when you visit example.com",
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
    { a: "resolver", b: "root" },
    { a: "resolver", b: "tld" },
    { a: "resolver", b: "auth" },
    { a: "router", b: "web" },
  ],
  steps: [
    {
      id: "dns_query",
      action: {
        type: "send",
        path: ["laptop", "router", "resolver"],
        packet: { protocol: "DNS", label: "Where is example.com?", fields: { type: "A", name: "example.com" } },
      },
      narration:
        "Your computer only understands numbers, so first it asks a DNS resolver: what is the IP address for example.com?",
      citationIds: ["rfc1034"],
    },
    {
      id: "ask_root",
      action: { type: "send", path: ["resolver", "root"], packet: { protocol: "DNS", label: "example.com?" } },
      narration: "The resolver doesn't know yet, so it starts at the top of the DNS tree: a root server.",
      citationIds: ["rfc1034"],
    },
    {
      id: "root_referral",
      action: { type: "send", path: ["root", "resolver"], packet: { protocol: "DNS", label: "Ask the .com servers" } },
      narration: "The root server doesn't have the answer, but it knows who handles .com, and points the resolver there.",
      citationIds: ["rfc1034"],
    },
    {
      id: "ask_tld",
      action: { type: "send", path: ["resolver", "tld"], packet: { protocol: "DNS", label: "example.com?" } },
      narration: "The resolver asks the .com server.",
      citationIds: ["rfc1034"],
    },
    {
      id: "tld_referral",
      action: {
        type: "send",
        path: ["tld", "resolver"],
        packet: { protocol: "DNS", label: "Ask example.com's DNS" },
      },
      narration: "The .com server points it to the name server that is in charge of example.com.",
      citationIds: ["rfc1034"],
    },
    {
      id: "ask_auth",
      action: { type: "send", path: ["resolver", "auth"], packet: { protocol: "DNS", label: "example.com?" } },
      narration: "Finally, the resolver asks the server that has the real answer.",
      citationIds: ["rfc1034"],
    },
    {
      id: "auth_answer",
      action: {
        type: "send",
        path: ["auth", "resolver"],
        packet: { protocol: "DNS", label: "203.0.113.10", fields: { type: "A", address: "203.0.113.10" } },
      },
      narration: "It replies with the IP address. Here we use a sample address to keep things simple.",
      citationIds: ["rfc1035"],
    },
    {
      id: "resolver_cache",
      action: { type: "highlight", device: "resolver", caption: "Saves the answer in its cache" },
      narration: "The resolver remembers this answer for a while, so the next lookup is much faster.",
      citationIds: ["rfc1034"],
    },
    {
      id: "dns_reply",
      action: {
        type: "send",
        path: ["resolver", "router", "laptop"],
        packet: { protocol: "DNS", label: "203.0.113.10" },
      },
      narration: "The resolver sends the IP address back to your laptop. Now it knows where to go.",
      citationIds: ["rfc1034"],
    },
    {
      id: "syn",
      action: { type: "send", path: ["laptop", "router", "web"], packet: { protocol: "TCP", label: "SYN" } },
      narration: "Next your laptop opens a connection with a three-way handshake. First it sends a SYN: can we talk?",
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
      narration: "Your laptop replies with an ACK. The connection is now open.",
      citationIds: ["rfc9293"],
    },
    {
      id: "tls",
      action: {
        type: "send",
        path: ["laptop", "router", "web"],
        packet: { protocol: "TLS", label: "Let's encrypt" },
      },
      narration:
        "Because the site uses HTTPS, the two sides agree on encryption keys with TLS, so nobody in between can read the traffic.",
      citationIds: ["rfc8446"],
    },
    {
      id: "http_get",
      action: {
        type: "send",
        path: ["laptop", "router", "web"],
        packet: { protocol: "HTTP", label: "GET /", fields: { method: "GET", path: "/", host: "example.com" } },
      },
      narration: "Now your browser asks for the page with an HTTP GET request.",
      citationIds: ["rfc9110"],
    },
    {
      id: "http_ok",
      action: {
        type: "send",
        path: ["web", "router", "laptop"],
        packet: { protocol: "HTTP", label: "200 OK + page", fields: { status: "200 OK" } },
      },
      narration: "The server sends back 200 OK along with the page, and your browser draws it on the screen.",
      citationIds: ["rfc9110"],
    },
  ],
  citations: [
    { id: "rfc1034", title: "RFC 1034: Domain Names, Concepts and Facilities", url: "https://www.rfc-editor.org/rfc/rfc1034" },
    { id: "rfc1035", title: "RFC 1035: Domain Names, Implementation and Specification", url: "https://www.rfc-editor.org/rfc/rfc1035" },
    { id: "rfc9293", title: "RFC 9293: Transmission Control Protocol (TCP)", url: "https://www.rfc-editor.org/rfc/rfc9293" },
    { id: "rfc8446", title: "RFC 8446: The Transport Layer Security (TLS) Protocol Version 1.3", url: "https://www.rfc-editor.org/rfc/rfc8446" },
    { id: "rfc9110", title: "RFC 9110: HTTP Semantics", url: "https://www.rfc-editor.org/rfc/rfc9110" },
  ],
};
