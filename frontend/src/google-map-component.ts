/**
 * Custom A2UI v0.8 components for the restaurant finder:
 *
 *   - WebFrameUrl: embeds a URL in an iframe. Used for Google Maps embeds.
 *   - GoogleMap: renders a Google Map with center/zoom/pins.
 */

import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { componentRegistry } from "@a2ui/lit/ui";

// ---------------------------------------------------------------------------
// WebFrameUrl
// ---------------------------------------------------------------------------
@customElement("a2ui-restaurant-webframeurl")
export class A2uiWebFrameUrl extends LitElement {
  @property({ type: String }) accessor url = "";

  static override styles = css`
    :host {
      display: block;
      width: 100%;
      overflow: hidden;
    }
    .frame {
      position: relative;
      width: 100%;
      height: 400px;
      border-radius: 8px;
      overflow: hidden;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: 0;
    }
  `;

  override render() {
    if (!this.url) return nothing;
    return html`
      <div class="frame">
        <iframe src=${this.url} loading="lazy" allowfullscreen></iframe>
      </div>
    `;
  }
}

// ---------------------------------------------------------------------------
// GoogleMap
// ---------------------------------------------------------------------------
interface LatLng {
  lat: number;
  lng: number;
}

interface MapPin extends LatLng {
  name: string;
  description?: string;
}

@customElement("a2ui-restaurant-googlemap")
export class A2uiGoogleMap extends LitElement {
  @property({ type: Object }) accessor center: LatLng | null = null;
  @property({ type: Number }) accessor zoom = 14;
  @property({ type: Array }) accessor pins: MapPin[] = [];

  static override styles = css`
    :host {
      display: block;
      width: 100%;
      overflow: hidden;
    }
    .map {
      width: 100%;
      height: 400px;
      border-radius: 8px;
      overflow: hidden;
      background: #e8eaed;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: 0;
    }
    .empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #5f6368;
    }
  `;

  override render() {
    if (!this.center) {
      return html`<div class="map"><div class="empty">Map data not available</div></div>`;
    }

    let embedUrl: string;
    const pins = Array.isArray(this.pins) ? this.pins : [];

    if (pins.length >= 2) {
      const [origin, dest] = pins;
      const saddr = encodeURIComponent(origin.name || `${origin.lat},${origin.lng}`);
      const daddr = encodeURIComponent(dest.name || `${dest.lat},${dest.lng}`);
      embedUrl = `https://maps.google.com/maps?saddr=${saddr}&daddr=${daddr}&output=embed`;
    } else if (pins.length === 1) {
      const [pin] = pins;
      const q = encodeURIComponent(pin.name || `${pin.lat},${pin.lng}`);
      embedUrl = `https://maps.google.com/maps?q=${q}&z=${this.zoom}&output=embed`;
    } else {
      const q = encodeURIComponent(`${this.center.lat},${this.center.lng}`);
      embedUrl = `https://maps.google.com/maps?q=${q}&z=${this.zoom}&output=embed`;
    }

    return html`
      <div class="map">
        <iframe src=${embedUrl} loading="lazy" allowfullscreen></iframe>
      </div>
    `;
  }
}

// Register the custom components with A2UI 0.8 componentRegistry
componentRegistry.register("WebFrameUrl", A2uiWebFrameUrl, "a2ui-restaurant-webframeurl");
componentRegistry.register("GoogleMap", A2uiGoogleMap, "a2ui-restaurant-googlemap");
