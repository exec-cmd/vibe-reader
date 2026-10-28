# Live link (IPC)

The CLI talks to a running reader window over a Unix socket. There is no
network port.

- Path: `$XDG_RUNTIME_DIR/vibe-reader/vibe-reader.sock`
  (`$VIBE_READER_HOME/run/vibe-reader.sock` with `VIBE_READER_HOME`).
- The folder is created with mode 0700 and the socket with 0600, so only the
  owner can connect.
- Only the library window listens; lite windows and `--measure` runs do not.
  A second library window hands its file to the first through `open` and exits.

Code: `src/core/src/ipc.rs` (client and server, std only),
`src/gui/src/state.rs` (`handle_ipc`), `src/cli/src/look.rs` (commands).

## Protocol

One JSON object per line in each direction; one request per connection.
Requests are limited to 64 KB. Errors come back as `{"error": "..."}`.

| Request | Reply / effect |
|---|---|
| `{"cmd": "ping"}` | `{"ok": true}` |
| `{"cmd": "status"}` | `ok`, `lite`, `book` (`id`, `title`, `path`), `position` |
| `{"cmd": "position"}` | `book`, `position` (a locator) |
| `{"cmd": "selection"}` | `book`, `selection` (`start`, `end`, `text`) or null |
| `{"cmd": "goto", "locator": "ch:3:120"}` | The window moves there |
| `{"cmd": "highlight", "range": "ch:3:0..ch:3:80"}` | The window shows and marks the passage for 8 seconds |
| `{"cmd": "reload"}` | The window reloads notes, art and atmosphere |
| `{"cmd": "open", "path": "/abs/file.epub"}` | The window opens the file (adding it to the library) |

The window answers position and selection from what the UI last reported
(`report_state`), so a request never waits on the webview.

## Who sends what

| CLI command | Request |
|---|---|
| `live position`, `live selection`, `live goto`, `live highlight` | as named |
| `gui status`, `doctor` | `status`, `ping` |
| `context` | `selection`, when the window shows the same book |
| `note`, `highlight`, `bookmark`, `art`, `atmosphere`, `undo` writes | `reload`, ignored when no window runs |
| `open FILE` while a window runs | the new process sends `open` |

Windows named pipes are not implemented yet; on Windows the live commands
report that live mode is unavailable.
