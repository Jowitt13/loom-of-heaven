# Release-only host evidence

This file is a release checklist, not evidence that a host is already verified. Do not change a
host's status to verified until a human records a real installation on that host.

## Candidate preparation

The standalone P9 candidate is built separately from the chart Skill:

```text
pnpm run build:psychology-skill
pnpm run package:psychology-hosts
pnpm run verify:psychology-hosts
```

These commands write only to gitignored
`releases/psychology-self-assessment-v0.1.0-candidate/`. That directory contains four
host-shaped ZIPs, an unpublished candidate `install-manifest.json`, and `SHA256SUMS.txt`.
`verify:psychology-hosts` extracts each real ZIP, runs `doctor`, `version`, `verify`, and one
synthetic `start → answer → score → export → delete` lifecycle. It proves packaging integrity;
it does **not** prove that Codex, Qoder, WorkBuddy, or Doubao has installed the package.

The source `BUILD_MANIFEST.json` stays `status: "unpublished"`. The candidate tool never creates
a tag, GitHub Release, public download URL, root-manifest promotion, migration command, or host
verification claim.

## Human acceptance record required before release

For Codex, Qoder, WorkBuddy, and Doubao, record outside this repository bundle:

- the exact candidate ZIP name and SHA-256, cross-checked with the matching `SHA256SUMS.txt`;
- imported package name, host version, and Node version;
- redacted `doctor`, `version`, and `verify` result summaries;
- one synthetic `start → answer → score → export → delete` run; and
- confirmation that no raw response, item text, local path, account identifier, or chat content
  was copied into the record.

Do not run a real person's answers during host validation. Keep evidence outside the release
bundle and redact local paths, account identifiers, and chat content. A tag, Release, or public
asset remains a separate owner-authorized action after this evidence exists.
