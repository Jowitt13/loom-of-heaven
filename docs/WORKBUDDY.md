# WorkBuddy integration

Loom uses **Skill + local CLI**, not an MCP service. The maintained install/update protocol is
[the WorkBuddy installer](installers/workbuddy.md); start through [INSTALL.md](../INSTALL.md).
Do not use this page as a second set of install instructions.

## Installation and ordinary use

- Use the WorkBuddy ZIP selected by the published root manifest; verify its SHA-256 before import.
  A local candidate is used only when the owner explicitly selects that exact ZIP and checksum.
- Keep one active `xuan-ji-yu-heng`. Updates preserve the old package until the replacement is ready;
  do not delete the old skill first. Only the intended skill directory may be replaced.
- Requires Node.js ≥ 22. Run `version` to inspect labels and, on updated builds, `contentIdentity`;
  run `verify` for the engine self-check. Neither requires birth data.
- For “帮我看事业”, use `answer-plan --topic career` and the Skill's draft validation workflow.
  Return a readable topic answer, not the full charts, raw JSON, warning panel or follow-up menu.
  Full charts are available only when requested. `doctor` is for installation/update/diagnosis,
  not a mandatory step before each question; `answer-plan` normalizes its input itself.

## Privacy and evidence

The engine calculates locally without network or telemetry. **The host's chat/model may send
messages, tool output or attachments to its provider** under its own settings; engine-offline
does not mean chat-offline. Do not send sensitive chart data without informed consent. See
[the shipped privacy reference](../skills/xuan-ji-yu-heng/references/privacy.md).

A successful package build, an installed package, a host-triggered answer and a published Release
are different evidence. Historical device checks do not automatically verify a rebuilt candidate.

## Development only

`pnpm run build` rebuilds the canonical Skill; `pnpm run package:hosts` produces local candidate
ZIPs. Neither installs a host package or publishes a Release. Use the proportional checks in
[VALIDATION.md](VALIDATION.md) and the existing [release checklist](RELEASE_CHECKLIST.md).
