# Privacy boundary

This Skill scores locally and makes no network request. Local scoring does not override the privacy rules of a chat host: if a person types an answer into a hosted conversation, that host can process the conversation before the CLI sees anything.

- Show the consent notice before collecting answers.
- Prefer a user-created local JSON answers file.
- Do not pass answer values, item text, filenames, or paths into diagnostics, logs, prompts, fixtures, screenshots, or exported profiles.
- A session contains raw answers and is private. It is created, updated, resumed, or cancelled only in a user-selected file.
- A profile is de-identified aggregate output. It contains no raw answers, name, contact field, birth data, or chart facts.
- `delete` validates the artifact and removes only a non-symlink valid session/profile file. It is a first-class user action, not a best-effort suggestion.
- The default session is not written unless the user passes `--output-file`; the CLI refuses to print a private session to stdout.

No encryption claim is made. “Offline” and “encrypted” are different properties.
