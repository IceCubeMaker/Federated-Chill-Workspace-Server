import React, { useState } from 'react'
import type { DocumentId, GroupDocument } from '@federation/models'
import { color, space, radius, fontSize, fontWeight } from '../../tokens/index.js'
import { Button } from '../Button.js'
import { Input } from '../Input.js'
import { Badge } from '../Badge.js'

export interface PublicGroupEntry {
  id: DocumentId
  doc: GroupDocument
}

export interface PublicGroupBrowserProps {
  groups: PublicGroupEntry[]
  loading?: boolean
  currentUserId?: string
  onJoin: (groupId: DocumentId) => Promise<void>
  onRefresh?: () => void
}

export function PublicGroupBrowser({ groups, loading, currentUserId, onJoin, onRefresh }: PublicGroupBrowserProps) {
  const [query, setQuery] = useState('')
  const [joining, setJoining] = useState<DocumentId | null>(null)

  const filtered = groups.filter((g) =>
    g.doc.metadata.name.toLowerCase().includes(query.toLowerCase()) ||
    (g.doc.metadata.description ?? '').toLowerCase().includes(query.toLowerCase()),
  )

  const handleJoin = async (id: DocumentId) => {
    setJoining(id)
    try { await onJoin(id) } finally { setJoining(null) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4], padding: space[6] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
        <h2 style={{ margin: 0, color: color.textPrimary, fontSize: fontSize['2xl'], fontWeight: fontWeight.bold }}>
          Discover Groups
        </h2>
        {onRefresh && (
          <Button variant="ghost" size="sm" onClick={onRefresh} loading={loading}>
            Refresh
          </Button>
        )}
      </div>

      <Input
        placeholder="Search groups…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading && filtered.length === 0 && (
        <p style={{ color: color.textMuted, textAlign: 'center', margin: space[8] }}>
          Searching the network…
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {filtered.map(({ id, doc }) => {
          const isMember = currentUserId ? doc.members.includes(currentUserId) : false
          const vis = doc.metadata.visibility

          return (
            <div
              key={id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: space[4],
                background: color.surface2,
                border: `1px solid ${color.border}`,
                borderRadius: radius.lg,
                padding: space[4],
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: radius.md,
                  background: color.surface3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: fontSize['2xl'],
                  flexShrink: 0,
                }}
              >
                {doc.metadata.avatarUrl ? (
                  <img src={doc.metadata.avatarUrl} alt="" style={{ width: 48, height: 48, borderRadius: radius.md, objectFit: 'cover' }} />
                ) : (
                  doc.metadata.name[0].toUpperCase()
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[1] }}>
                  <span style={{ color: color.textPrimary, fontWeight: fontWeight.semibold, fontSize: fontSize.base }}>
                    {doc.metadata.name}
                  </span>
                  <Badge variant={vis === 'open' ? 'success' : vis === 'application' ? 'warning' : 'default'}>
                    {vis}
                  </Badge>
                </div>
                {doc.metadata.description && (
                  <p style={{ margin: 0, color: color.textSecondary, fontSize: fontSize.sm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.metadata.description}
                  </p>
                )}
                <span style={{ fontSize: fontSize.xs, color: color.textMuted }}>
                  {doc.members.length} member{doc.members.length !== 1 ? 's' : ''}
                </span>
              </div>

              {isMember ? (
                <Badge variant="brand">Joined</Badge>
              ) : (
                <Button
                  size="sm"
                  variant={vis === 'application' ? 'secondary' : 'primary'}
                  loading={joining === id}
                  onClick={() => handleJoin(id)}
                >
                  {vis === 'application' ? 'Apply' : 'Join'}
                </Button>
              )}
            </div>
          )
        })}

        {!loading && filtered.length === 0 && (
          <p style={{ color: color.textMuted, textAlign: 'center', padding: space[8] }}>
            No public groups found
          </p>
        )}
      </div>
    </div>
  )
}
