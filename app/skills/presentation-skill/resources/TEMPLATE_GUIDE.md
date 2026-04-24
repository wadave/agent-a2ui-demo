# Template Layout Guide

The bundled `template.pptx` has **5 slides, indexed 0–4**, 16:9. This guide describes what each slide holds and how to reuse them when assembling a deck via `rearrange_presentation_slides`.

## Slide Catalog

| Index | Layout | Role | Addressable shapes |
|---|---|---|---|
| 0 | `CUSTOM_2` | Cover | `shape-0` Title/subtitle, `shape-1` Name/date |
| 1 | `Blank_12` | Table of Contents | `shape-1` "Table of Contents" title; `shape-3 / shape-5 / shape-7 / shape-9 / shape-11` numbered labels `01`–`05`; `shape-2 / shape-4 / shape-6 / shape-8 / shape-10` empty entry-title placeholders next to each number |
| 2 | `Blank_7` | Section divider | `shape-0` single large title (e.g. "Problem") |
| 3 | `BLANK_1` | **Body content page** | `shape-0` title (top, 9.0" × 0.5"), `shape-1` body area (8.3" × 0.56") — both empty in the inventory; fill with your title and prose/bullets |
| 4 | `CUSTOM_2` | Closing | `shape-1` "Thank you", `shape-0` "Proprietary & Confidential" footer |

### Empty-placeholder rule

Several shapes have empty text in the inventory (`"paragraphs": []`). They are **not decorative** — they are the title and body placeholders waiting to be filled. The inventory exposes them deliberately so the LLM can address them. Treat them the same as shapes that already contain sample text.

## Required deck structure

- **Bookends are mandatory**: the first index must be `0` (cover) and the last must be `4` (closing).
- **At least one body slide between them** — `[0, 4]` and `[0, 1, 4]` are rejected by `rearrange_presentation_slides`. Use index `2` for section breaks and index `3` for the actual body content.

## Example index lists

| Use case | `indices` |
|---|---|
| 3-section content deck | `[0, 1, 3, 3, 3, 4]` |
| 5-section deck without TOC | `[0, 3, 3, 3, 3, 3, 4]` |
| Sectioned (2 chapters × 2 body slides each) | `[0, 1, 2, 3, 3, 2, 3, 3, 4]` |
| Single-topic flash | `[0, 3, 4]` |

## When to swap to a custom template

The bundled template covers cover / TOC / section / body / closing — enough for narrative decks. If you need richer layouts (multi-column comparisons, image galleries, quote slides, statistics callouts, timelines), supply a custom `.pptx` via the `template_path` argument; the bundled template's structural validator only runs when `template_path` is empty.
