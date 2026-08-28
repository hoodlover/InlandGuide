import React from 'react'
import ReactDOM from 'react-dom/client'
import AccessBlock from './AccessBlock.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Temporary access block. Restore App.jsx here to reopen the guide. */}
    <AccessBlock />
  </React.StrictMode>,
)
