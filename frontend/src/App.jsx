import React, { useState } from 'react';
import LookupForm from './components/LookupForm';
import AdminPanel from './components/AdminPanel';
import { bannerTop, bannerBottom } from './assets/banners';
import './index.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('lookup');

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <img
        src={bannerTop}
        alt="Hapag-Lloyd IDT Ops Base"
        className="w-full h-auto block"
      />

      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-slate-900">Inland Cutoff Guide</h1>
          <p className="text-slate-500 text-sm mt-1">Rail cutoff &amp; delivery date calculator</p>
        </div>
      </header>

      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab('lookup')}
              className={`py-4 px-2 border-b-2 font-semibold transition ${
                activeTab === 'lookup'
                  ? 'border-slate-800 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Lookup Tool
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`py-4 px-2 border-b-2 font-semibold transition ${
                activeTab === 'admin'
                  ? 'border-slate-800 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Admin
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8 w-full flex-1">
        {activeTab === 'lookup' && <LookupForm />}
        {activeTab === 'admin' && <AdminPanel />}
      </main>

      <img
        src={bannerBottom}
        alt="Hapag-Lloyd IDT Ops Base"
        className="w-full h-auto block mt-8"
      />
    </div>
  );
}