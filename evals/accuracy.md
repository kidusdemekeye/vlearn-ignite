# Lesson accuracy review (CCNA / Network+ level)

Rated 2026-11-15. 15 lessons: 9 standalone (q01-q09) and 6 from courses. q10 ("What is a good recipe for banana bread?") correctly refused with a polite, one-line scope message ("V Learn can only help with computer networking questions..."). No lesson was produced, which is the right result.

## Summary

| File | Question / topic | Accuracy | Citation fit | Problems |
|---|---|---|---|---|
| outputs/q01.txt | Ping a server | Correct | Good | None of substance. |
| outputs/q02.txt | NAT / one public IP | Correct | Good | `private_addresses`: the caption says the router "hands out" addresses, which is DHCP (RFC 2131, not cited). RFC 1918 only defines the ranges. A nit. |
| outputs/q03.txt | Email laptop to inbox | Minor imprecision | Partial | See below. |
| outputs/q04.txt | What traceroute does | Correct | Good | `probe_ttl1`..`probe_ttl4`: classic traceroute raises the UDP port for every probe (3 per hop), not once per hop. Acceptable simplification. |
| outputs/q05.txt | TCP connection close | Correct | Good | None. Seq/ack numbers, states (FIN-WAIT-1/2, CLOSE-WAIT, LAST-ACK, TIME-WAIT 2xMSL) are all right. |
| outputs/q06.txt | SSH login | Correct | Partial | See below. |
| outputs/q07.txt | Switch MAC learning | Minor imprecision | Poor | See below. |
| outputs/q08.txt | Why QUIC | Correct | Partial | See below. |
| outputs/q09.txt | DNS caching | Correct | Good | None. The decremented TTL (3600 to 3540) on the cache hit is a nice, accurate touch. |
| course/intro-lesson-01.txt | Joining Wi-Fi (beacon to 4-way handshake) | Minor imprecision | Good | See below. |
| course/intro-lesson-02.txt | DHCP DORA | Correct | Good | None. 0.0.0.0 to 255.255.255.255, UDP 68 to 67, broadcast REQUEST with server ID, and options in ACK (RFC 2132) are all correct. |
| course/intro-lesson-03.txt | DNS iterative resolution | Correct | Good | None. |
| course/intro-lesson-04.txt | TCP three-way handshake | Correct | Good | None. SYN seq 1000, SYN-ACK seq 5000/ack 1001, ACK seq 1001/ack 5001 are consistent. |
| course/routing-lesson-01.txt | Default gateway and ARP | Minor imprecision | Good | See below. |
| course/routing-lesson-03.txt | Traceroute TTL / Time Exceeded | Correct | Good | None. TTL arithmetic (3 becomes 2, then 1, then reaches the host) is correct. |

## Specific problems

**q03 (email)**
- `tls_login`: on port 587 the client does not send a TLS ClientHello straight after the TCP handshake. Correction: it sends EHLO, then STARTTLS, and only then the TLS handshake. Implicit TLS from the first byte is port 465.
- `tls_login` / `submit`: login (SMTP AUTH, RFC 4954), STARTTLS (RFC 3207) and submission on 587 (RFC 6409) are not what RFC 5321 defines. Correction: cite those RFCs. None of them is in the vetted library, so this is a library gap.
- `data`: after the DATA command the server replies 354 before the content is sent. An acceptable omission.
- `inbox`: storing mail in a mailbox and IMAP are outside RFC 5321. Correction: cite IMAP (RFC 9051), or drop the citation for that sentence.

**q06 (SSH)**
- `user_auth`, `server_accepts`: user authentication is defined in RFC 4252, and channels/shell in RFC 4254, not in RFC 4253 (transport). Correction: cite 4252/4254. Both are missing from the library.
- `versions`, `newkeys`: the narration says "both sides send" but the path shows only laptop to server. Correction: add the reverse send, or say the server does the same.
- `kexinit`: the algorithm chosen is the first one in the client's list that the server also supports, not "the best one". A wording nit.

**q07 (switch learning)**
- `empty_table`, `learn_a`, `flood_b`, `learn_b`, `forward_a`, `aging`: MAC learning, flooding and aging are defined by IEEE 802.1D/802.1Q bridging, not RFC 826 (ARP). Correction: cite IEEE 802.1Q. It is not in the library, so the citation should be removed rather than misattributed. Citing RFC 826 only fits `a_broadcast`, `c_ignores` and `b_reply`.
- `forward_a`: "keeps traffic private" is a security misconception, because switching is not a confidentiality control (MAC flooding, port mirroring). Correction: say it "reduces unnecessary traffic to other ports".

**q08 (QUIC)**
- `alt_svc`, `remember`: the Alt-Svc header is defined in RFC 7838. RFC 9114 only uses it for HTTP/3 discovery. This is a partial fit.
- `quic_initial`, `quic_handshake`: how TLS is carried in QUIC is RFC 9001, not RFC 9000. Correction: cite RFC 9001, which is not in the library.
- The technical content is accurate: the RTT comparison, client stream IDs 0 and 4, no head-of-line blocking (HOL), connection-ID migration and the TCP fallback are all right.

**intro-lesson-01 (Wi-Fi)**
- `handshake_3`: a wrong passphrase is detected by the AP when it checks the MIC on message 2, and the AP then never sends message 3. Correction: move the wrong-password sentence to `handshake_2` and say "the AP checks message 2's MIC; if the password is wrong it fails here".
- `handshake_2`: the fields show only the SNonce. Correction: message 2 also carries a MIC, which is what proves the laptop knows the key.

**routing-lesson-01 (default gateway)**
- `deliver`: the packet is shown crossing "Internet" with src ip 192.168.1.20. RFC 1918 addresses are not routed on the internet. Correction: relabel the cloud "Other networks / ISP", or note that the home router NATs the source (as q01/q02 teach).
- `deliver`: the TTL is fixed at 63 along the whole multi-router path. Correction: TTL is 63 after the first router and drops by one at every further hop.

## Totals

Accuracy: 11/15 Correct, 4 Minor, 0 Wrong. Citation fit: 11 Good, 3 Partial, 1 Poor. Refusal (q10): passed.

## Method

I am an independent rater who did not write these lessons, and the review was read-only: the only file created is this one. For each lesson I read the question, device topology, every step's action, path and order, packet labels and fields, narration, and the cited sources. For course lessons I also checked the matching outline item and module page text (app/samples/intro-module.js TEXT, evals/course/module-routing.txt). Accuracy grades: Correct; Minor imprecision (a detail is off but the core lesson is right); Wrong (a student would learn something false, or the steps are in an impossible order). Simplification suitable for beginners was not penalised. Citation fit grades whether each cited RFC/standard actually defines what the step shows (Good / Partial / Poor). Where the right source is absent from the vetted library in app/core.js (for example IEEE 802.1Q, RFC 4252/4254, 6409, 3207, 9001, 7838), this is noted as a library gap, not only a model error.
