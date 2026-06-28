import React, { useState } from 'react'
import { color, radius, fontSize, space } from '../tokens/index.js'

export interface TooltipProps {
  content: string
  children: React.ReactElement
  placement?: 'top' | 'bottom'
}

export function Tooltip({ content, children, placement = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false)

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          style={{
            position: 'absolute',
            [placement === 'top' ? 'bottom' : 'top']: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: color.surface3,
            border: `1px solid ${color.border}`,
            borderRadius: radius.sm,
            color: color.textPrimary,
            fontSize: fontSize.xs,
            padding: `${space[1]} ${space[2]}`,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 100,
          }}
        >
          {content}
        </span>
      )}
    </span>
  )
}
