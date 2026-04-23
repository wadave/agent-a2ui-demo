# Example Presentation Outline

## Topic: Introducing Our Q1 2026 Product Roadmap

### Target Audience
Engineering and product teams

### Presentation Length
7 slides

### Content Structure

#### Slide 1: Cover
- Title: "Q1 2026 Product Roadmap"
- Subtitle: "Engineering & Product Teams"
- Date: "January 2026"

#### Slide 2: Agenda
- Overview
- New Features
- Technical Improvements
- Timeline
- Next Steps

#### Slide 3: Section Divider - New Features
- Section number: 01
- Title: "New Features"
- Subhead: "Customer-Driven Innovation"

#### Slide 4: Feature Overview (Single Column)
- Header: "What We're Building"
- Body: Brief intro to new features and why they matter

#### Slide 5: Feature Details (Double Column)
- Column 1: "Mobile App Redesign"
  - Key improvements
  - Expected impact
- Column 2: "Advanced Analytics Dashboard"
  - Key improvements
  - Expected impact

#### Slide 6: Section Divider - Timeline
- Section number: 02
- Title: "Delivery Timeline"
- Subhead: "Rolling out through Q1"

#### Slide 7: Next Steps (Single Column)
- Header: "Next Steps"
- Bullet list of action items

## Template Mapping

```python
# Template slides to use (0-based indexing)
# Template has 48 slides (indices 0-47)
template_mapping = [
    1,  # Slide 1: Cover slide (template slide 1)
    2,  # Slide 2: Contents/Agenda (template slide 2)
    6,  # Slide 3: Section divider (template slide 6)
    11,  # Slide 4: Single column text (template slide 11)
    12,  # Slide 5: Double column text (template slide 12)
    6,  # Slide 6: Section divider (template slide 6)
    11,  # Slide 7: Single column text (template slide 11)
]
```

## Rearrange Command

**Work in your project directory, NOT in the skill folder:**

```bash
# Navigate to your project directory
cd /path/to/your/project

# Set skill path
SKILL_PATH=~/.agent/skills/presentation-skill

# Rearrange template slides
python $SKILL_PATH/scripts/cli.py rearrange \
  $SKILL_PATH/resources/template.pptx \
  working.pptx 1,2,6,11,12,6,11
```

## Next Steps

After rearranging:
1. Extract inventory: `python $SKILL_PATH/scripts/cli.py inventory working.pptx text-inventory.json`
2. Review the inventory to see available shapes
3. Create `replacement-text.json` based on inventory (see `example-replacement.json`)
4. Apply replacements: `python $SKILL_PATH/scripts/cli.py replace working.pptx replacement-text.json Q1-2026-Roadmap.pptx --cleanup`

The `--cleanup` flag automatically removes temporary files after successful generation.
