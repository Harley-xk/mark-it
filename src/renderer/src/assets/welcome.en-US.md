---
title: MarkIt User Manual
version: 1.3.2
author: MarkIt Team
updated: 2026-11-16
tags: markdown, mermaid, editor, manual
description: |
  This document ships with the application. It is both the MarkIt user guide
  and a complete example of the Markdown and Mermaid rendering capabilities.
---

# MarkIt User Manual

> **MarkIt** is a lightweight, focused local Markdown editor.
> It puts writing and presentation in the same window: type Markdown on the left and see the result live on the right.

This built-in welcome document serves two purposes:

1. **User guide**: covers files, tabs, layouts, themes, outline, export, and every other feature.
2. **Example document**: demonstrates the Markdown syntax and every Mermaid diagram type MarkIt supports.

> 💡 This document is an unsaved new tab. Press `Ctrl + S` after editing to save it as a file;
> opening another document from disk replaces the unmodified welcome page automatically.

## Contents

1. Getting Started
2. Workspace and Interface
3. Markdown Syntax Reference
4. Document Info (Frontmatter)
5. Mermaid Diagram Gallery
6. Diagram Interaction
7. Exporting PDF
8. Exporting Long Images
9. Keyboard Shortcuts
10. FAQ and Tips

## 1. Getting Started

### 1.1 Opening, Creating, and Saving

| Action         | Shortcut           | Description                                                        |
| -------------- | ------------------ | ------------------------------------------------------------------ |
| New tab        | `Ctrl + N`         | Creates a blank document; repeated use reuses the unmodified blank |
| Open file      | `Ctrl + O`         | Multi-select supported; `.md`, `.markdown`, and `.txt`             |
| Save           | `Ctrl + S`         | The first save of a new document opens the Save As dialog          |
| Save As        | `Ctrl + Shift + S` | Saving to a new path renames the tab automatically                 |
| Manual refresh | `F5` or `Ctrl + R` | Forces a disk read; disk changes normally sync automatically       |
| Recent files   | Clock button in the toolbar | Lists recently opened files with a clear action            |
| Drop to open   | Drag files into the window  | Up to 20 files; accepts `.md`, `.markdown`, and `.txt`    |

UTF-8 files (including BOM) can be edited and saved regardless of size. UTF-16, GBK, and other non-UTF-8 files open **read-only** so saving cannot damage the original; use Save As to convert them to UTF-8 first. To keep large documents responsive, preview is paused by default above 1 MiB (click "Render Preview Anyway" in the preview area). Above 5 MiB the editor enters plain text mode, turning off preview, syntax highlighting, outline, and word count (click "Restore Markdown" in the status bar to re-enable them). Files larger than 50 MiB are rejected. The content of large files is not stored in session recovery data.

On Windows you can also double-click a `.md` file or choose "Open with MarkIt" from the context menu.

When saving fails (full disk, no write permission, file in use, and so on), a message shows the path and the reason and offers Retry, Save As, or Cancel; canceling keeps the tab unsaved. Failures from multi-select, command-line, or VS Code opening are summarized in one dialog.

MarkIt follows disk changes automatically: when the active tab's file is changed by another program it syncs immediately, and switching to an inactive tab reads the disk once first. Unsaved local changes are never interrupted immediately; the conflict is detected on save (`Ctrl + S`), where the disk and local versions are shown as a line-by-line diff.

Drag files from your file manager into any MarkIt window to open them. Recent files appear in the top-right corner of the welcome or blank tab, and are also available from the clock button in the toolbar, where the list can be cleared. The recent list stays on this machine and is never uploaded.

Auto save is off by default. In Settings → Editor → Auto Save, choose to write to disk 2, 5, or 10 seconds after you stop typing. If a file was changed or deleted externally, auto save skips it and manual save decides what happens. Unsaved content is also restored as a draft after a restart.

### 1.2 Multiple Tabs

- Each tab keeps its own **content, undo history, cursor position, layout mode, outline visibility, and scroll positions for the editor and preview**; switching back and forth loses nothing.
- For very large documents (hundreds of thousands of characters), switching back to a recently viewed tab reuses its last preview instead of re-rendering the whole document. While typing, the preview refreshes about 0.15 seconds after you stop, avoiding per-keystroke layout work.
- A dot on a tab means unsaved changes; middle-click closes the tab.
- Right-click a tab to open in a new window, close, close others, close to the left, or close to the right. Batch closing still confirms each unsaved document.
- Drag a tab left or right to reorder it. The order is saved with the session; `Ctrl + 1` to `Ctrl + 9` and `Ctrl + Tab` follow the new order.
- Drag a tab into another MarkIt editor window to move it there. Releasing outside the title bar or outside all windows creates a new editor window. The source tab is not removed until the target window is ready.
- About 28 px below the title bar is a vertical snap zone: while dragging, a slight downward movement still reorders tabs instead of accidentally creating a new window.
- When dragging over another editor window, the target highlights and shows a "release to move" hint; the hint disappears when you leave the window.
- New windows appear on the display where the pointer was released. While dragging, a floating label with the file icon and tab title follows the pointer across displays instead of the system "not allowed" cursor.
- The tab context menu can also move a tab into another open editor window directly.
- The context menu also offers "Move All to Window N", which moves every tab in the current window to the target in order; the source window closes after the last tab leaves.
- `Ctrl + Tab` / `Ctrl + Shift + Tab` cycle through tabs; `Ctrl + 1` to `Ctrl + 9` jump directly to a tab.
- Opening a file through `Ctrl + O`, a system double-click, VS Code, or the command line first searches all editor windows. If the file is already open, that window is focused and the original tab is activated instead of creating a copy. Explicit drag or context-menu moves still follow the user's action.
- Opening or creating a document switches to it immediately and starts at the top of the document.

### 1.3 Unsaved Changes Protection

Before closing a tab, closing a window, or installing an update, MarkIt checks every unsaved document and offers three choices:

- **Save**: save, then continue
- **Discard**: throw the changes away
- **Cancel**: stay in the current document

If the file on disk was changed by another program while you also have unsaved local changes, a **File Conflict** dialog lists the line-by-line differences:

- Red `−` lines: the content on disk
- Green `+` lines: unsaved local content

You can choose:

- **Overwrite Disk**: replace the disk file with the local content
- **Load Disk Version**: discard local changes and load the latest disk content
- **Cancel**: keep local changes and return to the editor

Automatic refresh does not show this dialog immediately when it notices a disk change; a manual refresh (`F5` / `Ctrl + R`) shows the same diff instead.

### 1.4 Session Recovery

After quitting the app or restarting for an update, MarkIt restores the editor windows from the last session:

- Window count, position, size, and global zoom
- Tab order and the active tab
- Cursor position, layout mode, outline visibility, editor and preview scroll positions, and undo/redo history from before a normal quit
- **Content of new documents that were never saved**
- File tabs read the latest disk content first
- Files larger than 5 MiB restore only the path and cursor state; their content is read from disk again after startup and is not written to the session file

## 2. Workspace and Interface

### 2.1 Four Layouts

Press `Ctrl + \` to cycle through four layouts:

1. **Editor left / preview right**: the most common writing layout
2. **Preview left / editor right**: good for proofreading and checking formatting
3. **Editor only**: focused input for long-form writing
4. **Preview only**: focused reading for presentations and final checks

The layout is remembered per tab: each tab keeps its own layout and the interface follows when you switch. A new tab inherits the current tab's layout, and the layout is restored with the session after a restart.

In split mode, drag the **divider** in the middle to adjust the ratio. The ratio is remembered for the next launch.

### 2.2 Automatic Outline

- The outline panel is generated from heading levels; `#` inside code blocks is not mistaken for a heading.
- Click any entry to scroll both the editor and the preview to that section.
- Use `Ctrl + Shift + O` to show or hide the outline for the current tab. Each tab remembers its own visibility; a new tab inherits the current tab's setting, and it is restored with the session.
- Drag the right edge of the panel to resize it between 160 and 500 px. The width is shared by all tabs.

### 2.3 Themes, Language, and Preview Styles

| Item               | Options                            | Description                                               |
| ------------------ | ---------------------------------- | --------------------------------------------------------- |
| Interface theme    | Follow system / Light / Dark       | Editor, preview, and interface components switch together |
| Interface language | Follow system / 简体中文 / English | Changed in Settings; applies to every window immediately  |
| Preview style      | GitHub / Academic / Minimal        | Each style has a light and a dark variant                 |
| Custom style       | Import a local CSS file            | Available for the current run                             |

The interface language follows the operating system by default: Chinese systems show Chinese, while English and other languages show English. You can also fix it to Simplified Chinese or English under **Settings → Appearance → Interface Language**. The change applies immediately to editor, settings, and update windows; open documents are never translated. The **User Manual** toolbar button opens the version for the current language.

### 2.4 Preview Width and Window Zoom

- Preview content supports **fixed width** (adjustable in Settings) and **automatic** modes.
- Whole-window zoom: `Ctrl + =` zooms in, `Ctrl + -` zooms out, and `Ctrl + 0` restores 100%. The range is 50%–300%. Zoom is global and all editor windows follow.
- The status bar shows the file name, line and column, word count, encoding, layout mode, and current zoom level.
- When the ratio is not 100%, click "Zoom N%" at the bottom right to open a panel: use `−` / `+` to adjust in 10% steps, choose a preset from 50% to 300%, or click the middle percentage to return to 100% immediately. Click outside the panel or press `Esc` to close it.
- The same ratio is available under **Settings → Appearance → Interface Zoom** in the settings window and applies to all editor windows.

### 2.5 Windows and Automatic Updates

- A frameless frosted-glass window with tabs merged into the title bar; drag an empty part of the title bar to move the window.
- Press `Ctrl + Shift + N` to create a new editor window. Each editor window has its own tabs, layout, and scroll positions; theme, preview style, and preview width are synchronized across windows.
- Moving a tab between windows preserves unsaved content, cursor, layout, outline visibility, scroll positions, and undo/redo history. A single editor history larger than 4 MB safely degrades to moving only the document content.
- Before a normal quit or an update install, each tab's edit history is written to a local sidecar file. The per-window history limit is 32 MB; overflow degrades in tab order.
- Closing one editor window does not affect the others. The settings window and update details window close only after the last editor window closes.
- Settings use a separate window with the system minimize / maximize / close buttons. Changes apply automatically; there is no Save button.
- If the app crashes or misbehaves, use **Settings → About → Export Diagnostics** to save the version, runtime environment, and recent error logs to a text file for reporting. Logs do not contain document text, but may contain local file paths.
- The settings and update details windows first open on the display of the window that triggered them. Opening them again from another display activates the existing window instead of creating or moving it.
- Window size, position, maximized state, and global zoom are remembered and restored on the next launch.
- About 3 seconds after startup MarkIt quietly checks for updates; you can also check manually in Settings. A manual check opens the update details window directly and does not show a toast in the editor window, while an automatic check shows the bottom-right notice.
- Clicking **View** in the notice or opening the update details window hides the editor notice immediately and suppresses repeats while the window is open. Closing the details window does not immediately show the notice again; later discoveries still notify normally.
- Downloads show progress and speed. After the download, choose **Restart and Install**: every editor window confirms unsaved content first, then the app restarts and restores the original documents and windows.
- Enable **Receive Beta updates** in Settings to receive the newer of Beta and stable releases; a `Beta` badge appears next to the version. When disabled, only stable releases are received, and an installed Beta version rejoins the stable channel after the next stable release (it is never downgraded automatically).
- If the current Beta is causing problems, use **Settings → Updates → Roll Back to Stable**. After confirmation, Beta is disabled and the latest stable release is downloaded; restart after the download to complete the rollback. A failed rollback can be retried, and disabling Beta still never downgrades automatically.

### 2.6 Opening Files in VS Code

- Detect and install the VS Code extension under **Settings → Editor Integration**. After restarting VS Code, right-click a Markdown file in the explorer and choose "Open with MarkIt". The extension uses the MarkIt application icon in VS Code.
- Multiple `.md` / `.markdown` files can be selected at once; if MarkIt is already running, the files open as new tabs in the current window and the window is focused.
- Turning off the integration switch removes the extension and the context menu disappears after restarting VS Code. Flatpak, Remote / WSL / SSH workspaces, and development mode are not supported.

### 2.7 Search and Replace

Press `Ctrl + F` to open the search panel and type to search the current document:

- By default the search is **literal text matching**, not regular expressions. English matching ignores case by default; toggle `Aa` to match case.
- In editor-only and split layouts the search runs in the editor, and the preview highlights the matching text. In preview-only layout the rendered result is searched directly.
- `Enter` / `F3` next, `Shift + Enter` / `Shift + F3` previous; reaching the end or beginning wraps automatically and shows a hint at the top.
- `Ctrl + H` opens the replace row, where you can replace the current match or replace all. Replacement edits Markdown source text and can be undone with `Ctrl + Z`; preview-only layout does not offer replace.
- While the panel is open, press `Esc` to close it and clear the highlights.

> A single search locates at most 2,000 matches. Text inside Mermaid diagrams in the preview is not searched.

## 3. Markdown Syntax Reference

### 3.1 Headings

Use 1–6 `#` characters for the six heading levels. Headings also appear in the automatic outline.

#### This is a level-4 heading

##### This is a level-5 heading

###### This is a level-6 heading

### 3.2 Text Styles

- **Bold**: `**bold**`
- _Italic_: `*italic*`
- _**Bold italic**_: `***bold italic***`
- ~~Strikethrough~~: `~~strikethrough~~`
- `Inline code`: wrap in backticks
- Plain text and superscript-like forms such as E = mc^2 are shown as written (MarkIt does not parse math formulas)

### 3.3 Lists

Unordered list:

- A lightweight local editor
  - Live preview
  - Multiple tabs
    - Independent undo history
- Mermaid diagrams

Ordered list:

1. Capture the idea
2. Shape the structure
3. Export and deliver

Task list:

- [x] Multiple tabs
- [x] Mermaid diagrams
- [ ] Add more examples

> MarkIt shows the `[ ]` / `[x]` markers of task lists as written; it does not render interactive checkboxes.

### 3.4 Quotes

> A good document is not written in one pass;
> it becomes clear through previewing and revising.
>
> > Quotes can be nested to express hierarchy.
>
> — MarkIt User Manual

### 3.5 Tables

Tables support left, center, and right alignment:

| Feature          | Status |                        Description |
| :--------------- | :----: | ---------------------------------: |
| Live preview     |   ✅   |               Rendered as you type |
| Mermaid diagrams |   ✅   |     Zoom / dialog preview / export |
| PDF export       |   ✅   |            Keeps the preview style |
| Image export     |   ✅   | PNG / JPEG · configurable settings |
| Custom styles    |   ✅   |            Import a local CSS file |

In the preview, move the pointer to the right edge of a header cell and drag to resize that column. Dragging an inner edge shifts only the two adjacent columns; other columns stay put. Dragging the right edge of the last column keeps the other widths and changes the total table width, adding horizontal scrolling when it exceeds the preview area. Double-click the same spot to restore automatic width. Narrow columns such as an index can shrink to fit only a few digits instead of reserving a whole block of blank space. Column widths are remembered per document and survive tab switches and restarts. They affect the preview only and are **never written back to the Markdown file**, so other tools see the original layout; PDF export still uses the default widths.

### 3.6 Links

- External link: [Electron](https://www.electronjs.org/)
- Auto-detected URL: https://mermaid.js.org/
- Local file link: `[Read the guide](./README.md)`

Hover over a link to see its full address, including abbreviated link text and auto-detected URLs.

Click behavior in the preview:

- `http` / `https` / `mailto` links open in the system browser
- Local file links are revealed in the system file manager
- In-page anchors keep native navigation; all other protocols are ignored

### 3.7 Images

Common formats are supported: PNG, JPEG, GIF, WebP, BMP, SVG, AVIF, ICO, and TIFF.

```markdown
![Diagram](./images/demo.png)
![Web image](https://example.com/banner.png)
```

Relative paths are resolved from the **directory of the current document**, so move the image directory together with the document when you relocate it.

Click an image in the preview to open a large preview that covers the entire window:

- Scroll the wheel, or hold `Ctrl` / `Cmd` and scroll to zoom around the mouse pointer; `−` / `＋` zoom around the window center
- **Fit** keeps the whole image visible; entering full screen re-fits it instead of squeezing it into a fixed-size dialog
- Local images offer **Show in folder** and **Save as**; web images can be downloaded locally; press `Esc` or click `✕` to close
- When an image is inside a link, clicking it follows the link instead of opening the preview

### 3.8 Code

Inline code: `npm run dev`

Fenced code blocks can declare a language, and the editor provides multi-language syntax highlighting:

```typescript
interface DocumentTab {
  path: string | null
  content: string
  isModified: boolean
}

function createTab(path: string | null, content: string): DocumentTab {
  return { path, content, isModified: false }
}
```

```python
def word_count(text: str) -> int:
    return len("".join(text.split()))
```

```json
{
  "name": "mark-it",
  "version": "1.3.1",
  "description": "Lightweight Markdown editor"
}
```

```bash
npm install
npm run dev
npm run build:win
```

### 3.9 Embedded HTML

HTML can be written directly in Markdown, such as <kbd>Ctrl</kbd> + <kbd>S</kbd> key hints or a <mark>highlighted passage</mark>.

For safety, the preview keeps only a safe subset of HTML: scripts, event attributes such as `onclick`, `iframe`, forms, and `<style>` tags are removed. Common markup such as `<kbd>`, `<mark>`, tables, and inline `style` attributes is preserved. PDF and image export follow the same rules.

### 3.10 Horizontal Rules and Line Breaks

Three or more `-`, `*`, or `_` characters render a horizontal rule:

---

MarkIt enables soft line breaks, so a single Enter also starts a new line,
which is handy for capturing ideas line by line or writing poetry.

## 4. Document Info (Frontmatter)

The YAML block surrounded by `---` at the very top of a document is called frontmatter. MarkIt does not display it as raw YAML; it renders it as a **Document Info** table at the top of the document.

Supported basics:

```yaml
---
title: Weekly Project Report
author: Zhang San
date: 2026-11-02
tags: weekly, project, progress
description: |
  First line of the description
  Second line of the description
---
```

- Top-level `key: value` pairs become one property row each
- Quoted strings lose their quotes
- `|` preserves newlines; `>` folds them into spaces
- Indented continuation lines merge into the previous property
- Comment lines starting with `#` are not displayed

Frontmatter also affects outline parsing: body headings are counted after the property block, matching the preview hierarchy.

## 5. Mermaid Diagram Gallery

MarkIt renders Mermaid code blocks automatically. The fence language does not have to be `mermaid`; you can use the diagram type directly, and case plus `-beta` / `-v2` suffixes are supported.

For safety, interactive `click` syntax in diagrams does not take effect; diagrams are displayed as static graphics.

Diagrams prefer Pele's unified layout and colors and fall back to Mermaid when Pele cannot handle them; flowcharts, pie charts, radar charts, and bar charts share the same light and dark themes. Switching the app theme or preview style redraws the diagrams immediately.

| Category                      | Accepted language markers                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flowcharts                    | `mermaid`, `mmd`, `flowchart`, `flow`, `graph`                                                                                                        |
| Sequence / class / state / ER | `sequence`, `sequenceDiagram`, `class`, `classDiagram`, `state`, `stateDiagram-v2`, `er`, `erDiagram`                                                 |
| Planning and time             | `gantt`, `journey`, `timeline`                                                                                                                        |
| Mind maps / statistics        | `mindmap`, `pie`, `gitGraph`, `quadrantChart`                                                                                                         |
| Data charts                   | `xychart` / `xychart-beta`, `sankey` / `sankey-beta`, `radar` / `radar-beta`, `treemap` / `treemap-beta`                                              |
| Other                         | `block`, `packet`, `requirementDiagram`, `architecture`, `kanban`, `info`, `C4Context` / `C4Container` / `C4Component` / `C4Dynamic` / `C4Deployment` |

Each type is demonstrated below. Editing any code block re-renders the preview immediately.

> The first line inside the code block must still name the diagram type (for example `gantt` or `pie`). The fence language only tells MarkIt that the block should be rendered by Mermaid.

### 5.1 Flowchart

Flowcharts express steps, branches, and loops.

```flowchart
flowchart TD
    A([Start MarkIt]) --> B{Document open?}
    B -- Yes --> C[Open local Markdown]
    B -- No --> D[Create a new tab]
    C --> E[Edit content]
    D --> E
    E --> F[Live preview]
    F --> G{Need diagrams?}
    G -- Yes --> H[Mermaid code block]
    H --> F
    G -- No --> I{Ready?}
    I -- No --> E
    I -- Yes --> J[Ctrl + S to save]
    J --> K([Export PDF])
    subgraph Autosave
      L[Persist session]
    end
    E -.-> L
```

### 5.2 Sequence Diagram

Sequence diagrams describe call order and branches between roles.

```sequence
sequenceDiagram
    autonumber
    actor U as Writer
    participant E as Editor
    participant P as Live preview
    participant D as Local disk
    U->>E: Type Markdown
    E->>P: Parse and render
    P-->>U: Show the result immediately
    U->>E: Ctrl + S
    E->>D: Write the file as UTF-8
    alt Save succeeds
        D-->>E: Success
        E-->>U: Clear the unsaved marker
    else Save fails
        D-->>E: Error
        E-->>U: Show an error message
    end
    Note over E,P: Editor and preview scroll together
```

### 5.3 Class Diagram

Class diagrams describe types, attributes, methods, and their relationships.

```class
classDiagram
    direction LR
    class Document {
        +String path
        +String content
        +Boolean dirty
        +save()
        +saveAs(path)
    }
    class Tab {
        +String title
        +Boolean dirtyMark
        +activate()
        +close()
    }
    class Preview {
        +render(content)
        +exportPdf()
    }
    class Outline {
        +HeadingItem[] headings
        +jumpTo(index)
    }
    Document "1" --> "1" Tab : maps to
    Tab "1" *-- "0..*" Outline : generates
    Preview ..> Document : reads content
```

### 5.4 State Diagram

State diagrams express state transitions for documents, orders, workflows, and similar objects.

```state
stateDiagram-v2
    [*] --> Clean
    Clean --> Dirty : Type content
    Dirty --> Saved : Ctrl + S
    Saved --> Clean : Clear the modified flag
    Dirty --> Clean : Undo all changes
    Dirty --> [*] : Discard changes
    Saved --> Dirty : Keep editing
    state Dirty {
        [*] --> Editing
        Editing --> Rendering : Content changed
        Rendering --> Editing : Render complete
    }
```

### 5.5 ER Diagram

ER diagrams describe data entities and their relationships.

```er
erDiagram
    DOCUMENT ||--o{ TAB : "opens"
    TAB ||--o{ DIAGRAM : "contains"
    DOCUMENT {
        string path PK
        string content
        boolean dirty
    }
    TAB {
        string title
        int cursorLine
        int cursorCol
    }
    DIAGRAM {
        string type
        string source
    }
```

### 5.6 Gantt Chart

Gantt charts suit schedules, milestones, and iteration plans.

```gantt
    gantt
    title MarkIt Release Plan
    dateFormat YYYY-MM-DD
    axisFormat %m-%d
    excludes weekends
    section Editing experience
    Multiple tabs       :done,    t1, 2026-10-01, 7d
    Outline and scroll  :active,  t2, after t1, 5d
    Diagram zoom        :         t3, after t2, 4d
    section Release
    PDF export          :         t4, after t3, 3d
    Release 1.3.1       :milestone, m1, after t4, 0d
```

### 5.7 User Journey

User journey maps organize tasks and satisfaction from an experience perspective.

```journey
    journey
    title Writing with MarkIt
    section Open a document
      Launch the app: 5: Writer
      Open Markdown: 4: Writer
    section Edit content
      Write the body: 4: Writer
      Insert a diagram: 3: Writer
      Adjust formatting: 4: Writer
    section Deliver
      Export PDF: 5: Writer
      Share the file: 5: Writer
```

### 5.8 Timeline

Timelines show versions, events, and plans in chronological order.

```timeline
    timeline
    title MarkIt Version Timeline
    section 2026
      1.0 : Multiple tabs
          : Automatic outline
      1.1 : Mermaid diagrams
      1.2 : Themes and preview styles
      1.3 : Frontmatter table
          : Diagram dialog preview
    section Future
      1.4 : More collaboration features
```

### 5.9 Mind Map

Mind maps help with brainstorming and organizing document structure.

```mindmap
mindmap
  root((MarkIt))
    Editing
      CodeMirror 6
      Multiple tabs
      Formatting toolbar
    Preview
      Markdown-it
      Mermaid diagrams
      Automatic outline
    Export
      PDF
      SVG and PNG
```

### 5.10 Pie Chart

Pie charts show proportions and composition.

```pie
    pie showData
    title Document Type Distribution
    "Technical docs" : 45
    "Meeting notes" : 25
    "Personal notes" : 20
    "Other" : 10
```

### 5.11 Git Graph

Git graphs explain branches, merges, and release cadence.

```gitGraph
    gitGraph
    commit id: "init"
    commit id: "multi-tab"
    branch develop
    checkout develop
    commit id: "mermaid"
    commit id: "scroll-sync"
    checkout main
    merge develop
    commit id: "v1.3.1"
```

### 5.12 Quadrant Chart

Quadrant charts help with prioritization and value assessment.

```quadrantChart
    quadrantChart
    title Feature Priority
    x-axis Low implementation cost --> High implementation cost
    y-axis Low usage frequency --> High usage frequency
    quadrant-1 Do first
    quadrant-2 Keep as is
    quadrant-3 Defer
    quadrant-4 Re-evaluate
    Live preview: [0.2, 0.9]
    Mermaid diagrams: [0.45, 0.85]
    Multiple tabs: [0.35, 0.75]
    PDF export: [0.6, 0.5]
    Auto update: [0.8, 0.35]
```

### 5.13 XY Chart

XY charts combine bars and lines to show data trends.

```xychart-beta
    xychart-beta
    title "Words Written per Day"
    x-axis ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    y-axis "Words" 0 --> 3000
    bar [1200, 1800, 900, 2400, 2100, 600, 1500]
    line [1200, 1800, 900, 2400, 2100, 600, 1500]
```

### 5.14 Sankey Diagram

Sankey diagrams show flows, conversions, and destination distribution.

```sankey-beta
    sankey-beta
    Draft,Review,30
    Draft,Archive,10
    Review,Published,25
    Review,Revision,5
    Revision,Published,5
```

> Sankey field names use English identifiers: Draft, Review, Published, Revision, and Archive.

### 5.15 Radar Chart

Radar charts compare capabilities across dimensions.

```radar-beta
    radar-beta
    title Editor Capability Radar
    axis edit["Editing"], preview["Preview"], diagram["Diagrams"], export["Export"], theme["Theme"], tabs["Tabs"]
    curve markit["MarkIt"]{4, 5, 5, 4, 5, 5}
    curve classic["Classic editor"]{3, 3, 1, 2, 2, 4}
    max 5
    min 0
```

### 5.16 Treemap

Treemaps use area to show the proportion of hierarchical data.

```treemap-beta
    treemap-beta
    "Documents"
      "Writing"
        "Technical docs": 45
        "Personal notes": 30
        "Meeting notes": 25
      "Export"
        "PDF": 60
        "Images": 40
```

### 5.17 Block Diagram

Block diagrams express module boundaries and their relationships.

```block-beta
    block-beta
    columns 3
    editor["Editor"] preview["Preview"] outline["Outline"]
    editor --> preview
    preview --> outline
    style editor fill:#6c9bff,color:#fff
```

### 5.18 Packet Diagram

Packet diagrams describe binary messages, protocol fields, and bit ranges.

```packet-beta
    packet-beta
    0-2: "Separator"
    3-15: "frontmatter"
    16-31: "Body"
```

### 5.19 Requirement Diagram

Requirement diagrams express requirements, elements, and satisfaction links.

```requirementDiagram
    requirementDiagram
    requirement RealtimePreview {
        id: 1
        text: "Preview refreshes immediately after editing"
        risk: medium
        verifymethod: test
    }
    requirement Stability {
        id: 2
        text: "One failed diagram does not affect the rest"
        risk: high
        verifymethod: test
    }
    element Editor {
        type: diagram
    }
    Editor - satisfies -> RealtimePreview
    Editor - satisfies -> Stability
```

### 5.20 Architecture Diagram

Architecture diagrams describe services, groups, and deployment topology.

```architecture-beta
    architecture-beta
    group app(cloud)["MarkIt"]
    service editor(server)["Editor"] in app
    service preview(server)["Preview"] in app
    service disk(database)["Local disk"] in app
    editor:R -- L:preview
    editor:B -- T:disk
```

### 5.21 Kanban

Kanban boards organize tasks by column and status.

```kanban
    kanban
    todo[To do]
      t1[Document keyboard shortcuts]
      t2[Record demo animations]
    doing[In progress]
      t3[Polish the user manual]
    done[Done]
      t4[Diagram dialog preview]
```

### 5.22 Info

The info diagram shows the current Mermaid version and runtime details, which is useful for troubleshooting the renderer.

```info
info
```

### 5.23 C4 Architecture Diagrams

MarkIt supports the C4 context, container, component, dynamic, and deployment diagrams. Below are a system context and a container view:

```C4Context
    C4Context
    title MarkIt System Context
    Person(user, "Writer", "Writes documents with MarkIt")
    System(markit, "MarkIt", "Local Markdown editor")
    System_Ext(os, "Operating system", "File system and PDF printing")
    Rel(user, markit, "Edits and previews")
    Rel(markit, os, "Reads and writes files / exports")
```

```C4Container
    C4Container
    title MarkIt Container View
    Person(user, "Writer")
    Container(app, "MarkIt desktop app", "Electron", "Editing, preview, and export")
    ContainerDb(fs, "Local file system", "NTFS / APFS", "Stores Markdown files")
    Rel(user, app, "Uses")
    Rel(app, fs, "Reads and writes")
```

## 6. Diagram Interaction

### 6.1 Zoom

When you hover over a diagram, its area gets a faint background tint and the toolbar appears in the top-right corner. Each rendered diagram's toolbar contains:

- `−` / `＋`: zoom out or in in 1.25× steps
- Middle percentage: click to restore 100%
- Zoom range: 25%–400%; scroll when the diagram exceeds the visible area
- Without manual zoom, the diagram fits the preview width; wide diagrams scroll horizontally, while tall diagrams keep their normal font size and scroll with the page

You can also hold `Ctrl` / `Cmd` and scroll the mouse wheel to zoom a diagram without zooming the whole window.

### 6.2 Large Preview

Click the **Preview** button in the diagram toolbar to open a large preview that covers the entire window (double-clicking a diagram stays reserved for selecting text and does not open the preview):

- Scroll, zoom, and fit to window inside the preview; it fills the screen in full-screen mode
- Wheel zoom is anchored at the mouse pointer and button zoom at the window center, so the diagram does not jump to the top-left corner
- Useful for inspecting the details of a complex diagram
- Download SVG / PNG directly from the preview window

Images and diagrams share the same preview window; see "3.7 Images" for image save and download actions.

### 6.3 Exporting Diagrams

The diagram toolbar provides `SVG` and `PNG` download buttons:

- Choose a location in the system **Save File** dialog
- PNG is exported at 2× resolution
- The export background follows the current theme, so dark diagrams do not get a white background

### 6.4 Render Failure Notice

If a diagram has a syntax error, MarkIt first tries a fallback renderer. If that also fails, the original code block is kept and a notice appears below it:

> Failed to render diagram (language): reason

Hover over the notice to see the full error. Fixing the syntax re-renders automatically.

## 7. Exporting PDF

Press `Ctrl + P` to open the export dialog:

- Paper: A4 / Letter
- Uses a separate light print style
- Rendered Mermaid diagrams are included
- Configure margins, page numbers, table of contents, and document info

After you confirm, the settings dialog collapses into the status bar. During export the status bar shows the current stage, percentage, and progress bar; the result appears when it finishes.

## 8. Exporting Long Images

Click **Export Long Image** in the toolbar to open export settings first:

- Exports the current editor content, including unsaved changes
- Format: PNG or high-quality JPEG
- Content width: 640 / 800 / 1000 / 1200 px
- Quality: 1× or 2×
- Theme: follow current, light, or dark
- Optionally include the Frontmatter document info
- Keeps local images, code highlighting, and Mermaid diagrams
- Remembers the last confirmed settings; **Reset to defaults** returns to PNG / 800 px / 2× / follow current theme
- Very long documents automatically reduce the scale, and the status bar reports the actual result; if the image still exceeds the limit, the export fails with a message
- If page loading or image generation times out, the export fails with a message and the entry point is restored; shorten the document or use 1× and try again
- The save dialog defaults to the current document name and opens in the document's directory
- After confirmation the settings dialog collapses into the status bar and the stage and percentage update continuously

Long images are ideal for sharing in chat, documents, or social platforms. Use PDF export when you need printing, pagination, or a table of contents.

## 9. Keyboard Shortcuts

| Shortcut                             | Action                             |
| ------------------------------------ | ---------------------------------- |
| `Ctrl + N`                           | New tab                            |
| `Ctrl + Shift + N`                   | New editor window                  |
| `Ctrl + O`                           | Open file (multi-select supported) |
| `Ctrl + S`                           | Save file                          |
| `Ctrl + Shift + S`                   | Save As                            |
| `Ctrl + W`                           | Close the current tab              |
| `Ctrl + Tab` / `Ctrl + Shift + Tab`  | Switch tabs                        |
| `Ctrl + 1` to `Ctrl + 9`             | Jump to the Nth tab                |
| `F5` / `Ctrl + R`                    | Manual refresh (re-read from disk) |
| `Ctrl + B`                           | Bold                               |
| `Ctrl + I`                           | Italic                             |
| `Ctrl + K`                           | Insert link                        |
| `Ctrl + Shift + K`                   | Insert code block                  |
| `Ctrl + Shift + O`                   | Toggle the outline panel           |
| `Ctrl + F`                           | Open search                        |
| `Ctrl + H`                           | Open search with replace expanded  |
| `Enter` / `Shift + Enter`            | Next / previous match              |
| `F3` / `Shift + F3`                  | Next / previous match              |
| `Ctrl + \`                           | Cycle layouts                      |
| `Ctrl + P`                           | Export PDF                         |
| `Ctrl + ,`                           | Open or focus the settings window  |
| `Ctrl + =` / `Ctrl + -` / `Ctrl + 0` | Zoom in / out / reset to 100%      |
| `Ctrl` / `Cmd` + wheel               | Zoom a Mermaid diagram             |

> On macOS, use `Cmd` instead of `Ctrl`. Tab switching still uses `Ctrl + Tab` to avoid conflicting with the system app switcher.

## 10. FAQ and Tips

### 10.1 Images Do Not Show

- For relative paths, confirm the image is located relative to the current document's directory
- The image extension must be in the supported list
- Web images require working network access

### 10.2 Diagrams Do Not Render

- Check that the code fence language is a supported diagram type
- Start with a minimal example for complex syntax, then build it up
- Read the specific reason in the "Failed to render diagram" notice

### 10.3 I Want My Own Preview Style

Import a local CSS file in Settings. Custom styles are available for the current run and are handy for temporary changes to fonts, spacing, and colors.

### 10.4 Where Are Documents Saved?

MarkIt is a local editor: saving writes to the file you choose and never uploads to the cloud. Session recovery data is used only to restore tabs on the next launch.

### 10.5 What Can I Choose During Installation?

On a first install, the Windows installer asks for the install scope (just me / all users), the install directory, and whether to create desktop and Start menu shortcuts. When MarkIt is already installed, the install scope reuses your previous choice and is no longer asked (uninstall first to change it); the shortcut options are preselected from the current state, and automatic updates run silently without changing your earlier shortcut choices.

### 10.6 Does MarkIt Upload Usage Data?

No document content, file paths, or window titles are uploaded. MarkIt only reports anonymous device activity to the application platform: a randomly generated installation identifier, the operating system and version, and when a window becomes active. This data is used to count how many devices use MarkIt, is not linked to an account, and cannot reveal your document content.

---

**Start writing.** Press `Ctrl + N` for a blank document, or `Ctrl + O` to open an existing Markdown file.
