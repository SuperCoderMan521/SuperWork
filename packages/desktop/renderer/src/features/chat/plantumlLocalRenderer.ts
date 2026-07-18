type ParticipantKind =
  | 'actor'
  | 'participant'
  | 'database'
  | 'queue'
  | 'boundary'
  | 'control'
  | 'entity'

type Participant = {
  id: string
  label: string
  kind: ParticipantKind
}

type PlantUmlEvent =
  | { type: 'section'; label: string }
  | { type: 'message'; from: string; to: string; label: string; dashed: boolean }
  | { type: 'note'; target: string | null; side: 'left' | 'right' | 'over'; label: string }
  | { type: 'group'; label: string; level: number; variant: 'alt' | 'else' | 'group' }

const PARTICIPANT_SPACING = 156
const LEFT_PADDING = 76
const TOP_PADDING = 30
const LIFELINE_TOP = 116

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeSource(content: string): string {
  return content
    .replace(/^\s*@start[a-z]*\s*/i, '')
    .replace(/\s*@end[a-z]*\s*$/i, '')
}

function cleanLabel(value: string): string {
  return value
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
}

function approxTextWidth(value: string): number {
  let width = 0
  for (const char of value) width += char.charCodeAt(0) > 255 ? 13 : 7
  return width
}

function wrapText(value: string, maxChars = 26): string[] {
  const explicit = cleanLabel(value).split(/\n/)
  const lines: string[] = []
  for (const part of explicit) {
    let current = ''
    for (const char of part) {
      current += char
      if (current.length >= maxChars) {
        lines.push(current)
        current = ''
      }
    }
    if (current || part === '') lines.push(current)
  }
  return lines.length > 0 ? lines : ['']
}

function parseParticipant(line: string): Participant | null {
  const match =
    /^(actor|participant|database|queue|boundary|control|entity)\s+(.+?)(?:\s+as\s+([A-Za-z_][\w-]*))?$/i.exec(
      line,
    )
  if (!match) return null
  const kind = (match[1]?.toLowerCase() ?? 'participant') as ParticipantKind
  const rawLabel = match[2] ?? ''
  const alias = match[3]
  const label = cleanLabel(rawLabel.replace(/\s+as\s+[A-Za-z_][\w-]*$/i, ''))
  return {
    id: alias ?? label.replace(/\W+/g, '_'),
    label,
    kind,
  }
}

function parsePlantUml(content: string): {
  title: string | null
  participants: Participant[]
  events: PlantUmlEvent[]
} {
  const participants = new Map<string, Participant>()
  const events: PlantUmlEvent[] = []
  let title: string | null = null
  let groupLevel = 0
  let lastMessageTarget: string | null = null

  const ensureParticipant = (id: string) => {
    if (participants.has(id)) return
    participants.set(id, { id, label: id, kind: 'participant' })
  }

  for (const rawLine of normalizeSource(content).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("'") || /^skinparam\b/i.test(line)) continue
    if (/^@/i.test(line)) continue

    const titleMatch = /^title\s+(.+)$/i.exec(line)
    if (titleMatch) {
      title = cleanLabel(titleMatch[1] ?? '')
      continue
    }

    const participant = parseParticipant(line)
    if (participant) {
      participants.set(participant.id, participant)
      continue
    }

    const section = /^==\s*(.*?)\s*==$/.exec(line)
    if (section) {
      events.push({ type: 'section', label: cleanLabel(section[1] ?? '') })
      continue
    }

    const group = /^(alt|group|loop|opt|par|critical|break)\s*(.*)$/i.exec(line)
    if (group) {
      events.push({
        type: 'group',
        label: cleanLabel(group[2] || group[1] || 'group'),
        level: groupLevel,
        variant: group[1]?.toLowerCase() === 'alt' ? 'alt' : 'group',
      })
      groupLevel += 1
      continue
    }

    const elseGroup = /^else\s*(.*)$/i.exec(line)
    if (elseGroup) {
      events.push({
        type: 'group',
        label: cleanLabel(elseGroup[1] || 'else'),
        level: Math.max(0, groupLevel - 1),
        variant: 'else',
      })
      continue
    }

    if (/^end$/i.test(line)) {
      groupLevel = Math.max(0, groupLevel - 1)
      continue
    }

    const note =
      /^note\s+(over|right|left)(?:\s+of)?(?:\s+([^:]+))?:\s*(.+)$/i.exec(line)
    if (note) {
      const side = (note[1]?.toLowerCase() ?? 'over') as 'left' | 'right' | 'over'
      const target = cleanLabel(note[2] ?? '').split(/\s*,\s*/)[0] || lastMessageTarget
      if (target) ensureParticipant(target)
      events.push({
        type: 'note',
        target,
        side,
        label: cleanLabel(note[3] ?? ''),
      })
      continue
    }

    const message =
      /^([A-Za-z_][\w-]*)\s*([-.]+>|<-[-.]+)\s*([A-Za-z_][\w-]*)\s*:\s*(.+)$/.exec(
        line,
      )
    if (message) {
      const from = message[1] ?? ''
      const arrow = message[2] ?? '->'
      const to = message[3] ?? ''
      ensureParticipant(from)
      ensureParticipant(to)
      lastMessageTarget = to
      events.push({
        type: 'message',
        from,
        to,
        label: cleanLabel(message[4] ?? ''),
        dashed: arrow.includes('.'),
      })
    }
  }

  return { title, participants: [...participants.values()], events }
}

function textLinesSvg(lines: string[], x: number, y: number, options?: {
  anchor?: 'start' | 'middle'
  className?: string
  lineHeight?: number
}): string {
  const anchor = options?.anchor ?? 'middle'
  const lineHeight = options?.lineHeight ?? 16
  const className = options?.className ?? 'pu-text'
  return lines
    .map(
      (line, index) =>
        `<text class="${className}" x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}">${escapeXml(line)}</text>`,
    )
    .join('')
}

function participantShape(participant: Participant, x: number, y: number): string {
  const labelLines = wrapText(participant.label, 14)
  const width = Math.max(96, Math.max(...labelLines.map(approxTextWidth)) + 28)
  const height = Math.max(42, labelLines.length * 16 + 18)
  const left = x - width / 2
  if (participant.kind === 'actor') {
    return [
      `<circle class="pu-actor" cx="${x}" cy="${y + 9}" r="9"/>`,
      `<line class="pu-actor-line" x1="${x}" y1="${y + 18}" x2="${x}" y2="${y + 36}"/>`,
      `<line class="pu-actor-line" x1="${x - 16}" y1="${y + 25}" x2="${x + 16}" y2="${y + 25}"/>`,
      `<line class="pu-actor-line" x1="${x}" y1="${y + 36}" x2="${x - 14}" y2="${y + 54}"/>`,
      `<line class="pu-actor-line" x1="${x}" y1="${y + 36}" x2="${x + 14}" y2="${y + 54}"/>`,
      textLinesSvg(labelLines, x, y + 76, { className: 'pu-label' }),
    ].join('')
  }
  if (participant.kind === 'database') {
    return [
      `<path class="pu-box" d="M${left} ${y + 8} C${left} ${y - 6},${left + width} ${y - 6},${left + width} ${y + 8} L${left + width} ${y + height - 8} C${left + width} ${y + height + 6},${left} ${y + height + 6},${left} ${y + height - 8} Z"/>`,
      `<path class="pu-box-line" d="M${left} ${y + 8} C${left} ${y + 22},${left + width} ${y + 22},${left + width} ${y + 8}"/>`,
      textLinesSvg(labelLines, x, y + 28, { className: 'pu-label' }),
    ].join('')
  }
  return [
    `<rect class="pu-box" x="${left}" y="${y}" width="${width}" height="${height}" rx="8"/>`,
    textLinesSvg(labelLines, x, y + 25, { className: 'pu-label' }),
  ].join('')
}

export function renderPlantUmlToSvg(content: string): string {
  const parsed = parsePlantUml(content)
  const participants =
    parsed.participants.length > 0
      ? parsed.participants
      : [{ id: 'PlantUML', label: 'PlantUML', kind: 'participant' as const }]
  const xById = new Map(
    participants.map((participant, index) => [
      participant.id,
      LEFT_PADDING + index * PARTICIPANT_SPACING,
    ]),
  )
  const width = Math.max(760, LEFT_PADDING * 2 + (participants.length - 1) * PARTICIPANT_SPACING)
  let y = parsed.title ? TOP_PADDING + 54 : TOP_PADDING + 16
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" class="plantuml-local-svg" viewBox="0 0 ${width} 1000" role="img">`,
    '<style>',
    '.pu-bg{fill:#101113}.pu-box{fill:#1c1d20;stroke:#4a4d55;stroke-width:1.2}.pu-box-line,.pu-actor-line,.pu-actor{fill:none;stroke:#bfc1c6;stroke-width:1.4}.pu-life{stroke:#4a4d55;stroke-dasharray:5 6}.pu-message{stroke:#d9dade;stroke-width:1.4;marker-end:url(#arrow)}.pu-message-dashed{stroke-dasharray:5 5}.pu-text,.pu-label{fill:#e6e7e9;font:13px Inter,Arial,sans-serif}.pu-title{fill:#f1f1f2;font:700 18px Inter,Arial,sans-serif}.pu-section{fill:#252930;stroke:#5769f7;stroke-opacity:.55}.pu-note{fill:#332f22;stroke:#9b7d38}.pu-note-text{fill:#f0dfb6;font:12px Inter,Arial,sans-serif}.pu-group{fill:#1a1b1e;stroke:#555962}.pu-group-text{fill:#cdd2ff;font:12px Inter,Arial,sans-serif}',
    '</style>',
    '<defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#d9dade"/></marker></defs>',
    `<rect class="pu-bg" width="${width}" height="100%"/>`,
  ]

  if (parsed.title) {
    parts.push(textLinesSvg(wrapText(parsed.title, 44), width / 2, TOP_PADDING, {
      className: 'pu-title',
      lineHeight: 22,
    }))
  }

  for (const participant of participants) {
    const x = xById.get(participant.id) ?? LEFT_PADDING
    parts.push(participantShape(participant, x, y))
  }

  y = Math.max(LIFELINE_TOP, y + 94)
  const eventStartY = y

  for (const event of parsed.events) {
    if (event.type === 'section') {
      y += 14
      parts.push(`<rect class="pu-section" x="24" y="${y}" width="${width - 48}" height="28" rx="8"/>`)
      parts.push(textLinesSvg([event.label], width / 2, y + 19, { className: 'pu-label' }))
      y += 48
      continue
    }

    if (event.type === 'group') {
      const left = 34 + event.level * 16
      const label = `${event.variant === 'else' ? 'else' : event.variant} ${event.label}`
      parts.push(`<rect class="pu-group" x="${left}" y="${y}" width="${width - left - 34}" height="26" rx="6"/>`)
      parts.push(textLinesSvg([label], left + 12, y + 18, {
        anchor: 'start',
        className: 'pu-group-text',
      }))
      y += 36
      continue
    }

    if (event.type === 'note') {
      const lines = wrapText(event.label, 28)
      const boxWidth = Math.max(160, Math.max(...lines.map(approxTextWidth)) + 24)
      const boxHeight = lines.length * 16 + 20
      const targetX = event.target ? xById.get(event.target) ?? width / 2 : width / 2
      const left =
        event.side === 'right'
          ? Math.min(width - boxWidth - 24, targetX + 22)
          : event.side === 'left'
            ? Math.max(24, targetX - boxWidth - 22)
            : Math.max(24, Math.min(width - boxWidth - 24, targetX - boxWidth / 2))
      parts.push(`<rect class="pu-note" x="${left}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="6"/>`)
      parts.push(textLinesSvg(lines, left + 12, y + 22, {
        anchor: 'start',
        className: 'pu-note-text',
      }))
      y += boxHeight + 22
      continue
    }

    const fromX = xById.get(event.from) ?? LEFT_PADDING
    const toX = xById.get(event.to) ?? fromX + PARTICIPANT_SPACING
    const labelLines = wrapText(event.label, Math.max(16, Math.floor(Math.abs(toX - fromX) / 8)))
    const textY = y - 8
    parts.push(
      `<line class="pu-message${event.dashed ? ' pu-message-dashed' : ''}" x1="${fromX}" y1="${y}" x2="${toX}" y2="${y}"/>`,
    )
    parts.push(textLinesSvg(labelLines, (fromX + toX) / 2, textY, {
      className: 'pu-text',
      lineHeight: 15,
    }))
    y += Math.max(42, labelLines.length * 15 + 28)
  }

  const bottom = y + 40
  for (const participant of participants) {
    const x = xById.get(participant.id) ?? LEFT_PADDING
    parts.push(`<line class="pu-life" x1="${x}" y1="${eventStartY - 18}" x2="${x}" y2="${bottom}"/>`)
  }

  parts.push(`</svg>`)
  return parts.join('')
    .replace('viewBox="0 0 ' + width + ' 1000"', `viewBox="0 0 ${width} ${bottom + 20}"`)
}
