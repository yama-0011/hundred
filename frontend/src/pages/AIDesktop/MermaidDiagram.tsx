import { useEffect, useRef, useState } from 'react'
import { diagramKindMatchesSource, withMermaid, type DiagramKind } from './mermaidDiagramValidation'

export function MermaidDiagram({ id, kind, title, source, caption }: { id: string; kind: DiagramKind; title: string; source: string; caption?: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const desktop = rootRef.current?.closest('.ai-desktop')
    if (!desktop) return
    const sync = () => setDark(desktop.classList.contains('dark'))
    queueMicrotask(sync)
    const observer = new MutationObserver(sync)
    observer.observe(desktop, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let disposed = false
    const root = rootRef.current
    if (!root) return
    queueMicrotask(() => { if (!disposed) { setState('loading'); setMessage('') } })
    root.replaceChildren()
    if (!diagramKindMatchesSource(kind, source)) {
      queueMicrotask(() => { if (!disposed) { setState('error'); setMessage('図の種類とMermaid構文の先頭が一致していません。') } })
      return () => { disposed = true }
    }
    const renderId = `ad-mermaid-${id.replace(/[^a-zA-Z0-9_-]/gu, '-')}-${Math.random().toString(36).slice(2, 8)}`
    void withMermaid(dark, async (mermaid) => {
      const valid = await mermaid.parse(source, { suppressErrors: true })
      if (!valid) throw new Error('Mermaid構文を解析できません。')
      return mermaid.render(renderId, source)
    }).then(({ svg, bindFunctions }) => {
      if (disposed || !rootRef.current) return
      rootRef.current.innerHTML = svg
      bindFunctions?.(rootRef.current)
      setState('ready')
    }).catch((error: unknown) => {
      if (disposed) return
      setMessage(error instanceof Error ? error.message : 'Mermaid構文を解析できません。')
      setState('error')
    })
    return () => { disposed = true }
  }, [dark, id, kind, source])

  return <figure className={`ad-diagram state-${state}`} data-diagram-state={state}>{title && <h3>{title}</h3>}<div className="ad-diagram__canvas" ref={rootRef} />{state === 'loading' && <p className="ad-diagram__status">図を生成しています…</p>}{state === 'error' && <div className="ad-diagram__error"><strong>図を表示できません</strong><p>{message} 構文を確認してください。</p></div>}{caption && <figcaption>{caption}</figcaption>}</figure>
}
