import React, { useEffect, useState } from 'react'
import { materialService } from '../api/materialService'
import { supabase } from '../lib/supabase'
import { useResponsive } from '../lib/useResponsive'
import logoCarreta from '../assets/la_carreta_sin_fondo.png'

const POS = () => {
  const [inventory, setInventory] = useState([])
  const [tables, setTables] = useState([])
  const [selectedTable, setSelectedTable] = useState(null)
  const [cart, setCart] = useState([])
  const [ticketData, setTicketData] = useState(null)
  const [loading, setLoading] = useState(true)
  const { isMobile, isTablet } = useResponsive()

  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([loadInventory(), loadTables()])
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const loadInventory = async () => {
    try {
      const data = await materialService.getAllMaterials()
      setInventory(data || [])
    } catch (error) {
      console.error('Error al cargar inventario para POS:', error)
    }
  }

  const loadTables = async () => {
    try {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .order('number')

      if (error) throw error
      setTables(data || [])
    } catch (error) {
      console.error('Error al cargar mesas:', error)
    }
  }

  const handleSelectTable = async (table) => {
    try {
      setSelectedTable(table)

      if (!table.current_order_id) {
        setCart([])
        return
      }

      const { data: order, error } = await supabase
        .from('table_orders')
        .select('*')
        .eq('id', table.current_order_id)
        .maybeSingle()

      if (error) throw error
      setCart(order?.items || [])
    } catch (error) {
      console.error('Error al cargar la mesa:', error)
      alert('No se pudo abrir la mesa.')
    }
  }

  const persistTableOrder = async (table, items) => {
    const total = items.reduce((acc, item) => acc + item.unit_price * item.quantity, 0)
    let orderId = table.current_order_id

    if (items.length === 0) {
      const { error: tableError } = await supabase
        .from('tables')
        .update({ status: 'libre', current_order_id: null })
        .eq('id', table.id)

      if (tableError) throw tableError

      if (orderId) {
        const { error: deleteError } = await supabase
          .from('table_orders')
          .delete()
          .eq('id', orderId)

        if (deleteError) throw deleteError
      }

      return
    }

    if (orderId) {
      const { error } = await supabase
        .from('table_orders')
        .update({ items, total })
        .eq('id', orderId)

      if (error) throw error
    } else {
      const { data, error } = await supabase
        .from('table_orders')
        .insert([{ table_id: table.id, items, total }])
        .select()
        .single()

      if (error) throw error
      orderId = data.id
    }

    const { error: tableError } = await supabase
      .from('tables')
      .update({ status: 'ocupada', current_order_id: orderId })
      .eq('id', table.id)

    if (tableError) throw tableError
  }

  const handleSaveAndExit = async () => {
    if (!selectedTable) return

    try {
      await persistTableOrder(selectedTable, cart)
      setSelectedTable(null)
      setCart([])
      await loadTables()
    } catch (error) {
      console.error('Error al guardar la mesa:', error)
      alert('Error al guardar la mesa')
    }
  }

  const addToCart = (item) => {
    const isExtra = item.materials?.categories?.name === 'Extras'

    if (item.precio_venta <= 0) {
      alert('Este producto no tiene precio de venta asignado.')
      return
    }

    if (!isExtra && item.stock_actual <= 0) {
      alert('No hay existencias de este producto.')
      return
    }

    const existing = cart.find((c) => c.material_id === item.materials.id)

    if (!isExtra && existing && existing.quantity >= item.stock_actual) {
      alert(`Solo hay ${item.stock_actual} unidades disponibles.`)
      return
    }

    if (existing) {
      setCart(
        cart.map((c) =>
          c.material_id === item.materials.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      )
    } else {
      setCart([
        ...cart,
        {
          material_id: item.materials.id,
          name: item.materials.name,
          unit_price: item.precio_venta,
          quantity: 1,
          is_extra: isExtra,
        },
      ])
    }
  }

  const changeQuantity = (id, delta) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.material_id !== id) return item
          return { ...item, quantity: item.quantity + delta }
        })
        .filter((item) => item.quantity > 0)
    )
  }

  const removeFromCart = (id) => {
    setCart(cart.filter((c) => c.material_id !== id))
  }

  const total = cart.reduce((acc, curr) => acc + curr.unit_price * curr.quantity, 0)
  const totalItems = cart.reduce((acc, curr) => acc + curr.quantity, 0)
  const availableProducts = inventory.filter((item) => item.materials?.categories?.is_for_sale === true)
  const occupiedTables = tables.filter((table) => table.status === 'ocupada').length

  const buildTicketData = (sale, items, table) => {
    const chargedAt = sale?.created_at || new Date().toISOString()

    return {
      saleId: sale?.id,
      chargedAt,
      tableNumber: table?.number,
      items: items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price),
        subtotal: parseFloat(item.unit_price) * parseFloat(item.quantity),
      })),
      total: items.reduce((acc, item) => acc + parseFloat(item.unit_price) * parseFloat(item.quantity), 0),
    }
  }

  const handleFinalizeSale = async () => {
    if (!selectedTable || cart.length === 0) return

    try {
      const centerId = inventory[0]?.centers?.id
      if (!centerId) {
        alert('No se encontro un centro de inventario para procesar la venta.')
        return
      }

      const latestInventory = await materialService.getAllMaterials()
      const inventoryByMaterialId = new Map(
        (latestInventory || [])
          .filter((item) => item.centers?.id === centerId)
          .map((item) => [item.materials?.id, item])
      )

      const normalizedCart = cart.map((item) => {
        const inventoryItem = inventoryByMaterialId.get(item.material_id)
        const categoryName = inventoryItem?.materials?.categories?.name
        const isExtra = categoryName === 'Extras' || item.is_extra === true

        return {
          ...item,
          is_extra: isExtra,
        }
      })

      for (const item of normalizedCart) {
        if (item.is_extra) continue

        const availableStock = inventoryByMaterialId.get(item.material_id)?.stock_actual ?? 0
        if (item.quantity > availableStock) {
          alert(`No hay stock suficiente para ${item.name}. Disponible: ${availableStock}, solicitado: ${item.quantity}.`)
          await loadInventory()
          return
        }
      }

      const saleHeader = {
        center_id: centerId,
        total_amount: total,
        payment_method: 'Efectivo',
      }

      const sale = await materialService.recordSale(saleHeader, normalizedCart)
      setTicketData(buildTicketData(sale, normalizedCart, selectedTable))
      await persistTableOrder(selectedTable, [])
      alert('Venta realizada con exito')
      setCart([])
      setSelectedTable(null)
      await Promise.all([loadInventory(), loadTables()])
    } catch (error) {
      console.error('Error en la venta:', error)
      alert(`Hubo un error al procesar la venta: ${error.message || 'Error desconocido'}`)
    }
  }

  if (loading) return <div style={{ padding: '20px' }}>Iniciando terminal de venta...</div>

  if (!selectedTable) {
    return (
      <>
        <div style={getContainerStyle(isMobile)}>
          <div style={heroCardStyle}>
            <div>
              <h2 style={{ color: '#1f2937', margin: 0, fontSize: isMobile ? '1.5rem' : '1.9rem' }}>Mapa de Mesas</h2>
              <p style={{ ...mutedTextStyle, margin: '8px 0 0 0' }}>
                Toca una mesa para abrir su cuenta y seguir tomando pedidos.
              </p>
            </div>

            <div style={getStatsGridStyle(isMobile)}>
              <div style={statCardStyle}>
                <span style={statLabelStyle}>Mesas libres</span>
                <strong style={statValueStyle}>{tables.length - occupiedTables}</strong>
              </div>
              <div style={statCardStyle}>
                <span style={statLabelStyle}>Mesas ocupadas</span>
                <strong style={statValueStyle}>{occupiedTables}</strong>
              </div>
            </div>
          </div>

          <div style={getTableGridStyle(isMobile)}>
            {tables.map((table) => {
              const isFree = table.status === 'libre'
              return (
                <button
                  key={table.id}
                  onClick={() => handleSelectTable(table)}
                  style={{
                    ...getTableButtonStyle(isMobile),
                    background: isFree
                      ? 'linear-gradient(135deg, #2f855a 0%, #276749 100%)'
                      : 'linear-gradient(135deg, #c53030 0%, #9b2c2c 100%)',
                  }}
                >
                  <span style={{ fontSize: isMobile ? '1rem' : '0.9rem', opacity: 0.88 }}>Mesa</span>
                  <strong style={{ fontSize: isMobile ? '1.35rem' : '1.55rem' }}>{table.number}</strong>
                  <span style={tableStatusBadgeStyle}>{(table.status || 'libre').toUpperCase()}</span>
                </button>
              )
            })}
          </div>
        </div>
        {ticketData && <TicketModal ticket={ticketData} onClose={() => setTicketData(null)} />}
      </>
    )
  }

  return (
    <>
      <div style={getWorkspaceStyle(isTablet, isMobile)}>
        <section>
          <div style={topBarStyle(isMobile)}>
            <button onClick={handleSaveAndExit} style={btnSecondaryStyle}>
              Volver a Mesas
            </button>
            <div style={tableInfoCardStyle}>
              <span style={tableInfoLabelStyle}>Atendiendo</span>
              <strong style={{ color: '#1f2937', fontSize: isMobile ? '1rem' : '1.15rem' }}>
                {selectedTable?.number}
              </strong>
            </div>
          </div>

          <div style={heroCardStyle}>
            <div>
              <h2 style={{ color: '#1f2937', margin: 0, fontSize: isMobile ? '1.35rem' : '1.65rem' }}>Productos Disponibles</h2>
              <p style={{ ...mutedTextStyle, margin: '8px 0 0 0' }}>
                Toca un producto para agregarlo a la cuenta de la mesa.
              </p>
            </div>

            <div style={getStatsGridStyle(isMobile)}>
              <div style={statCardStyle}>
                <span style={statLabelStyle}>Productos</span>
                <strong style={statValueStyle}>{availableProducts.length}</strong>
              </div>
              <div style={statCardStyle}>
                <span style={statLabelStyle}>Articulos</span>
                <strong style={statValueStyle}>{totalItems}</strong>
              </div>
            </div>
          </div>

          <div style={getProductGridStyle(isMobile)}>
            {availableProducts.map((item, idx) => {
              const isExtra = item.materials?.categories?.name === 'Extras'
              const isOutOfStock = !isExtra && item.stock_actual <= 0

              return (
                <div
                  key={idx}
                  onClick={() => addToCart(item)}
                  style={{
                    ...getProductCardStyle(isMobile),
                    opacity: isOutOfStock ? 0.52 : 1,
                    cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                  }}
                >
                  <div style={productCategoryPillStyle}>{item.materials.categories.name}</div>
                  <div style={{ fontWeight: 'bold', color: '#1f2937', fontSize: isMobile ? '0.95rem' : '1rem' }}>
                    {item.materials.name}
                  </div>
                  <div style={{ color: '#0f766e', fontWeight: 'bold', marginTop: '10px', fontSize: isMobile ? '1.1rem' : '1.2rem' }}>
                    ${item.precio_venta}
                  </div>

                  {item.materials.categories.is_inventoried ? (
                    <div style={{ fontSize: '0.78rem', color: item.stock_actual <= 0 ? '#b91c1c' : '#475569', marginTop: '10px' }}>
                      Stock: {item.stock_actual}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '10px' }}>
                      Venta sin inventario fisico
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section style={getCartContainerStyle(isTablet, isMobile)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, color: '#1f2937' }}>Cuenta Actual</h3>
              <p style={{ ...mutedTextStyle, margin: '6px 0 0 0' }}>{totalItems} articulos en la mesa</p>
            </div>
            <div style={cartBadgeStyle}>${total.toFixed(2)}</div>
          </div>

          <div style={cartListStyle}>
            {cart.length === 0 ? (
              <div style={emptyCartStyle}>
                <strong style={{ color: '#334155' }}>Aun no hay productos</strong>
                <span style={{ ...mutedTextStyle, marginTop: '6px' }}>Agrega articulos para comenzar la cuenta.</span>
              </div>
            ) : (
              cart.map((c) => (
                <div key={c.material_id} style={cartItemStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.95rem', color: '#0f172a', fontWeight: '700' }}>{c.name}</div>
                    <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px' }}>
                      ${c.unit_price} c/u
                    </div>
                  </div>

                  <div style={cartActionsStyle}>
                    <div style={quantityControlStyle}>
                      <button onClick={() => changeQuantity(c.material_id, -1)} style={qtyBtnStyle} type="button">
                        -
                      </button>
                      <span style={qtyValueStyle}>{c.quantity}</span>
                      <button onClick={() => changeQuantity(c.material_id, 1)} style={qtyBtnStyle} type="button">
                        +
                      </button>
                    </div>

                    <button onClick={() => removeFromCart(c.material_id)} style={deleteBtnStyle} type="button">
                      Quitar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={checkoutPanelStyle}>
            <div style={checkoutRowStyle}>
              <span>Total</span>
              <strong>${total.toFixed(2)}</strong>
            </div>
            <button onClick={handleFinalizeSale} disabled={cart.length === 0} style={checkoutBtnStyle}>
              Finalizar Venta
            </button>
          </div>
        </section>
      </div>
      {ticketData && <TicketModal ticket={ticketData} onClose={() => setTicketData(null)} />}
    </>
  )
}

const TicketModal = ({ ticket, onClose }) => {
  const chargedAt = new Date(ticket.chargedAt)
  const dateLabel = chargedAt.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const timeLabel = chargedAt.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const handlePrintTicket = () => {
    const watermarkUrl = new URL('../assets/la_carreta_sin_fondo.png', import.meta.url).href
    const printWindow = window.open('', '_blank', 'width=760,height=900')

    if (!printWindow) {
      alert('No se pudo abrir la ventana de impresion. Revisa si el navegador bloqueo la ventana emergente.')
      return
    }

    const itemsMarkup = ticket.items
      .map(
        (item) => `
          <div class="ticket-row">
            <div>
              <div class="item-name">${item.name}</div>
              <div class="item-meta">${item.quantity} x $${item.unitPrice.toFixed(2)}</div>
            </div>
            <strong>$${item.subtotal.toFixed(2)}</strong>
          </div>
        `
      )
      .join('')

    printWindow.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Ticket Virtual</title>
          <style>
            body {
              margin: 0;
              font-family: Arial, sans-serif;
              background: #f3f4f6;
              color: #111827;
            }
            .sheet {
              position: relative;
              max-width: 560px;
              margin: 24px auto;
              padding: 24px;
              background: #ffffff;
              border-radius: 18px;
              overflow: hidden;
              box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
            }
            .watermark {
              position: absolute;
              inset: 50% auto auto 50%;
              transform: translate(-50%, -50%);
              width: 78%;
              opacity: 0.08;
              pointer-events: none;
            }
            .header,
            .total-row,
            .ticket-row,
            .items-header {
              position: relative;
              z-index: 1;
            }
            .header h1 {
              margin: 0 0 14px 0;
              font-size: 24px;
            }
            .meta {
              position: relative;
              z-index: 1;
              display: grid;
              gap: 6px;
              margin-bottom: 18px;
              font-size: 14px;
              color: #374151;
            }
            .items-header {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              padding-bottom: 8px;
              border-bottom: 1px solid #e5e7eb;
              font-size: 12px;
              font-weight: 700;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: 0.04em;
            }
            .ticket-row {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 12px;
              padding: 12px 0;
              border-bottom: 1px solid #f1f5f9;
            }
            .item-name {
              font-weight: 700;
            }
            .item-meta {
              margin-top: 4px;
              color: #6b7280;
              font-size: 13px;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-top: 18px;
              padding-top: 14px;
              border-top: 2px solid #e5e7eb;
              font-size: 18px;
              font-weight: 800;
            }
            @media print {
              body {
                background: #ffffff;
              }
              .sheet {
                margin: 0;
                max-width: none;
                border-radius: 0;
                box-shadow: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <img src="${watermarkUrl}" alt="" class="watermark" />
            <div class="header">
              <h1>Ticket Virtual</h1>
            </div>
            <div class="meta">
              <div><strong>Fecha:</strong> ${dateLabel}</div>
              <div><strong>Hora:</strong> ${timeLabel}</div>
              <div><strong>Mesa:</strong> ${ticket.tableNumber || 'General'}</div>
              ${ticket.saleId ? `<div><strong>Venta:</strong> ${ticket.saleId}</div>` : ''}
            </div>
            <div class="items-header">
              <span>Producto</span>
              <span>Importe</span>
            </div>
            ${itemsMarkup}
            <div class="total-row">
              <span>Total</span>
              <strong>$${ticket.total.toFixed(2)}</strong>
            </div>
          </div>
        </body>
      </html>
    `)

    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <div style={ticketOverlayStyle}>
      <div style={ticketCardStyle}>
        <img src={logoCarreta} alt="" style={ticketWatermarkStyle} />

        <div style={ticketHeaderStyle}>
          <h3 style={{ margin: 0, color: '#111827' }}>Ticket Virtual</h3>
          <div style={ticketHeaderActionsStyle}>
            <button type="button" onClick={handlePrintTicket} style={ticketPrintBtnStyle}>
              Imprimir
            </button>
            <button type="button" onClick={onClose} style={ticketCloseBtnStyle}>
              Cerrar
            </button>
          </div>
        </div>

        <div style={ticketMetaStyle}>
          <div><strong>Fecha:</strong> {dateLabel}</div>
          <div><strong>Hora:</strong> {timeLabel}</div>
          <div><strong>Mesa:</strong> {ticket.tableNumber || 'General'}</div>
          {ticket.saleId && <div><strong>Venta:</strong> {ticket.saleId}</div>}
        </div>

        <div style={ticketItemsWrapStyle}>
          <div style={ticketItemsHeaderStyle}>
            <span>Producto</span>
            <span>Importe</span>
          </div>

          {ticket.items.map((item, index) => (
            <div key={`${item.name}-${index}`} style={ticketItemRowStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={ticketItemNameStyle}>{item.name}</div>
                <div style={ticketItemMetaStyle}>
                  {item.quantity} x ${item.unitPrice.toFixed(2)}
                </div>
              </div>
              <strong style={{ color: '#111827' }}>${item.subtotal.toFixed(2)}</strong>
            </div>
          ))}
        </div>

        <div style={ticketTotalStyle}>
          <span>Total</span>
          <strong>${ticket.total.toFixed(2)}</strong>
        </div>
      </div>
    </div>
  )
}

const getContainerStyle = (isMobile) => ({
  padding: isMobile ? '16px' : '24px',
  backgroundColor: '#f8fafc',
  minHeight: '100vh',
})

const getWorkspaceStyle = (isTablet, isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 1fr) 380px',
  gap: isMobile ? '16px' : '20px',
  padding: isMobile ? '12px' : '20px',
  backgroundColor: '#f8fafc',
  minHeight: '100vh',
  fontFamily: 'sans-serif',
})

const heroCardStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '18px',
  padding: '18px',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
  marginBottom: '18px',
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  flexWrap: 'wrap',
}

const mutedTextStyle = {
  color: '#64748b',
  fontSize: '0.9rem',
  lineHeight: 1.4,
}

const getStatsGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(2, 130px)',
  gap: '10px',
  width: isMobile ? '100%' : 'auto',
})

const statCardStyle = {
  backgroundColor: '#f8fafc',
  borderRadius: '14px',
  padding: '12px 14px',
  border: '1px solid #e2e8f0',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const statLabelStyle = {
  color: '#64748b',
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const statValueStyle = {
  color: '#0f172a',
  fontSize: '1.2rem',
}

const getTableGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(170px, 1fr))',
  gap: isMobile ? '12px' : '18px',
})

const getTableButtonStyle = (isMobile) => ({
  minHeight: isMobile ? '132px' : '148px',
  padding: isMobile ? '18px 14px' : '24px 18px',
  borderRadius: '18px',
  border: 'none',
  color: 'white',
  cursor: 'pointer',
  boxShadow: '0 14px 25px rgba(15, 23, 42, 0.14)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  textAlign: 'left',
})

const tableStatusBadgeStyle = {
  backgroundColor: 'rgba(255,255,255,0.18)',
  borderRadius: '999px',
  padding: '6px 10px',
  fontSize: '0.72rem',
  fontWeight: '700',
  letterSpacing: '0.04em',
}

const topBarStyle = (isMobile) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: isMobile ? 'stretch' : 'center',
  flexDirection: isMobile ? 'column' : 'row',
  gap: '12px',
  marginBottom: '16px',
})

const tableInfoCardStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '14px',
  padding: '12px 14px',
  border: '1px solid #e2e8f0',
  display: 'flex',
  flexDirection: 'column',
  minWidth: '140px',
}

const tableInfoLabelStyle = {
  color: '#64748b',
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: '4px',
}

const getProductGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: isMobile ? '12px' : '16px',
})

const getProductCardStyle = (isMobile) => ({
  padding: isMobile ? '14px 12px' : '16px',
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
  border: '1px solid #e2e8f0',
  display: 'flex',
  flexDirection: 'column',
  textAlign: 'left',
  minHeight: isMobile ? '150px' : '164px',
})

const productCategoryPillStyle = {
  alignSelf: 'flex-start',
  backgroundColor: '#eff6ff',
  color: '#1d4ed8',
  padding: '5px 10px',
  borderRadius: '999px',
  fontSize: '0.72rem',
  fontWeight: '700',
  marginBottom: '10px',
}

const getCartContainerStyle = (isTablet, isMobile) => ({
  backgroundColor: '#ffffff',
  padding: isMobile ? '16px' : '20px',
  borderRadius: '18px',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  height: isTablet ? 'auto' : 'calc(100vh - 40px)',
  maxHeight: isTablet ? 'none' : 'calc(100vh - 40px)',
  position: isTablet ? 'static' : 'sticky',
  top: isTablet ? 'auto' : '20px',
})

const cartBadgeStyle = {
  backgroundColor: '#ecfdf5',
  color: '#047857',
  borderRadius: '999px',
  padding: '8px 12px',
  fontWeight: '800',
  fontSize: '0.95rem',
}

const cartListStyle = {
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
}

const emptyCartStyle = {
  backgroundColor: '#f8fafc',
  border: '1px dashed #cbd5e1',
  borderRadius: '16px',
  padding: '18px',
  display: 'flex',
  flexDirection: 'column',
}

const cartItemStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: '10px',
  padding: '14px',
  borderRadius: '14px',
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
}

const cartActionsStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '10px',
  flexWrap: 'wrap',
}

const quantityControlStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  backgroundColor: '#ffffff',
  borderRadius: '999px',
  padding: '4px',
  border: '1px solid #cbd5e1',
}

const qtyBtnStyle = {
  width: '34px',
  height: '34px',
  borderRadius: '50%',
  border: 'none',
  backgroundColor: '#e2e8f0',
  color: '#0f172a',
  fontWeight: '800',
  cursor: 'pointer',
}

const qtyValueStyle = {
  minWidth: '18px',
  textAlign: 'center',
  fontWeight: '700',
  color: '#0f172a',
}

const deleteBtnStyle = {
  background: 'none',
  border: 'none',
  color: '#dc2626',
  cursor: 'pointer',
  fontSize: '0.88rem',
  fontWeight: '700',
  padding: '6px 0',
}

const checkoutPanelStyle = {
  borderTop: '1px solid #e2e8f0',
  paddingTop: '14px',
}

const checkoutRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '1.12rem',
  fontWeight: '800',
  color: '#0f172a',
}

const btnSecondaryStyle = {
  padding: '12px 18px',
  backgroundColor: '#1f2937',
  color: 'white',
  border: 'none',
  borderRadius: '12px',
  cursor: 'pointer',
  fontWeight: '700',
  fontSize: '0.95rem',
}

const checkoutBtnStyle = {
  width: '100%',
  marginTop: '14px',
  padding: '15px',
  backgroundColor: '#16a34a',
  color: 'white',
  border: 'none',
  borderRadius: '14px',
  fontWeight: '800',
  fontSize: '1rem',
  cursor: 'pointer',
}

const ticketOverlayStyle = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.52)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '18px',
  zIndex: 1000,
}

const ticketCardStyle = {
  position: 'relative',
  width: '100%',
  maxWidth: '520px',
  backgroundColor: '#ffffff',
  borderRadius: '22px',
  boxShadow: '0 30px 70px rgba(15, 23, 42, 0.28)',
  padding: '22px',
  overflow: 'hidden',
}

const ticketWatermarkStyle = {
  position: 'absolute',
  inset: '50% auto auto 50%',
  transform: 'translate(-50%, -50%)',
  width: '78%',
  opacity: 0.08,
  pointerEvents: 'none',
}

const ticketHeaderStyle = {
  position: 'relative',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '16px',
}

const ticketHeaderActionsStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
}

const ticketPrintBtnStyle = {
  border: 'none',
  borderRadius: '999px',
  backgroundColor: '#16a34a',
  color: '#ffffff',
  fontWeight: '700',
  cursor: 'pointer',
  padding: '8px 14px',
}

const ticketCloseBtnStyle = {
  border: 'none',
  borderRadius: '999px',
  backgroundColor: '#e2e8f0',
  color: '#0f172a',
  fontWeight: '700',
  cursor: 'pointer',
  padding: '8px 12px',
}

const ticketMetaStyle = {
  position: 'relative',
  display: 'grid',
  gap: '6px',
  color: '#374151',
  marginBottom: '18px',
  fontSize: '0.95rem',
}

const ticketItemsWrapStyle = {
  position: 'relative',
  display: 'grid',
  gap: '10px',
}

const ticketItemsHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  color: '#6b7280',
  fontWeight: '700',
  fontSize: '0.82rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  paddingBottom: '8px',
  borderBottom: '1px solid #e5e7eb',
}

const ticketItemRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
}

const ticketItemNameStyle = {
  color: '#111827',
  fontWeight: '700',
}

const ticketItemMetaStyle = {
  color: '#6b7280',
  fontSize: '0.88rem',
  marginTop: '3px',
}

const ticketTotalStyle = {
  position: 'relative',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: '20px',
  paddingTop: '16px',
  borderTop: '2px solid #e5e7eb',
  fontSize: '1.08rem',
  color: '#111827',
}

export default POS
