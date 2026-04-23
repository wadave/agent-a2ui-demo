# Presentation Skill

Create professional presentations using templates - either the default Google corporate template or your own custom template.

## Overview

This skill supports two workflows:
- **Workflow A**: Using the default Google template (48 professionally designed slides)
- **Workflow B**: Using a custom user-uploaded template

Choose the workflow that matches your needs.

---

## Files in This Skill

### Core Files
- **SKILL.md** - Complete skill documentation (both workflows)
- **README.md** - This file (quick start guide)

### Scripts
- **scripts/cli.py** - Unified CLI tool with subcommands:
  - `analyze` - Analyze template files and show basic info
  - `rearrange` - Rearrange and duplicate template slides
  - `inventory` - Extract text shapes and properties
  - `replace` - Replace placeholder text with content
  - `thumbnail` - Generate visual thumbnail grids
  - `cleanup` - Clean up temporary working files
- **scripts/utils.py** - Shared utility functions and data structures

### Resources
- **resources/template.pptx** - The default Google corporate template (48 slides)
- **resources/TEMPLATE_GUIDE.md** - Detailed layout reference for default template
- **resources/template-content.md** - Extracted default template text (auto-generated)

### Examples
- **examples/example-outline.md** - Sample presentation outline (using default template)
- **examples/example-replacement.json** - Sample replacement JSON
- **examples/custom-template-workflow.md** - Complete example using custom template

## Key Concepts

### Template Mapping
Choose which template slides to use for your presentation:
```python
template_mapping = [1, 2, 6, 11, 12]  # Cover, Agenda, Divider, Text, Text
```

### Rearranging
Create a working copy with slides in desired order:
```bash
python scripts/cli.py rearrange template.pptx working.pptx 1,2,6,11,12
```

### Text Inventory
Extract all text shapes and their properties:
```bash
python scripts/cli.py inventory working.pptx text-inventory.json
```

### Text Replacement
Replace placeholder text with your content:
```bash
python scripts/cli.py replace working.pptx replacement-text.json output.pptx
```

## Common Layouts

| Template Slide | Type | Best For |
|----------------|------|----------|
| 1 | Cover | Every presentation opening |
| 2-3 | Contents | Table of contents, agenda |
| 4-5 | Agenda | Timeline-based schedules |
| 6-10 | Section Dividers | Major topic breaks |
| 11 | Single Column | Unified narrative, single concept |
| 12 | Double Column | Two related concepts, comparisons |
| 13-47 | Mixed | Specialized layouts |

## Dependencies

Required Python packages:
- **python-pptx**: PowerPoint file manipulation
- **markitdown**: Text extraction (`pip install "markitdown[pptx]"`)
- **defusedxml**: XML parsing (`pip install defusedxml`)
- **Pillow**: Text overflow calculation (`pip install Pillow`)

Optional (for thumbnail generation):
- **LibreOffice**: `sudo apt-get install libreoffice`
- **Poppler**: `sudo apt-get install poppler-utils`

## Getting Help

1. Read `SKILL.md` for detailed workflow
2. Review `resources/TEMPLATE_GUIDE.md` for layout details
3. Check `examples/` for working samples
4. Examine the scripts in `scripts/` directory for tool usage

## Tips

- **Start small**: Test with 2-3 slides first
- **Read inventory carefully**: Only use shapes that exist
- **Preserve formatting**: Copy paragraph properties from inventory
- **Keep it simple**: Basic layouts often work best
- **Validate early**: Check for errors after each step

## Example Usage

See `examples/example-outline.md` and `examples/example-replacement.json` for a complete working example that creates a 7-slide product roadmap presentation.
