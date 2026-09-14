import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import UpdateToast from './components/UpdateToast.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {window.__INLAND_PORTABLE__ && <div className="bg-[#002D72] px-4 py-2 text-center text-sm text-white">Standalone Inland Guide · Synced master saved {new Date(window.__INLAND_PORTABLE__.modifiedAt).toLocaleString()}</div>}
    <App />
    {window.__INLAND_PORTABLE__ && <UpdateToast />}
  </React.StrictMode>,
)
