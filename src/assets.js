// Resolves an asset path. In the single-file build, window.__ASSETS maps paths to data URIs.
export const asset = (p) => (typeof window !== 'undefined' && window.__ASSETS && window.__ASSETS[p]) || p;
