export type DiagramKind = 'flowchart' | 'sequence' | 'architecture' | 'er' | 'state'

const startsByKind: Record<DiagramKind, RegExp> = {
  flowchart: /^\s*(?:flowchart|graph)\b/iu,
  sequence: /^\s*sequenceDiagram\b/u,
  architecture: /^\s*architecture-beta\b/u,
  er: /^\s*erDiagram\b/u,
  state: /^\s*stateDiagram(?:-v2)?\b/u,
}

export const diagramKindMatchesSource = (kind: DiagramKind, source: string) => startsByKind[kind].test(source)

let mermaidQueue = Promise.resolve()

export async function withMermaid<T>(dark: boolean, task: (mermaid: (typeof import('mermaid'))['default']) => Promise<T>): Promise<T> {
  const next = mermaidQueue.then(async () => {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      suppressErrorRendering: true,
      maxTextSize: 50_000,
      maxEdges: 200,
      theme: dark ? 'dark' : 'neutral',
    })
    return task(mermaid)
  })
  mermaidQueue = next.then(() => undefined, () => undefined)
  return next
}

export async function validateMermaidSource(kind: DiagramKind, source: string): Promise<boolean> {
  if (!source.trim() || source.length > 50_000 || !diagramKindMatchesSource(kind, source)) return false
  return withMermaid(false, async (mermaid) => Boolean(await mermaid.parse(source, { suppressErrors: true })))
}
