const text = (value, max = 4000) => String(value ?? '').trim().slice(0, max)
export const CONTENT_SCHEMAS = {
  report: '{"title":"标题","sections":[{"heading":"小节","body":"Markdown 正文","evidenceIds":["真实ID"]}]}',
  mindmap: '{"title":"标题","nodes":[{"id":"n1","parentId":"","label":"中心主题","body":"解释","evidenceIds":["真实ID"]},{"id":"n2","parentId":"n1","label":"子概念","body":"解释","evidenceIds":["真实ID"]}]}',
  table: '{"title":"标题","columns":["字段1","字段2"],"rows":[{"cells":["值1","值2"],"evidenceIds":["真实ID"]}]}',
  slides: '{"title":"标题","slides":[{"heading":"一句结论","bullets":["要点1","要点2"],"notes":"讲解稿","evidenceIds":["真实ID"]}]}',
  audio: '{"title":"标题","segments":[{"speaker":"A","text":"讲解内容","evidenceIds":["真实ID"]},{"speaker":"B","text":"问题或补充","evidenceIds":["真实ID"]}]}',
  video: '{"title":"标题","scenes":[{"heading":"一句结论","bullets":["简短要点"],"narration":"配音稿","evidenceIds":["真实ID"]}]}',
}
export function contentItems(content) {
  return content?.questions ?? content?.cards ?? content?.sections ?? content?.nodes ?? content?.rows ?? content?.slides ?? content?.segments ?? content?.scenes ?? []
}
export function validateContent(kind, raw, evidence) {
  const source = text(raw, 150000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(source)
  const allowed = new Set(evidence.map(item => item.evidenceId))
  const key = { report:'sections', mindmap:'nodes', table:'rows', slides:'slides', audio:'segments', video:'scenes' }[kind]
  if (!key || !Array.isArray(parsed[key]) || !parsed[key].length) throw new Error('模型未返回有效成果内容')
  const columns = kind === 'table' ? (parsed.columns ?? []).map(value => text(value, 80)).slice(0, 16) : undefined
  if (kind === 'table' && !columns?.length) throw new Error('数据表缺少字段')
  const items = parsed[key].slice(0, kind === 'table' ? 200 : 30).map((item, index) => {
    const evidenceIds = [...new Set((item.evidenceIds ?? []).filter(id => allowed.has(id)))]
    if (!evidenceIds.length) throw new Error(`第 ${index + 1} 项缺少有效来源，未保存为成功成果`)
    const common = { id: kind === 'mindmap' ? text(item.id, 60) : `item${index + 1}`, evidenceIds }
    if (kind === 'table') {
      if (!Array.isArray(item.cells) || item.cells.length !== columns.length) throw new Error('数据表行与字段数量不一致')
      return { ...common, cells: item.cells.map(value => text(value, 1500)) }
    }
    if (kind === 'report') return { ...common, heading:text(item.heading, 150), body:text(item.body, 12000) }
    if (kind === 'mindmap') return { ...common, parentId:text(item.parentId,60), label:text(item.label,100), body:text(item.body) }
    if (kind === 'audio') return { ...common, speaker:item.speaker === 'B' ? 'B' : 'A', text:text(item.text, 1800) }
    return { ...common, heading:text(item.heading,80), bullets:(item.bullets ?? []).map(value => text(value,100)).slice(0,4), notes:text(item.notes), narration:text(item.narration,1500) }
  })
  if (items.some(item => !text(item.body || item.text || item.label || item.heading || item.cells?.join('')))) throw new Error('成果存在空白内容')
  if (kind === 'mindmap') {
    const ids = new Set(items.map(item => item.id))
    if (ids.size !== items.length || ids.has('')) throw new Error('思维导图节点标识无效')
    for (const item of items) {
      const seen = new Set([item.id]); let parent = item.parentId
      while (parent) {
        if (!ids.has(parent) || seen.has(parent)) throw new Error('思维导图存在循环或未知父节点')
        seen.add(parent); parent = items.find(node => node.id === parent).parentId
      }
    }
  }
  return { title:text(parsed.title,150) || 'Studio 成果', ...(columns ? { columns } : {}), [key]:items }
}

export function contentMarkdown(artifact) {
  const content = artifact.content
  const cite = item => (item.evidenceIds ?? []).map(id => {
    const source = artifact.citations.find(c => c.evidenceId === id)
    return source ? `${source.path} (${source.locator === 'page' ? 'P'+source.pageStart : 'L'+source.lineStart})` : id
  }).join('；')
  if(artifact.kind==='table') {
    const cell=value=>String(value).replaceAll('|','\\|').replaceAll('\n',' ')
    const columns=[...content.columns,'来源']
    return `# ${artifact.title}\n\n| ${columns.map(cell).join(' | ')} |\n| ${columns.map(()=> '---').join(' | ')} |\n`+content.rows.map(row=>`| ${[...row.cells,cite(row)].map(cell).join(' | ')} |`).join('\n')
  }
  return `# ${artifact.title}\n\n` + contentItems(content).map(item => {
    const body = item.question ? `${item.options.map((option,index)=>String.fromCharCode(65+index)+'. '+option).join('\n')}\n\n答案：${String.fromCharCode(65+item.correctIndex)}\n${item.explanation}` : item.body || item.text || item.narration || item.back || item.explanation || item.cells?.join(' | ') || item.notes || ''
    return `## ${item.heading ?? item.label ?? item.question ?? item.front ?? item.speaker ?? item.id}\n\n${item.bullets?.map(b => '- '+b).join('\n') ?? ''}\n${body}\n\n来源：${cite(item)}`
  }).join('\n\n')
}
