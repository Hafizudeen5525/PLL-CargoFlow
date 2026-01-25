/// <reference types="vite/client" />

/**
 * Fix: Use triple-slash reference to 'vite/client' to include standard Vite types.
 * This resolves "Duplicate identifier" and "identical modifiers" errors by
 * removing manual re-declarations of assets, CSS modules, and environment interfaces
 * that are already provided by Vite.
 */

declare module '*.svg' {
  import * as React from 'react';
  /**
   * Fix: Augment the existing *.svg module declaration from vite/client
   * to add support for ReactComponent (commonly used with vite-plugin-svgr).
   */
  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & { title?: string }
  >;
}
