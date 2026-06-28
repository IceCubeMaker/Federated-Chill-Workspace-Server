import React from 'react'
import { color, radius, fontSize } from '../tokens/index.js'

export interface AvatarProps {
  name: string
  src?: string
  size?: number
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function hslFromString(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff
  return `hsl(${Math.abs(h) % 360}, 60%, 45%)`
}

export function Avatar({ name, src, size = 32 }: AvatarProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius.full,
        overflow: 'hidden',
        background: src ? 'transparent' : hslFromString(name),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: `1px solid ${color.border}`,
      }}
    >
      {src ? (
        <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ color: '#fff', fontSize: Math.floor(size * 0.38), fontWeight: 600 }}>
          {initials(name)}
        </span>
      )}
    </div>
  )
}
