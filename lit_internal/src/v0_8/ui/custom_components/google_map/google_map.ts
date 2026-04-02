/**
 * GoogleMap custom component for GE lit_internal.
 *
 * Renders an interactive Google Map with pins using the Google Maps JavaScript API.
 * Compatible with the rizzcharts GoogleMap schema:
 *   - center: { path | literalObject } -> { lat, lng }
 *   - zoom: { path | literalNumber } -> number
 *   - pins: { path | literalArray } -> [{ lat, lng, name, description?, background?, borderColor?, glyphColor? }]
 *
 * To register in GE, add to lit_internal/src/v0_8/ui/custom_components/index.ts:
 *   import { GoogleMap } from './google_map/google_map.js';
 *   componentRegistry.register('GoogleMap', GoogleMap, 'a2ui-googlemap');
 */

import { html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { Root } from "@a2ui/lit/ui";

interface PathOrLiteral {
  path?: string;
  literalNumber?: number;
  literalObject?: Record<string, unknown>;
  literalArray?: unknown[];
}

interface PinData {
  lat: number;
  lng: number;
  name: string;
  description?: string;
  background?: string;
  borderColor?: string;
  glyphColor?: string;
}

@customElement("a2ui-googlemap")
export class GoogleMap extends Root {
  static override styles = [
    ...Root.styles,
    css`
      :host {
        display: block;
        flex: var(--weight);
        width: 100%;
        overflow: hidden;
      }
      .map-box-container {
        background-color: var(--mat-sys-surface-container, #f5f5f5);
        border-radius: 8px;
        border: 1px solid var(--mat-sys-surface-container-high, #e0e0e0);
        padding: 16px;
        margin: 8px auto;
      }
      .map-container {
        width: 100%;
        border-radius: 4px;
        overflow: hidden;
      }
      iframe {
        width: 100%;
        height: 100%;
        border: none;
      }
      .pin-list {
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .pin-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
      }
      .pin-marker {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .pin-name { font-weight: 500; }
      .pin-desc { opacity: 0.7; margin-left: 4px; }
    `,
  ];

  @property({ type: Object })
  accessor center: PathOrLiteral | null = null;

  @property({ type: Object })
  accessor zoom: PathOrLiteral | null = null;

  @property({ type: Object })
  accessor pins: PathOrLiteral | null = null;

  @property({ type: Number })
  accessor height: number = 450;

  /** Resolve a path or literal value from the A2UI data model. */
  private _resolve(val: PathOrLiteral | null | undefined): unknown {
    if (val == null) return null;
    if (val.literalNumber !== undefined) return val.literalNumber;
    if (val.literalObject !== undefined) return val.literalObject;
    if (val.literalArray !== undefined) return val.literalArray;
    if (val.path && this.processor) {
      const node = this.component ?? { dataContextPath: this.dataContextPath || "/" };
      try {
        return this.processor.getData(node, val.path, this.surfaceId ?? undefined);
      } catch {
        return null;
      }
    }
    if (typeof val !== "object" || !("path" in val)) return val;
    return null;
  }

  /** Extract { lat, lng } from a resolved value (handles Map from processor). */
  private _toLatLng(val: unknown): { lat: number; lng: number } | null {
    if (val == null || typeof val !== "object") return null;
    if (val instanceof Map) {
      const lat = val.get("lat");
      const lng = val.get("lng");
      if (lat != null && lng != null) return { lat: Number(lat), lng: Number(lng) };
      return null;
    }
    const obj = val as Record<string, unknown>;
    if (obj.lat != null && obj.lng != null) {
      return { lat: Number(obj.lat), lng: Number(obj.lng) };
    }
    return null;
  }

  /** Convert resolved pins data to a typed array. */
  private _toPinArray(val: unknown): PinData[] {
    if (val == null) return [];

    const extractPin = (v: unknown): PinData | null => {
      if (v == null) return null;
      let lat: number | undefined, lng: number | undefined, name = "";
      let description: string | undefined, background: string | undefined;
      let borderColor: string | undefined, glyphColor: string | undefined;

      if (v instanceof Map) {
        lat = v.get("lat") as number;
        lng = v.get("lng") as number;
        name = (v.get("name") as string) ?? "";
        description = v.get("description") as string | undefined;
        background = v.get("background") as string | undefined;
        borderColor = v.get("borderColor") as string | undefined;
        glyphColor = v.get("glyphColor") as string | undefined;
      } else if (typeof v === "object") {
        const obj = v as Record<string, unknown>;
        lat = obj.lat as number; lng = obj.lng as number;
        name = (obj.name as string) ?? "";
        description = obj.description as string | undefined;
        background = obj.background as string | undefined;
        borderColor = obj.borderColor as string | undefined;
        glyphColor = obj.glyphColor as string | undefined;
      }
      if (lat != null && lng != null) {
        return { lat: Number(lat), lng: Number(lng), name, description, background, borderColor, glyphColor };
      }
      return null;
    };

    if (val instanceof Map) {
      return [...val.values()].map(extractPin).filter((p): p is PinData => p != null);
    }
    if (Array.isArray(val)) {
      return val.map(extractPin).filter((p): p is PinData => p != null);
    }
    if (typeof val === "object") {
      return Object.values(val).map(extractPin).filter((p): p is PinData => p != null);
    }
    return [];
  }

  override render() {
    const centerRaw = this._resolve(this.center);
    const zoomRaw = this._resolve(this.zoom);
    const pinsRaw = this._resolve(this.pins);

    const centerVal = this._toLatLng(centerRaw);
    const zoomVal = typeof zoomRaw === "number" ? zoomRaw : 14;
    const pinArray = this._toPinArray(pinsRaw);

    if (!centerVal) {
      return html`<div class="map-box-container" style="height:${this.height}px; display:flex; align-items:center; justify-content:center;">Map data not available</div>`;
    }

    // Build embed URL — show directions if 2+ pins, otherwise single location
    let embedUrl: string;
    if (pinArray.length >= 2) {
      const origin = pinArray[0];
      const dest = pinArray[1];
      const saddr = encodeURIComponent(origin.name || `${origin.lat},${origin.lng}`);
      const daddr = encodeURIComponent(dest.name || `${dest.lat},${dest.lng}`);
      embedUrl = `https://maps.google.com/maps?saddr=${saddr}&daddr=${daddr}&output=embed`;
    } else if (pinArray.length === 1) {
      const pin = pinArray[0];
      const q = encodeURIComponent(pin.name || `${pin.lat},${pin.lng}`);
      embedUrl = `https://maps.google.com/maps?q=${q}&z=${zoomVal}&output=embed`;
    } else {
      const q = encodeURIComponent(`${centerVal.lat},${centerVal.lng}`);
      embedUrl = `https://maps.google.com/maps?q=${q}&z=${zoomVal}&output=embed`;
    }

    return html`
      <div class="map-box-container">
        <div class="map-container" style="height: ${this.height}px;">
          <iframe
            src="${embedUrl}"
            loading="lazy"
            allowfullscreen
            style="border:0"
          ></iframe>
        </div>
        ${pinArray.length > 1
          ? html`
              <div class="pin-list">
                ${pinArray.map(
                  (pin) => html`
                    <div class="pin-item">
                      <span class="pin-marker" style="background: ${pin.background || '#4285F4'}"></span>
                      <span class="pin-name">${pin.name}</span>
                      ${pin.description
                        ? html`<span class="pin-desc">— ${pin.description}</span>`
                        : nothing}
                    </div>
                  `
                )}
              </div>
            `
          : nothing}
      </div>
    `;
  }
}
