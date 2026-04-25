import 'google3/third_party/a2ui/renderers/lit_internal/src/v0_8/ui/surface';
import 'google3/third_party/a2ui/renderers/lit_internal/src/v0_8/ui/ui';

import {provide} from '@lit/context';
import {theme as demoTheme} from 'google3/google/cloud/discoveryengine/apps/ucs_widget/standalone/components/ucs_a2ui/theme';
import {createMobxA2UIModelProcessor, Events, Types, UI} from 'google3/third_party/a2ui/renderers/lit_internal';
import {css, html, LitElement, nothing} from 'lit';
import {customElement, property} from 'lit/decorators';
import {repeat} from 'lit/directives/repeat';

/**
 * Container for hosting A2UI surfaces.
 */
@customElement('a2ui-surface-container')
export class A2uiSurfaceContainer extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
  `;

  @provide({context: UI.Context.themeContext}) theme: Types.Theme = demoTheme;

  @property({type: Array}) a2UIMessages: Types.ServerToClientMessage[] = [];

  private readonly processor = createMobxA2UIModelProcessor();

  override render() {
    this.processor.clearSurfaces();
    this.processor.processMessages(this.a2UIMessages);
    this.requestUpdate();

    const surfaces = this.processor.getSurfaces();
    if (surfaces.size === 0) {
      return nothing;
    }

    return html`<section id="surfaces">
      ${
        repeat(
            this.processor.getSurfaces(),
            ([surfaceId]) => surfaceId,
            ([surfaceId, surface]) => {
              return html`<a2ui-surface
            @a2uiaction=${this.getActionHandler(surfaceId)}
            .surfaceId=${surfaceId}
            .surface=${surface}
            .childComponents=${
                  surface?.componentTree ? [surface.componentTree] : null}
            .processor=${this.processor}
            .enableCustomElements=${true}
          >
          </a2ui-surface>`;
            },
            )}
    </section>`;
  }

  private getActionHandler(surfaceId: string) {
    // Generate an A2UI action handler for the given surface.
    return async (event: Events.StateEvent<'a2ui.action'>) => {
      const [target] = event.composedPath();
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (!event.detail.sourceComponent) {
        return;
      }

      const context: Record<string, unknown> = {};
      if (event.detail.action.context) {
        const srcContext = event.detail.action.context;
        for (const item of srcContext) {
          const key = item.key;
          if ('literalBoolean' in item.value) {
            context[key] = item.value.literalBoolean;
          } else if ('literalNumber' in item.value) {
            context[key] = item.value.literalNumber;
          } else if ('literalString' in item.value) {
            context[key] = item.value.literalString;
          } else if (item.value.path) {
            const path = this.processor.resolvePath(
                item.value.path,
                event.detail.dataContextPath,
            );
            const value = this.processor.getData(
                event.detail.sourceComponent!,
                path,
                surfaceId,
            );
            context[key] = value;
          }
        }
      }

      const message: Types.UserAction = {
        surfaceId,
        name: event.detail.action.name,
        sourceComponentId: target.id,
        timestamp: new Date().toISOString(),
        context,
      };

      this.dispatchEvent(
          new CustomEvent('a2ui-action-triggered', {
            detail: message,
            bubbles: true,
            composed: true,
          }),
      );
    };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'a2ui-surface-container': A2uiSurfaceContainer;
  }
}
