import React, { useState } from 'react'
import Inventory from './pages/Inventory'
import ProviderMaster from './pages/ProviderMaster'
import PurchaseEntry from './pages/PurchaseEntry'
import InventoryReport from './pages/InventoryReport'
import POS from './pages/POS'
import { useResponsive } from './lib/useResponsive'

function App() {
  const [currentPage, setCurrentPage] = useState('master')
  const { isMobile } = useResponsive()

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#e9ecef', paddingBottom: '40px' }}>
      <nav
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          justifyContent: isMobile ? 'center' : 'flex-start',
          flexWrap: 'wrap',
          padding: isMobile ? '12px' : '15px 30px',
          backgroundColor: '#2c3e50',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
        }}
      >
        <button onClick={() => setCurrentPage('master')} style={currentPage === 'master' ? getActiveBtnStyle(isMobile) : getBtnNavStyle(isMobile)}>📦 Maestro de Materiales</button>
        <button onClick={() => setCurrentPage('providers')} style={currentPage === 'providers' ? getActiveBtnStyle(isMobile) : getBtnNavStyle(isMobile)}>🏢 Proveedores</button>
        <button onClick={() => setCurrentPage('purchases')} style={currentPage === 'purchases' ? getActiveBtnStyle(isMobile) : getBtnNavStyle(isMobile)}>🚚 Entrada por Compra</button>
        <button onClick={() => setCurrentPage('report')} style={currentPage === 'report' ? getActiveBtnStyle(isMobile) : getBtnNavStyle(isMobile)}>📊 Reporte de Existencias</button>
        <button onClick={() => setCurrentPage('pos')} style={currentPage === 'pos' ? getActiveBtnStyle(isMobile) : getBtnNavStyle(isMobile)}>🛒 Punto de Venta</button>
      </nav>

      <main style={{ marginTop: isMobile ? '12px' : '20px' }}>
        {currentPage === 'master' && <Inventory />}
        {currentPage === 'providers' && <ProviderMaster />}
        {currentPage === 'purchases' && <PurchaseEntry />}
        {currentPage === 'report' && <InventoryReport />}
        {currentPage === 'pos' && <POS />}
      </main>
    </div>
  )
}

const getBtnNavStyle = (isMobile) => ({
  minWidth: isMobile ? 'calc(50% - 12px)' : 'auto',
  padding: isMobile ? '10px 12px' : '8px 16px',
  cursor: 'pointer',
  backgroundColor: 'transparent',
  color: '#bdc3c7',
  border: '1px solid #7f8c8d',
  borderRadius: '4px',
  fontSize: isMobile ? '0.9rem' : '1rem'
})

const getActiveBtnStyle = (isMobile) => ({
  ...getBtnNavStyle(isMobile),
  backgroundColor: '#3498db',
  color: 'white',
  border: '1px solid #3498db'
})

export default App
