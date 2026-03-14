// Asset declarations to silence TypeScript errors for missing font and SVG files
// These are runtime assets that are loaded via bundler, not TypeScript

declare module "*.woff2" {
  const value: string
  export default value
}

declare module "*.woff" {
  const value: string
  export default value
}

declare module "*.svg" {
  const value: string
  export default value
}

declare module "*.png" {
  const value: string
  export default value
}

declare module "*.jpg" {
  const value: string
  export default value
}
