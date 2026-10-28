# Releasing

Releases are cut from tags. The `Release` workflow
(`.github/workflows/release.yml`) runs the tests, builds the binaries and an
AppImage on Ubuntu 22.04 (for an older glibc baseline), and publishes a GitHub
release with:

- `vibe-reader-<version>-x86_64-linux.tar.gz`: `vibe-reader`, `vibe-reader-gui`, READMEs and licenses;
- `vibe-reader-<version>-x86_64.AppImage`: the reader window;
- `SHA256SUMS`.

## Steps

1. Update `version` in the root `Cargo.toml` (`[workspace.package]`) and the
   `vibe-reader-core` version in `[workspace.dependencies]`.
2. Run the checks and a release build locally:

   ```bash
   cargo fmt --all --check
   cargo clippy --workspace --all-targets -- -D warnings
   cargo test --workspace
   cargo build --release --workspace
   cargo run --release -p vibe-reader-gui -- --measure
   ```

3. Commit, tag and push:

   ```bash
   git tag v0.2.0
   git push origin main v0.2.0
   ```

4. Check the release page; notes are generated from commits since the last tag.

## AppImage locally

```bash
cargo install tauri-cli --version "^2" --locked
cd src/gui && cargo tauri build --bundles appimage
```

The bundle lands in `target/release/bundle/appimage/`. Bundle settings
(identifier, icons, category) live in `src/gui/tauri.conf.json`.

## Publishing crates

The crates can go to crates.io in dependency order: `vibe-reader-core`, then
`vibe-reader` and `vibe-reader-gui`. Embedded files (presets, Skills, the UI)
live inside each crate, so `cargo package` includes them; check with
`cargo package --list -p <crate>`.
