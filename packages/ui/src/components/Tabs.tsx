import React, { useState } from 'react'
import { color, space, fontSize, fontWeight, radius } from '../tokens/index.js'

export interface Tab {
  key: string
  label: string
  content: React.ReactNode
}

export interface TabsProps {
  tabs: Tab[]
  defaultTab?: string
  onChange?: (key: string) => void
}

export function Tabs({ tabs, defaultTab, onChange }: TabsProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.key)

  const select = (key: string) => {
    setActive(key)
    onChange?.(key)
  }

  const current = tabs.find((t) => t.key === active)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${color.border}`,
          gap: space[1],
          padding: `0 ${space[4]}`,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => select(tab.key)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${active === tab.key ? color.brandPrimary : 'transparent'}`,
              color: active === tab.key ? color.textPrimary : color.textSecondary,
              cursor: 'pointer',
              fontSize: fontSize.sm,
              fontWeight: active === tab.key ? fontWeight.semibold : fontWeight.normal,
              padding: `${space[3]} ${space[3]}`,
              marginBottom: '-1px',
              transition: 'all 150ms ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, padding: space[4] }}>{current?.content}</div>
    </div>
  )
}
