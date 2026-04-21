---
name: restaurant-finder-overrides
description: Routing and naming overrides on top of the vendored gws-* and google-* Workspace skills.
---

# Restaurant-Finder Workspace overrides

This overlay sits on top of:

- `gws-*` skills (CLI-shaped, from googleworkspace/cli)
- `google-*` skills (MCP-shaped, from gemini-cli-extensions/workspace)

## Tool routing (strict — overrides the vendored skills)

- **Reads** (list/search/get) → use the MCP tools defined by the `google-*`
  skills.
- **Mutations** (create/update/share) → use the Python wrappers
  (`create_doc`, `append_doc_text`, `share_doc`). Do **not** invoke the
  `gws` binary directly even when a `gws-*` skill suggests it; the wrappers
  add validation, timeout, and structured error returns the raw CLI lacks.
- The `gws-*` skills remain useful as **API references**: consult them to
  learn what fields a request body needs, then pass that body through the
  appropriate wrapper.

## Naming & organization (restaurant-finder specific)

- Doc titles: `{YYYY-MM-DD}_{City}_Restaurant_Recommendations`
- Place new docs in the user's Drive root unless they specify a folder.
- For trip plans across multiple cities, create one doc and append sections;
  do not create one doc per restaurant.

## Failure handling

If a wrapper returns `{"ok": false, "error": ...}`, surface a one-line
apology and the human-readable error verbatim. Do not retry automatically.
