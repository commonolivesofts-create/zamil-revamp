/// <reference types="vite/client" />

type LucideNode = [string, Record<string, string | number>, LucideNode[]?];

interface Window {
  /** Lucide 0.468 UMD icon data, loaded by index.html (same file as the main Zamil client). */
  lucide?: { icons: Record<string, LucideNode> };
}

interface ImportMetaEnv {
  readonly VITE_ZAMIL_LOGIN_URL?: string;
}
