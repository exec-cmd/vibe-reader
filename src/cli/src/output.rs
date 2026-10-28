//! JSON for programs, Markdown-flavored text for people.

use std::io::{IsTerminal, Write};

use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Json,
    Text,
}

impl Mode {
    /// `--json` and `--md` win; otherwise JSON when stdout is not a terminal.
    pub fn pick(json: bool, md: bool) -> Self {
        if json {
            Mode::Json
        } else if md || std::io::stdout().is_terminal() {
            Mode::Text
        } else {
            Mode::Json
        }
    }
}

/// A command result in both shapes.
pub struct Out {
    pub json: Value,
    pub text: String,
}

impl Out {
    pub fn new(json: Value, text: impl Into<String>) -> Self {
        Self {
            json,
            text: text.into(),
        }
    }

    pub fn print(&self, mode: Mode) {
        let mut stdout = std::io::stdout().lock();
        let _ = match mode {
            Mode::Json => writeln!(
                stdout,
                "{}",
                serde_json::to_string_pretty(&self.json).unwrap_or_default()
            ),
            Mode::Text => writeln!(stdout, "{}", self.text.trim_end()),
        };
    }
}

/// Wraps book text for people the same way the JSON `untrusted` flag marks it for programs.
pub fn untrusted(text: &str) -> String {
    format!(
        "<book-content untrusted=\"true\">\n{}\n</book-content>",
        text.trim_end()
    )
}

pub fn percent(share: f64) -> String {
    format!("{:.0}%", share * 100.0)
}

/// `2026-10-28 14:05` in local time is not in std; UTC keeps output stable and dependency-free.
pub fn date(unix: i64) -> String {
    let days = unix.div_euclid(86_400);
    let secs = unix.rem_euclid(86_400);
    // Civil-from-days, Howard Hinnant's algorithm.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02} UTC",
        secs / 3600,
        secs % 3600 / 60
    )
}

#[cfg(test)]
mod tests {
    #[test]
    fn formats_dates() {
        assert_eq!(super::date(0), "1970-01-01 00:00 UTC");
        assert_eq!(super::date(1_793_190_300), "2026-10-28 12:25 UTC");
    }
}
