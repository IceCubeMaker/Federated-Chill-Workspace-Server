import React, { useState, useRef, useCallback } from 'react'
import type { PeerIdStr, UserProfile } from '@federation/models'
import { color, space, fontSize, radius, fontWeight } from '../../tokens/index.js'
import { Avatar } from '../Avatar.js'

const MENTION_TRIGGER = /@([\w.-]*)$/

export interface MessageInputProps {
  onSend: (content: string, mentions: PeerIdStr[]) => Promise<void>
  members: Map<PeerIdStr, UserProfile>
  disabled?: boolean
  disabledReason?: string
  placeholder?: string
}

export function MessageInput({ onSend, members, disabled, disabledReason, placeholder }: MessageInputProps) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const [suggestions, setSuggestions] = useState<UserProfile[]>([])
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const extractMentions = (text: string): PeerIdStr[] => {
    const found = new Set<PeerIdStr>()
    const re = /@([\w.-]+)/g
    let m: RegExpExecArray | null
    const nameMap = new Map<string, PeerIdStr>()
    for (const [id, p] of members) nameMap.set(p.displayName.toLowerCase(), id)
    while ((m = re.exec(text)) !== null) {
      const hit = nameMap.get(m[1].toLowerCase())
      if (hit) found.add(hit)
    }
    return Array.from(found)
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setValue(text)

    // Check for @mention trigger at caret position
    const pos = e.target.selectionStart ?? text.length
    const before = text.slice(0, pos)
    const match = MENTION_TRIGGER.exec(before)
    if (match) {
      const partial = match[1].toLowerCase()
      const hits = Array.from(members.values())
        .filter((p) => p.displayName.toLowerCase().startsWith(partial))
        .slice(0, 6)
      setSuggestions(hits)
      setSuggestionIndex(0)
    } else {
      setSuggestions([])
    }
  }

  const insertMention = useCallback((profile: UserProfile) => {
    const ta = textareaRef.current
    if (!ta) return
    const pos = ta.selectionStart ?? value.length
    const before = value.slice(0, pos)
    const after = value.slice(pos)
    const match = MENTION_TRIGGER.exec(before)
    const prefix = match ? before.slice(0, before.length - match[0].length) : before
    const newValue = `${prefix}@${profile.displayName} ${after}`
    setValue(newValue)
    setSuggestions([])
    // Restore focus
    setTimeout(() => {
      ta.focus()
      const newPos = prefix.length + profile.displayName.length + 2
      ta.setSelectionRange(newPos, newPos)
    }, 0)
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestionIndex((i) => (i + 1) % suggestions.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestionIndex((i) => (i - 1 + suggestions.length) % suggestions.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(suggestions[suggestionIndex]); return }
      if (e.key === 'Escape') { setSuggestions([]); return }
    }

    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = async () => {
    const content = value.trim()
    if (!content || sending || disabled) return
    setSending(true)
    try {
      const mentions = extractMentions(content)
      await onSend(content, mentions)
      setValue('')
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <div style={{ padding: `${space[2]} ${space[3]} ${space[3]}`, position: 'relative' }}>
      {/* @mention autocomplete */}
      {suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: space[3],
          right: space[3],
          marginBottom: space[1],
          background: color.surface2,
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
          overflow: 'hidden',
          zIndex: 100,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.3)',
        }}>
          <div style={{ padding: `${space[1]} ${space[3]}`, fontSize: fontSize.xs, color: color.textMuted }}>
            Mention a member
          </div>
          {suggestions.map((p, i) => (
            <button
              key={p.userId}
              onMouseDown={(e) => { e.preventDefault(); insertMention(p) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: space[2],
                padding: `${space[2]} ${space[3]}`,
                width: '100%',
                background: i === suggestionIndex ? color.surface3 : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                color: color.textPrimary,
                fontSize: fontSize.sm,
              }}
            >
              <Avatar name={p.displayName} size={20} />
              <span style={{ fontWeight: fontWeight.medium }}>{p.displayName}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: space[2],
        background: color.surface2,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: `${space[2]} ${space[2]} ${space[2]} ${space[3]}`,
        opacity: disabled ? 0.6 : 1,
      }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || sending}
          placeholder={disabled ? (disabledReason ?? 'No permission to send messages') : (placeholder ?? (isMobile ? 'Message…' : 'Message… (Ctrl+Enter to send, @ to mention)'))}
          rows={1}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: color.textPrimary,
            fontSize: fontSize.md,
            lineHeight: 1.5,
            resize: 'none',
            minHeight: 24,
            maxHeight: 120,
            overflowY: 'auto',
            fontFamily: 'inherit',
          }}
          onInput={(e) => {
            const t = e.target as HTMLTextAreaElement
            t.style.height = 'auto'
            t.style.height = `${Math.min(t.scrollHeight, 120)}px`
          }}
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || sending || disabled}
          style={{
            background: value.trim() && !disabled ? color.brandPrimary : color.surface3,
            border: 'none',
            borderRadius: radius.md,
            color: '#fff',
            cursor: value.trim() && !disabled ? 'pointer' : 'not-allowed',
            fontSize: isMobile ? fontSize.md : fontSize.sm,
            fontWeight: fontWeight.semibold,
            minWidth: 44,
            minHeight: 44,
            padding: `${space[1]} ${space[3]}`,
            flexShrink: 0,
            transition: 'background 150ms ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {sending ? '…' : '↑'}
        </button>
      </div>
      {!isMobile && (
        <p style={{ fontSize: 10, color: color.textMuted, margin: `${space[1]} 0 0`, paddingLeft: space[1] }}>
          Markdown supported · Ctrl+Enter to send
        </p>
      )}
    </div>
  )
}
