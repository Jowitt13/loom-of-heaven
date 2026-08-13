---
name: psychology-self-assessment
description: Conduct a voluntary, offline, nonclinical Mandarin IPIP-NEO-120 personality self-assessment with explicit consent, local file-only responses, deterministic raw domain/facet scoring, profile export, and deletion. Use when an adult asks to start, continue, score, export, or delete this personality self-assessment. Do not use for astrology readings, mental-health screening, diagnosis, ADHD, depression, anxiety, trauma, crisis assessment, or personality-disorder labels.
---

# psychology-self-assessment

Use `scripts/psychology.mjs`. It is a separate, offline Skill for voluntary nonclinical personality self-report. It contains one source-bound Mandarin IPIP-NEO-120 instrument; it is not a diagnostic, clinical, or chart-reading tool.

## Boundaries

- Accept adults only. Do not collect age, sex, email, free text, birth data, or clinical symptoms.
- Obtain explicit consent before creating a session. The consent scope is `personality`; the notice version is `psychology-self-assessment-notice/v1`.
- Explain the host boundary before collecting a response: if answers are typed into a cloud-hosted chat, that host may process the chat. Prefer a locally prepared JSON file for answers.
- Never call a score a diagnosis, disorder, percentile, or high/medium/low population label. The output is raw keyed domain/facet sums; `norms-not-applied` is intentional.
- Do not combine this Skill with chart facts, chart/personality cross-checking, or any clinical screening. Those capabilities are not shipped here.
- Do not log or quote raw answers in prose. Keep raw responses only in a user-selected local session file; profile export omits them.

## Workflow

1. Run `doctor` and confirm `runtimeSupported: true`.
2. State the consent notice below and wait for an affirmative user choice. Do not infer consent from a request to view the instrument.
3. Save the consent JSON locally, start the session, and export the exact items to a local questionnaire file.
4. Record only bounded `{ itemId, response }` data from a local answers file. `response` is an integer from 1 through 5.
5. Score only a complete 120-item session. Present the returned profile as self-report evidence, not a verdict. Export or delete only at the user's request.

### Consent notice

This is a voluntary nonclinical personality self-assessment. It uses 120 self-report items and produces raw profile scores only; it does not diagnose any condition and does not use population norms. You may stop, leave without saving, or delete a saved local session. If you type answers in this chat, the chat host may process them; use a local JSON file if you prefer the CLI's local file boundary.

## Commands

Run commands as argument arrays. Use files for all input and output; never concatenate user text into a shell command.

```text
node scripts/psychology.mjs doctor
node scripts/psychology.mjs instruments
node scripts/psychology.mjs items --instrument ipip-neo-120-zh --output-file questionnaire.json
node scripts/psychology.mjs start --instrument ipip-neo-120-zh --consent-file consent.json --output-file session.json
node scripts/psychology.mjs answer --input-file session.json --answers-file answers.json --output-file session.json
node scripts/psychology.mjs resume --input-file session.json --output-file session.json
node scripts/psychology.mjs cancel --input-file session.json --output-file cancelled-session.json
node scripts/psychology.mjs score --input-file session.json --output-file profile.json
node scripts/psychology.mjs export --input-file profile.json --output-file profile-export.json
node scripts/psychology.mjs delete --input-file session.json
node scripts/psychology.mjs verify
node scripts/psychology.mjs version
```

`start`, `answer`, and `resume` require `--output-file` because they produce a private session that can contain raw answers. They never print it to stdout. `delete` refuses files that are not a valid local session or de-identified profile.

## Local JSON shapes

Create `consent.json` only after the user agrees:

```json
{
  "scope": "personality",
  "granted": true,
  "noticeVersion": "psychology-self-assessment-notice/v1"
}
```

Use an answers file only for the user's local session:

```json
[
  { "itemId": "ipip-neo-120-001", "response": 4 },
  { "itemId": "ipip-neo-120-002", "response": 2 }
]
```

Do not put a real person's answers in repository files, examples, screenshots, or CI. The only shipped test inputs are synthetic.

## Reading a profile

Explain scores as the user's answers on this item set at this time. Compare a user's own facets or domains only when the user asks; do not compare them with a population or assign a clinical/personality-disorder meaning. If a user requests medical interpretation, ADHD, depression, anxiety, trauma, or a diagnosis, explain that this Skill does not provide it.

## References

- `references/privacy.md` — raw-response and host-boundary rules.
- `references/ipip-neo-120.md` — instrument, source, scoring, attribution, and nonclinical limits.
- `references/host-validation.md` — release-only installation evidence; it is not a claim that a host has already been verified.
