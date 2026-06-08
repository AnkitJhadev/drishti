import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initActionQueue } from './services/actionQueue'
import 'leaflet/dist/leaflet.css'
import './index.css'

// Register offline-action-queue reconnect triggers + drain any leftover queue.
initActionQueue()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
