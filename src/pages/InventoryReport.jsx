import React, { useEffect, useState } from 'react';
import { materialService } from '../api/materialService';

const InventoryReport = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadReport = async () => {
      try {
        const data = await materialService.getAllMaterials();
        // FILTRADO ESTRICTO (Punto 4): Solo lo que es inventariable
        const inventoriedItems = data?.filter(i => i.materials?.categories?.is_inventoried === true) || [];
        setItems(inventoriedItems);
      } catch (error) {
        console.error("Error al cargar reporte:", error);
      } finally {
        setLoading(false);
      }
    };
    loadReport();
  }, []);

  if (loading) return <div style={{ padding: '50px', textAlign: 'center' }}>Generando reporte...</div>;

  return (
    <div style={{ padding: '30px', backgroundColor: '#f7fafc', minHeight: '100vh' }}>
      <h2 style={{ color: '#2d3748', marginBottom: '20px', borderBottom: '2px solid #cbd5e0', paddingBottom: '10px' }}>
        📊 Reporte de Inventario Actual
      </h2>
      
      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#4a5568', color: '#ffffff' }}>
              <th style={thStyle}>SKU</th>
              <th style={thStyle}>Producto</th>
              <th style={thStyle}>Categoría</th>
              <th style={thStyle}>Stock Físico</th>
              <th style={thStyle}>Costo Promedio</th>
              <th style={thStyle}>Valor del Inventario</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: item.stock_actual <= 0 ? '#fff5f5' : 'transparent' }}>
                <td style={tdStyle}>{item.materials?.sku}</td>
                <td style={{ ...tdStyle, fontWeight: 'bold' }}>{item.materials?.name}</td>
                <td style={tdStyle}>{item.materials?.categories?.name}</td>
                <td style={{ ...tdStyle, color: item.stock_actual <= 0 ? '#c53030' : '#2d3748', fontWeight: 'bold' }}>
                  {item.stock_actual}
                </td>
                <td style={tdStyle}>${item.costo_promedio}</td>
                <td style={{ ...tdStyle, fontWeight: 'bold', color: '#2b6cb0' }}>
                  ${(item.stock_actual * item.costo_promedio).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Resumen al final */}
      <div style={{ marginTop: '20px', textAlign: 'right', padding: '20px', fontSize: '1.2rem', fontWeight: 'bold', color: '#2d3748' }}>
        Valor Total en Almacén: $
        {items.reduce((acc, item) => acc + (item.stock_actual * item.costo_promedio), 0).toFixed(2)}
      </div>
    </div>
  );
};

const thStyle = { padding: '15px', textAlign: 'left', fontSize: '0.85rem' };
const tdStyle = { padding: '12px 15px', fontSize: '0.95rem', color: '#4a5568' };

export default InventoryReport;