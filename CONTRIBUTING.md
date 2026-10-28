# Contributing

Thanks for your interest in vibe-reader. This page is the entry point for
contributors; the details live in [docs/dev/](docs/dev/).

## Getting started

1. Install the system dependencies and build the workspace as described in
   [docs/dev/building.md](docs/dev/building.md).
2. Read [docs/dev/architecture.md](docs/dev/architecture.md) for how the core,
   CLI and GUI fit together.
3. Keep test data out of your real library by setting `VIBE_READER_HOME`:

   ```bash
   export VIBE_READER_HOME=$(mktemp -d)
   cargo run -p vibe-reader -- --help
   ```

## Before you open a pull request

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

- Add tests for new behavior in the core and the CLI.
- Keep the core synchronous and free of GUI dependencies.
- Keep the UI build-free: plain HTML, CSS and ES modules, types in JSDoc.
- New dependencies must be compatible with MIT OR Apache-2.0.
- Update the matching page in `docs/user/` or `docs/dev/` when behavior changes.

## License

By contributing, you agree that your contributions are dual-licensed under the
MIT and Apache-2.0 licenses, as the rest of the project.
