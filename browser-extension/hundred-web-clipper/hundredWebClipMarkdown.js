/**
 * 概要:
 * 記事の本文（HTMLの要素）をMarkdownに変える。
 *
 * 対応する要素：見出し、段落、改行、太字・斜体・コード、リンク、画像、箇条書き（入れ子も）、番号付きリスト、表、整形済みテキスト、引用、区切り線、図とキャプション。
 * それ以外の要素は中身だけを残す。画像はonImageでパス（またはURL）に置き換える。
 */
const blockTags = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE', 'UL'])
const collapse = (text) => text.replace(/\s+/g, ' ')
const isBlock = (node) => node.nodeType === 1 && blockTags.has(node.tagName)
const hasBlockChild = (node) => [...node.childNodes].some((child) => isBlock(child) || (child.nodeType === 1 && child.tagName === 'IMG' && node.tagName !== 'P' && node.tagName !== 'A'))
const escapeText = (text) => text.replace(/([\\`*_[\]])/g, '\\$1')
const tableCell = (text) => text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim()

function imageMarkdown(element, onImage) {
  const src = element.getAttribute('src') ?? ''
  if (!src || src.startsWith('data:')) return ''
  const alt = collapse(element.getAttribute('alt') ?? '').trim()
  return `![${alt.replace(/[[\]]/g, '')}](${onImage(src, alt)})`
}

function inline(node, onImage) {
  let result = ''
  for (const child of node.childNodes) {
    if (child.nodeType === 3) { result += escapeText(collapse(child.textContent)); continue }
    if (child.nodeType !== 1) continue
    const tag = child.tagName
    if (tag === 'BR') { result += '  \n'; continue }
    if (tag === 'IMG') { result += imageMarkdown(child, onImage); continue }
    const content = inline(child, onImage)
    if (tag === 'STRONG' || tag === 'B') result += content.trim() ? `**${content.trim()}**` : content
    else if (tag === 'EM' || tag === 'I') result += content.trim() ? `*${content.trim()}*` : content
    else if (tag === 'CODE' || tag === 'KBD') result += content.trim() ? `\`${child.textContent.trim()}\`` : ''
    else if (tag === 'A') {
      const href = child.getAttribute('href') ?? ''
      result += href && !href.startsWith('javascript:') && content.trim() && !content.trim().startsWith('![') ? `[${content.trim()}](${href})` : content
    } else result += content
  }
  return result
}

// 改行（br）を表す行末の空白2つは残し、それ以外の連続した空白は1つにする。
const tidy = (text) => text.replace(/[ \t]+\n/g, (match) => match.endsWith('  \n') ? '  \n' : '\n').replace(/ {2,}(?!\n)/g, ' ').trim()

// 入れ子のリストは、親の行頭の記号（「- 」や「1. 」）の幅だけ字下げする（Markdownで入れ子として読まれるため）。
function list(node, onImage, indent) {
  const ordered = node.tagName === 'OL'
  const lines = []
  let number = Number(node.getAttribute('start') ?? 1) || 1
  for (const item of node.children) {
    if (item.tagName !== 'LI') continue
    const nested = [...item.children].filter((child) => child.tagName === 'UL' || child.tagName === 'OL')
    const ownContent = item.cloneNode(true)
    ownContent.querySelectorAll(':scope > ul, :scope > ol').forEach((child) => child.remove())
    const text = hasBlockChild(ownContent) ? blocks(ownContent, onImage).join(' ') : tidy(inline(ownContent, onImage))
    const marker = ordered ? `${number}.` : '-'
    lines.push(`${indent}${marker} ${text.replace(/\n/g, ' ')}`)
    number += 1
    for (const child of nested) lines.push(list(child, onImage, `${indent}${' '.repeat(marker.length + 1)}`))
  }
  return lines.join('\n')
}

function table(node, onImage) {
  const rows = [...node.querySelectorAll('tr')].map((row) => [...row.children].filter((cell) => cell.tagName === 'TD' || cell.tagName === 'TH').map((cell) => tableCell(tidy(inline(cell, onImage)))))
  const width = Math.max(0, ...rows.map((row) => row.length))
  if (!width) return ''
  const line = (cells) => `| ${Array.from({ length: width }, (_, index) => cells[index] ?? '').join(' | ')} |`
  return [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n')
}

function block(node, onImage) {
  const tag = node.tagName
  if (/^H[1-6]$/.test(tag)) { const text = tidy(inline(node, onImage)).replace(/\n/g, ' '); return text ? [`${'#'.repeat(Number(tag[1]))} ${text}`] : [] }
  if (tag === 'UL' || tag === 'OL') { const text = list(node, onImage, ''); return text ? [text] : [] }
  if (tag === 'TABLE') { const text = table(node, onImage); return text ? [text] : [] }
  if (tag === 'PRE') return [`\`\`\`\n${node.textContent.replace(/\n$/, '')}\n\`\`\``]
  if (tag === 'HR') return ['---']
  if (tag === 'IMG') { const text = imageMarkdown(node, onImage); return text ? [text] : [] }
  if (tag === 'BLOCKQUOTE') { const inner = blocks(node, onImage).join('\n\n'); return inner ? [inner.split('\n').map((line) => `> ${line}`).join('\n')] : [] }
  if (tag === 'FIGCAPTION') { const text = tidy(inline(node, onImage)); return text ? [`*${text}*`] : [] }
  if (hasBlockChild(node)) return blocks(node, onImage)
  const text = tidy(inline(node, onImage))
  return text ? [text] : []
}

function blocks(node, onImage) {
  const result = []
  let pending = ''
  const flush = () => { const text = tidy(pending); if (text) result.push(text); pending = '' }
  for (const child of node.childNodes) {
    if (child.nodeType === 1 && (isBlock(child) || child.tagName === 'IMG')) { flush(); result.push(...block(child, onImage)) }
    else if (child.nodeType === 1) pending += inline({ childNodes: [child] }, onImage)
    else if (child.nodeType === 3) pending += escapeText(collapse(child.textContent))
  }
  flush()
  return result
}

/** 要素をMarkdownにする。onImage(src, alt) は、Markdownに書く画像のパスかURLを返す。 */
export function htmlToMarkdown(root, onImage) {
  return `${blocks(root, onImage).join('\n\n').replace(/\n{3,}/g, '\n\n')}\n`
}
