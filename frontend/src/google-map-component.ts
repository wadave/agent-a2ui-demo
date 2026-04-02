/**
 * Custom A2UI GoogleMap component for embedding Google Maps.
 * Supports the GE pattern: center (lat/lng), zoom, and pins.
 */

import { html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { Root } from "@a2ui/lit/ui";

export class WebFrameUrl extends Root {
  static override styles = [
    ...Root.styles,
    css`
      :host { display: block; width: 100%; overflow: hidden; }
      .frame-container { position: relative; width: 100%; border-radius: 8px; overflow: hidden; }
      iframe { width: 100%; height: 100%; border: none; }
    `,
  ];

  @property({ type: Object })
  accessor url: unknown = null;

  override render() {
    let resolvedUrl: string | null = null;
    if (this.url && typeof this.url === "object") {
      const urlObj = this.url as Record<string, unknown>;
      resolvedUrl = (urlObj.literalString as string) ?? null;
      if (!resolvedUrl && urlObj.path && this.processor) {
        const node = this.component ?? { dataContextPath: this.dataContextPath || "/" };
        try {
          resolvedUrl = this.processor.getData(node, urlObj.path as string, this.surfaceId ?? undefined) as string;
        } catch { resolvedUrl = null; }
      }
    } else if (typeof this.url === "string") {
      resolvedUrl = this.url;
    }
    if (!resolvedUrl) return nothing;
    return html`<div class="frame-container" style="height:400px"><iframe src="${resolvedUrl}" loading="lazy" allowfullscreen style="border:0"></iframe></div>`;
  }
}

@customElement("a2ui-googlemap")
export class GoogleMap extends Root {
  static override styles = [
    ...Root.styles,
    css`
      :host {
        display: block;
        width: 100%;
        overflow: hidden;
      }
      .map-container {
        position: relative;
        width: 100%;
        border-radius: 8px;
        overflow: hidden;
        background: #e8eaed;
      }
      iframe {
        width: 100%;
        height: 100%;
        border: none;
      }
    `,
  ];

  @property({ type: Object })
  accessor center: unknown = null;

  @property({ type: Object })
  accessor zoom: unknown = null;

  @property({ type: Object })
  accessor pins: unknown = null;

  // Legacy
  @property({ type: String })
  accessor url: string = "";

  @property({ type: Number })
  accessor height: number = 400;

  private _resolveProp(val: unknown): unknown {
    if (val == null) return null;
    // Direct value (number, string, etc)
    if (typeof val !== "object") return val;

    const obj = val as Record<string, unknown>;

    // Literal values
    if ("literalNumber" in obj) return obj.literalNumber;
    if ("literalObject" in obj) return obj.literalObject;
    if ("literalArray" in obj) return obj.literalArray;
    if ("literalString" in obj) return obj.literalString;

    // Path reference — resolve from data model
    if ("path" in obj && typeof obj.path === "string" && this.processor) {
      const node = this.component ?? {
        dataContextPath: this.dataContextPath || "/",
      };
      try {
        const result = this.processor.getData(
          node,
          obj.path,
          this.surfaceId ?? undefined
        );
        console.log(`[GoogleMap] resolve ${obj.path} =>`, result);
        return result;
      } catch (e) {
        console.warn("[GoogleMap] getData failed:", obj.path, e);
        return null;
      }
    }

    // Already a resolved object (e.g. {lat, lng})
    if ("lat" in obj && "lng" in obj) return obj;

    return obj;
  }

  private _toLatLng(val: unknown): { lat: number; lng: number } | null {
    if (val == null || typeof val !== "object") return null;

    // Could be a Map (from the processor)
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

  private _toPinArray(
    val: unknown
  ): Array<{ lat: number; lng: number; name: string }> {
    if (val == null) return [];

    // Map from processor
    if (val instanceof Map) {
      const result: Array<{ lat: number; lng: number; name: string }> = [];
      for (const [, v] of val) {
        const pin = this._extractPin(v);
        if (pin) result.push(pin);
      }
      return result;
    }

    // Plain object keyed by index
    if (typeof val === "object" && !Array.isArray(val)) {
      return Object.values(val)
        .map((v) => this._extractPin(v))
        .filter((p): p is { lat: number; lng: number; name: string } => p != null);
    }

    // Array
    if (Array.isArray(val)) {
      return val
        .map((v) => this._extractPin(v))
        .filter((p): p is { lat: number; lng: number; name: string } => p != null);
    }

    return [];
  }

  private _extractPin(
    v: unknown
  ): { lat: number; lng: number; name: string } | null {
    if (v == null) return null;

    let lat: number | undefined;
    let lng: number | undefined;
    let name = "";

    if (v instanceof Map) {
      lat = v.get("lat") as number;
      lng = v.get("lng") as number;
      name = (v.get("name") as string) ?? "";
    } else if (typeof v === "object") {
      const obj = v as Record<string, unknown>;
      lat = obj.lat as number;
      lng = obj.lng as number;
      name = (obj.name as string) ?? "";
    }

    if (lat != null && lng != null) {
      return { lat: Number(lat), lng: Number(lng), name };
    }
    return null;
  }

  override render() {
    // WebFrameUrl mode: url is {literalString: "..."} or {path: "..."}
    if (this.url && typeof this.url === "object") {
      const urlObj = this.url as Record<string, unknown>;
      const resolvedUrl = urlObj.literalString as string
        ?? (urlObj.path ? this._resolveProp(urlObj) as string : null);
      if (resolvedUrl) {
        return html`
          <div class="map-container" style="height: ${this.height}px;">
            <iframe src="${resolvedUrl}" loading="lazy" allowfullscreen style="border:0"></iframe>
          </div>
        `;
      }
    }

    // Legacy: direct URL string
    if (this.url && typeof this.url === "string") {
      return html`
        <div class="map-container" style="height: ${this.height}px;">
          <iframe src="${this.url}" loading="lazy" allowfullscreen style="border:0"></iframe>
        </div>
      `;
    }

    const centerRaw = this._resolveProp(this.center);
    const zoomRaw = this._resolveProp(this.zoom);
    const pinsRaw = this._resolveProp(this.pins);

    const centerVal = this._toLatLng(centerRaw);
    const zoomVal = typeof zoomRaw === "number" ? zoomRaw : 14;
    const pinArray = this._toPinArray(pinsRaw);

    console.log("[GoogleMap] center:", centerVal, "zoom:", zoomVal, "pins:", pinArray.length);

    if (!centerVal) {
      return html`<div class="map-container" style="height:${this.height}px; display:flex; align-items:center; justify-content:center; color:#5f6368;">Map data not available</div>`;
    }

    // Build Google Maps embed URL
    let embedUrl: string;
    if (pinArray.length >= 2) {
      // Two+ pins: show directions route between first and second
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
      <div class="map-container" style="height: ${this.height}px;">
        <iframe
          src="${embedUrl}"
          loading="lazy"
          allowfullscreen
          style="border:0"
        ></iframe>
      </div>
    `;
  }
}
