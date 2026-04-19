# Custom Components for GE lit_internal

## GoogleMap Component

### Registration

Add to GE's `lit_internal/src/v0_9/ui/custom_components/index.ts`:

```typescript
import { GoogleMap } from './google_map/google_map.js';
import { componentRegistry } from '../component-registry.js';

componentRegistry.register('GoogleMap', GoogleMap, 'a2ui-googlemap');
```

### Component Schema (A2UI v0.9)

In v0.9, bound values are direct literals (string, number, object, array) or
`{ path }` DataBindings. The legacy `literalString` / `literalNumber` /
`literalObject` / `literalArray` wrappers are no longer used.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `center` | `{ lat, lng }` \| `{ path }` | Yes | Map center coordinates |
| `zoom`   | `number` \| `{ path }` | Yes | Zoom level (1-20) |
| `pins`   | `Pin[]` \| `{ path }` | No | Array of pin markers |

Example:

```json
{
  "id": "map",
  "component": "GoogleMap",
  "center": { "lat": 33.97, "lng": -118.42 },
  "zoom": 14,
  "pins": { "path": "/restaurants" }
}
```

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

`WebFrameUrl` is **built-in to GE** and does not need registration. It is used
by the agent to embed Google Maps via the Maps Embed API. The custom frontend
also registers a `WebFrameUrl` component for parity.

In v0.9 the `url` property is a `DynamicString` — a plain string literal or a
`{ path }` DataBinding.

Maps embed URLs use the format:
- **Place**: `https://www.google.com/maps/embed/v1/place?key=API_KEY&q=...`
- **Directions**: `https://www.google.com/maps/embed/v1/directions?key=API_KEY&origin=...&destination=...`

## Catalog Definition

Both components are defined in
`app/catalog_schemas/0.9/restaurant_finder_catalog_definition.json`.
