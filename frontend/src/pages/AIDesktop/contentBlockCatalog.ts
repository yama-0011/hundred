import type { BlockType, ContentBlock, LeafBlockType, ScreenMapBlock } from './contentBlocks'
import contentBlockCatalogJson from './contentBlockCatalog.json'

export type ContentBlockCatalog = {
  version: number
  allowedTypes: BlockType[]
  nestedAllowedTypes: LeafBlockType[]
  templates: Array<{ label: string; description: string; block: ContentBlock }>
  // Screen Mapのカテゴリ専用。allowedTypesには含めず、通常のページには追加させない。
  screenMap: { label: string; description: string; fieldDefinitions: Record<string, string>; block: ScreenMapBlock }
}

export const contentBlockCatalog = contentBlockCatalogJson as ContentBlockCatalog

export const createContentBlockCatalog = (): ContentBlockCatalog => structuredClone(contentBlockCatalog)
