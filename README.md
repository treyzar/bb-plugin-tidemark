# Tidemark ↔ bb

Answer agent questions and send follow-up instructions from [Tidemark](https://github.com/treyzar/tidemark), the native Windows island.

## Install

Requires bb with Plugin SDK **0.6.132 or later in major 0**, and Tidemark **1.5.0+**.

```powershell
bb plugin install git:https://github.com/treyzar/bb-plugin-tidemark.git
```

On the Windows computer running Tidemark, open the island's empty area with a right click → **bb · вопросы и сообщения…** (also in its tray menu, or `win-island.exe --bb`). Open the dots menu for connection settings, then enter your bb server URL and the token from:

```powershell
bb plugin token tidemark
```

In Tidemark 1.5, questions and messages work directly inside the expanded island. The arrow button opens the alternate compact window; the dots button opens connection settings.

For a local bb, you can instead run Tidemark's bundled `integrations\bb\Connect-Bb.ps1`; it reads the address/token locally and stores the connection without printing the token. No token belongs in source code or a shared config.

The token is encrypted with Windows DPAPI for the current Windows account. HTTP is accepted only for loopback addresses. Remote servers require HTTPS with a valid Windows-trusted certificate; redirects are refused. Reverse proxies must forward the `x-bb-plugin-token` header and plugin routes.

## Use

- New pending questions appear on the island with selectable options and a custom-answer field. For several questions, complete each and send the combined response.
- Standard provider questions and Codex asynchronous questions can be answered in either bb or Tidemark. Codex asynchronous questions allow one option or a custom answer per question.
- Select a thread and **Дополнить задачу** to send additional instructions. bb may queue messages behind an unanswered question.
- Approval cards offer only **Allow once** / **Deny** when bb offers those decisions. Permission grants and other custom plugin forms are handled in bb itself.
- **Позже** dismisses the island alert; the question remains accessible in the panel. **Обновить** refreshes the list. Disconnect in the panel to stop the connection.

## Access and limits

The plugin token can read thread titles/questions and send messages or answer supported interactions. Keep it private. Optionally choose one project in **bb → Settings → Installed plugins → Tidemark** to restrict both reading and writing. Rotate with `bb plugin token tidemark --rotate` if needed, then reconnect Tidemark.

Only unarchived visible threads are listed, up to 1,000. The response limit is 2 MiB; choose a project if your workspace exceeds it. Pending state is reconciled on startup and cached; bb events invalidate pending questions, with periodic reconciliation as fallback. Tidemark checks every three seconds while connected. Stale answers are rejected by bb. Network failures retain the draft; after an uncertain send, check the target thread before retrying to avoid duplicates. No replies or approvals are automatic.

## HTTP contract

`GET /state` exposes standard questions as `payload.kind: "user_question"`. It also normalizes plugin input requests whose origin is exactly `provider-codex` / `async-question`; other plugin forms remain unsupported. Codex question IDs are `question-1`, `question-2`, etc., and their option values are `option-1`, `option-2`, etc., matching bb's own renderer. Questions without predefined options accept custom text.

`POST /answer` accepts `{threadId, interactionId, response: {answers: {"question-1": {selected: ["option-2"]}}}}`; a custom answer uses `{selected: [], freeText: "My answer"}`. The server fetches the current interaction before validating the response. Standard questions and approvals use SDK `resolve`; recognized Codex async requests use `respond` with `{answers}` as the value. Expired, completed, unknown, malformed, and concurrent duplicate submissions are rejected. An answer submitted in either app completes the same bb interaction.

## Development

```powershell
npm ci --include=dev
npm test
npm run typecheck
bb plugin build
bb plugin install .
```

This is an independent backend plugin; no browser frontend or provider-specific hook is required.
