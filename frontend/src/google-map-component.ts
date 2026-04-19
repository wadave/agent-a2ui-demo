/**
 * Custom A2UI v0.9 components for the restaurant finder:
 *
 *   - WebFrameUrl: embeds a URL in an iframe. Used for Google Maps embeds and
 *     other web content the agent wants to surface.
 *   - GoogleMap: renders a Google Map with center/zoom/pins, falling back to
 *     a maps.google.com embed.
 *
 * Both components follow the v0.9 catalog pattern: a Zod schema declares the
 * component's API, a LitElement subclass binds via `A2uiController` and reads
 * resolved props off `this.controller.props`. The exported `customCatalog`
 * gets passed to `MessageProcessor` alongside `basicCatalog`.
 */

import { html, css, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { z } from "zod";
import {
  A2uiController,
  A2uiLitElement,
  type LitComponentApi,
} from "@a2ui/lit/v0_9";
import { Catalog } from "@a2ui/web_core/v0_9";

/** Catalog ID — must match the `catalogId` in the backend custom catalog file. */
const CATALOG_ID =
  "https://github.com/user/agent-a2ui-demo/restaurant_finder_catalog_definition.json";

// ---------------------------------------------------------------------------
// Shared schema fragments
// ---------------------------------------------------------------------------

/** v0.9 DynamicString: literal | { path } | { call, args, returnType }. */
const DynamicString = z.union([
  z.string(),
  z.object({ path: z.string() }),
  z.object({
    call: z.string(),
    args: z.record(z.any()),
    returnType: z.string().optional(),
  }),
]);

/** v0.9 DynamicNumber: literal | { path } | function call. */
const DynamicNumber = z.union([
  z.number(),
  z.object({ path: z.string() }),
  z.object({
    call: z.string(),
    args: z.record(z.any()),
    returnType: z.string().optional(),
  }),
]);

const PathBinding = z.object({ path: z.string() });

// ---------------------------------------------------------------------------
// WebFrameUrl
// ---------------------------------------------------------------------------

const WebFrameUrlSchema = z.object({
  url: DynamicString,
});

const WebFrameUrlApi = {
  name: "WebFrameUrl",
  schema: WebFrameUrlSchema,
};

@customElement("a2ui-restaurant-webframeurl")
export class A2uiWebFrameUrl extends A2uiLitElement<typeof WebFrameUrlApi> {
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

  protected createController(): A2uiController<typeof WebFrameUrlApi> {
    return new A2uiController(this, WebFrameUrlApi);
  }

  override render() {
    const props = this.controller.props;
    if (!props) return nothing;
    const url = typeof props.url === "string" ? props.url : null;
    if (!url) return nothing;
    return html`
      <div class="frame">
        <iframe src=${url} loading="lazy" allowfullscreen></iframe>
      </div>
    `;
  }
}

export const WebFrameUrl: LitComponentApi = {
  ...WebFrameUrlApi,
  tagName: "a2ui-restaurant-webframeurl",
};

// ---------------------------------------------------------------------------
// GoogleMap
// ---------------------------------------------------------------------------

const LatLng = z.object({ lat: z.number(), lng: z.number() });

const Pin = z.object({
  lat: z.number(),
  lng: z.number(),
  name: z.string(),
  description: z.string().optional(),
  background: z.string().optional(),
  borderColor: z.string().optional(),
  glyphColor: z.string().optional(),
});

const GoogleMapSchema = z.object({
  center: z.union([LatLng, PathBinding]),
  zoom: DynamicNumber,
  pins: z.union([z.array(Pin), PathBinding]).optional(),
});

const GoogleMapApi = {
  name: "GoogleMap",
  schema: GoogleMapSchema,
};

type ResolvedPin = z.infer<typeof Pin>;

@customElement("a2ui-restaurant-googlemap")
export class A2uiGoogleMap extends A2uiLitElement<typeof GoogleMapApi> {
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

  protected createController(): A2uiController<typeof GoogleMapApi> {
    return new A2uiController(this, GoogleMapApi);
  }

  /** Coerce a controller-resolved value (object or Map) to {lat, lng}. */
  private toLatLng(val: unknown): { lat: number; lng: number } | null {
    if (val == null || typeof val !== "object") return null;
    if (val instanceof Map) {
      const lat = val.get("lat");
      const lng = val.get("lng");
      if (lat != null && lng != null) {
        return { lat: Number(lat), lng: Number(lng) };
      }
      return null;
    }
    const obj = val as Record<string, unknown>;
    if (obj.lat != null && obj.lng != null) {
      return { lat: Number(obj.lat), lng: Number(obj.lng) };
    }
    return null;
  }

  /** Coerce resolved pins payload (array, object-keyed-by-index, or Map) to a typed array. */
  private toPinArray(val: unknown): ResolvedPin[] {
    if (val == null) return [];
    const extract = (v: unknown): ResolvedPin | null => {
      if (v == null) return null;
      const get = (k: string): unknown =>
        v instanceof Map ? v.get(k) : (v as Record<string, unknown>)[k];
      const lat = get("lat");
      const lng = get("lng");
      if (lat == null || lng == null) return null;
      return {
        lat: Number(lat),
        lng: Number(lng),
        name: (get("name") as string | undefined) ?? "",
        description: get("description") as string | undefined,
        background: get("background") as string | undefined,
        borderColor: get("borderColor") as string | undefined,
        glyphColor: get("glyphColor") as string | undefined,
      };
    };
    if (val instanceof Map) {
      return [...val.values()].map(extract).filter((p): p is ResolvedPin => p != null);
    }
    if (Array.isArray(val)) {
      return val.map(extract).filter((p): p is ResolvedPin => p != null);
    }
    if (typeof val === "object") {
      return Object.values(val).map(extract).filter((p): p is ResolvedPin => p != null);
    }
    return [];
  }

  override render() {
    const props = this.controller.props;
    if (!props) return nothing;

    const center = this.toLatLng(props.center);
    const zoom = typeof props.zoom === "number" ? props.zoom : 14;
    const pins = this.toPinArray(props.pins);

    if (!center) {
      return html`<div class="map"><div class="empty">Map data not available</div></div>`;
    }

    let embedUrl: string;
    if (pins.length >= 2) {
      const [origin, dest] = pins;
      const saddr = encodeURIComponent(origin.name || `${origin.lat},${origin.lng}`);
      const daddr = encodeURIComponent(dest.name || `${dest.lat},${dest.lng}`);
      embedUrl = `https://maps.google.com/maps?saddr=${saddr}&daddr=${daddr}&output=embed`;
    } else if (pins.length === 1) {
      const [pin] = pins;
      const q = encodeURIComponent(pin.name || `${pin.lat},${pin.lng}`);
      embedUrl = `https://maps.google.com/maps?q=${q}&z=${zoom}&output=embed`;
    } else {
      const q = encodeURIComponent(`${center.lat},${center.lng}`);
      embedUrl = `https://maps.google.com/maps?q=${q}&z=${zoom}&output=embed`;
    }

    return html`
      <div class="map">
        <iframe src=${embedUrl} loading="lazy" allowfullscreen></iframe>
      </div>
    `;
  }
}

export const GoogleMap: LitComponentApi = {
  ...GoogleMapApi,
  tagName: "a2ui-restaurant-googlemap",
};

// ---------------------------------------------------------------------------
// Custom catalog
// ---------------------------------------------------------------------------

/** Custom catalog containing this app's WebFrameUrl + GoogleMap components. */
export const customCatalog = new Catalog<LitComponentApi>(
  CATALOG_ID,
  [WebFrameUrl, GoogleMap],
);
