import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react'
import { AI_DESKTOP_MESSAGES } from './aiDesktopMessages'
import { confirmAIDesktop } from './aiDesktopConfirmBus'
import { showAIDesktopNotification } from './aiDesktopNotificationBus'
import ScreenMapAddDialog, { type ScreenMapScreenFields } from './ScreenMapAddDialog'
import ScreenMapImageLightbox from './ScreenMapImageLightbox'
import ScreenMapViewSettings from './ScreenMapViewSettings'
import { imageFileFrom, newScreenMapId, readScreenMapLabelMode, saveScreenMapLabelMode, SCREEN_MAP_LIMITS, SCREEN_MAP_NODE_SCALE, screenMapGroupColor, type ScreenMapData, type ScreenMapGroup, type ScreenMapImage, type ScreenMapPosition, type ScreenMapScreen, type ScreenMapSelection, type ScreenMapTransition } from './screenMap'
import { positionForNewScreen, resolvedPositions } from './screenMapLayout'

const ScreenMapCanvas = lazy(() => import('./ScreenMapCanvas'))

/**
 * 概要:
 * Screen Mapの編集画面（PC向け）。キャンバスで画面を配置・接続し、右のパネルで画面・遷移・グループの情報を編集する。
 *
 * 画面の追加は「＋ 画面を追加」のほか、スクリーンショットの貼り付けやドロップでも始められる。
 * 変更は呼び出し側へ渡すだけで、保存はカテゴリ編集の「DBへ保存」で行う。
 *
 * 「元に戻す」「やり直す」は、この画面で行った変更だけが対象。JSONの読み込みなど、外から内容が変わったときはさかのぼらない。
 * 文字の入力は、同じ項目への続けての入力を1回分にまとめる。
 */

type DialogState = { mode: 'create'; file: File | null } | { mode: 'replace'; screenId: string } | null
type History = { past: ScreenMapData[]; future: ScreenMapData[]; current: ScreenMapData | null; key: string | null; at: number }
const historyLimit = 50
const typingMergeMilliseconds = 1_000

const isTextInput = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

function ScreenMapEditor({ data, imageFolder, fill = false, onChange }: { data: ScreenMapData; imageFolder: string; fill?: boolean; onChange: (data: ScreenMapData) => void }) {
  const [selection, setSelection] = useState<ScreenMapSelection | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [lightboxScreenId, setLightboxScreenId] = useState<string | null>(null)
  const [labelMode, setLabelMode] = useState(readScreenMapLabelMode)
  // ミニマップは、キャンバスを広く使えるよう左のグループ一覧の下に表示する。
  const [minimapSlot, setMinimapSlot] = useState<HTMLDivElement | null>(null)
  const [history, setHistory] = useState<History>({ past: [], future: [], current: null, key: null, at: 0 })
  const tracked = history.current === data
  const canUndo = tracked && history.past.length > 0
  const canRedo = tracked && history.future.length > 0
  const commit = (next: ScreenMapData, key?: string) => {
    const now = Date.now()
    const merge = tracked && key !== undefined && history.key === key && now - history.at < typingMergeMilliseconds
    setHistory({ past: merge ? history.past : [...(tracked ? history.past : []), data].slice(-historyLimit), future: [], current: next, key: key ?? null, at: now })
    onChange(next)
  }
  const undo = () => {
    if (!canUndo) return
    const previous = history.past[history.past.length - 1]
    setHistory({ past: history.past.slice(0, -1), future: [data, ...history.future].slice(0, historyLimit), current: previous, key: null, at: 0 })
    onChange(previous)
  }
  const redo = () => {
    if (!canRedo) return
    const [next, ...rest] = history.future
    setHistory({ past: [...history.past, data].slice(-historyLimit), future: rest, current: next, key: null, at: 0 })
    onChange(next)
  }
  const selectedScreen = selection?.kind === 'screen' ? data.screens.find((screen) => screen.id === selection.id) ?? null : null
  const selectedTransition = selection?.kind === 'transition' ? data.transitions.find((transition) => transition.id === selection.id) ?? null : null
  const selectedGroup = selection?.kind === 'group' ? data.groups.find((group) => group.id === selection.id) ?? null : null
  const names = new Map(data.screens.map((screen) => [screen.id, screen.name || '名称未設定']))

  const openCreate = (file: File | null) => {
    if (data.screens.length >= SCREEN_MAP_LIMITS.screens) { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.content.screenMapLimit('画面', SCREEN_MAP_LIMITS.screens)); return }
    setDialog({ mode: 'create', file })
  }
  // スクリーンショットを貼り付けると、そのまま画面の追加を始める。⌘Z・⇧⌘Z（Ctrl+Z・Ctrl+Y）で元に戻す・やり直す。
  // 入力欄での貼り付けと元に戻すは、入力欄そのものの動きを優先する。
  useEffect(() => {
    if (dialog) return
    const paste = (event: ClipboardEvent) => {
      if (isTextInput(event.target)) return
      const file = imageFileFrom(event.clipboardData?.files)
      if (!file) return
      event.preventDefault()
      openCreate(file)
    }
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || isTextInput(event.target)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo() }
      else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); redo() }
    }
    window.addEventListener('paste', paste)
    window.addEventListener('keydown', shortcut)
    return () => { window.removeEventListener('paste', paste); window.removeEventListener('keydown', shortcut) }
  })

  const updateScreen = (id: string, patch: Partial<ScreenMapScreen>) => commit({ ...data, screens: data.screens.map((screen) => {
    if (screen.id !== id) return screen
    const next = { ...screen, ...patch }
    if (!next.groupId) delete next.groupId
    if (!next.stateOf) delete next.stateOf
    return next
  }) }, `screen:${id}:${Object.keys(patch).join(',')}`)
  const updateTransition = (id: string, patch: Partial<ScreenMapTransition>) => commit({ ...data, transitions: data.transitions.map((transition) => transition.id === id ? { ...transition, ...patch } : transition) }, `transition:${id}:${Object.keys(patch).join(',')}`)
  const updateGroup = (id: string, patch: Partial<ScreenMapGroup>) => commit({ ...data, groups: data.groups.map((group) => group.id === id ? { ...group, ...patch } : group) }, `group:${id}:${Object.keys(patch).join(',')}`)

  const addScreen = (image: ScreenMapImage, fields: ScreenMapScreenFields) => {
    const screen: ScreenMapScreen = { id: newScreenMapId('screen'), name: fields.name, url: fields.url, description: fields.description, images: [image], verification: 'confirmed', ...(fields.groupId ? { groupId: fields.groupId } : {}), ...(fields.stateOf ? { stateOf: fields.stateOf } : {}) }
    // 新しい画面は、選んでいる画面の右隣（なければ全体のいちばん右）に置く。座標のなかった画面も、今の位置で固定する。
    const position = positionForNewScreen(data, screen, selectedScreen?.id ?? null)
    commit({ ...data, screens: [...data.screens, screen], layout: { ...data.layout, screens: { ...layoutWith(resolvedPositions(data)), [screen.id]: position } } })
    setSelection({ kind: 'screen', id: screen.id })
  }
  const removeElements = (screenIds: string[], transitionIds: string[]) => {
    if (!screenIds.length && !transitionIds.length) return
    const removedScreens = new Set(screenIds)
    const removedTransitions = new Set(transitionIds)
    const layoutScreens = Object.fromEntries(Object.entries(data.layout.screens).filter(([id]) => !removedScreens.has(id)))
    commit({
      ...data,
      screens: data.screens.filter((screen) => !removedScreens.has(screen.id)).map((screen) => { if (!screen.stateOf || !removedScreens.has(screen.stateOf)) return screen; const next = { ...screen }; delete next.stateOf; return next }),
      transitions: data.transitions.filter((transition) => !removedTransitions.has(transition.id) && !removedScreens.has(transition.from) && !removedScreens.has(transition.to)),
      layout: { ...data.layout, screens: layoutScreens },
    })
    setSelection(null)
  }
  const confirmRemoveScreen = async (screen: ScreenMapScreen) => {
    if (await confirmAIDesktop({ title: `「${screen.name || '名称未設定'}」を削除しますか？`, message: 'この画面につながる遷移も削除されます。「DBへ保存」を押すまでは保存されません。', confirmLabel: '削除', tone: 'danger' })) removeElements([screen.id], [])
  }
  const addTransition = (from: string, to: string) => {
    if (from === to) return
    if (data.transitions.length >= SCREEN_MAP_LIMITS.transitions) { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.content.screenMapLimit('遷移', SCREEN_MAP_LIMITS.transitions)); return }
    const transition: ScreenMapTransition = { id: newScreenMapId('transition'), from, to, action: '', condition: '', verification: 'confirmed' }
    commit({ ...data, transitions: [...data.transitions, transition] })
    setSelection({ kind: 'transition', id: transition.id })
  }
  const addGroup = () => {
    if (data.groups.length >= SCREEN_MAP_LIMITS.groups) { showAIDesktopNotification('warning', AI_DESKTOP_MESSAGES.content.screenMapLimit('グループ', SCREEN_MAP_LIMITS.groups)); return }
    const group: ScreenMapGroup = { id: newScreenMapId('group'), name: '新しいグループ', description: '' }
    commit({ ...data, groups: [...data.groups, group] })
    setSelection({ kind: 'group', id: group.id })
  }
  const removeGroup = async (group: ScreenMapGroup) => {
    if (!(await confirmAIDesktop({ title: `グループ「${group.name || '名称未設定'}」を削除しますか？`, message: 'グループの画面は削除されず、「グループなし」になります。', confirmLabel: '削除', tone: 'danger' }))) return
    commit({ ...data, groups: data.groups.filter((candidate) => candidate.id !== group.id), screens: data.screens.map((screen) => { if (screen.groupId !== group.id) return screen; const next = { ...screen }; delete next.groupId; return next }), layout: { ...data.layout, groups: Object.fromEntries(Object.entries(data.layout.groups).filter(([id]) => id !== group.id)) } })
    setSelection(null)
  }
  // 位置を変えても、利用者が変えたカードの幅は残す。
  const layoutWith = (positions: Record<string, ScreenMapPosition>) => Object.fromEntries(Object.entries(positions).map(([id, position]) => [id, { ...position, ...(data.layout.screens[id]?.width ? { width: data.layout.screens[id].width } : {}) }]))
  const moveScreens = (updates: Record<string, ScreenMapPosition>) => commit({ ...data, layout: { ...data.layout, screens: layoutWith({ ...resolvedPositions(data), ...updates }) } })
  const resizeScreen = (id: string, width: number) => { const positions = resolvedPositions(data); commit({ ...data, layout: { ...data.layout, screens: { ...layoutWith(positions), [id]: { ...positions[id], width: Math.min(4_000, Math.max(40, width)) } } } }) }

  const ungroupedCount = data.screens.filter((screen) => !screen.groupId).length
  const incoming = selectedScreen ? data.transitions.filter((transition) => transition.to === selectedScreen.id) : []
  const outgoing = selectedScreen ? data.transitions.filter((transition) => transition.from === selectedScreen.id) : []
  const transitionLine = (transition: ScreenMapTransition, direction: 'in' | 'out') => <button type="button" key={transition.id} className={`ad-sm-panel-link ${transition.verification}`} onClick={() => setSelection({ kind: 'transition', id: transition.id })}>
    {direction === 'in' ? `${names.get(transition.from)} →` : `→ ${names.get(transition.to)}`}<span>{transition.action ? `「${transition.action}」` : '操作名なし'}</span>
  </button>
  const verificationSwitch = (value: ScreenMapScreen['verification'], onSet: (value: ScreenMapScreen['verification']) => void) => <div className="ad-sm-segmented" role="group" aria-label="確認状態">
    <button type="button" aria-pressed={value === 'confirmed'} className={value === 'confirmed' ? 'confirmed' : ''} onClick={() => onSet('confirmed')}>確認済み</button>
    <button type="button" aria-pressed={value === 'ai-inferred'} className={value === 'ai-inferred' ? 'ai-inferred' : ''} onClick={() => onSet('ai-inferred')}>AIの推測</button>
  </div>

  return <div className={`ad-sm-editor${fill ? ' ad-sm-editor--fill' : ''}`}>
    <div className="ad-sm-editor-toolbar">
      <button type="button" className="accent" onClick={() => openCreate(null)}>＋ 画面を追加</button>
      <div className="ad-sm-editor-history" role="group" aria-label="変更の取り消し">
        <button type="button" disabled={!canUndo} aria-keyshortcuts="Meta+Z Control+Z" title="元に戻す（⌘Z）" onClick={undo}>↶ 元に戻す</button>
        <button type="button" disabled={!canRedo} aria-keyshortcuts="Meta+Shift+Z Control+Y" title="やり直す（⇧⌘Z）" onClick={redo}>↷ やり直す</button>
      </div>
      <ScreenMapViewSettings labelMode={labelMode} onLabelMode={(value) => { setLabelMode(value); saveScreenMapLabelMode(value) }} />
      <span className="ad-sm-editor-hint">スクリーンショットは貼り付け（⌘V）やドロップでも追加できます。画面の丸をドラッグすると矢印をつなげ、選んだ画面の右下の角で大きさを変えられます。</span>
    </div>
    <div className="ad-sm-editor-grid">
      <aside className="ad-sm-editor-groups" aria-label="グループ">
        <p>グループ</p>
        {data.groups.map((group) => <button type="button" key={group.id} className={selection?.kind === 'group' && selection.id === group.id ? 'active' : ''} onClick={() => setSelection({ kind: 'group', id: group.id })}>
          <span><i style={{ background: screenMapGroupColor(data, group.id) } as CSSProperties} />{group.name || '名称未設定'}</span><small>{data.screens.filter((screen) => screen.groupId === group.id).length}</small>
        </button>)}
        {ungroupedCount > 0 && <span className="ad-sm-editor-ungrouped"><span><i />グループなし</span><small>{ungroupedCount}</small></span>}
        <button type="button" className="add" onClick={addGroup}>＋ グループを追加</button>
        <div ref={setMinimapSlot} className="ad-sm-minimap-slot" />
        <div className="ad-sm-legend">
          <span><i className="line" />確認済みの遷移</span>
          <span><i className="dashed" />AIの推測</span>
          <span><i className="state" />状態の画面</span>
        </div>
      </aside>
      <div className="ad-sm-editor-canvas" onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }} onDrop={(event) => { const file = imageFileFrom(event.dataTransfer.files); if (!file) return; event.preventDefault(); openCreate(file) }}>
        {data.screens.length === 0 ? <div className="ad-sm-editor-empty">
          <strong>最初の画面を追加しましょう</strong>
          <p>スクリーンショットを貼り付けるかドロップするか、「＋ 画面を追加」を押します。</p>
          <button type="button" className="accent" onClick={() => openCreate(null)}>＋ 画面を追加</button>
        </div> : <Suspense fallback={<p className="ad-sm-loading">キャンバスを読み込んでいます…</p>}>
          <ScreenMapCanvas data={data} mode="edit" selection={selection} labelMode={labelMode} scale={SCREEN_MAP_NODE_SCALE} onSelect={setSelection} onOpenImage={setLightboxScreenId} onMoveScreens={moveScreens} onResizeScreen={resizeScreen} onConnectScreens={addTransition} onDeleteElements={removeElements} minimapTarget={minimapSlot} />
        </Suspense>}
      </div>
      <aside className="ad-sm-panel" aria-label="詳細">
        {selectedScreen ? <>
          <h2>画面の詳細</h2>
          <button type="button" className="ad-sm-panel-image" aria-label="画像を拡大" onClick={() => setLightboxScreenId(selectedScreen.id)}>{selectedScreen.images[0] ? <img src={selectedScreen.images[0].thumbnailUrl ?? selectedScreen.images[0].url} alt="" /> : <span>画像なし</span>}</button>
          <div className="ad-sm-panel-row"><button type="button" onClick={() => setDialog({ mode: 'replace', screenId: selectedScreen.id })}>{selectedScreen.images.length ? '画像を差し替え' : '画像を追加'}</button>{selectedScreen.images[0] && <span className="ad-sm-panel-note">{selectedScreen.images[0].masked ? 'マスキング済み' : 'マスキングなし'}</span>}</div>
          <label><span>画面名</span><input value={selectedScreen.name} maxLength={100} onChange={(event) => updateScreen(selectedScreen.id, { name: event.target.value })} /></label>
          <label><span>URL</span><input value={selectedScreen.url} maxLength={2000} onChange={(event) => updateScreen(selectedScreen.id, { url: event.target.value })} /></label>
          <div className="ad-sm-panel-pair">
            <label><span>グループ</span><select value={selectedScreen.groupId ?? ''} onChange={(event) => updateScreen(selectedScreen.id, { groupId: event.target.value || undefined })}><option value="">グループなし</option>{data.groups.map((group) => <option key={group.id} value={group.id}>{group.name || '名称未設定'}</option>)}</select></label>
            <label><span>元の画面</span><select value={selectedScreen.stateOf ?? ''} onChange={(event) => updateScreen(selectedScreen.id, { stateOf: event.target.value || undefined })}><option value="">なし</option>{data.screens.filter((screen) => screen.id !== selectedScreen.id).map((screen) => <option key={screen.id} value={screen.id}>{screen.name || '名称未設定'}</option>)}</select></label>
          </div>
          <label><span>説明</span><textarea value={selectedScreen.description} maxLength={5000} onChange={(event) => updateScreen(selectedScreen.id, { description: event.target.value })} /></label>
          <div className="ad-sm-panel-field"><span>確認状態</span>{verificationSwitch(selectedScreen.verification, (verification) => updateScreen(selectedScreen.id, { verification }))}</div>
          <section className="ad-sm-panel-section">
            <h3>この画面への遷移</h3>
            {incoming.length ? incoming.map((transition) => transitionLine(transition, 'in')) : <p>まだありません。</p>}
            <h3>この画面からの遷移</h3>
            {outgoing.length ? outgoing.map((transition) => transitionLine(transition, 'out')) : <p>まだありません。</p>}
            <label><span>遷移を追加</span><select value="" onChange={(event) => { if (event.target.value) addTransition(selectedScreen.id, event.target.value) }}><option value="">遷移先の画面を選ぶ</option>{data.screens.filter((screen) => screen.id !== selectedScreen.id).map((screen) => <option key={screen.id} value={screen.id}>{screen.name || '名称未設定'}</option>)}</select></label>
          </section>
          <button type="button" className="danger" onClick={() => void confirmRemoveScreen(selectedScreen)}>この画面を削除</button>
        </> : selectedTransition ? <>
          <h2>遷移の詳細</h2>
          <div className="ad-sm-panel-pair">
            <label><span>遷移元</span><select value={selectedTransition.from} onChange={(event) => updateTransition(selectedTransition.id, { from: event.target.value })}>{data.screens.map((screen) => <option key={screen.id} value={screen.id}>{screen.name || '名称未設定'}</option>)}</select></label>
            <label><span>遷移先</span><select value={selectedTransition.to} onChange={(event) => updateTransition(selectedTransition.id, { to: event.target.value })}>{data.screens.map((screen) => <option key={screen.id} value={screen.id}>{screen.name || '名称未設定'}</option>)}</select></label>
          </div>
          <label><span>操作</span><input value={selectedTransition.action} maxLength={200} placeholder="例：友だち名をタップ" onChange={(event) => updateTransition(selectedTransition.id, { action: event.target.value })} /></label>
          <label><span>条件</span><input value={selectedTransition.condition} maxLength={1000} placeholder="例：サインインしている" onChange={(event) => updateTransition(selectedTransition.id, { condition: event.target.value })} /></label>
          <div className="ad-sm-panel-field"><span>確認状態</span>{verificationSwitch(selectedTransition.verification, (verification) => updateTransition(selectedTransition.id, { verification }))}</div>
          <button type="button" className="danger" onClick={() => removeElements([], [selectedTransition.id])}>この遷移を削除</button>
        </> : selectedGroup ? <>
          <h2>グループの詳細</h2>
          <label><span>グループ名</span><input value={selectedGroup.name} maxLength={100} onChange={(event) => updateGroup(selectedGroup.id, { name: event.target.value })} /></label>
          <label><span>説明</span><textarea value={selectedGroup.description} maxLength={2000} onChange={(event) => updateGroup(selectedGroup.id, { description: event.target.value })} /></label>
          <p className="ad-sm-panel-note">画面のグループは、画面の詳細で変更できます。</p>
          <button type="button" className="danger" onClick={() => void removeGroup(selectedGroup)}>このグループを削除</button>
        </> : <div className="ad-sm-panel-empty">
          <h2>詳細</h2>
          <p>画面や矢印を選ぶと、ここで編集できます。グループは左の一覧から選びます。</p>
          <p>画面の数：{data.screens.length}／遷移の数：{data.transitions.length}</p>
        </div>}
      </aside>
    </div>
    {dialog && <ScreenMapAddDialog
      mode={dialog.mode}
      data={data}
      initialFile={dialog.mode === 'create' ? dialog.file : null}
      defaultGroupId={selection?.kind === 'group' ? selection.id : selectedScreen?.groupId}
      targetName={dialog.mode === 'replace' ? names.get(dialog.screenId) : undefined}
      imageFolder={imageFolder}
      onCancel={() => setDialog(null)}
      onSubmit={(image, fields) => {
        if (dialog.mode === 'replace') updateScreen(dialog.screenId, { images: [image] })
        else if (fields) addScreen(image, fields)
        setDialog(null)
      }}
    />}
    {lightboxScreenId && <ScreenMapImageLightbox data={data} screenId={lightboxScreenId} onNavigate={(screenId) => { setLightboxScreenId(screenId); setSelection({ kind: 'screen', id: screenId }) }} onClose={() => setLightboxScreenId(null)} />}
  </div>
}

export default ScreenMapEditor
