/**
 * Original Orvexa files are served from Vite's public directory.
 * Use this helper for React-owned image references, including on nested routes
 * and when the Vite application is deployed under a non-root base path.
 * The original purchased source remains unchanged.
 *
 * @example orvexaAsset('images/orvexa-command-robot-v1.png')
 */
export function orvexaAsset(path) {
  const relativePath = path.replace(/^\/+/, '')
  return `${import.meta.env.BASE_URL}orvexa/assets/${relativePath}`
}
