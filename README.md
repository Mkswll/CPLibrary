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

1. Copy a `.h` file into `library/`
2. Add an entry to `library/manifest.json` with `id`, `file`, `name`, `description`, `category`, and `deps`

## Marker format

Inserted snippets are wrapped:

```cpp
// @cplib DSU
...snippet content...
// @cplib-end DSU
```

These markers let the extension detect what's already in the file.
