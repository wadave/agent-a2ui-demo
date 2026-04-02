/**
 * Custom A2UI GoogleMap component for embedding Google Maps.
 *
 * Usage in A2UI messages:
 * {
 *   "id": "mapEmbed",
 *   "component": {
 *     "GoogleMap": {
 *       "url": {"literalString": "https://www.google.com/maps/embed/v1/place?key=KEY&q=..."},
 *       "height": "400px"
 *     }
 *   }
 * }
 */

import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("a2ui-googlemap")
export class GoogleMap extends LitElement {
  @property() url: { literalString?: string; path?: string } | null = null;
  @property() height: string = "400px";

  // A2UI component properties (set by the Root renderer)
  @property({ attribute: false }) component: any = null;
  @property({ attribute: false }) processor: any = null;
  @property() surfaceId: string | null = null;
  @property() dataContextPath: string = "";
  @property() weight: any = "initial";

  static styles = css`
    :host {
      display: block;
      flex: var(--weight);
      min-height: 0;
    }
    iframe {
      display: block;
      width: 100%;
      border: none;
      border-radius: 8px;
    }
  `;

  private resolveUrl(): string | null {
    if (!this.url) return null;
    if (typeof this.url === "string") return this.url as string;
    if ("literalString" in this.url && this.url.literalString) {
      return this.url.literalString;
    }
    if ("path" in this.url && this.url.path && this.processor && this.component) {
      const resolved = this.processor.getData(
        this.component, this.url.path, this.surfaceId ?? ""
      );
      return typeof resolved === "string" ? resolved : null;
    }
    return null;
  }

  render() {
    const resolvedUrl = this.resolveUrl();
    if (!resolvedUrl) return nothing;
    return html`<iframe
      src=${resolvedUrl}
      style="height: ${this.height}"
      title="Google Map"
      loading="lazy"
      referrerpolicy="no-referrer-when-downgrade"
      allowfullscreen
    ></iframe>`;
  }
}
