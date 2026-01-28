/**
 * Fix: Removed problematic triple-slash reference to 'vite/client'
 * to resolve "Cannot find type definition file" error.
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
