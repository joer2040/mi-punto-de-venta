import React, { useState } from 'react'
import Inventory from './pages/Inventory'
import ProviderMaster from './pages/ProviderMaster'
import PurchaseEntry from './pages/PurchaseEntry'
import InventoryReport from './pages/InventoryReport'
import POS from './pages/POS'

function App() {
  const [currentPage, setCurrentPage] = useState('master')

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#e9ecef', paddingBottom: '40px' }}>
      <nav style={navStyle}>
        <button onClick={() => setCurrentPage('master')} style={currentPage === 'master' ? activeBtnStyle : btnNavStyle}>📦 Maestro de Materiales</button>
        <button onClick={() => setCurrentPage('providers')} style={currentPage === 'providers' ? activeBtnStyle : btnNavStyle}>🏢 Proveedores</button>
        <button onClick={() => setCurrentPage('purchases')} style={currentPage === 'purchases' ? activeBtnStyle : btnNavStyle}>🚚 Entrada por Compra</button>
        <button onClick={() => setCurrentPage('report')} style={currentPage === 'report' ? activeBtnStyle : btnNavStyle}>📊 Reporte de Existencias</button>
        <button onClick={() => setCurrentPage('pos')} style={currentPage === 'pos' ? activeBtnStyle : btnNavStyle}>🛒 Punto de Venta</button>
      </nav>

      <main style={{ marginTop: '20px' }}>
        {currentPage === 'master' && <Inventory />}
        {currentPage === 'providers' && <ProviderMaster />}
        {currentPage === 'purchases' && <PurchaseEntry />}
        {currentPage === 'report' && <InventoryReport />}
        {currentPage === 'pos' && <POS />}
      </main>
    </div>
  )
}

const navStyle = {
  display: 'flex',
  gap: '15px',
  alignItems: 'center',
  padding: '15px 30px',
  backgroundColor: '#2c3e50',
  boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
}

const btnNavStyle = {
  padding: '8px 16px',
  cursor: 'pointer',
  backgroundColor: 'transparent',
  color: '#bdc3c7',
  border: '1px solid #7f8c8d',
  borderRadius: '4px'
}

const activeBtnStyle = {
  ...btnNavStyle,
  backgroundColor: '#3498db',
  color: 'white',
  border: '1px solid #3498db'
}

export default App
