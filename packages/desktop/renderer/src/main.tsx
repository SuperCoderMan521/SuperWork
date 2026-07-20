import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import './styles.css'
import { I18nProvider } from './i18n/I18nProvider.js'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Desktop root element was not found')
}

createRoot(root).render(
  <React.StrictMode>
    <I18nProvider><App /></I18nProvider>
  </React.StrictMode>,
)
