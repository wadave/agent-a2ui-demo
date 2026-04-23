# Template Layout Guide

This guide provides an overview of the 48 slides in `template.pptx` to help you select appropriate layouts for your presentation.

## Slide Index Reference

**IMPORTANT**: Slides are 0-indexed (first slide = 0, last slide = 47)

## Slide Catalog

### Administrative (Do Not Use in Final Presentation)
- **Slide 0**: Instructions slide - "DO NOT PRESENT THIS SLIDE"

### Title & Opening Slides
- **Slide 1**: Cover slide - Two or three lined headline, date field
- **Slide 2**: Contents page - Numbered list (01-08)
- **Slide 3**: Alternative contents - Shorter format
- **Slide 4**: Agenda with timeline - 6 time-based events
- **Slide 5**: Alternative agenda - Detailed timeline layout

### Section Dividers
- **Slide 6**: Section title with number (01) and optional subhead
- **Slides 7-10**: Break slides with numbered sections (01) and 6 subheadings (variations A-F)

### Content Layouts - Text

#### Single Column
- **Slide 11**: Single column text - Full-width paragraph layout
  - Use for: Long-form narrative, detailed explanations
  - Best for: Unified message, single concept

#### Double Column
- **Slide 12**: Double column text - Two equal columns with subheads
  - Use for: Comparing two concepts, side-by-side information
  - Best for: Pros/cons, before/after, two case studies

### Content Layouts - Mixed

Based on the template content extraction, slides 13-47 contain various layouts including:
- Image + text combinations
- Multi-column layouts (3+ columns)
- Quote layouts
- Statistics/data displays
- Timeline layouts
- Icon + text combinations
- Gallery layouts
- Call-out boxes
- Full-bleed image slides

**To identify specific layouts**, use one of these methods:
1. Extract template content: `python -m markitdown resources/template.pptx > resources/template-content.md`
2. Generate thumbnails: `python ../scripts/cli.py thumbnail resources/template.pptx template-thumbnails`
3. Analyze template: `python ../scripts/cli.py analyze resources/template.pptx`

## Layout Selection Decision Tree

### Start Here
1. **What type of slide do you need?**
   - Opening → Slides 1-2
   - Table of contents → Slides 2-3
   - Agenda/Timeline → Slides 4-5
   - Section divider → Slides 6-10
   - Content → Slides 11-47

2. **For content slides, how many distinct items?**
   - 1 unified message → Single column (Slide 11)
   - 2 items/concepts → Double column (Slide 12)
   - 3+ items → Multi-column layouts (Slides 13+)
   - Timeline/sequence → Agenda layouts (Slides 4-5)

3. **Do you have visual elements?**
   - No, text only → Slides 11-12
   - Yes, images → Image layouts (Slides 13+)
   - Yes, data/stats → Data visualization layouts
   - Yes, icons → Icon layouts

4. **What's the purpose?**
   - Inform → Text layouts
   - Persuade → Image + text layouts
   - Inspire → Quote layouts
   - Explain → Diagram/illustration layouts
   - Prove → Data/statistics layouts

## Common Mapping Patterns

### Standard Business Presentation
```bash
# Command to create working.pptx
python scripts/cli.py rearrange resources/template.pptx working.pptx 1,2,6,11,12,6,11

# Breakdown:
# 1 = Cover slide
# 2 = Table of contents
# 6 = Section 1 divider
# 11 = Section 1 intro (single column)
# 12 = Section 1 details (double column)
# 6 = Section 2 divider
# 11 = Section 2 content
```

### Pitch Deck
```bash
# Command to create working.pptx
python scripts/cli.py rearrange resources/template.pptx working.pptx 1,11,11,12

# Breakdown:
# 1 = Cover
# 11 = Problem statement
# 11 = Solution
# 12 = Product features (2 columns)
```

### Training/Educational
```bash
# Command to create working.pptx
python scripts/cli.py rearrange resources/template.pptx working.pptx 1,4,6,11,12,6,11

# Breakdown:
# 1 = Title
# 4 = Agenda/Schedule
# 6 = Module 1 divider
# 11 = Module 1 concept
# 12 = Module 1 examples (2 column)
# 6 = Module 2 divider
# 11 = Module 2 concept
```

## Best Practices

### Do:
✅ Use slide 1 for your cover
✅ Include a contents/agenda slide (2-5) for longer presentations
✅ Use section dividers (6-10) to organize topics
✅ Match layout to actual content count
✅ Reuse the same template slide multiple times
✅ Keep text concise to fit within shape boundaries

### Don't:
❌ Use slide 0 in final presentation (instructions only)
❌ Force content into incompatible layouts
❌ Use image layouts without actual images
❌ Reference slide indices ≥ 48 (out of range)
❌ Overcomplicate - simple layouts often work best

## Quick Reference: First 15 Slides

| Slide # | Type | Description | Use When |
|---------|------|-------------|----------|
| 0 | Admin | Instructions | Never (internal only) |
| 1 | Title | Cover slide | Every presentation (opening) |
| 2 | Contents | Numbered TOC (8 items) | 5+ slides in presentation |
| 3 | Contents | Short TOC | 3-7 slides in presentation |
| 4 | Agenda | Timeline (6 events) | Meetings, workshops |
| 5 | Agenda | Detailed timeline | Detailed schedules |
| 6 | Divider | Section title + subhead | Major section breaks |
| 7-10 | Divider | Break slides + subheads | Section breaks with preview |
| 11 | Content | Single column text | Single concept/narrative |
| 12 | Content | Double column text | Two related concepts |
| 13-47 | Mixed | Various layouts | Specific content needs |

## How to Discover Layout Details

Since slides 13-47 contain various specialized layouts, use these methods to identify the right one:

1. **Read extracted content**:
   ```bash
   # Already generated at: resources/template-content.md
   # Look for slide number comments and content structure
   ```

2. **Generate visual thumbnails** (if LibreOffice available):
   ```bash
   python scripts/cli.py thumbnail resources/template.pptx resources/template-thumbnails
   # Creates visual grid showing all 48 slides
   ```

3. **Extract shape inventory for specific slide**:
   ```bash
   # Rearrange to isolate specific slides
   python scripts/cli.py rearrange resources/template.pptx test.pptx 13,14,15
   # Then inventory to see shapes
   python scripts/cli.py inventory test.pptx test-inventory.json
   ```

## Template Customization Tips

- The template uses Google's corporate branding
- Color scheme, fonts, and styling are pre-configured
- Placeholder text guides appropriate content length
- Image shapes indicate expected visual placements
- Number placeholders (01, 02, etc.) suggest section numbering

## Need More Help?

Refer to:
- Main skill documentation: `../SKILL.md`
- Quick start guide: `../README.md`
- Working examples: `../examples/`
- Template content extract: `template-content.md`
- Template thumbnails: `template-thumbnails-*.jpg` (if generated)
