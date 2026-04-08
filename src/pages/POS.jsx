import React, { useState, useEffect } from 'react';
import { materialService } from '../api/materialService';
import { supabase } from '../lib/supabase';

const POS = () => {
  const [inventory, setInventory] = useState([]);
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([loadInventory(), loadTables()]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const loadInventory = async () => {
    try {
      const data = await materialService.getAllMaterials();
      setInventory(data || []);
    } catch (error) {
      console.error('Error al cargar inventario para POS:', error);
    }
  };

  const loadTables = async () => {
    try {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .order('number');

      if (error) throw error;
      setTables(data || []);
    } catch (error) {
      console.error('Error al cargar mesas:', error);
    }
  };

  const handleSelectTable = async (table) => {
    try {
      setSelectedTable(table);

      if (!table.current_order_id) {
        setCart([]);
        return;
      }

      const { data: order, error } = await supabase
        .from('table_orders')
        .select('*')
        .eq('id', table.current_order_id)
        .maybeSingle();

      if (error) throw error;
      setCart(order?.items || []);
    } catch (error) {
      console.error('Error al cargar la mesa:', error);
      alert('No se pudo abrir la mesa.');
    }
  };

  const persistTableOrder = async (table, items) => {
    const total = items.reduce((acc, item) => acc + (item.unit_price * item.quantity), 0);

    let orderId = table.current_order_id;

    if (items.length === 0) {
      const { error: tableError } = await supabase
        .from('tables')
        .update({ status: 'libre', current_order_id: null })
        .eq('id', table.id);

      if (tableError) throw tableError;

      if (orderId) {
        const { error: deleteError } = await supabase
          .from('table_orders')
          .delete()
          .eq('id', orderId);

        if (deleteError) throw deleteError;
      }

      return;
    }

    if (orderId) {
      const { error } = await supabase
        .from('table_orders')
        .update({
          items,
          total
        })
        .eq('id', orderId);

      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from('table_orders')
        .insert([{
          table_id: table.id,
          items,
          total
        }])
        .select()
        .single();

      if (error) throw error;
      orderId = data.id;
    }

    const { error: tableError } = await supabase
      .from('tables')
      .update({
        status: 'ocupada',
        current_order_id: orderId
      })
      .eq('id', table.id);

    if (tableError) throw tableError;
  };

  const handleSaveAndExit = async () => {
    if (!selectedTable) return;

    try {
      await persistTableOrder(selectedTable, cart);
      setSelectedTable(null);
      setCart([]);
      await loadTables();
    } catch (error) {
      console.error('Error al guardar la mesa:', error);
      alert('Error al guardar la mesa');
    }
  };

  const addToCart = (item) => {
    const isExtra = item.materials?.categories?.name === 'Extras';

    if (item.precio_venta <= 0) {
      alert('Este producto no tiene precio de venta asignado.');
      return;
    }

    if (!isExtra && item.stock_actual <= 0) {
      alert('No hay existencias de este producto.');
      return;
    }

    const existing = cart.find(c => c.material_id === item.materials.id);

    if (!isExtra && existing && existing.quantity >= item.stock_actual) {
      alert(`Solo hay ${item.stock_actual} unidades disponibles.`);
      return;
    }

    if (existing) {
      setCart(cart.map(c =>
        c.material_id === item.materials.id ? { ...c, quantity: c.quantity + 1 } : c
      ));
    } else {
      setCart([...cart, {
        material_id: item.materials.id,
        name: item.materials.name,
        unit_price: item.precio_venta,
        quantity: 1,
        is_extra: isExtra
      }]);
    }
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(c => c.material_id !== id));
  };

  const total = cart.reduce((acc, curr) => acc + (curr.unit_price * curr.quantity), 0);

  const handleFinalizeSale = async () => {
    if (!selectedTable || cart.length === 0) return;

    try {
      const centerId = inventory[0]?.centers?.id;
      if (!centerId) {
        alert('No se encontró un centro de inventario para procesar la venta.');
        return;
      }

      const latestInventory = await materialService.getAllMaterials();
      const inventoryByMaterialId = new Map(
        (latestInventory || [])
          .filter(item => item.centers?.id === centerId)
          .map(item => [item.materials?.id, item])
      );

      const normalizedCart = cart.map(item => {
        const inventoryItem = inventoryByMaterialId.get(item.material_id);
        const categoryName = inventoryItem?.materials?.categories?.name;
        const isExtra = categoryName === 'Extras' || item.is_extra === true;

        return {
          ...item,
          is_extra: isExtra
        };
      });

      for (const item of normalizedCart) {
        if (item.is_extra) continue;

        const availableStock = inventoryByMaterialId.get(item.material_id)?.stock_actual ?? 0;
        if (item.quantity > availableStock) {
          alert(`No hay stock suficiente para ${item.name}. Disponible: ${availableStock}, solicitado: ${item.quantity}.`);
          await loadInventory();
          return;
        }
      }

      const saleHeader = {
        center_id: centerId,
        total_amount: total,
        payment_method: 'Efectivo'
      };

      await materialService.recordSale(saleHeader, normalizedCart);

      for (const item of normalizedCart) {
        if (!item.is_extra) {
          console.log(`Descontando ${item.quantity} de stock para ${item.name}`);
        } else {
          console.log(`El producto ${item.name} es un Extra. No se descuenta stock físico.`);
        }
      }

      await persistTableOrder(selectedTable, []);
      alert('Venta realizada con éxito');
      setCart([]);
      setSelectedTable(null);
      await Promise.all([loadInventory(), loadTables()]);
    } catch (error) {
      console.error('Error en la venta:', error);
      alert(`Hubo un error al procesar la venta: ${error.message || 'Error desconocido'}`);
    }
  };

  if (loading) return <div style={{ padding: '20px' }}>Iniciando terminal de venta...</div>;

  if (!selectedTable) {
    return (
      <div style={containerStyle}>
        <h2 style={{ color: '#2d3748', marginBottom: '20px' }}>📍 Selecciona una Mesa</h2>
        <div style={tableGridStyle}>
          {tables.map(table => (
            <button
              key={table.id}
              onClick={() => handleSelectTable(table)}
              style={{
                ...tableButtonStyle,
                backgroundColor: table.status === 'libre' ? '#2f855a' : '#c53030'
              }}
            >
              {table.number}
              <div style={tableStatusStyle}>
                {(table.status || 'libre').toUpperCase()}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '20px', padding: '20px', fontFamily: 'sans-serif' }}>
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
          <button onClick={handleSaveAndExit} style={btnSecondaryStyle}>
            ⬅️ Volver a Mesas (Guardar)
          </button>
          <h3 style={{ color: '#2d3748', margin: 0 }}>Atendiendo: {selectedTable?.number}</h3>
        </div>

        <h2>Productos Disponibles</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '15px' }}>
          {inventory
            .filter(item => item.materials?.categories?.is_for_sale === true)
            .map((item, idx) => (
              <div
                key={idx}
                onClick={() => addToCart(item)}
                style={{
                  ...productCardStyle,
                  opacity: item.stock_actual <= 0 && item.materials.categories.name !== 'Extras' ? 0.5 : 1,
                  cursor: item.stock_actual <= 0 && item.materials.categories.name !== 'Extras' ? 'not-allowed' : 'pointer'
                }}
              >
                <div style={{ fontWeight: 'bold' }}>{item.materials.name}</div>
                <div style={{ fontSize: '0.8em', color: '#666' }}>{item.materials.categories.name}</div>
                <div style={{ color: '#27ae60', fontWeight: 'bold', marginTop: '10px' }}>
                  ${item.precio_venta}
                </div>

                {item.materials.categories.is_inventoried && (
                  <div style={{ fontSize: '0.75em', color: item.stock_actual <= 0 ? 'red' : '#333' }}>
                    Stock: {item.stock_actual}
                  </div>
                )}
              </div>
            ))}
        </div>
      </section>

      <section style={cartContainerStyle}>
        <h3>Cuenta Actual</h3>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {cart.map(c => (
            <div key={c.material_id} style={cartItemStyle}>
              <div>
                <div style={{ fontSize: '0.9em' }}>{c.name}</div>
                <div style={{ fontSize: '0.8em', color: '#666' }}>{c.quantity} x ${c.unit_price}</div>
              </div>
              <button onClick={() => removeFromCart(c.material_id)} style={deleteBtnStyle}>X</button>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '2px solid #eee', paddingTop: '15px', marginTop: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2em', fontWeight: 'bold' }}>
            <span>Total:</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <button
            onClick={handleFinalizeSale}
            disabled={cart.length === 0}
            style={checkoutBtnStyle}
          >
            Finalizar Venta
          </button>
        </div>
      </section>
    </div>
  );
};

const containerStyle = {
  padding: '30px',
  backgroundColor: '#f7fafc',
  minHeight: '100vh'
};
const tableGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: '20px'
};
const tableButtonStyle = {
  padding: '30px',
  borderRadius: '12px',
  border: 'none',
  color: 'white',
  fontSize: '1.2rem',
  fontWeight: 'bold',
  cursor: 'pointer',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
};
const tableStatusStyle = {
  fontSize: '0.7rem',
  marginTop: '5px',
  fontWeight: 'normal'
};
const productCardStyle = {
  padding: '15px', backgroundColor: 'white', borderRadius: '8px', cursor: 'pointer',
  boxShadow: '0 2px 5px rgba(0,0,0,0.1)', border: '1px solid #eee', textAlign: 'center'
};
const cartContainerStyle = {
  backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  display: 'flex', flexDirection: 'column', height: '80vh', position: 'sticky', top: '20px'
};
const cartItemStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '10px 0', borderBottom: '1px solid #eee'
};
const deleteBtnStyle = { background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '1.1em' };
const btnSecondaryStyle = {
  padding: '10px 16px',
  backgroundColor: '#2d3748',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 'bold'
};
const checkoutBtnStyle = {
  width: '100%', marginTop: '15px', padding: '12px', backgroundColor: '#27ae60',
  color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer'
};

export default POS;
