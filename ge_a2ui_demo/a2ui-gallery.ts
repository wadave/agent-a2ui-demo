import './a2ui-surface-container';
import 'google3/third_party/javascript/material/web/icon/icon';
import 'google3/third_party/javascript/material/web/iconbutton/icon-button';
import 'google3/third_party/javascript/material/web/dialog/dialog';
import './demo-dialog';
import './demo-slide-out';

import {css, html, LitElement} from 'lit';
import {customElement, query, state} from 'lit/decorators';
import {createRef, ref, Ref} from 'lit/directives/ref';

import {styles as galleryStyles} from './a2ui-gallery.css';
import {DemoSlideOut} from './demo-slide-out';
import {GALLERY_DATA, GalleryData} from './gallery_data';

/**
 * Gallery view for A2UI components.
 */
@customElement('a2ui-gallery')
export class A2uiGallery extends LitElement {
  @state() expandedDemoId: string|null = null;
  @state() viewMode: 'gallery'|'code' = 'gallery';
  @state() columns = 3;
  @query('demo-slide-out') slideOut!: DemoSlideOut;
  private resizeObserver?: ResizeObserver;

  override connectedCallback() {
    super.connectedCallback();
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        let cols = Math.floor((entry.contentRect.width + 24) / 404);
        if (cols < 1) cols = 1;
        if (cols !== this.columns) {
          this.columns = cols;
        }
      }
    });
  }

  override firstUpdated() {
    const grid = this.shadowRoot?.querySelector('.grid');
    if (grid) {
      this.resizeObserver?.observe(grid);
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
  }

  private openDialog(id: string) {
    this.expandedDemoId = id;
    this.viewMode = 'gallery';
  }

  private closeDialog() {
    this.expandedDemoId = null;
  }

  private toggleViewMode() {
    this.viewMode = this.viewMode === 'gallery' ? 'code' : 'gallery';
  }

  private async copyCode() {
    const comp = GALLERY_DATA.find(c => c.id === this.expandedDemoId);
    if (comp) {
      try {
        await navigator.clipboard.writeText(
            JSON.stringify(comp.message, null, 2));
        this.slideOut.show('Code copied to clipboard!');
      } catch (e: any) {
        this.slideOut.show('Failed to copy code: ' + e.message);
      }
    }
  }

  static override styles = [galleryStyles];

  private renderCard(comp: GalleryData) {
    return html`
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${comp.title}</h3>
          <p class="card-desc">${comp.description}</p>
          <div class="card-actions">
            <md-icon-button @click=${() => this.openDialog(comp.id)}>
              <md-icon>open_in_full</md-icon>
            </md-icon-button>
          </div>
        </div>
        <div class="card-preview">
           <a2ui-surface-container .a2UIMessages=${
        comp.message}></a2ui-surface-container>
        </div>
      </div>
    `;
  }

  override render() {
    return html`
      <div class="header">
        <h1>Component Gallery</h1>
      </div>
      <div class="grid">
        ${
        Array.from({length: this.columns})
            .map(
                (_, colIndex) => html`
          <div class="grid-column">
            ${
                    GALLERY_DATA.filter((_, i) => i % this.columns === colIndex)
                        .map((comp) => this.renderCard(comp))}
          </div>
        `)}
      </div>

      ${this.renderDialog()}
      <demo-slide-out></demo-slide-out>
    `;
  }

  private renderDialog() {
    const comp = this.expandedDemoId ?
        GALLERY_DATA.find(c => c.id === this.expandedDemoId) :
        null;

    return html`
      <demo-dialog
        dialogTitle=${comp ? comp.title : ''}
        ?open=${!!this.expandedDemoId}
        @close=${this.closeDialog}
      >
        <div slot="actions">
           ${
        this.viewMode === 'code' ? html`
             <md-icon-button @click=${this.copyCode} title="Copy Code">
               <md-icon>content_copy</md-icon>
             </md-icon-button>
           ` :
                                   ''}
           <md-icon-button @click=${
        this.toggleViewMode} title="Toggle View Mode">
             <md-icon>${
        this.viewMode === 'gallery' ? 'code' : 'preview'}</md-icon>
           </md-icon-button>
        </div>
        ${
        comp ? html`
          <div class="dialog-content ${
                   this.viewMode === 'gallery' ? 'gallery-view' : ''}">
             ${
                   this.viewMode === 'gallery' ?
                       html`<a2ui-surface-container .a2UIMessages=${
                           comp.message}></a2ui-surface-container>` :
                       html`<pre class="code-preview"><code>${
                           JSON.stringify(comp.message, null, 2)}</code></pre>`}
          </div>
        ` :
               ''}
      </demo-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'a2ui-gallery': A2uiGallery;
  }
}
