# Example: Custom Template Workflow

This example demonstrates how to use a custom user-uploaded template to create a presentation.

## Scenario

User uploads their company template (`company-template.pptx`) and wants to create a quarterly business review presentation.

## Step 1: Analyze the Template

**IMPORTANT**: Work in your project directory, NOT in the skill folder.

```bash
# Navigate to your project directory (where company-template.pptx is located)
cd /path/to/your/project

# Set skill path for convenience
SKILL_PATH=~/.agent/skills/presentation-skill

# Quick analysis
python $SKILL_PATH/scripts/cli.py analyze company-template.pptx
```

Output might show:
```
============================================================
TEMPLATE ANALYSIS
============================================================
Template: company-template.pptx
Total Slides: 20
Slide Range: 0-19 (0-indexed)
Dimensions: 10.00" × 5.62"
Aspect Ratio: 16:9 (widescreen)
============================================================

SLIDE SUMMARY:
------------------------------------------------------------
Slide 0:
  Shapes: 5 total, 3 with text
  Placeholders: TITLE, SUBTITLE
  Preview: Company Name | Presentation Title

Slide 1:
  Shapes: 8 total, 4 with text
  Placeholders: TITLE, BODY
  Preview: Agenda | Placeholder text...

Slide 2:
  Shapes: 3 total, 2 with text
  Placeholders: TITLE
  Preview: Section Divider

...
```

## Step 2: Extract Detailed Content

```bash
# Extract all text (saved to current directory)
python -m markitdown company-template.pptx > template-analysis.md

# Generate thumbnails (if LibreOffice available)
python $SKILL_PATH/scripts/cli.py thumbnail company-template.pptx company-thumbnails --cols 5
```

## Step 3: Review and Create Template Inventory

After reviewing `template-analysis.md` and thumbnails, create an inventory:

```markdown
# Company Template Inventory
**Total Slides**: 20 (indexed 0-19)

## Slide Breakdown
- Slide 0: Cover slide (company logo, title, subtitle)
- Slide 1: Agenda slide (numbered list layout)
- Slide 2: Section divider (large text, accent color)
- Slide 3: Title + single column text
- Slide 4: Title + two column text
- Slide 5: Title + image on left, text on right
- Slide 6: Title + bullet points
- Slide 7: Title + numbered list
- Slide 8: Full-slide image with overlay text
- Slide 9: Quote slide
- Slide 10: Statistics (3 big numbers)
- Slides 11-19: Various specialized layouts
```

## Step 4: Plan Content Outline

For a Q4 2025 Business Review:

```markdown
# Q4 2025 Business Review
## Presentation Structure

1. Cover - Q4 Business Review title
2. Agenda - 5 sections
3. Section 1: Executive Summary
   - Divider slide
   - Summary content (single column)
4. Section 2: Financial Performance
   - Divider slide
   - Key metrics (statistics layout)
   - Details (two column)
5. Section 3: Product Updates
   - Divider slide
   - Updates (bullet points)
6. Section 4: Customer Wins
   - Divider slide
   - Customer quote
7. Closing
   - Next steps (bullet points)
```

## Step 5: Create Template Mapping

Based on inventory and outline:

```python
# Template mapping for 12-slide presentation
# Company template has 20 slides (indices 0-19)
template_mapping = [
    0,  # Cover slide
    1,  # Agenda
    2,  # Section 1 divider
    3,  # Executive summary (single column)
    2,  # Section 2 divider (reuse)
    10,  # Financial metrics (statistics)
    4,  # Financial details (two column)
    2,  # Section 3 divider (reuse)
    6,  # Product updates (bullets)
    2,  # Section 4 divider (reuse)
    9,  # Customer quote
    6,  # Next steps (bullets)
]
```

## Step 6: Rearrange Slides

```bash
python $SKILL_PATH/scripts/cli.py rearrange company-template.pptx working.pptx 0,1,2,3,2,10,4,2,6,2,9,6
```

## Step 7: Extract Text Inventory

```bash
python $SKILL_PATH/scripts/cli.py inventory working.pptx text-inventory.json
```

Read the entire `text-inventory.json` to see available shapes.

## Step 8: Create Replacement Text

Create `replacement-text.json`:

```json
{
  "slide-0": {
    "shape-0": {
      "paragraphs": [
        {
          "text": "Company Name",
          "alignment": "CENTER",
          "bold": true
        }
      ]
    },
    "shape-1": {
      "paragraphs": [
        {
          "text": "Q4 2025 Business Review",
          "alignment": "CENTER",
          "font_size": 44.0
        }
      ]
    },
    "shape-2": {
      "paragraphs": [
        {
          "text": "Presented by [Your Name]",
          "alignment": "CENTER"
        }
      ]
    }
  },
  "slide-1": {
    "shape-0": {
      "paragraphs": [
        {
          "text": "Agenda",
          "bold": true
        }
      ]
    },
    "shape-1": {
      "paragraphs": [
        {
          "text": "Executive Summary",
          "bullet": true,
          "level": 0
        },
        {
          "text": "Financial Performance",
          "bullet": true,
          "level": 0
        },
        {
          "text": "Product Updates",
          "bullet": true,
          "level": 0
        },
        {
          "text": "Customer Wins",
          "bullet": true,
          "level": 0
        },
        {
          "text": "Next Steps",
          "bullet": true,
          "level": 0
        }
      ]
    }
  }
  // ... continue for remaining slides
}
```

## Step 9: Apply Replacements

```bash
# Apply replacements with automatic cleanup
python $SKILL_PATH/scripts/cli.py replace working.pptx replacement-text.json Q4-2025-Business-Review.pptx --cleanup
```

The `--cleanup` flag automatically removes temporary files after successful generation.

**Final output in your current working directory:**
- `Q4-2025-Business-Review.pptx` - final presentation
- `company-template.pptx` - original template (kept)

**Temporary files removed by --cleanup:**
- `working.pptx` - rearranged template (removed)
- `text-inventory.json` - extracted text shapes (removed)
- `replacement-text.json` - replacement data (removed)

## Step 10: Validate and Iterate

If errors occur:
- **Shape not found**: Check text-inventory.json for available shapes
- **Text overflow**: Shorten text or choose different layout
- **Index out of range**: Verify template has 20 slides (0-19)

## Step 11: Optional Additional Cleanup

If you didn't use the `--cleanup` flag in Step 9, or if you want to remove additional analysis files:

### Remove Analysis Files (Optional)

```bash
# Remove template analysis files if no longer needed
rm template-analysis.md
rm -rf company-thumbnails/

# Or use the cleanup script for everything
python $SKILL_PATH/scripts/cli.py cleanup --yes
```

**Note:** If you used `--cleanup` in Step 9, the core temporary files (working.pptx, text-inventory.json, replacement-text.json) are already removed.

**Files to keep:**
- `Q4-2025-Business-Review.pptx` - Your final presentation
- `company-template.pptx` - The template (for future use)
- Any outline or planning documents you created

**Additional files you may want to clean:**
- `template-analysis.md` - Template content (can be regenerated)
- `company-thumbnails/` - Thumbnail images (can be regenerated)

## Tips for Custom Templates

1. **Always analyze first**: Don't assume slide layouts from visual inspection alone
2. **Use thumbnails**: Visual reference is crucial for understanding layouts
3. **Count slides carefully**: Remember 0-indexing (20 slides = indices 0-19)
4. **Preserve branding**: Copy formatting properties from inventory (colors, fonts)
5. **Test incrementally**: Start with 2-3 slides, verify, then continue
6. **Reuse slides freely**: Duplicate section dividers and common layouts

## Common Pitfalls

❌ **Wrong**: Assuming first slide is slide 1
✅ **Correct**: First slide is slide 0

❌ **Wrong**: Using index 20 for 20-slide template
✅ **Correct**: Last slide is index 19 (total slides - 1)

❌ **Wrong**: Forcing 3 items into 2-column layout
✅ **Correct**: Use layout that matches content count

❌ **Wrong**: Ignoring template's visual style
✅ **Correct**: Preserve fonts, colors, and formatting from inventory
