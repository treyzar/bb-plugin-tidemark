---
name: tidemark
description: Connect or troubleshoot Tidemark's Windows island integration with bb.
---

# Tidemark

The standalone Tidemark app (1.4.0+) connects to this plugin using the bb server URL and its per-plugin token. In Tidemark, right-click the island background or tray icon and choose bb. The packaged integrations/bb/Connect-Bb.ps1 can configure a local connection without displaying the token.

Read the plugin README for installation and HTTP API behavior. Optional plugin setting `project` restricts all reads and writes to that project; clear it for all projects. Remote connections require HTTPS. Tokens belong only in the encrypted Windows connection file, never source, logs, screenshots, or chat. Rotate compromised tokens with `bb plugin token tidemark --rotate`, then reconnect.

Do not answer user questions or approve agent commands through this bridge without the user's specific answer or decision. Tidemark presents pending questions and lets the user respond. Messages sent to a thread awaiting an interaction can remain queued until it is resolved. Unsupported forms and permission grants should be completed in bb.
