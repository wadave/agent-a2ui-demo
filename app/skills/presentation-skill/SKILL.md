---
name: presentation-skill
description: Create professional presentations using templates. Supports both the default Google corporate template and user-uploaded custom templates. Specializes in template-based presentation creation with proper slide layout selection, text replacement, and visual consistency. Use when users need presentations created from templates.
---

# Presentation Skill - Template-Based Presentation Creation

## Overview

This skill enables creating professional presentations using templates. It supports:
- **Default Google Template**: A pre-defined 48-slide corporate template with various layouts
- **Custom User Templates**: User-uploaded PowerPoint files to use as presentation templates

The skill provides structured workflows for analyzing templates, selecting appropriate layouts, and replacing placeholder text with custom content.

**IMPORTANT WORKING DIRECTORY NOTE**:
- **Always run commands from your project directory**, NOT from the skill folder
- All generated files (working.pptx, text-inventory.json, final output) will be saved in your current working directory
- The skill folder (`~/.agent/skills/presentation-skill`) contains only the template, scripts, and documentation
- Never work inside the skill folder - it should remain clean

## When to Use This Skill

Use this skill when:
- User requests a presentation to be created
- User mentions needing slides or a deck
- User wants a professional corporate presentation
- User specifies Google presentation format
- User provides a template file to use as basis
- Creating business presentations with consistent branding
- Reusing existing presentation templates with new content

Do NOT use this skill for:
- General PowerPoint editing or analysis → use `pptx` skill instead
- Creating presentations from scratch without a template → use `pptx` skill with html2pptx workflow
- Reading or analyzing existing presentations → use `pptx` skill
- Making minor edits to existing presentations → use `pptx` skill

## Dependencies

This skill requires:
- **python-pptx**: PowerPoint file manipulation
- **markitdown**: Text extraction from presentations (`pip install "markitdown[pptx]"`)
- **defusedxml**: Secure XML parsing (`pip install defusedxml`)
- **Pillow**: Image processing for text overflow detection (`pip install Pillow`)
- **LibreOffice** (optional): For thumbnail generation (`sudo apt-get install libreoffice`)
- **Poppler** (optional): For thumbnail generation (`sudo apt-get install poppler-utils`)

## Choosing Your Workflow

This skill supports two workflows:

1. **Workflow A: Using the Default Google Template** - Use when creating standard corporate presentations
2. **Workflow B: Using a Custom User Template** - Use when the user provides their own template file

Choose the appropriate workflow based on whether the user has uploaded a custom template or wants to use the default Google template.

---

## Workflow A: Using the Default Google Template

### Template Information

**Location**: `~/.agent/skills/presentation-skill/resources/template.pptx`
**Total Slides**: 48 (indexed 0-47)
**Design**: Google corporate style with clean layouts
**Content**: Placeholder text ready for replacement

#### Key Slide Types in Template

The template includes:
- **Slide 1**: Instructions (not for presentation)
- **Slide 2**: Cover slide with title and date
- **Slides 3-6**: Table of contents and agenda layouts
- **Slides 7-11**: Section divider slides with numbering
- **Slides 12-13**: Single and double column text layouts
- **Various layouts**: Image placeholders, quotes, callouts, statistics, timelines, etc.

See `resources/TEMPLATE_GUIDE.md` for detailed layout reference.

### Steps

### Step 1: Understand User Requirements

1. Ask clarifying questions about:
   - Presentation topic and purpose
   - Target audience
   - Number of sections/topics to cover
   - Any specific content requirements (images, data, quotes)
   - Desired presentation length (number of slides)

### Step 2: Extract and Analyze Template

Extract the template content to understand available layouts:

```bash
# Set the skill path for convenience
SKILL_PATH=~/.agent/skills/presentation-skill

# Extract template text content
python -m markitdown $SKILL_PATH/resources/template.pptx > template-content.md

# If LibreOffice is available, create visual thumbnail grids
python $SKILL_PATH/scripts/cli.py thumbnail $SKILL_PATH/resources/template.pptx template-thumbnails --cols 5
```

Review the extracted content and thumbnails (if available) to identify appropriate slide layouts for the user's content.

### Step 3: Create Content Outline and Template Mapping

Create an outline file (`outline.md`) that includes:

1. **Content structure**: Organized topics and key points
2. **Template mapping**: Which template slide to use for each content slide
3. **Layout justification**: Why each layout was chosen

**Critical Layout Selection Rules**:
- **Match content to layout structure**:
  - Single-column layouts → unified narrative or single topic
  - Two-column layouts → exactly 2 distinct items/concepts
  - Three-column layouts → exactly 3 distinct items/concepts
  - Image layouts → only when you have actual images
  - Quote layouts → only for attributed quotes
- **Count your content first** before selecting layout
- **Never force content** into incompatible layouts

Example template mapping:
```python
# Template slides to use (0-based indexing)
# Total slides in template: 48 (indices 0-47)
# Mapping: slide numbers from outline → template slide indices
template_mapping = [
    2,  # Cover slide
    3,  # Table of contents
    7,  # Section 1 divider
    12,  # Section 1 content (single column)
    13,  # Section 1 details (double column)
    7,  # Section 2 divider
    12,  # Section 2 content
]
```

### Step 4: Rearrange Template Slides

Use the rearrange script to create a working presentation:

```bash
# Set the skill path if not already set
SKILL_PATH=~/.agent/skills/presentation-skill

python $SKILL_PATH/scripts/cli.py rearrange \
  $SKILL_PATH/resources/template.pptx \
  working.pptx 2,3,7,12,13,7,12
```

This creates `working.pptx` in your current directory with slides in the desired order.

### Step 5: Extract Text Inventory

Extract all text shapes and their properties:

```bash
SKILL_PATH=~/.agent/skills/presentation-skill

python $SKILL_PATH/scripts/cli.py inventory working.pptx text-inventory.json
```

**IMPORTANT**: Read the entire `text-inventory.json` file (saved in your current directory) to understand:
- Available shapes on each slide
- Placeholder types (TITLE, BODY, SUBTITLE, etc.)
- Text formatting properties
- Shape positions and dimensions

### Step 6: Generate Replacement Text

Create `replacement-text.json` based on the inventory:

**Critical Rules**:
1. **Verify shapes exist**: Only reference shapes found in the inventory
2. **Include formatting**: Copy paragraph properties from inventory (bold, alignment, etc.)
3. **Handle bullets properly**: Use `"bullet": true, "level": 0` (no bullet symbols in text)
4. **Preservation**: Shapes not listed in replacement JSON are **preserved** (not cleared)
5. **Match content length**: Consider shape size when writing replacement text

Example replacement JSON structure:

```json
{
  "slide-0": {
    "shape-0": {
      "paragraphs": [
        {
          "text": "Your Presentation Title",
          "alignment": "CENTER",
          "bold": true,
          "font_size": 44.0
        }
      ]
    },
    "shape-1": {
      "paragraphs": [
        {
          "text": "January 2026",
          "alignment": "CENTER",
          "font_size": 18.0
        }
      ]
    }
  },
  "slide-1": {
    "shape-0": {
      "paragraphs": [
        {
          "text": "Section Header",
          "bold": true
        }
      ]
    },
    "shape-1": {
      "paragraphs": [
        {
          "text": "First key point",
          "bullet": true,
          "level": 0
        },
        {
          "text": "Second key point",
          "bullet": true,
          "level": 0
        },
        {
          "text": "Third key point",
          "bullet": true,
          "level": 0
        }
      ]
    }
  }
}
```

**Common Formatting Patterns**:
- **Titles**: Bold, centered, larger font size
- **Section headers**: Bold
- **Bullet lists**: `"bullet": true, "level": 0` for each item
- **Body text**: Usually no special properties
- **Dates/metadata**: Smaller font size, sometimes centered

### Step 7: Apply Replacements

Apply your replacement text to create the final presentation:

```bash
python $SKILL_PATH/scripts/cli.py replace working.pptx replacement-text.json output.pptx --cleanup
```

The script will:
- Validate all shapes exist in inventory
- Clear all text from inventory shapes
- Apply new text with proper formatting
- Report any overflow issues
- **Cleanup (Optional)**: If `--cleanup` is provided, it removes `working.pptx`, `replacement-text.json`, and `text-inventory.json` after successful generation.


### Step 8: Validation and Quality Check

If validation errors occur:

```
ERROR: Invalid shapes in replacement JSON:
  - Shape 'shape-5' not found on 'slide-2'. Available shapes: shape-0, shape-1, shape-2, shape-3
```

**Fix**: Update your replacement JSON to only use available shapes.

```
WARNING: Found 2 text overflow(s):
WARNING:   - Slide 3 / Shape 1: +1.5"
WARNING:   - Slide 5 / Shape 2: +0.8"
```

**Fix**: Shorten the text in the specified shape or use a different layout. The overflow amount indicates how much text extends beyond the shape boundary.

---

## Workflow B: Using a Custom User Template

Use this workflow when the user provides their own PowerPoint template file.

### Step 1: Receive and Save User Template

1. Receive the template file from the user
2. Save it to a working location (e.g., `user-template.pptx`)
3. Verify the file is a valid PowerPoint file

### Step 2: Analyze the Custom Template

Extract information about the template to understand its structure:

```bash
# Set the skill path
SKILL_PATH=~/.agent/skills/presentation-skill

# Extract text content from template
python -m markitdown user-template.pptx > template-analysis.md

# Generate visual thumbnails (if LibreOffice available)
python $SKILL_PATH/scripts/cli.py thumbnail user-template.pptx template-thumbnails --cols 5

# Count total slides and analyze structure
python $SKILL_PATH/scripts/cli.py analyze user-template.pptx
```

**IMPORTANT**: Read the entire `template-analysis.md` file to understand:
- How many slides are in the template
- What types of layouts are available
- Which slides have placeholder text vs. final content
- Visual design patterns and branding

### Step 3: Create Template Inventory

Document the available layouts in the template:

1. **Review thumbnails** (if generated) to visually identify slide types
2. **Read extracted content** to understand text structure
3. **Create a template inventory** listing:
   - Total slide count (remember: 0-indexed)
   - Slide types by index (title, content, divider, etc.)
   - Layout characteristics (columns, image placeholders, etc.)
   - Which slides are suitable for reuse

Example inventory format:
```markdown
# User Template Inventory
**Total Slides**: 25 (indexed 0-24)

## Slide Breakdown
- Slide 0: Cover/title slide
- Slide 1: Agenda/TOC layout
- Slide 2: Section divider
- Slides 3-5: Single column content
- Slides 6-8: Two column content
- Slide 9: Image + text layout
- Slides 10-24: Various specialized layouts
```

### Step 4: Understand User Requirements

Ask clarifying questions:
- Presentation topic and purpose
- Target audience
- Number of sections/topics
- Content requirements (images, data, quotes)
- Desired presentation length

### Step 5: Create Content Outline and Template Mapping

Based on the template inventory and user requirements:

1. **Match content to available layouts**
2. **Select appropriate template slides** for each content section
3. **Create template mapping** (comma-separated indices)

Example:
```python
# Using custom template with 25 slides (indices 0-24)
template_mapping = [
    0,  # Cover slide
    1,  # Agenda
    2,  # Section 1 divider
    3,  # Section 1 content
    4,  # Section 1 details
    2,  # Section 2 divider (reuse slide 2)
    3,  # Section 2 content
]
```

**Critical Rules**:
- Verify all indices are within template range (0 to N-1)
- Match layout structure to actual content needs
- Reuse slides by repeating indices in the mapping
- Don't force content into incompatible layouts

### Step 6: Rearrange Template Slides

Create a working presentation with slides in the desired order:

```bash
SKILL_PATH=~/.agent/skills/presentation-skill

python $SKILL_PATH/scripts/cli.py rearrange user-template.pptx working.pptx 0,1,2,3,4,2,3
```

This creates `working.pptx` in your current directory with your selected slides arranged properly.

### Step 7: Extract Text Inventory

Extract all text shapes and their properties from the working presentation:

```bash
SKILL_PATH=~/.agent/skills/presentation-skill

python $SKILL_PATH/scripts/cli.py inventory working.pptx text-inventory.json
```

**IMPORTANT**: Read the entire `text-inventory.json` file (saved in your current directory) to understand:
- Available shapes on each slide
- Placeholder types and properties
- Text formatting (fonts, sizes, colors)
- Shape positions and dimensions

### Step 8: Generate Replacement Text

Create `replacement-text.json` based on the inventory and your content:

**Critical Rules**:
1. Only reference shapes that exist in the inventory
2. Include proper formatting properties (bold, alignment, etc.)
3. Use `"bullet": true, "level": 0` for bullet points (no bullet symbols in text)
4. Shapes not listed in replacement JSON will be **preserved** (original content kept)
5. Match text length to shape size to avoid overflow

See Workflow A Step 6 for detailed replacement JSON format and examples.

### Step 9: Apply Replacements

Apply your replacement text:

```bash
SKILL_PATH=~/.agent/skills/presentation-skill

# With automatic cleanup (recommended)
python $SKILL_PATH/scripts/cli.py replace working.pptx replacement-text.json final-presentation.pptx --cleanup

# Or without cleanup
python $SKILL_PATH/scripts/cli.py replace working.pptx replacement-text.json final-presentation.pptx
```

The `--cleanup` flag automatically removes temporary files (working.pptx, text-inventory.json, replacement-text.json) after successful generation.

Validation will check:
- All referenced shapes exist
- Text doesn't overflow shape boundaries

### Step 10: Review and Iterate

If validation errors occur:
- **Shape not found**: Update JSON to use only available shapes
- **Text overflow**: Shorten text or use different layout
- **Formatting issues**: Check paragraph properties match template style

---

## Best Practices

### Content Creation

1. **Be concise**: Less is more in presentations
2. **Use bullet points**: Not full paragraphs
3. **One idea per slide**: Don't overcrowd
4. **Consistent voice**: Maintain tone throughout
5. **Visual hierarchy**: Use bold for emphasis, bullets for lists

### Layout Selection

1. **Start simple**: Use basic text layouts first
2. **Section dividers**: Use between major topics
3. **Visual variety**: Mix single and multi-column layouts
4. **Image placeholders**: Only use when you have images
5. **White space**: Don't fill every shape on every slide

### Template Mapping

1. **Verify indices**: Template has slides 0-47, ensure mapping is within range
2. **Reuse layouts**: It's okay to use the same template slide multiple times
3. **Logical flow**: Title → Contents → Sections → Content → Conclusion
4. **Count carefully**: Double-check your comma-separated list matches your outline

## Common Errors and Solutions

### Error: "Slide index out of range"
**Cause**: Referenced a slide index ≥ 48
**Fix**: Use only indices 0-47

### Error: "Shape not found"
**Cause**: Replacement JSON references non-existent shape
**Fix**: Read text-inventory.json and use only available shapes

### Error: "Text overflow"
**Cause**: Replacement text is too long for the shape
**Fix**: Shorten text or choose a layout with larger text areas

### Slides appear blank
**Cause**: Forgot to create replacement text for that slide
**Fix**: Add entries in replacement JSON for all slides in working.pptx

## Example Workflow

**IMPORTANT**: Always run commands from your project directory, NOT from the skill folder. All generated files will be saved in your current working directory.

```bash
# Work in your project directory (NOT in .agent/skills/presentation-skill)
cd /path/to/your/project

# 1. Rearrange template slides (using skill's template)
python ~/.agent/skills/presentation-skill/scripts/cli.py rearrange \
  ~/.agent/skills/presentation-skill/resources/template.pptx \
  working.pptx 2,3,7,12,13,7,12

# 2. Extract inventory
python ~/.agent/skills/presentation-skill/scripts/cli.py inventory \
  working.pptx text-inventory.json

# 3. Create replacement-text.json (manually in editor based on inventory)

# 4. Apply replacements and cleanup
python ~/.agent/skills/presentation-skill/scripts/cli.py replace \
  working.pptx replacement-text.json final-presentation.pptx --cleanup

# All output files are now in your current directory:
# - final-presentation.pptx
```

## Cleaning Up Temporary Files

After successfully creating your final presentation, clean up the temporary files:

### Option 1: Use the --cleanup Flag (Integrated)

The recommended way to clean up is to use the `--cleanup` flag with `replace.py` in your final step:

```bash
SKILL_PATH=~/.agent/skills/presentation-skill

python $SKILL_PATH/scripts/cli.py replace \
  working.pptx replacement-text.json final-presentation.pptx --cleanup
```

This automatically removes `working.pptx`, `replacement-text.json`, and `text-inventory.json` upon successful completion.

### Option 2: Use the Cleanup Script

Alternatively, you can use the dedicated cleanup script:

```bash
SKILL_PATH=~/.agent/skills/presentation-skill

# Interactive mode - asks before deleting
python $SKILL_PATH/scripts/cli.py cleanup

# Automatic mode - deletes without asking
python $SKILL_PATH/scripts/cli.py cleanup --yes
```

### Option 2: Manual Cleanup

```bash
# Remove temporary working files
rm working.pptx text-inventory.json replacement-text.json

# Optional: Remove extracted template content if no longer needed
rm template-content.md
rm -rf template-thumbnails/
```

**What to keep:**
- Your final presentation file (e.g., `final-presentation.pptx`)
- Your outline file (e.g., `outline.md`) - for reference
- Any custom template files you uploaded

**What to remove:**
- `working.pptx` - temporary rearranged template
- `text-inventory.json` - temporary inventory file
- `replacement-text.json` - can be removed after successful replacement
- `template-content.md` - extracted template text (can be regenerated)
- `template-thumbnails/` - thumbnail images (can be regenerated)

## Tips for Success

- **Read the inventory thoroughly**: Understanding available shapes is critical
- **Preserve formatting**: Copy bold, alignment, and font properties from template
- **Test incrementally**: Start with 2-3 slides, verify, then add more
- **Keep backups**: Save working.pptx and intermediate versions
- **Use descriptive names**: Name your output files clearly (e.g., `sales-pitch-v1.pptx`)

## Reference Files

Located in `~/.agent/skills/presentation-skill/`:
- Template: `resources/template.pptx` (48 slides)
- Template guide: `resources/TEMPLATE_GUIDE.md`
- Scripts: `scripts/cli.py` (includes rearrange, inventory, replace, thumbnail, analyze, cleanup), `scripts/utils.py`
- Examples: `examples/custom-template-workflow.md`

Generated in your working directory:
- Template content: `template-content.md` (when you extract template)
- Template thumbnails: `template-thumbnails/` (if LibreOffice available)
- Working files: `working.pptx`, `text-inventory.json`, `replacement-text.json`
- Final output: Your custom-named presentation file
