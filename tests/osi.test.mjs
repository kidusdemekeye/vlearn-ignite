import { test } from "node:test";
import assert from "node:assert/strict";
import { SOURCE_LIBRARY } from "../app/core.js";
import { OSI_LAYERS, OSI_CITATIONS, osiSteps } from "../app/osi.js";

test("OSI_LAYERS has 7 layers in order 7..1", () => {
  assert.deepEqual(OSI_LAYERS.map((l) => l.n), [7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(
    OSI_LAYERS.map((l) => l.name),
    ["Application", "Presentation", "Session", "Transport", "Network", "Data Link", "Physical"],
  );
});

test("OSI_LAYERS PDU names are exact", () => {
  assert.deepEqual(
    OSI_LAYERS.map((l) => l.pdu),
    ["data", "data", "data", "segment", "packet", "frame", "bits"],
  );
});

test("every layer has an example and a short narration", () => {
  for (const l of OSI_LAYERS) {
    assert.ok(l.example.length > 0, `example ${l.n}`);
    assert.ok(l.narration.length > 0 && l.narration.length <= 300, `narration ${l.n}`);
  }
});

test("OSI_CITATIONS are exact library entries", () => {
  assert.deepEqual(OSI_CITATIONS.map((c) => c.id), ["rfc1122", "rfc9293", "rfc791", "ieee80211_2020"]);
  for (const c of OSI_CITATIONS) {
    assert.deepEqual(c, SOURCE_LIBRARY.find((s) => s.id === c.id));
  }
});

test("encapsulation has 15 steps, layer 7 to layer 7", () => {
  const s = osiSteps("encapsulation");
  assert.equal(s.length, 15);
  assert.equal(s[0].layer, 7);
  assert.equal(s[14].layer, 7);
  assert.deepEqual(s.slice(0, 7).map((x) => x.layer), [7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(s.slice(8).map((x) => x.layer), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(s.map((x) => x.side), [
    ...Array(7).fill("sender"), "medium", ...Array(7).fill("receiver"),
  ]);
  assert.equal(s[7].layer, 1);
});

test("layers focus has 7 sender steps, layer 7 to 1", () => {
  const s = osiSteps("layers");
  assert.deepEqual(s.map((x) => x.layer), [7, 6, 5, 4, 3, 2, 1]);
  assert.ok(s.every((x) => x.side === "sender"));
});

test("every step caption <= 80 and narration <= 300 chars", () => {
  for (const f of ["encapsulation", "layers"]) {
    for (const x of osiSteps(f)) {
      assert.ok(x.caption.length > 0 && x.caption.length <= 80, x.caption);
      assert.ok(x.narration.length > 0 && x.narration.length <= 300, x.narration);
    }
  }
});

test("unknown focus throws", () => {
  assert.throws(() => osiSteps("nope"));
  assert.throws(() => osiSteps());
});

test("narration wording is precise about headers, PDUs and the medium", () => {
  const enc = osiSteps("encapsulation");
  assert.match(enc[14].narration, /Layers 4, 3 and 2 each removed the header that the sender's matching layer added\./);
  assert.doesNotMatch(enc[14].narration, /Each layer removed its own header/);
  assert.match(enc[7].narration, /The network medium carries signals that represent the bits/);
  assert.doesNotMatch(enc[7].narration, /only carries bits/);
  const l4 = OSI_LAYERS.find((l) => l.n === 4).narration;
  assert.match(l4, /^Layer 4 adds a header with port numbers\. TCP splits data into segments; UDP sends each message as one datagram\./);
});
