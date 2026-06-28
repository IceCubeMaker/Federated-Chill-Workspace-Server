import React from 'react'
import { createRoot } from 'react-dom/client'
import { injectTokens } from '@federation/ui'
import { App } from './App.js'

injectTokens()

const root = document.getElementById('root')!
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
