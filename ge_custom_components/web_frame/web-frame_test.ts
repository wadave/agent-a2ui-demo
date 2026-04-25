/*
 Copyright 2025 Google LLC

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

import 'jasmine';

import {ContextProvider} from '@lit/context';
import {SAFE_CONTENT_FRAME_TEST_ONLY} from 'google3/javascript/security/safe_content_frame/v2/testing';
import {cleanState} from 'google3/testing/web/jasmine/state/clean_state';

import {allowlistContext} from '../../context/allowlist';
import {WebFrameSrcdoc} from './web-frame-srcdoc';
import {WebFrameUrl} from './web-frame-url';

describe('a2ui-web-frame-srcdoc', () => {
  const state = cleanState(async () => {
    const element = new WebFrameSrcdoc();
    document.body.appendChild(element);
    return {element};
  }, beforeEach);

  beforeEach(() => {
    SAFE_CONTENT_FRAME_TEST_ONLY.enableTestShim();
  });

  afterEach(() => {
    SAFE_CONTENT_FRAME_TEST_ONLY.resetDefaults();
    document.body.removeChild(state.element);
  });

  describe('height configuration', () => {
    it('defaults to 4/3 aspect ratio when no height is provided', async () => {
      await state.element.updateComplete;
      const container = state.element.shadowRoot!.querySelector('div')!;
      expect(container.style.aspectRatio).toBe('4 / 3');
    });

    it('uses specified height when provided', async () => {
      state.element.height = 600;
      await state.element.updateComplete;
      const container = state.element.shadowRoot!.querySelector('div')!;
      expect(container.style.height).toBe('600px');
    });
  });

  describe('CSP validation', () => {
    describe('hasRequiredCsp', () => {
      it('returns true for HTML with the required CSP meta tag', () => {
        const validHtml =
            '<html><head><meta http-equiv="Content-Security-Policy" ' +
            'content="connect-src \'none\'"></head><body></body></html>';
        expect(WebFrameSrcdoc.hasRequiredCsp(validHtml)).toBeTrue();
      });

      it('returns true for self-closing meta tag', () => {
        const validHtml =
            '<meta http-equiv="Content-Security-Policy" ' +
            'content="connect-src \'none\'" />';
        expect(WebFrameSrcdoc.hasRequiredCsp(validHtml)).toBeTrue();
      });

      it('returns false for HTML without the CSP meta tag', () => {
        const invalidHtml =
            '<html><head><title>Test</title></head><body></body></html>';
        expect(WebFrameSrcdoc.hasRequiredCsp(invalidHtml)).toBeFalse();
      });

      it('returns false for HTML with a different CSP directive', () => {
        const invalidHtml =
            '<meta http-equiv="Content-Security-Policy" ' +
            'content="default-src \'self\'">';
        expect(WebFrameSrcdoc.hasRequiredCsp(invalidHtml)).toBeFalse();
      });

      it('returns false for empty string', () => {
        expect(WebFrameSrcdoc.hasRequiredCsp('')).toBeFalse();
      });

      it('returns true when content attribute comes before http-equiv', () => {
        const validHtml =
            '<meta content="connect-src \'none\'" ' +
            'http-equiv="Content-Security-Policy">';
        expect(WebFrameSrcdoc.hasRequiredCsp(validHtml)).toBeTrue();
      });

      it('returns true when extra attributes appear between http-equiv and content',
         () => {
           const validHtml =
               '<meta http-equiv="Content-Security-Policy" ' +
               'id="csp-tag" content="connect-src \'none\'">';
           expect(WebFrameSrcdoc.hasRequiredCsp(validHtml)).toBeTrue();
         });
    });

    describe('render behavior', () => {
      it('renders error UI by default when no content is set', async () => {
        await state.element.updateComplete;
        const errorEl =
            state.element.shadowRoot!.querySelector('.security-error');
        expect(errorEl).not.toBeNull();
      });

      it('renders error UI when htmlContent lacks CSP meta tag', async () => {
        state.element.htmlContent = {
          literalString: '<html><body>No CSP</body></html>',
        };
        await state.element.updateComplete;
        const errorEl =
            state.element.shadowRoot!.querySelector('.security-error');
        expect(errorEl).not.toBeNull();
        const titleEl =
            state.element.shadowRoot!.querySelector('.security-error-title');
        expect(titleEl!.textContent).toContain('blocked for security reasons');
      });

      it('does not render error UI when htmlContent has valid CSP', async () => {
        state.element.htmlContent = {
          literalString:
              '<html><head><meta http-equiv="Content-Security-Policy" ' +
              'content="connect-src \'none\'"></head>' +
              '<body>Safe content</body></html>',
        };
        await state.element.updateComplete;
        const errorEl =
            state.element.shadowRoot!.querySelector('.security-error');
        expect(errorEl).toBeNull();
        const scfContainer =
            state.element.shadowRoot!.querySelector('.scf-container');
        expect(scfContainer).not.toBeNull();
      });
    });
  });
});

describe('a2ui-web-frame-url', () => {
  const state = cleanState(async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const element = new WebFrameUrl();
    const allowlist = ['example.com'];

    // tslint:disable-next-line:no-unused-expression
    new ContextProvider(host, {
      context: allowlistContext,
      initialValue: allowlist,
    });

    host.appendChild(element);
    await element.updateComplete;
    return {element, host};
  }, beforeEach);

  afterEach(() => {
    document.body.removeChild(state.host);
  });

  describe('height configuration', () => {
    it('defaults to 4/3 aspect ratio when no height is provided', async () => {
      await state.element.updateComplete;
      const container = state.element.shadowRoot!.querySelector('div')!;
      expect(container.style.aspectRatio).toBe('4 / 3');
    });

    it('uses specified height when provided', async () => {
      state.element.height = 600;
      await state.element.updateComplete;
      const container = state.element.shadowRoot!.querySelector('div')!;
      expect(container.style.height).toBe('600px');
    });
  });

  describe('render behavior', () => {
    it('renders iframe container when url is provided in allowlist', async () => {
      state.element.url = {literalString: 'https://example.com'};
      await state.element.updateComplete;
      const iframeContainer =
          state.element.shadowRoot!.querySelector('.iframe-container');
      expect(iframeContainer).not.toBeNull();
    });

    it('renders security error when url is not set', async () => {
      await state.element.updateComplete;
      const errorEl =
          state.element.shadowRoot!.querySelector('.security-error');
      expect(errorEl).not.toBeNull();
    });
  });
});
