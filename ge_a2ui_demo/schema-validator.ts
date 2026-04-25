
export class SchemaValidator {
  /**
   * Minimal structural validation against the core A2UI requirements.
   * Full JSON schema validation is better done via AJV, but for the demo,
   * we ensure the basic structure holds.
   */
  static validateSurfaceUpdate(json: any): string | null {
    if (!json) return "JSON is empty or null";
    if (typeof json !== 'object') return "Root must be an object";
    if (!json.surfaceId || typeof json.surfaceId !== 'string') {
      return "Missing or invalid 'surfaceId' string";
    }
    if (!json.components || !Array.isArray(json.components)) {
      return "Missing or invalid 'components' array";
    }

    // Check components
    for (const comp of json.components) {
      if (!comp.id || typeof comp.id !== 'string') {
        return "A component is missing an 'id' string";
      }
      if (!comp.component || typeof comp.component !== 'object') {
        return `Component ${comp.id} is missing a 'component' object`;
      }
    }
    return null;
  }

  static validateDataModelUpdate(json: any): string | null {
    if (!json) return "JSON is empty or null";
    if (typeof json !== 'object') return "Root must be an object";
    if (!json.surfaceId || typeof json.surfaceId !== 'string') {
      return "Missing or invalid 'surfaceId' string";
    }
    if (!json.contents || !Array.isArray(json.contents)) {
      return "Missing or invalid 'contents' array";
    }
    return null;
  }

  static validateBeginRendering(json: any): string|null {
    if (!json) return 'JSON is empty or null';
    if (typeof json !== 'object') return 'Root must be an object';
    if (!json.surfaceId || typeof json.surfaceId !== 'string') {
      return 'Missing or invalid \'surfaceId\' string';
    }
    if (!json.root || typeof json.root !== 'string') {
      return 'Missing or invalid \'root\' string';
    }
    return null;
  }
}
