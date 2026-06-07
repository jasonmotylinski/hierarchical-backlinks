# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install          # Install dependencies
npm run dev          # Development build with watch mode (uses esbuild)
npm run build        # Production build (runs tsc type check first, then esbuild)
npx vitest           # Run all tests
npx vitest run src/search/__tests__/parser.spec.ts  # Run a single test file
```

## Testing

### Unit tests (Vitest)

- Tests live in `__tests__/` folders next to the code. The `obsidian` package
  ships types only, so `vitest.config.ts` aliases it to `src/__mocks__/obsidian.ts`;
  add to that stub when code under test imports a new `obsidian` runtime value.
- DOM wiring (e.g. `TreeNodeView` click handlers) is tested under
  `// @vitest-environment jsdom`, polyfilling the `createDiv`/`createEl`/`setAttr`/
  `setText`/`toggleClass` helpers Obsidian adds to `HTMLElement` — see
  `src/tree/__tests__/treeNodeViewClick.spec.ts`.

### Manual interactive testing in the vault

Most bugs here are about *interaction* (clicks, navbar toggles, flatten/lock
state), which unit tests can't fully cover. The vault containing this repo has
a dedicated scenario folder, `HBTest/`, whose `HB Bug Tests.md` note contains
step-by-step verification instructions (folder notes via `_index`, an injected
ancestor folder note, plain backlinks). Open that note, open the Hierarchical
backlinks panel, and follow the steps. Add new scenario notes there when fixing
interaction bugs, and convert findings into unit tests where possible.

## Releasing

To release a new version (e.g., 1.4.0):

```bash
# 1. Bump version in package.json (also updates manifest.json and versions.json)
npm version 1.4.0 --no-git-tag-version

# 2. Commit the version bump
git add package.json manifest.json versions.json
git commit -m "chore: bump version to 1.4.0"

# 3. Create and push tag (triggers GitHub Actions)
git tag 1.4.0
git push origin main --tags
```

GitHub Actions (`.github/workflows/release.yml`) will build the plugin and create a **draft release** with `main.js`, `manifest.json`, and `styles.css`. Go to GitHub releases to add release notes and publish.

## Architecture Overview

This is an Obsidian plugin that displays backlinks for the active document as a collapsible hierarchy based on folder structure, rather than a flat list.

### Core Data Flow

1. **File** (`src/data/file.ts`) - Fetches backlinks from Obsidian's metadata cache and builds a `TreeNode[]` hierarchy mirroring the vault's folder structure. Each leaf node contains file content, frontmatter, tags, and reference positions.

2. **TreeNode** (`src/tree/treeNode.ts`) - Data model representing a file or folder in the hierarchy. Stores path, content, references, children, frontmatter, and tags.

3. **View** (`src/view/view.ts`) - Main `ItemView` subclass that orchestrates rendering. Manages:
   - Tree state (collapse/expand, sort order, flatten mode)
   - Lock snapshots (freezing backlinks for a specific note)
   - Search filtering
   - Global UI state synchronization

### Search System

The search system uses a parser/evaluator pattern:

- **Parser** (`src/search/parser.ts`) - Tokenizes queries into DNF (disjunctive normal form) clauses. Supports:
  - `key:value` field filters (title, path, content, tag, references)
  - `[prop]` or `[prop: expr]` frontmatter property queries
  - Quoted phrases, negation (`-term`), OR operator, parentheses
  - Regex literals (`/pattern/flags`)

- **Evaluator** (`src/search/evaluator.ts`) - `makePredicate()` creates a function that tests TreeNodes against parsed clauses

### UI Layer

- **BacklinksLayout** (`src/ui/layout.ts`) - Coordinates header (navbar) and tree rendering
- **HeaderController** (`src/ui/headerController.ts`) - Manages the toolbar with collapse/flatten/sort/lock/search controls
- **TreeRenderer** (`src/ui/treeRenderer.ts`) - Renders TreeNode hierarchy into TreeNodeView instances
- **uiState** (`src/ui/uiState.ts`) - Global singleton for persisted UI toggle states

### State Management

- **LockService** (`src/main/lockService.ts`) - Stores frozen `LockedTreeSnapshot` objects keyed by note path
- **ViewState** - Per-node collapse/visibility states stored in `Map<NodeId, NodeViewState>`
- Globals (list collapsed, content hidden, sort order, flatten mode, search query) are in `uiState`

### Key Types

Defined in `src/types.ts`:
- `TreeNodeData` - Interface for tree node data
- `ContentReference` - Backlink position data (content matches and frontmatter property matches)
- `ViewState`, `NodeViewState` - Per-node UI state
- `BacklinksLayoutHandlers` - Callback interface for navbar actions
