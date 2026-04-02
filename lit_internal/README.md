# Custom Components for GE lit_internal

## GoogleMap Component

### Registration

Add to GE's `lit_internal/src/v0_8/ui/custom_components/index.ts`:

```typescript
import { GoogleMap } from './google_map/google_map.js';
import { componentRegistry } from '../component-registry.js';

componentRegistry.register('GoogleMap', GoogleMap, 'a2ui-googlemap');
```

### Component Schema

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `center` | `{ path } \| { literalObject: { lat, lng } }` | Yes | Map center coordinates |
| `zoom` | `{ path } \| { literalNumber }` | Yes | Zoom level (1-20) |
| `pins` | `{ path } \| { literalArray }` | No | Array of pin markers |

### Pin object properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `lat` | `number` | Yes | Latitude |
| `lng` | `number` | Yes | Longitude |
| `name` | `string` | Yes | Pin label |
| `description` | `string` | No | Pin description |
| `background` | `string` | No | Pin background color (hex) |
| `borderColor` | `string` | No | Pin border color (hex) |
| `glyphColor` | `string` | No | Pin glyph color (hex) |

## WebFrameUrl Component

`WebFrameUrl` is **built-in to GE** and does not need registration. It is used by the agent to embed Google Maps via the Maps Embed API. The custom frontend also registers a `WebFrameUrl` component for parity.

Maps embed URLs use the format:
- **Place**: `https://www.google.com/maps/embed/v1/place?key=API_KEY&q=...`
- **Directions**: `https://www.google.com/maps/embed/v1/directions?key=API_KEY&origin=...&destination=...`

## Catalog Definition

Both components are defined in `app/catalog_schemas/0.8/restaurant_finder_catalog_definition.json`.
