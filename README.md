# CP Library (VS Code Extension)

Import competitive programming snippets with automatic dependency resolution and deduplication.

## Features

- **Sidebar tree** — browse snippets by category; expand to see direct dependencies
- **Quick pick import** — `CP Library: Import Snippet` from the Command Palette
- **Dependency resolution** — importing `HLD` pulls in `Graph` and `LazySegTree` (and their deps) once
- **Deduplication** — snippets marked with `// @cplib <id>` in the file are skipped on re-import
- **Preview** — see resolved order and generated text before inserting

## Development

```bash
npm install
npm run compile
```

Open this folder in VS Code and press **F5** to launch the Extension Development Host.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `cplib.libraryPath` | *(bundled)* | Path to a folder with `manifest.json` and snippet files |
| `cplib.insertPosition` | `cursor` | `cursor`, `top`, or `afterIncludes` |
| `cplib.showPreviewBeforeInsert` | `true` | Confirm before inserting |
| `cplib.detectExisting` | `true` | Skip snippets already marked in the file |

## Adding snippets

**UI (recommended):** `CP Library: Add Snippet` from the Command Palette (or `+` in the sidebar).

1. Choose **Use existing file** or **Create new file** (tabs under Snippet file)
2. Enter ID, name, description, category
3. Multi-select dependencies from existing snippets

**Use existing file:** pick a `.h` already in `library/`. **Create new file:** set path + paste code.

Edit later with `CP Library: Edit Snippet` (sidebar pencil icon or Command Palette). Use **Remove from library** on the form to delete the manifest entry (the `.h` file is kept on disk).

**Library file paths:** on **Create new file**, use **Choose path…** to create subfolders or type the path manually.

**Manual:** add a `.h` file under `library/` and an entry in `library/manifest.json`.

For a writable library when using an installed `.vsix`, set `cplib.libraryPath` to your repo's `library/` folder.

## Marker format

Inserted snippets are wrapped:

```cpp
// @cplib DSU
...snippet content...
// @cplib-end DSU
```

These markers let the extension detect what's already in the file.
