import React, { useState, useEffect } from 'react';
import { materialService } from '../api/materialService';
import { providerService } from '../api/providerService';

const PurchaseEntry = () => {
  const [materials, setMaterials] = useState([]);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [loading, setLoading] = useState(true);

  const [purchase, setPurchase] = useState({
    center_id: '',
    provider_id: '',
    invoice_ref: ''
  });

  const [itemsList, setItemsList] = useState([]);

  const [currentEntry, setCurrentEntry] = useState({
    material_id: '',
    quantity: '',
    unit_cost: ''
  });

  const selectedMaterial = materials.find(material => material.materials?.id === currentEntry.material_id);

  useEffect(() => {
    const loadData = async () => {
      try {
        const matData = await materialService.getAllMaterials();
        const provData = await providerService.getProviders();

        const filteredMaterials = (matData || []).filter(i => i.materials?.categories?.is_inventoried === true);
        setMaterials(filteredMaterials);
        setProviders(provData || []);

        if (filteredMaterials.length > 0) {
          setPurchase(prev => ({ ...prev, center_id: filteredMaterials[0].centers.id }));
        }
      } catch (error) {
        console.error('Error al cargar datos:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleAddToList = () => {
    if (!currentEntry.material_id || !currentEntry.quantity || !currentEntry.unit_cost) {
      alert("Por favor completa SKU, cantidad y costo unitario");
      return;
    }

    const materialInfo = materials.find(m => m.materials.id === currentEntry.material_id);

    const newItem = {
      ...currentEntry,
      name: materialInfo.materials.name,
      sku: materialInfo.materials.sku,
      subtotal: parseFloat(currentEntry.quantity) * parseFloat(currentEntry.unit_cost)
    };

    setItemsList([...itemsList, newItem]);
    setCurrentEntry({ material_id: '', quantity: '', unit_cost: '' });
  };

  const handleSavePurchase = async (e) => {
    e?.preventDefault?.();

    if (!selectedProvider || itemsList.length === 0) {
      alert('Por favor completa todos los campos de la compra');
      return;
    }

    try {
      const purchaseData = {
        ...purchase,
        provider_id: selectedProvider,
        invoice_ref: invoiceRef
      };

      await materialService.recordPurchase(purchaseData, itemsList);
      alert('Compra registrada y stock actualizado!');
      setSelectedProvider('');
      setInvoiceRef('');
      setItemsList([]);
      setCurrentEntry({ material_id: '', quantity: '', unit_cost: '' });
    } catch (error) {
      console.error('Error al registrar compra:', error);
      alert('Error al guardar la transaccion.');
    }
  };

  if (loading) return <div style={{ padding: '20px' }}>Cargando datos de compra...</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '800px', fontFamily: 'sans-serif' }}>
      <h1>Entrada de Almacen (Compras)</h1>

      <form onSubmit={handleSavePurchase} style={formContainerStyle}>
        <section style={sectionStyle}>
          <h3>Datos de la Factura / Remisión</h3>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Proveedor:</label>
            <select
              style={inputStyle}
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              required
            >
              <option value="">Selecciona un proveedor...</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.rfc})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Folio de Factura / Remisión:</label>
            <input
              type="text"
              style={inputStyle}
              placeholder="Ej: FAC-1234"
              value={invoiceRef}
              onChange={(e) => setInvoiceRef(e.target.value)}
            />
          </div>
        </section>

        <section style={sectionStyle}>
          <h3>Producto a Ingresar</h3>
          <label style={labelStyle}>Material:</label>
          <select
            style={inputStyle}
            onChange={(e) => setCurrentEntry({ ...currentEntry, material_id: e.target.value })}
            value={currentEntry.material_id}
          >
            <option value="">Selecciona producto...</option>
            {materials.map(m => (
              <option key={m.materials.id} value={m.materials.id}>
                {m.materials.name} ({m.materials.sku})
              </option>
            ))}
          </select>

          <div style={{ fontSize: '0.9em', color: '#4a5568', marginTop: '5px' }}>
            Unidad: <span style={{ fontWeight: 'bold' }}>{selectedMaterial?.materials?.uoms?.abbr || 'pz'}</span>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Cantidad:</label>
              <input
                type="number"
                style={inputStyle}
                placeholder="0.00"
                value={currentEntry.quantity}
                onChange={(e) => setCurrentEntry({ ...currentEntry, quantity: e.target.value })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Costo Unitario ($):</label>
              <input
                type="number"
                style={inputStyle}
                placeholder="0.00"
                value={currentEntry.unit_cost}
                onChange={(e) => setCurrentEntry({ ...currentEntry, unit_cost: e.target.value })}
              />
            </div>
          </div>

          <div style={entryRowStyle}>
            <button
              type="button"
              onClick={handleAddToList}
              style={btnAddStyle}
            >
              ➕ Agregar a la lista
            </button>
          </div>
        </section>
      </form>

      <div style={tableWrapperStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#2d3748', color: 'white' }}>
              <th style={thStyle}>SKU</th>
              <th style={thStyle}>Producto</th>
              <th style={thStyle}>Cant.</th>
              <th style={thStyle}>Costo U.</th>
              <th style={thStyle}>Subtotal</th>
              <th style={thStyle}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {itemsList.map((item, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdStyle}>{item.sku}</td>
                <td style={tdStyle}>{item.name}</td>
                <td style={tdStyle}>{item.quantity}</td>
                <td style={tdStyle}>${item.unit_cost}</td>
                <td style={tdStyle}>${item.subtotal.toFixed(2)}</td>
                <td style={tdStyle}>
                  <button onClick={() => setItemsList(itemsList.filter((_, i) => i !== index))} style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ padding: '20px', textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem' }}>
          Total Factura: ${itemsList.reduce((acc, item) => acc + item.subtotal, 0).toFixed(2)}
        </div>
      </div>

      <div style={{ marginTop: '20px' }}>
        <button onClick={handleSavePurchase} style={btnStyle}>
          Procesar Factura Completa
        </button>
      </div>
    </div>
  );
};

const formContainerStyle = { backgroundColor: '#f4f7f6', padding: '20px', borderRadius: '10px' };
const sectionStyle = { marginBottom: '20px', padding: '15px', backgroundColor: '#fff', borderRadius: '8px' };
const labelStyle = { display: 'block', fontSize: '0.9em', color: '#555', marginBottom: '5px' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' };
const btnStyle = { width: '100%', padding: '12px', backgroundColor: '#2980b9', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' };
const entryRowStyle = {
  marginTop: '20px',
  paddingTop: '20px',
  borderTop: '1px solid #e2e8f0',
  display: 'flex',
  justifyContent: 'flex-end'
};
const btnAddStyle = {
  padding: '12px 24px',
  backgroundColor: '#2d3748',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '1rem',
  transition: 'background 0.2s'
};
const tableWrapperStyle = { marginTop: '20px', backgroundColor: '#fff', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' };
const thStyle = { padding: '15px', textAlign: 'left' };
const tdStyle = { padding: '12px 15px' };

export default PurchaseEntry;
