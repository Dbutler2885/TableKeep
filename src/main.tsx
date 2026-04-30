import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { addCollection } from '@iconify/react'
import gameIcons from '@iconify-json/game-icons/icons.json'
import './index.css'
import App from './App.tsx'

// Register the full game-icons set up front so VtM ornaments render
// synchronously without an Iconify API fetch. Source: game-icons.net (CC BY 3.0).
addCollection(gameIcons)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
