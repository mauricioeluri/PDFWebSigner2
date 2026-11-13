// @ts-check
import { defineConfig } from 'astro/config'
import { cp, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const pdfjs = dirname(require.resolve('pdfjs-dist/package.json'))
const resources = new URL('./public/pdfjs/', import.meta.url)
await mkdir(resources, { recursive: true })
for (const name of ['cmaps', 'standard_fonts', 'wasm', 'LICENSE']) {
  await cp(join(pdfjs, name), new URL(name, resources), { recursive: true })
}

export default defineConfig({})
