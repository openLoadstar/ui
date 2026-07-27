> 🌐 **English** | **[한국어](README.ko.md)**

# LOADSTAR Explorer UI

> 🚧 **Rebuilding for LOADSTAR 2.0.** The previous implementation (Spring Boot + React web app) has been removed from the working tree and replaced with a fresh Go project scaffold. The old implementation is still fully browsable in this repo's git history.

> 📌 New to LOADSTAR? Start with the [openLoadstar overview](https://github.com/openLoadstar/openLoadstar) and the [spec 2.0 design](https://github.com/openLoadstar/spec/tree/main/SPEC%202.0).

---

## 🧭 Planned direction

A standalone, cross-platform (Windows/Linux) desktop app — not a browser-based client/server app like the previous version.

| Layer | Stack (planned) |
|:---|:---|
| App shell | Go + [Wails](https://wails.io) (native OS webview, no bundled browser engine) |
| Extractor | Plugin-based, per-FORMAT md parsers (see `spec 2.0/06.META_EXTRACTION.md`) |
| Storage | SQLite (plain RDBMS, no FTS5 — see spec 2.0 for rationale) |
| Diagram rendering | Mermaid.js, rendered live inside the webview |

## 📄 License

[Apache License 2.0](./LICENSE)
