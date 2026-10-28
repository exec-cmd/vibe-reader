//! Live link between the CLI and a running reader window: one JSON request and one JSON
//! reply per line over a Unix socket that only the owner can open. There is no network port.

use std::io::{BufRead, BufReader, Read, Write};
use std::path::Path;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use serde_json::Value;

/// Longest accepted request, in bytes.
const MAX_REQUEST: u64 = 64 * 1024;

/// Sends a request to the window and waits for its reply.
#[cfg(unix)]
pub fn request(socket: &Path, message: &Value) -> Result<Value> {
    use std::os::unix::net::UnixStream;
    let mut stream = UnixStream::connect(socket).context("the reader window is not running")?;
    stream.set_read_timeout(Some(Duration::from_secs(3)))?;
    stream.set_write_timeout(Some(Duration::from_secs(3)))?;
    writeln!(stream, "{message}")?;
    let mut line = String::new();
    BufReader::new(stream.take(4 * 1024 * 1024)).read_line(&mut line)?;
    let reply: Value = serde_json::from_str(&line).context("the reader window sent an invalid reply")?;
    if let Some(error) = reply.get("error").and_then(Value::as_str) {
        bail!("reader window: {error}");
    }
    Ok(reply)
}

#[cfg(not(unix))]
pub fn request(_socket: &Path, _message: &Value) -> Result<Value> {
    // shortcut: Unix sockets only; add a named pipe when the Windows build lands.
    bail!("live mode is available on Linux and macOS only")
}

/// True when a window answers on the socket.
pub fn running(socket: &Path) -> bool {
    request(socket, &serde_json::json!({ "cmd": "ping" })).is_ok()
}

/// Listens on the socket in a background thread and answers each request with `handler`.
/// Fails when another window already serves the socket.
#[cfg(unix)]
pub fn serve(socket: &Path, handler: impl Fn(Value) -> Value + Send + Sync + 'static) -> Result<()> {
    use std::fs;
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
    use std::os::unix::net::UnixListener;

    if running(socket) {
        bail!("another reader window is already running");
    }
    if let Some(dir) = socket.parent() {
        fs::DirBuilder::new().recursive(true).mode(0o700).create(dir)?;
    }
    let _ = fs::remove_file(socket);
    let listener = UnixListener::bind(socket).with_context(|| format!("cannot listen on {}", socket.display()))?;
    fs::set_permissions(socket, fs::Permissions::from_mode(0o600))?;
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
            let mut line = String::new();
            let Ok(mut writer) = stream.try_clone() else { continue };
            if BufReader::new(stream.take(MAX_REQUEST)).read_line(&mut line).is_err() {
                continue;
            }
            let reply = match serde_json::from_str::<Value>(&line) {
                Ok(message) => handler(message),
                Err(e) => serde_json::json!({ "error": format!("invalid request: {e}") }),
            };
            let _ = writeln!(writer, "{reply}");
        }
    });
    Ok(())
}

#[cfg(not(unix))]
pub fn serve(_socket: &Path, _handler: impl Fn(Value) -> Value + Send + Sync + 'static) -> Result<()> {
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let socket = dir.path().join("run").join("test.sock");
        assert!(!running(&socket));
        serve(&socket, |m| match m["cmd"].as_str() {
            Some("ping") => serde_json::json!({ "ok": true }),
            Some("echo") => serde_json::json!({ "ok": true, "value": m["value"] }),
            _ => serde_json::json!({ "error": "unknown command" }),
        })
        .unwrap();
        assert!(running(&socket));
        let reply = request(&socket, &serde_json::json!({ "cmd": "echo", "value": "ч:1" })).unwrap();
        assert_eq!(reply["value"], "ч:1");
        assert!(request(&socket, &serde_json::json!({ "cmd": "nope" })).is_err());
        let mode = std::fs::metadata(&socket).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
        assert!(
            serve(&socket, |_| Value::Null).is_err(),
            "a second window must not take over"
        );
    }
}
