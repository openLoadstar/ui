> 🌐 **English** | **[한국어](README.ko.md)**

# LOADSTAR Explorer UI

A standalone desktop explorer/editor for [LOADSTAR 2.0](https://github.com/openLoadstar/spec/tree/main/SPEC%202.0) projects — browse the `.loadstar/` element files of a project as a tree, read them rendered (Mermaid diagrams included), edit them, walk their git history, and search across all of them. Single executable, native OS webview, no server to start.

![Explorer overview](docs/images/explorer-overview.png)

> 📌 New to LOADSTAR? Start with the [openLoadstar overview](https://github.com/openLoadstar/openLoadstar) and the [spec 2.0 design](https://github.com/openLoadstar/spec/tree/main/SPEC%202.0).

---

## 🧭 Stack

| Layer | Stack |
|:---|:---|
| App shell | Go 1.25 + [Wails v2](https://wails.io) (native OS webview, no bundled browser engine) |
| Frontend | TypeScript + Vite, no UI framework |
| Rendering | [markdown-it](https://github.com/markdown-it/markdown-it) + [Mermaid.js](https://mermaid.js.org), rendered live inside the webview |
| Index | SQLite via [modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite) (pure Go, no cgo) |
| History | The `git` executable already on your `PATH` (no library dependency) |

## 🚀 Build & run

```bash
wails build          # -> build/bin/loadstar.exe
wails dev            # live-reload development build
```

The same binary is both the GUI and the CLI: launched with no arguments it opens the window, with a subcommand it runs headless.

---

## ✨ Features

### Open a project

Pick any folder that contains a `.loadstar/` directory. Recently opened projects are kept on the start screen and in **파일 > 프로젝트 열기 (File > Open project)**, so switching between projects is one click.

![Open project](docs/images/project-picker.png)

### Three views of the same project

The left tree is a *perspective* on the project, swappable from the **보기 (View)** menu or the toolbar dropdown.

![View modes](docs/images/view-modes.png)

| View | What it shows |
|:---|:---|
| **Directory (GROUP) structure** | The GROUP hierarchy built by resolving `GROUP.ITEMS` recursively. Elements that belong to no GROUP sit at the root. WP rows carry a STATUS color dot, and the toolbar filter hides/shows WPs by status. |
| **By date** | Every WP/DWP/GROUP/OTHER/FLOW as one flat list, newest first, with a start/end date filter. |
| **Search** | Full-project search results — see below. |

### Markdown + Mermaid viewer and editor

`.md` elements render as formatted text, and ` ```mermaid ` blocks render as real diagrams. Toggle to **✎ 편집 (Edit)** for a plain-text editor of the raw markdown; saving runs a lightweight format check (required `IDENTITY` / `SUMMARY` / `CONNECTIONS` / `STATUS` sections per the spec appendix) and asks before saving anything that fails it.

OTHER files are handled by type: `.csv` / `.json` / `.txt` are shown verbatim so markdown syntax cannot mangle them, and self-contained `.html` files render inside a sandboxed iframe. A GROUP tab shows an info view instead — its member list as clickable links, plus a "copy" button that puts the group and its members on the clipboard as plain text.

![Mermaid rendering](docs/images/mermaid-viewer.png)

### Flow diagrams — the `FLOW` element

A `FLOW` element describes a process as one mermaid diagram. What sits in `### DIAGRAM` is plain mermaid, so it renders anywhere markdown does (GitHub included), and what each node stands for — a WP, a DWP, another FLOW — is written in `### REFERENCES`, outside the code block, where the extractor and the validator can still see it.

Shapes carry meaning: `[step]`, `{branch}`, `(( ))` merge, `[[subflow]]`, `[(store)]`, `((terminal))`.

#### Using it

| To do this | Do that |
|:--|:--|
| Create a flow | **+ FLOW** in the toolbar |
| Switch modes | `👁 보기` · `✎ 그림 편집` · `</> 텍스트 편집` on a FLOW tab |
| Select a node | Click it — the side panel shows its id, kind and label |
| Add a step | **⑂ 병렬 추가** (one more path) · **↳ 삽입 추가** (push the existing path behind a new step) |
| Add to one path only | **↳** on that arrow's row — the condition stays on the branch |
| Name a condition | The input on the arrow's row |
| Merge paths | Change an arrow's far end in its dropdown, or draw a new arrow with **연결** |
| Move a node | **이동** — put the selected node after another |
| Link an element | Pick a WP/DWP/FLOW from the list at the bottom of the panel (picking a FLOW also gives the node the subflow shape) |
| Make a subflow | **Ctrl-click** several nodes, then **⊞** — they become a `subgraph` region of the same diagram |
| Fold / unfold | The chips above the document in view mode (`⊖` open / `⊕` folded). The file does not change |
| Rename or dissolve a region | Select a node inside it for the title field and **⊟** |
| Undo | `Ctrl+Z` |

In view mode a node that points at something is outlined, and clicking it opens that element.

Every edit rewrites only the lines it has to, so comments and hand-written notation survive. A diagram using syntax the editor cannot safely rewrite — a chained `a --> b --> c`, a nested `subgraph` — locks structural editing rather than mangling it, while drawing and element linking carry on. The full rules are in [appendix/FLOW.md](https://github.com/openLoadstar/spec/blob/main/SPEC%202.0/appendix/FLOW.md).

### Git history per file

Every element tab has a version combo box: pick a commit and the viewer renders that revision read-only, then return to **현재 (Current)** to get your working copy back — unsaved edits are preserved while you look. Renames are followed (`git log --follow`), so history survives the rename and `.del` conventions LOADSTAR uses. If `git` is not installed, the project is not a repository, or the file was never committed, the control simply reads **이력 없음 (No history)** and disables itself.

![Git history](docs/images/git-history.png)

### Find in the open document — `Ctrl+F`

Every match is highlighted in inverted colors, the current one in the accent color, with a match counter and next/previous navigation (`Enter` / `Shift+Enter`, `F3` / `Shift+F3`). Works in edit mode too, and never touches the text inside a rendered Mermaid diagram.

![Find in file](docs/images/find-in-file.png)

### Search every file — `Ctrl+Shift+F`

An Eclipse-style result list: matching files with a hit count, expandable into the matching lines. Clicking a line opens that file and jumps straight to that occurrence with the keyword highlighted. Search runs from the button or `Enter`, and automatically from two characters up (debounced, and it waits for IME composition to finish so Korean input does not fire a query per jamo).

![Search all files](docs/images/search-all.png)

### Create, rename, delete elements

**+ WP** / **+ DWP** / **+ FLOW** scaffold a spec-shaped file and open it in edit mode right away; closing without ever saving offers to delete it again, so a mistyped name leaves nothing behind. Right-click a tree row to rename (the `[FORMAT][VER][DATE]` prefix is kept, only the label changes) or delete. "Delete" appends `.del` rather than removing the file — hidden from the tree, trivially undone in Explorer. Renaming also updates the `ITEMS` of every GROUP the file belonged to.

### Group editor

Build the GROUP hierarchy and manage each group's `ITEMS` as a list instead of editing markdown by hand.

![Group editor](docs/images/group-editor.png)

### Structure extractor (re-index)

**⟳ 재색인** runs the extractor over `.loadstar/` and regenerates `.loadstar/.cache/index.db` (`nodes` / `edges` per `04.META_EXTRACTION.md`). Broken references are not silently dropped — they are stored with the original target name and an `is_valid` flag so a later validator can report them.

### OTHER extension filter

OTHER is the one FORMAT exempt from the `[FORMAT][VER][DATE]이름.md` naming rule, so any extension can appear there. **편집 > OTHER 확장자 설정** picks which extensions show up in the tree; the list combines a default preset with the extensions actually present in the current project.

### CLI

```
loadstar                           launch the GUI
loadstar create <FORMAT> "name"    create a WP/DWP/GROUP/FLOW file (wp|dwp|group|flow)
loadstar show                      STATUS distribution + documents that have ISSUEs
loadstar reindex                   rebuild .loadstar/.cache/index.db
```

The GUI and the CLI share the same scaffolding and indexing code, so the two can never drift apart.

---

## ⌨️ Shortcuts

| Key | Action |
|:---|:---|
| `Ctrl+F` | Find in the open document |
| `Ctrl+Shift+F` | Search across every file |
| `Enter` / `Shift+Enter` | Next / previous match (in the find box) |
| `F3` / `Shift+F3` | Next / previous match (anywhere) |
| `Esc` | Close the find bar |

## 📁 Where things live

```
<project>/
└── .loadstar/
    ├── WP/  DWP/  GROUP/  OTHER/  FLOW/    element files
    └── .cache/index.db               extractor output (git-ignored)

%AppData%\loadstar\
├── recent_projects.json  recent_files.json
├── other_extensions.json
└── loadstar-debug.log
```

User data lives under `%AppData%` rather than next to the executable: the `.exe` may sit somewhere unwritable, and this data belongs to the user, not to a copy of the binary or to one project.

## 🛠 Development

This repository manages itself with LOADSTAR — the work items behind every feature above are in `.loadstar/WP/`, and `CLAUDE.md` describes the WayPoint-first workflow (record what you are about to do, then do it).

## 📄 License

[Apache License 2.0](./LICENSE)
