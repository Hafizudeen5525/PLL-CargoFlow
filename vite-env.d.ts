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

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_FIRESTORE_DATABASE_ID?: string;
  [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

