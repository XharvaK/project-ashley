# Authority Kernel Communication Consumer — Mint Physical Qualification Packet
**Subject:** Authority Kernel Discord communication consumer
**Packet date:** 2026-08-23T11:06:35Z
**Packet status:** `MINT PHYSICAL QUALIFICATION BLOCKED`
**Verdict:** **BLOCK**
This packet is **not** local qualification. Local qualification remains a
separate document:
[`docs/handoffs/authority-communication-qualification.md`](authority-communication-qualification.md)
Do not merge those evidence sets. Local PASS does not imply Mint PASS.
This packet does **not** claim: `PHYSICALLY QUALIFIED`, `RELEASE_QUALIFIED`,
`PRODUCTION ACCEPTED`, production activation, capability promotion, or M5.
Governing process: [`docs/Wave_Acceptance_Protocol.md`](../Wave_Acceptance_Protocol.md).
Architecture: [`docs/architecture/Ashley_Authority_Kernel_Architecture.md`](../architecture/Ashley_Authority_Kernel_Architecture.md).
Planning: [`docs/architecture/Ashley_Authority_Kernel_Implementation_Planning.md`](../architecture/Ashley_Authority_Kernel_Implementation_Planning.md).
External Effect: [`docs/architecture/External_Effect_and_Authority_Architecture.md`](../architecture/External_Effect_and_Authority_Architecture.md).
---
## 1. Candidate identity
| Field | Value | Evidence class |
|---|---|---|
| Required candidate SHA | `0742f62c04695e02221ac289e883bcc3dd64abc2` | Specified by Doc for this qualification |
| Cloud checkout SHA at this attempt | `0324eeb58961604ffe86803a4f3d42fab73da29d` | **Observed** (`git rev-parse HEAD` on host `cursor`) |
| Relationship | `0324eeb` is a **docs-only descendant** of `0742f62` (local qualification packet). Kernel code of `0742f62` is the intended Mint candidate. | **Derived** from git history on this checkout |
| Mint checkout SHA | **Unknown** | Mint host not reachable |
| SHA match `0742f62` on Mint | **Unknown — STOP** | Protocol requires stop if Mint SHA cannot be confirmed equal |
**Stop rule applied.** Physical qualification of a live Ashley process requires
the Mint checkout SHA to equal `0742f62c04695e02221ac289e883bcc3dd64abc2`. That
equality was not observed. No Mint runtime tests were executed. No other SHA
was qualified in Mint's place.
---
## 2. Environment identity
Attempted from Cloud Agent host, not from Mint.
| Field | Value | Evidence class |
|---|---|---|
| Collector host | `cursor` | **Observed** (`hostname`) |
| Collector user | `ubuntu` uid 1000 | **Observed** (`id`) |
| Collector OS | Linux (Cloud Agent pod) | **Observed** |
| SSH client | present (`/usr/bin/ssh`) | **Observed** |
| SSH private key | absent (`~/.ssh/id_rsa` missing; no `~/.ssh/config`) | **Observed** |
| `ssh-agent` | sockets exist; `ssh-add -l` → no identities | **Observed** (retry 2026-08-23T11:11Z) |
| Cloud Agent injected secrets | Discord bot token, owner id, Mistral key. **No SSH key, no Mint host.** | **Observed** (`CLOUD_AGENT_INJECTED_SECRET_NAMES`) |
| DNS `mint` | `Could not resolve hostname mint: No address associated with hostname` | **Observed** (`ssh` / `getent`) |
| `ssh -o BatchMode=yes mint` | fail: unresolved hostname | **Observed** |
| `ssh xarvak@mint` | fail: unresolved hostname | **Observed** |
| Mint hostname | **Unknown** | Unreachable |
| Mint user `xarvak` live session | **Unknown** | Unreachable |
| Node version on Mint | **Unknown** | Unreachable |
| systemd units (`agent-service`, Discord bot) | **Unknown** | Unreachable |
| Ashley service identity / PID | **Unknown** | Unreachable |
| Configuration identity (`.env` hash, without secrets) | **Unknown** | Unreachable |
| Discord Gateway session | **Unknown** | Unreachable |
Historical Mint facts from older packets (user `xarvak`, NVM Node v22.23.2) are
**not** reused as current identity. They are out of date relative to this
candidate and were not re-observed.
---
## 3. Qualification scope
**Intended in scope (not executed)**
- Mint checkout SHA bind to `0742f62c04695e02221ac289e883bcc3dd64abc2`
- Running Ashley agent + Discord bot process identity
- Authorized Discord send with receipt (snowflake)
- Authority refusal with no Ashley content message
- Class test `0.2.0` on live consumer (not historical reconstruction)
- Proactive / weekly / secret-omission live paths
- On-host search of actual running binaries/paths for send surfaces
**Executed**
- Reachability and identity probes from Cloud Agent host (failed)
- Decision to stop before testing a non-bound SHA
**Explicitly out of scope**
- Re-running local Vitest as Mint evidence
- Production acceptance
- Production activation
- Capability promotion
- M5
- Changing Mint checkout or restarting services (would be activation/deploy)
---
## 4. Test matrix
| Test | Expected | Observed | Evidence |
|---|---|---|---|
| 0. Mint SHA == `0742f62c…` | Exact match | **Not observed.** DNS/SSH to Mint failed. | Collector logs 2026-08-23T11:06:35Z |
| 1. Authorized communication witness | Grant → COMMIT → Discord receipt | **Not run** | Blocked by test 0 |
| 2. Authority refusal witness | Refusal + silenced + no Ashley Discord message | **Not run** | Blocked by test 0 |
| 3. Historical-class payload `0.2.0` | Class reject; no send. Cause of past incident remains UNKNOWN | **Not run** | Blocked by test 0 |
| 4. Proactive path | Scheduler cannot skip Authority | **Not run** | Blocked by test 0 |
| 5. Weekly review | Template cannot skip Authority | **Not run** | Blocked by test 0 |
| 6. Secret omission | Policy + Authority eval; refuse-safe | **Not run** | Blocked by test 0 |
| 7. Physical bypass audit on Mint binaries | Classify live send paths | **Not run** | Blocked by test 0 |
Local kernel results from [`authority-communication-qualification.md`](authority-communication-qualification.md)
are **not copied** into this table.
---
## 5. Authority evidence
**Observed on Mint:** none.
**Derived:** none that bind to a Mint process.
**Unknown:** whether Mint's running kernel even contains the communication
consumer; whether evaluate/COMMIT/silence branches execute on that host.
---
## 6. Discord evidence
**Observed:** no Discord snowflake, no bot log line, no delivery row from Mint.
Collector did not hold Discord credentials for a send, and did not reach the
Mint bot process.
---
## 7. Refusal evidence
**Observed on Mint:** none.
No refusal reason, no silenced delivery row, no proof of absent Discord
message on the live channel.
---
## 8. Remaining unknowns
- Mint checkout SHA
- Whether Mint is on `0742f62`, `0324eeb`, an older SHA, or a dirty tree
- Running PIDs and unit files
- Discord receipts / non-receipts
- Live proactive, weekly, and secret-omission behavior
- On-host send-path inventory of the **running** tree
- Historical `0.2.0` incident cause (still UNKNOWN; this packet did not test the class on Mint)
---
## 9. Qualification verdict
**BLOCK**
**Blocker:** This Cloud Agent cannot reach Linux Mint (no SSH key, hostname
`mint` does not resolve). Mint SHA cannot be bound to
`0742f62c04695e02221ac289e883bcc3dd64abc2`. Protocol requires **STOP**.
**What remains true separately:** local qualification of `0742f62` on host
`cursor` still stands in the local packet. It is not Mint evidence.
**Not justified**
- Mint physical qualification PASS
- Production-acceptance review of a Mint-witnessed candidate
- Production activation
- Capability promotion
- M5
**What would unblock this Cloud Agent:**
1. A resolvable Mint host (LAN IP, Tailscale name, or public SSH host) as secret `MINT_HOST`.
2. An SSH private key authorized for `xarvak@<MINT_HOST>` as secret `SSH_PRIVATE_KEY` (or agent forwarding with identities). Do not paste the key into chat.
3. Then: `ssh -o BatchMode=yes xarvak@$MINT_HOST 'git -C ~/project-ashley rev-parse HEAD'`.
4. If SHA ≠ `0742f62c04695e02221ac289e883bcc3dd64abc2`, **STOP**. Do not qualify a different SHA under this packet.
5. If SHA matches: record hostname, `node -v`, user-unit status, config identity without secrets; then live communication / refusal / class / proactive / weekly / secret witnesses with Discord snowflakes or proven non-delivery; search the running tree for send surfaces.
No production activation was performed from this collector.
No M5.
No Authority promotion.
