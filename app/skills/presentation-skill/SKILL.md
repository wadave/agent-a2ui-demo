---
name: presentation-skill
description: Create professional Google Slides presentations from a PowerPoint template by rearranging slides, replacing placeholder text, and uploading to Drive. Use when the user asks for a slide deck, presentation, or Google Slides built from a template.
metadata:
  adk_additional_tools:
    - rearrange_presentation_slides
    - extract_presentation_inventory
    - apply_presentation_replacements_data
    - upload_presentation
    - read_local_file
---

# Presentation Skill — Template-Based Slide Creation

## Overview

This skill drives the four ADK tools that, together, turn a PowerPoint template into a finished Google Slides deck:

| Step | Tool | Purpose |
|---|---|---|
| 1 | `rearrange_presentation_slides` | Pick slide indices from a template, write a working `.pptx`. |
| 2 | `extract_presentation_inventory` | Dump every shape on every slide to a JSON inventory. |
| 3 | `read_local_file` | Read the inventory so you know which `shape-*` IDs exist. |
| 4 | `apply_presentation_replacements_data` | Replace text in named shapes, write the final `.pptx`. |
| 5 | `upload_presentation` | Convert the local `.pptx` to Google Slides in Drive. |

You do **not** run shell commands or scripts. Every step is a tool call.

## When to Use This Skill

Use this skill when the user asks for:
- A presentation, slide deck, slides, pitch deck
- A Google Slides document built from existing data
- A summary, report, or briefing in slide form

Do **not** use it for: editing a single existing slide, reading a deck the user already has, or generating raw PowerPoint XML.

## Templates

There are two template options:

**Default bundled template** (used when the user hasn't supplied one):
- **5 slides total, indexed 0–4**, 16:9.
- Pass `template_path=""` to `rearrange_presentation_slides` and the bundled template is used automatically.
- **Required structure (mandatory bookends)**: every deck built from this template MUST start with index `0` (cover) and end with index `4` (closing). Every deck MUST also include at least one body slide (index `2` or `3`) between them.
  - Slide `0` — **Cover** — `shape-0` Title/subtitle, `shape-1` Name/date.
  - Slide `1` — **Table of Contents** — `shape-1` Title ("Table of Contents"), `shape-3/5/7/9/11` numbered labels `01`–`05`, `shape-2/4/6/8/10` the empty entry-title placeholders next to each number (FILL THESE with the actual TOC item names — they show up empty in the inventory but are real text frames).
  - Slide `2` — **Section divider** — `shape-0` single large title only (use as a chapter break between groups of body slides).
  - Slide `3` — **Body content page** — `shape-0` title (top, 9.0" × 0.5"), `shape-1` body area (below, 8.3" × 0.56"). Both placeholders are empty in the inventory; the LLM MUST fill them with the per-section title and prose/bullets. This is the workhorse slide for actual content.
  - Slide `4` — **Closing "Thank you"** slide — `shape-1` "Thank you" headline, `shape-0` "Proprietary & Confidential" footer.
- Example index lists for `rearrange_presentation_slides`:
  - 3-section deck: `[0, 1, 3, 3, 3, 4]` (cover, TOC, three body content pages, closing).
  - Sectioned 5-topic deck: `[0, 1, 2, 3, 3, 2, 3, 3, 3, 4]` (cover, TOC, divider, two body, divider, three body, closing).
  - `[0, 4]` and `[0, 1, 4]` are rejected by the tool — every deck needs at least one body slide.
- **Empty-placeholder rule**: shapes whose text is empty in the inventory (`"paragraphs": []`) are NOT decorative — they are the body/title placeholders waiting to be filled. Treat them the same as shapes with sample text. The applier will reject `"paragraphs": []` in your replacement payload, so always supply at least one paragraph per shape you want to populate.
- See `resources/TEMPLATE_GUIDE.md` for the full layout map.

**Custom user template**:
- The user provides a `.pptx` file with the body layouts they want (single-column, two-column, image+text, etc.). Save it locally and pass its path as `template_path` in step 3. Custom templates skip the index validator above — you're responsible for picking valid indices.

## Workflow

### Step 1 — Load the source material

A deck is only useful if its body slides contain the content the user actually asked about. **Before** planning slides, find and load that content:

1. **Explicit reference** — the user names a file (`scratch/sdd.md`), a Drive document, or a `.pptx`. Read it with `read_local_file`, `read_doc`, `read_drive_file`, or `read_presentation`.
2. **Implicit reference** — phrases like "use above info", "this doc", "the file I just opened", or "the search results from earlier" mean content already in conversation or in an open scratch file. Locate the file and read it from disk; do NOT reconstruct from memory.
3. **In-conversation data** — tool outputs already in the transcript (e.g. `find_restaurants` results) can be used directly.
4. **Nothing concrete** — if you cannot point to specific content for the body slides, STOP and ask the user. Do NOT fabricate filler — a deck of invented restaurant prose for an SDD request is the failure mode this skill exists to prevent.

### Step 2 — Plan the deck

With the source material in hand, decide:
1. **Topic and audience** (ask the user if not clear).
2. **Outline**: derive one body section per logical chunk of the source (e.g. each H2 in a markdown doc, each major restaurant, each search result). Write a short list of sections with one sentence each, drawn from the source — not invented.
3. **Body-slide minimum**: every deck must have at least 3 body slides (so `[1, 2, 47]` — cover, agenda, closing only — is never acceptable). Match outline length: 5 outline sections ≈ 5+ body slides.
4. **Template mapping**: which template slide index backs each outline entry. Match content shape to layout shape — two-column layouts get exactly two items, image layouts only when you have an image, etc. Reusing an index (e.g. the divider) is fine.

### Step 3 — Rearrange template slides

Call **`rearrange_presentation_slides`**:
- `template_path`: `""` for the default template, or the user's template path.
- `output_path`: `"working.pptx"` (in the current working directory).
- `indices`: your list from Step 2. **For the default template, the list MUST start with `0` (cover) and end with `4` (closing), and MUST include at least one body slide (index `2` or `3`) between them.** Examples: `[0, 1, 3, 3, 3, 4]` (cover, TOC, three body content pages, closing), `[0, 1, 2, 3, 3, 2, 3, 4]` (with section dividers). The tool will reject `[0, 4]`, `[0, 1, 4]`, and any out-of-range index (the bundled template only has 5 slides, indices 0–4 — pass a custom `template_path` if you need more).

This produces `working.pptx` with the chosen slides in order.

### Step 4 — Extract the text inventory

Call **`extract_presentation_inventory`**:
- `pptx_path`: `"working.pptx"`
- `output_json_path`: `"text-inventory.json"`

Then call **`read_local_file`** with `file_path="text-inventory.json"` and read the result fully. The inventory tells you:
- Which `slide-N` / `shape-M` IDs exist
- The placeholder type of each shape (TITLE, BODY, SUBTITLE, …)
- Original formatting (font size, bold, alignment) you should preserve

### Step 5 — Build the replacement payload

Construct a `replacements` dict keyed by `slide-N` → `shape-M` → `{paragraphs: [...]}`. Rules:
- **Reference only shapes that appear in the inventory.** Unknown `slide-N` or `shape-M` IDs now cause `apply_presentation_replacements_data` to fail with a clear error (no more silent skips).
- **Cover EVERY shape on EVERY slide.** Any shape not listed in the dict keeps its original template text (e.g. "Lorem ipsum", "This is a placeholder for the restaurant list."). The deck the user sees should never contain template placeholder text — if you don't have data for a shape, supply a paragraph with empty or minimal text rather than omitting the entry.
- **Empty paragraphs arrays are rejected.** A `shape-M` entry with `"paragraphs": []` would blank the shape and is treated as an error. Either supply at least one paragraph or omit the entry entirely.
- **Bullets**: use `{"text": "...", "bullet": true, "level": 0}`. Do not put `•` or `-` characters in `text`.
- **Preserve formatting**: copy `bold`, `alignment`, `font_size` from the inventory entry when relevant (titles bold + centered; section headers bold; body usually plain).
- **Length**: shape sizes are fixed. Each entry in the inventory has `width` and `height` (in inches) plus the original `paragraphs` showing what text fit comfortably. Keep your replacement text close to that original length. The applier auto-enables "shrink text to fit shape" on every replaced shape, so moderate overage shrinks gracefully — but text that's 2x+ longer than the placeholder will look microscopic. If you need substantially more space, pick a different template slide index in step 2 (e.g. swap a single-column layout for a two-column one).

Example payload:
```json
{
  "slide-0": {
    "shape-0": {
      "paragraphs": [
        {"text": "Q2 Restaurant Tour Recap", "alignment": "CENTER", "bold": true, "font_size": 44.0}
      ]
    },
    "shape-1": {
      "paragraphs": [
        {"text": "April 2026", "alignment": "CENTER", "font_size": 18.0}
      ]
    }
  },
  "slide-1": {
    "shape-1": {
      "paragraphs": [
        {"text": "Highlights from each visit", "bullet": true, "level": 0},
        {"text": "Top picks for the next round", "bullet": true, "level": 0},
        {"text": "Open questions for the team",  "bullet": true, "level": 0}
      ]
    }
  }
}
```

### Step 6 — Apply replacements

Call **`apply_presentation_replacements_data`**:
- `pptx_path`: `"working.pptx"`
- `replacements`: the dict you just built
- `output_pptx_path`: e.g. `"restaurants.pptx"`
- `cleanup`: `true` (deletes `working.pptx` and `text-inventory.json` after a successful run)

The tool's `data.log` reports `Applied N paragraph(s) across M shape(s) on K slide(s). J shape(s) left untouched — they retain their original template text.` plus a `WARNING:` line if `J > 0`. **You MUST read `data.log` after every call.** If `J` (skipped shapes) is not zero:
- The deck still contains template "Lorem ipsum" / "This is a placeholder for the restaurant list." text.
- Go back to step 5, add entries for the missing shapes (re-read `text-inventory.json` to find their IDs), and call this step again.
- Do NOT call `upload_presentation` while `J > 0` — uploading a deck with leftover template text is a failure mode, not a partial success.

If the tool returns `{"ok": False, "error": "Invalid replacements: ..."}`, the indices or empty-paragraph rules above were violated. The error message names every offending entry — fix the payload and retry.

### Step 7 — Upload to Google Slides

Call **`upload_presentation`** with the local `.pptx` path and the destination Drive folder name. It returns the Google Slides URL — share that with the user.

## Common Errors

| Symptom | Cause | Fix |
|---|---|---|
| `Slide index out of range` | Index ≥ template slide count (default template has 0–47). | Stay within the template's range. |
| `Shape 'shape-X' not found on 'slide-Y'` | Replacement payload references a shape that doesn't exist. | Re-read `text-inventory.json` and use only shapes listed there. |
| `WARNING: text overflow` | Replacement text exceeds the shape's bounding box. | Shorten the text or pick a layout with a larger text area. |
| Slide appears blank | Forgot to add a replacement entry for that slide. | Add the entry, or accept that template content is preserved. |

## Tips

- Start small: 3–5 slides, verify the output, then expand.
- Always read the inventory before writing replacements; do not guess shape IDs.
- For section dividers and other repeated layouts, reuse the same template index in `indices`.
- The output filename is what the user sees in Drive — use a descriptive name (e.g. `restaurants-recap-april-2026.pptx`).
