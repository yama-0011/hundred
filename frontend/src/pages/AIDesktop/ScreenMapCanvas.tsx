import { memo, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Background, BackgroundVariant, BaseEdge, ConnectionMode, Controls, EdgeLabelRenderer, getSmoothStepPath, Handle, MarkerType, MiniMap, NodeResizeControl, Position, ReactFlow, type Edge, type EdgeProps, type Node, type NodeChange, type NodeProps } from '@xyflow/react'
import { isMaskUnchecked, screenMapGroupColor, type ScreenMapData, type ScreenMapLabelMode, type ScreenMapPosition, type ScreenMapScreen, type ScreenMapSelection } from './screenMap'
import { groupFrames, resolvedPositions, screenNodeSize, type ScreenNodeSize } from './screenMapLayout'

/**
 * 概要:
 * Screen Mapの画面と遷移をキャンバスに描く。編集画面（編集できる）と閲覧の全体図（見るだけ）で共通に使う。
 *
 * 画面の位置・遷移・削除などのデータの変更は、呼び出し側へ知らせるだけにする。
 * ドラッグ中の位置だけはこの部品の中で持ち、ドラッグを終えたときに呼び出し側へ渡す。
 *
 * 保存する座標とカードの幅は「小」の大きさが基準。大きく表示するときは同じ倍率で広げて表示し、保存するときに戻す。
 * カードの高さはスクリーンショットの縦横比に合わせ、画像を切り取らない。編集画面では、選んだカードの右下の角で大きさを変えられる。
 * 操作名は、普段はアイコンだけにし、アイコンを押したときや、つながる画面を選んだときに表示する。
 */

export type ScreenMapCanvasMode = 'layout' | 'edit'
type ScreenNodeData = { screen: ScreenMapScreen; color: string; stateOfName: string | null; resizeLimits: { min: number; max: number } | null }
type FrameNodeData = { title: string; color: string; count: number; movable: boolean }
type TransitionEdgeData = { label: string; tone: 'normal' | 'active' | 'inferred'; expanded: boolean; onSelect: () => void }
type ScreenNode = Node<ScreenNodeData, 'screen'>
type FrameNode = Node<FrameNodeData, 'frame'>
type CanvasNode = ScreenNode | FrameNode
type Side = 'l' | 'r' | 't' | 'b'

const sides: Array<{ side: Side; position: Position }> = [{ side: 'l', position: Position.Left }, { side: 'r', position: Position.Right }, { side: 't', position: Position.Top }, { side: 'b', position: Position.Bottom }]
// 矢印の色。SVGのマーカーにも使うため、CSS変数ではなく明るい表示・暗い表示の両方で読める色にしている。
const edgeColors = { normal: '#8ea3cc', active: '#4f8ff0', inferred: '#d99a2b' }

const ScreenNodeView = memo(function ScreenNodeView({ data, selected }: NodeProps<ScreenNode>) {
  const { screen, color, stateOfName, resizeLimits } = data
  const image = screen.images[0]
  return <div className={`ad-sm-node${screen.stateOf ? ' state' : ''}${selected ? ' selected' : ''}`} style={{ '--sm-group': color } as CSSProperties}>
    {sides.map(({ side, position }) => <Handle key={`t-${side}`} id={`t-${side}`} type="target" position={position} className="ad-sm-handle" />)}
    {sides.map(({ side, position }) => <Handle key={`s-${side}`} id={`s-${side}`} type="source" position={position} className="ad-sm-handle" />)}
    <div className="ad-sm-node-thumb">{image ? <img src={image.thumbnailUrl ?? image.url} alt="" draggable={false} loading="lazy" /> : <span>画像なし</span>}</div>
    <div className="ad-sm-node-body">
      <strong>{screen.name || '名称未設定'}</strong>
      <span>{stateOfName ? `${stateOfName}の状態` : screen.url}</span>
      {screen.verification === 'ai-inferred' && <i className="ad-screen-map-verification ai-inferred">AIの推測</i>}
      {isMaskUnchecked(image) && <i className="ad-sm-mask-badge" title="マスキングを確認していません">マスク未確認</i>}
    </div>
    {/* 大きさ変更の部品は、渡した関数が変わるとドラッグを受け付けなくなるため、関数は渡さない。終了はonNodesChangeで受け取る。 */}
    {resizeLimits && selected && <NodeResizeControl position="bottom-right" keepAspectRatio minWidth={resizeLimits.min} maxWidth={resizeLimits.max} className="ad-sm-resize">
      <svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M14 6v8H6" /><path d="M14 14 8 8" /></svg>
    </NodeResizeControl>}
  </div>
})

const FrameNodeView = memo(function FrameNodeView({ data, selected }: NodeProps<FrameNode>) {
  return <div className={`ad-sm-frame${selected ? ' selected' : ''}`} style={{ '--sm-group': data.color } as CSSProperties}>
    <p className={data.movable ? 'ad-sm-frame-handle' : undefined} title={data.movable ? 'ドラッグでグループごと移動' : undefined}>{data.movable && <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor"><circle cx="5" cy="4" r="1.3" /><circle cx="11" cy="4" r="1.3" /><circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" /><circle cx="5" cy="12" r="1.3" /><circle cx="11" cy="12" r="1.3" /></svg>}<strong>{data.title}</strong><span>{data.count}画面</span></p>
  </div>
})

// 操作名は、表示するときも長くて重ならないよう、幅を決めて2行までにする。全文はマウスを乗せると表示する。
function TransitionEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps<Edge<TransitionEdgeData, 'transition'>>) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 12 })
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={24} />
    {data?.label && <EdgeLabelRenderer>
      {data.expanded
        ? <button type="button" className={`ad-sm-edge-label nodrag nopan ${data.tone}`} title={data.label} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }} onClick={data.onSelect}>{data.label}</button>
        : <button type="button" className={`ad-sm-edge-icon nodrag nopan ${data.tone}`} aria-label={`操作：${data.label}`} title={data.label} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }} onClick={data.onSelect}>
          <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8.5V3.5a1 1 0 0 1 2 0V8" /><path d="M8 7.5a1 1 0 0 1 2 0V9" /><path d="M10 8.5a1 1 0 0 1 2 0v2.5a3.5 3.5 0 0 1-3.5 3.5H8a3.5 3.5 0 0 1-2.9-1.6L3.6 10.6a1 1 0 0 1 1.6-1.2L6 10.5" /></svg>
        </button>}
    </EdgeLabelRenderer>}
  </>
}

const nodeTypes = { screen: ScreenNodeView, frame: FrameNodeView }
const edgeTypes = { transition: TransitionEdgeView }

// 2つの画面の中心の位置関係から、矢印をつなぐ辺を選ぶ。
function connectionSides(from: ScreenMapPosition | undefined, to: ScreenMapPosition | undefined, fromSize: ScreenNodeSize | undefined, toSize: ScreenNodeSize | undefined): [Side, Side] {
  if (!from || !to || !fromSize || !toSize) return ['r', 'l']
  const dx = to.x + toSize.width / 2 - (from.x + fromSize.width / 2)
  const dy = to.y + toSize.height / 2 - (from.y + fromSize.height / 2)
  if (Math.abs(dx) >= Math.abs(dy) * 1.2) return dx >= 0 ? ['r', 'l'] : ['l', 'r']
  return dy >= 0 ? ['b', 't'] : ['t', 'b']
}

type ScreenMapCanvasProps = {
  data: ScreenMapData
  mode: ScreenMapCanvasMode
  selection: ScreenMapSelection | null
  labelMode?: ScreenMapLabelMode
  scale?: number
  onSelect: (selection: ScreenMapSelection | null) => void
  onOpenImage?: (screenId: string) => void
  onMoveScreens?: (positions: Record<string, ScreenMapPosition>) => void
  onResizeScreen?: (screenId: string, width: number) => void
  onConnectScreens?: (from: string, to: string) => void
  onDeleteElements?: (screenIds: string[], transitionIds: string[]) => void
  // ミニマップを表示する場所。指定するとキャンバスの外（サイドバーなど）へ表示する。キャンバスの操作とはつながったまま動く。
  minimapTarget?: HTMLElement | null
}

function ScreenMapCanvas({ data, mode, selection, labelMode = 'icon', scale = 1, onSelect, onOpenImage, onMoveScreens, onResizeScreen, onConnectScreens, onDeleteElements, minimapTarget }: ScreenMapCanvasProps) {
  const editable = mode === 'edit'
  const [dragPositions, setDragPositions] = useState<Record<string, ScreenMapPosition>>({})
  const [resizingSizes, setResizingSizes] = useState<Record<string, ScreenNodeSize>>({})
  const resizeLimits = useMemo(() => ({ min: 80 * scale, max: 1_600 * scale }), [scale])
  const sizes = useMemo(() => ({ ...Object.fromEntries(data.screens.map((screen) => [screen.id, screenNodeSize(screen, data.layout.screens[screen.id]?.width, scale)])), ...resizingSizes }), [data, scale, resizingSizes])
  const basePositions = useMemo(() => Object.fromEntries(Object.entries(resolvedPositions(data)).map(([id, position]) => [id, { x: position.x * scale, y: position.y * scale }])), [data, scale])
  const positions = useMemo(() => ({ ...basePositions, ...dragPositions }), [basePositions, dragPositions])

  const nodes = useMemo<CanvasNode[]>(() => {
    const names = new Map(data.screens.map((screen) => [screen.id, screen.name || '名称未設定']))
    const screenNodes: ScreenNode[] = data.screens.map((screen) => ({
      id: screen.id,
      type: 'screen',
      position: positions[screen.id] ?? { x: 0, y: 0 },
      width: sizes[screen.id].width,
      height: sizes[screen.id].height,
      // 大きさはこちらで決めているため、計測した大きさとしても渡す（渡さないと、ドラッグ時に「初期化されていない」と警告される）。
      measured: { width: sizes[screen.id].width, height: sizes[screen.id].height },
      selected: selection?.kind === 'screen' && selection.id === screen.id,
      draggable: editable,
      connectable: editable,
      data: {
        screen,
        color: screenMapGroupColor(data, screen.groupId),
        stateOfName: screen.stateOf ? names.get(screen.stateOf) ?? null : null,
        resizeLimits: editable ? resizeLimits : null,
      },
    }))
    const count = (groupId: string | null) => data.screens.filter((screen) => (screen.groupId ?? null) === groupId).length
    const frameNodes: FrameNode[] = Object.entries(groupFrames(data, positions, sizes)).map(([groupId, frame]) => ({ id: `group-frame-${groupId}`, type: 'frame', position: { x: frame.x, y: frame.y }, width: frame.width, height: frame.height, measured: { width: frame.width, height: frame.height }, zIndex: -1, draggable: editable, dragHandle: '.ad-sm-frame-handle', selectable: false, focusable: false, deletable: false, connectable: false, selected: selection?.kind === 'group' && selection.id === groupId, data: { title: data.groups.find((group) => group.id === groupId)?.name || '名称未設定', color: screenMapGroupColor(data, groupId), count: count(groupId), movable: editable } }))
    return [...frameNodes, ...screenNodes]
  }, [data, positions, selection, editable, sizes, resizeLimits])

  const edges = useMemo<Edge<TransitionEdgeData, 'transition'>[]>(() => data.transitions.map((transition) => {
    const inferred = transition.verification === 'ai-inferred'
    const active = selection?.kind === 'transition' ? selection.id === transition.id : selection?.kind === 'screen' ? transition.from === selection.id || transition.to === selection.id : false
    const color = active ? edgeColors.active : inferred ? edgeColors.inferred : edgeColors.normal
    const [sourceSide, targetSide] = connectionSides(positions[transition.from], positions[transition.to], sizes[transition.from], sizes[transition.to])
    return {
      id: transition.id,
      source: transition.from,
      target: transition.to,
      sourceHandle: `s-${sourceSide}`,
      targetHandle: `t-${targetSide}`,
      type: 'transition' as const,
      selected: selection?.kind === 'transition' && selection.id === transition.id,
      data: { label: transition.action, tone: active ? 'active' as const : inferred ? 'inferred' as const : 'normal' as const, expanded: labelMode === 'all' || active, onSelect: () => onSelect({ kind: 'transition', id: transition.id }) },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
      style: { stroke: color, strokeWidth: active ? 2.6 : 1.6, strokeDasharray: inferred ? '6 4' : undefined },
      zIndex: active ? 2 : 1,
      deletable: editable,
    }
  }), [data.transitions, selection, labelMode, positions, sizes, editable, onSelect])

  // グループの囲みを動かしたときは、囲みの移動量だけ、グループの画面をまとめて動かす。
  const baseFrames = useMemo(() => groupFrames(data, basePositions, sizes), [data, basePositions, sizes])
  const groupMove = (frameId: string, framePosition: ScreenMapPosition) => {
    const groupId = frameId.slice('group-frame-'.length)
    const frame = baseFrames[groupId]
    if (!frame) return []
    const dx = framePosition.x - frame.x
    const dy = framePosition.y - frame.y
    return data.screens.filter((screen) => screen.groupId === groupId && basePositions[screen.id]).map((screen) => [screen.id, { x: basePositions[screen.id].x + dx, y: basePositions[screen.id].y + dy }] as const)
  }
  const handleNodesChange = (changes: NodeChange<CanvasNode>[]) => {
    if (!editable) return
    const moved = changes.flatMap((change) => change.type === 'position' && change.position && change.dragging ? change.id.startsWith('group-frame-') ? groupMove(change.id, change.position) : [[change.id, change.position] as const] : [])
    if (moved.length) setDragPositions((current) => ({ ...current, ...Object.fromEntries(moved) }))
    // 角をドラッグしている間だけ、カードの大きさをこの部品の中で変える。離したときにonResizeEndで保存する。
    const resized = changes.flatMap((change) => change.type === 'dimensions' && change.resizing && change.dimensions ? [[change.id, { width: change.dimensions.width, height: change.dimensions.height }] as const] : [])
    if (resized.length) setResizingSizes((current) => ({ ...current, ...Object.fromEntries(resized) }))
    // resizing: false は角を離したときだけ届く（大きさの計測による通知には resizing が付かない）。
    const finished = changes.flatMap((change) => change.type === 'dimensions' && change.resizing === false && change.dimensions ? [[change.id, change.dimensions.width] as const] : [])
    for (const [id, width] of finished) onResizeScreen?.(id, Math.round(width / scale))
    if (finished.length) setResizingSizes({})
  }
  const handleDragStop = (_event: unknown, _node: CanvasNode, dragged: CanvasNode[]) => {
    const updates = Object.fromEntries(dragged.flatMap((node) => node.type === 'screen' ? [[node.id, node.position] as const] : groupMove(node.id, node.position)).map(([id, position]) => [id, { x: Math.round(position.x / scale), y: Math.round(position.y / scale) }]))
    if (Object.keys(updates).length) onMoveScreens?.(updates)
    setDragPositions({})
  }

  return <div className="ad-sm-canvas">
    <ReactFlow<CanvasNode, Edge<TransitionEdgeData, 'transition'>>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={handleNodesChange}
      onNodeDragStop={handleDragStop}
      // グループの囲みは選べない（選ぶと手前に出て、中の画面を押せなくなるため）。囲みを押したときは、何もない場所と同じく選択を解除する。
      onNodeClick={(_event, node) => onSelect(node.type === 'screen' ? { kind: 'screen', id: node.id } : null)}
      onNodeDoubleClick={(_event, node) => { if (node.type === 'screen') onOpenImage?.(node.id) }}
      onEdgeClick={(_event, edge) => onSelect({ kind: 'transition', id: edge.id })}
      onPaneClick={() => onSelect(null)}
      onConnect={(connection) => { if (connection.source && connection.target) onConnectScreens?.(connection.source, connection.target) }}
      onDelete={({ nodes: removedNodes, edges: removedEdges }) => onDeleteElements?.(removedNodes.filter((node) => node.type === 'screen').map((node) => node.id), removedEdges.map((edge) => edge.id))}
      nodesDraggable={editable}
      nodesConnectable={editable}
      connectionMode={ConnectionMode.Loose}
      connectOnClick={editable}
      deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
      zoomOnDoubleClick={false}
      minZoom={0.2}
      maxZoom={2}
      fitView
      fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
      attributionPosition="top-right"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
      <Controls position="bottom-left" showInteractive={false} />
      {(() => {
        const minimap = <MiniMap position="bottom-right" className={minimapTarget ? 'ad-sm-minimap-docked' : undefined} pannable zoomable nodeColor={(node) => node.type === 'screen' ? (node.data as ScreenNodeData).color : 'transparent'} nodeStrokeWidth={0} />
        return minimapTarget ? createPortal(minimap, minimapTarget) : minimap
      })()}
    </ReactFlow>
  </div>
}

export default ScreenMapCanvas
