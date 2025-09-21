# Hierarchical Backlinks Search & Filter Syntax

The hierarchical backlinks pane reuses Obsidian's search vocabulary where it
makes sense, and adds a small number of plugin–specific filters. Queries are
parsed and evaluated client-side (see `parser.ts` and `evaluator.ts`) and are
case-insensitive by default.

- Whitespace joins terms with an implicit **AND**.
- Prefix any term with `-` to negate it.
- Wrap text in double quotes (`"exact phrase"`) for phrase matching.
- Use parentheses to control grouping and `OR` (uppercase is optional) to form
  explicit disjunctions.
- Wrap a term in `/pattern/flags` to run a JavaScript-style regular expression
  match (`flags` may be any of `gimsuy`). Regex literals work for bare terms
  and all field filters.
- Invalid or incomplete input (for example an unterminated quote) falls back to
  “show everything” so the UI remains responsive while you edit the query.

## Field Filters

| Filter                                    | Matches                                                    | Example                           | Notes                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| _bare term_                             | Note content**or** the note's display title/basename | `project alpha`                 | Mirrors Obsidian's default search target.                                                     |
| `content:<text>`                        | Markdown content of the linked note                        | `content:"meeting notes"`       | Substring match.                                                                              |
| `title:<text>` / `file:<text>`        | Display title or basename of the linked note               | `title:"Daily Note"`            | `file:` is an alias.                                                                        |
| `path:<text>`                           | The vault-relative path of the linked note                 | `path:"clients/acme"`           | Useful for folder scoping.                                                                    |
| `tag:<text>`                            | Frontmatter `tags` values and inline `#tags`           | `tag:research`                  | Matches the same tag metadata Obsidian exposes.                                               |
| `references:<text>` (`refs`, `ref`) | Backlink metadata describing the match source              | `references:"project-plan"`     | Matches the source file path or serialized reference payload.                                 |
| `[propName]`                            | Existence of a frontmatter property (case-insensitive)     | `[status]`                      | Same syntax as Obsidian property search.                                                      |
| `[propName: expression]`                | Property value tested against another query expression     | `[status: (active OR pending)]` | Expression uses the same syntax as the top-level query and runs against the property's value. |

Any other keyed term (for example `frontmatterKey:value`) falls back to a
simple substring check against the matching `TreeNode` field if it exists.

### Property Expressions in Detail

Bracketed property filters (`[prop: …]`) serialize the name and optional
expression into JSON so that the evaluator can:

1. Find the frontmatter key case-insensitively.
2. Cast the property's value to one or more strings (arrays are flattened).
3. Evaluate the expression using the same parser as the outer query.

Within the expression you can use `AND` (whitespace), `OR`, `-` for negation,
phrases, parentheses, and `/regex/flags` patterns—matching Obsidian's property
filter behaviour.

Examples:

```
[status:done]
[tags:-client OR internal]
[priority:/p[12]/]
```

## Behaviour Notes

- Matching is always case-insensitive and uses substring logic unless a regex is
  supplied inside a property expression.
- Typing `key:` without a value is treated as neutral (it neither matches nor
  filters anything) so partially-entered filters do not hide all results.
- When a query is empty, every node is made visible.

## Comparison with Obsidian Search

Supported features are intentionally close to the core search syntax, but there
are a few differences to keep in mind:

- Filters such as `line:`, `block:`, `section:`, `task`, `task-done`, and other
  task-centric predicates are **not** implemented in the backlinks view.
- Property queries use the bracket form (`[propName]`, `[propName: …]`), just
  like the core search syntax. Aliases such as `property:foo` are not currently
  recognised in this view.
- `tag:` reads the same tag metadata as Obsidian (frontmatter `tags` and inline
  `#tags`) and applies the same hierarchical rules (`tag:#work` matches
  `#work`/`#work/project`, but not `#myjob/work`).
- Regex literals (`/pattern/flags`) are interpreted everywhere, matching the
  core search plugin. Flags follow JavaScript conventions (`gimsuy`).
- The custom `references:` filter is unique to Hierarchical Backlinks and lets
  you match the source note path or serialized match metadata for a backlink
  entry.

If you rely on an Obsidian search operator that is not listed here, the query
will simply behave like a plain substring search. Feel free to open an issue if
additional operators would be useful in the backlinks context.
