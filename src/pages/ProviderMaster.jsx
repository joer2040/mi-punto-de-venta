import React, { useState, useEffect } from 'react';
import { providerService } from '../api/providerService';

const ProviderMaster = () => {
  const [providers, setProviders] = useState([]);
  const [formData, setFormData] = useState({ name: '', rfc: '', phone: '', email: '' });

  const loadProviders = async () => {
    const data = await providerService.getProviders();
    setProviders(data);
  };

  useEffect(() => { loadProviders(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.rfc) return alert("Nombre y RFC son obligatorios");
    
    try {
      await providerService.createProvider(formData);
      setFormData({ name: '', rfc: '', phone: '', email: '' });
      loadProviders();
      alert("Proveedor registrado con éxito");
    } catch (error) { alert("Error al registrar"); }
  };

  return (
    <div style={{ padding: '30px', backgroundColor: '#f7fafc', minHeight: '100vh' }}>
      <h2 style={{ color: '#2d3748', marginBottom: '20px' }}>📦 Maestro de Proveedores</h2>

      {/* Formulario de Registro */}
      <form onSubmit={handleSubmit} style={formCardStyle}>
        <div style={gridStyle}>
          <input 
            placeholder="Nombre del Proveedor *" 
            style={inputStyle} 
            value={formData.name} 
            onChange={e => setFormData({...formData, name: e.target.value})} 
          />
          <input 
            placeholder="RFC *" 
            style={inputStyle} 
            value={formData.rfc} 
            onChange={e => setFormData({...formData, rfc: e.target.value})} 
          />
          <input 
            placeholder="Teléfono" 
            style={inputStyle} 
            value={formData.phone} 
            onChange={e => setFormData({...formData, phone: e.target.value})} 
          />
          <input 
            placeholder="Email" 
            style={inputStyle} 
            value={formData.email} 
            onChange={e => setFormData({...formData, email: e.target.value})} 
          />
        </div>
        <button type="submit" style={btnSubmitStyle}>Registrar Proveedor</button>
      </form>

      {/* Tabla de Proveedores */}
      <div style={tableWrapperStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#2d3748', color: 'white' }}>
              <th style={thStyle}>Proveedor</th>
              <th style={thStyle}>RFC</th>
              <th style={thStyle}>Contacto</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p, i) => (
              <tr key={p.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <td style={tdStyle}><strong>{p.name}</strong></td>
                <td style={tdStyle}>{p.rfc}</td>
                <td style={tdStyle}>{p.email || p.phone || 'Sin datos'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Estilos rápidos
const formCardStyle = { backgroundColor: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', marginBottom: '30px' };
const gridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' };
const inputStyle = { padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e0' };
const btnSubmitStyle = { padding: '10px 20px', backgroundColor: '#3182ce', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };
const tableWrapperStyle = { backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' };
const thStyle = { padding: '15px', textAlign: 'left' };
const tdStyle = { padding: '12px 15px' };

export default ProviderMaster;