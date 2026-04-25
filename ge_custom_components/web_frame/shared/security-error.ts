/**
 * Copyright 2026 Google LLC
 */

import {css, html} from 'lit';

export const securityErrorStyles = css`
  .security-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 100%;
    padding: 24px;
    box-sizing: border-box;
    background: var(--n-95);
    color: var(--nv-30);
    font-family: 'Google Sans', 'Helvetica Neue', sans-serif;
    text-align: center;
  }
  .security-error-icon {
    font-size: 36px;
    color: var(--e-40);
  }
  .security-error-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--n-10);
  }
  .security-error-detail {
    font-size: 12px;
    color: var(--nv-50);
    max-width: 360px;
  }
`;

export const securityErrorTemplate = () => html`
  <div class="security-error">
    <div class="security-error-icon">⚠</div>
    <div class="security-error-title">
      This UI element was blocked for security reasons
    </div>
    <div class="security-error-detail">
      The content could not be displayed because it did not meet the
      required security policy.
    </div>
  </div>
`;
