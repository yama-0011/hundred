import type { BlockType, ContentBlock, LeafBlockType } from './contentBlocks'
import contentBlockCatalogJson from './contentBlockCatalog.json'

export type ContentBlockCatalog = {
  version: number
  allowedTypes: BlockType[]
  nestedAllowedTypes: LeafBlockType[]
  templates: Array<{ label: string; description: string; block: ContentBlock }>
}

export const contentBlockCatalog = contentBlockCatalogJson as ContentBlockCatalog

export const createContentBlockCatalog = (): ContentBlockCatalog => structuredClone(contentBlockCatalog)
