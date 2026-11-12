# Tidemark ↔ bb

Answer agent questions and send follow-up instructions from [Tidemark](https://github.com/treyzar/tidemark), the native Windows island.

## Install

Requires bb with Plugin SDK **0.6.132 or later in major 0**, and Tidemark **1.4.0+**.

```powershell
bb plugin install git:https://github.com/treyzar/bb-plugin-tidemark.git
```

On the Windows computer running Tidemark, open the island's empty area with a right click → **bb · вопросы и сообщения…** (also in its tray menu, or `win-island.exe --bb`). Enter your bb server URL and the token from:

```powershell
bb plugin token tidemark
```

For a local bb, you can instead run Tidemark's bundled `integrations\bb\Connect-Bb.ps1`; it reads the address/token locally and stores the connection without printing the token. No token belongs in source code or a shared config.

The token is encrypted with Windows DPAPI for the current Windows account. HTTP is accepted only for loopback addresses. Remote servers require HTTPS with a valid Windows-trusted certificate; redirects are refused. Reverse proxies must forward the `x-bb-plugin-token` header and plugin routes.

## Use

- New pending questions appear on the island. **Ответить** opens the native bb panel with the complete question and option descriptions.
- Select an option, multiple options with Ctrl when permitted, or enter a custom answer. For several questions, complete each and send the combined response.
- Select a thread and **Дополнить задачу** to send additional instructions. bb may queue messages behind an unanswered question.
- Approval cards show the complete payload and offer only **Allow once** / **Deny** when bb offers those decisions. Permission grants and custom plugin forms are handled in bb itself.
- **Позже** dismisses the island alert; the question remains accessible in the panel. **Обновить** refreshes the list. Disconnect in the panel to stop the connection.

## Access and limits

The plugin token can read thread titles/questions and send messages or answer supported interactions. Keep it private. Optionally choose one project in **bb → Settings → Installed plugins → Tidemark** to restrict both reading and writing. Rotate with `bb plugin token tidemark --rotate` if needed, then reconnect Tidemark.

Only unarchived visible threads are listed, up to 1,000. The response limit is 2 MiB; choose a project if your workspace exceeds it. Pending state is reconciled on startup and cached; bb events invalidate pending questions, with periodic reconciliation as fallback. Tidemark checks every three seconds while connected. Stale answers are rejected by bb. Network failures retain the draft; after an uncertain send, check the target thread before retrying to avoid duplicates. No replies or approvals are automatic.

## Development

```powershell
npm ci --include=dev
npm test
npm run typecheck
bb plugin build
bb plugin install .
```

This is an independent backend plugin; no browser frontend or provider-specific hook is required.
