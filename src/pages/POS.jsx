import React, { useEffect, useRef, useState } from 'react'
import { materialService } from '../api/materialService'
import { posService } from '../api/posService'
import { useAuth } from '../contexts/AuthContext'
import { ACTION_KEYS, PAGE_PERMISSION_MAP } from '../lib/permissionConfig'
import { supabase } from '../lib/supabase'
import { useResponsive } from '../lib/useResponsive'
import logoCarreta from '../assets/la_carreta_sin_fondo.png'

const TICKET_WIDTH_MM = 80
let jsPdfModulePromise = null

const loadJsPdf = async () => {
  if (!jsPdfModulePromise) {
    jsPdfModulePromise = import('jspdf')
  }

  return jsPdfModulePromise
}

const POS = ({ onEditingStateChange = () => {} }) => {
  const [inventory, setInventory] = useState([])
  const [tables, setTables] = useState([])
  const [selectedTable, setSelectedTable] = useState(null)
  const [cart, setCart] = useState([])
  const [ticketData, setTicketData] = useState(null)
  const [notice, setNotice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isHydratingTable, setIsHydratingTable] = useState(false)
  const [waiterEditLocked, setWaiterEditLocked] = useState(false)
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false)
  const { isMobile, isTablet } = useResponsive()
  const { can, isManager, isSuperadmin, isWaiter } = useAuth()
  const canCreateSale = can(PAGE_PERMISSION_MAP.pos, ACTION_KEYS.CREATE)
  const canEditSale = can(PAGE_PERMISSION_MAP.pos, ACTION_KEYS.EDIT)
  const canOperatePOS = canCreateSale || canEditSale
  const canFullyEditOccupiedTable = isSuperadmin || isManager
  const latestTableRef = useRef(null)
  const latestCartRef = useRef([])

  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([loadInventory(), loadTables()])
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [isWaiter])

  useEffect(() => {
    if (!notice) return undefined

    const timer = window.setTimeout(() => {
      setNotice(null)
    }, 3200)

    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const handleTicketNotice = (event) => {
      if (event.detail) {
        showNotice(event.detail, 'info')
      }
    }

    window.addEventListener('pos-ticket-notice', handleTicketNotice)
    return () => window.removeEventListener('pos-ticket-notice', handleTicketNotice)
  }, [isWaiter])

  useEffect(() => {
    latestTableRef.current = selectedTable
    latestCartRef.current = cart
  }, [cart, selectedTable])

  const isOccupiedTable = selectedTable?.status === 'ocupada' || Boolean(selectedTable?.current_order_id)
  const meseroLockedTable =
    isWaiter && isOccupiedTable && !canFullyEditOccupiedTable && waiterEditLocked
  const canDecreaseOrRemoveFromOccupiedTable = !meseroLockedTable

  useEffect(() => {
    onEditingStateChange(Boolean(selectedTable))

    return () => {
      onEditingStateChange(false)
    }
  }, [onEditingStateChange, selectedTable])

  useEffect(() => {
    if (!selectedTable || isHydratingTable) return undefined

    const persistCurrentTable = async () => {
      try {
        const persistedTable = await persistTableOrder(selectedTable, cart)
        if (
          persistedTable &&
          (
            persistedTable.current_order_id !== selectedTable.current_order_id ||
            persistedTable.status !== selectedTable.status
          )
        ) {
          setSelectedTable(persistedTable)
        }
        await loadTables()
      } catch (error) {
        console.error('Error al guardar automaticamente la mesa:', error)
      }
    }

    persistCurrentTable()
    return undefined
  }, [cart, isHydratingTable, selectedTable])

  useEffect(() => {
    const handlePageHide = () => {
      const table = latestTableRef.current
      const items = latestCartRef.current

      if (!table) return

      persistTableOrder(table, items, {
        lockWaiterEditing: isWaiter && items.length > 0,
      }).catch((error) => {
        console.error('Error al guardar la mesa al salir de la pantalla:', error)
      })
    }

    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [isWaiter])

  const showNotice = (message, type = 'info') => {
    setNotice({ message, type })
  }

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
      setIsHydratingTable(true)
      setSelectedTable(table)
      setWaiterEditLocked(false)

      if (!table.current_order_id) {
        setCart([])
        setIsHydratingTable(false)
        return
      }

      const { data: order, error } = await supabase
        .from('table_orders')
        .select('*')
        .eq('id', table.current_order_id)
        .maybeSingle()

      if (error) throw error
      setCart(order?.items || [])
      setWaiterEditLocked(Boolean(order?.waiter_edit_locked))
    } catch (error) {
      console.error('Error al cargar la mesa:', error)
      alert('No se pudo abrir la mesa.')
    } finally {
      setIsHydratingTable(false)
    }
  }

  const persistTableOrder = async (table, items, options = {}) => {
    const { table: persistedTable, order } = await posService.saveTableOrder({
      table_id: table.id,
      items,
      lock_waiter_editing: Boolean(options.lockWaiterEditing),
    })

    setWaiterEditLocked(Boolean(order?.waiter_edit_locked))
    return persistedTable
  }

  const handleSaveAndExit = async () => {
    if (!canOperatePOS || !selectedTable) return

    try {
      const persistedTable = await persistTableOrder(selectedTable, cart, {
        lockWaiterEditing: isWaiter && cart.length > 0,
      })
      if (persistedTable) {
        setSelectedTable(persistedTable)
      }
      setSelectedTable(null)
      setWaiterEditLocked(false)
      setCart([])
      await loadTables()
    } catch (error) {
      console.error('Error al guardar la mesa:', error)
      alert('Error al guardar la mesa')
    }
  }

  const addToCart = (item) => {
    if (!canOperatePOS) return
    const isExtra = item.materials?.categories?.name === 'Extras'

    if (item.precio_venta <= 0) {
      showNotice('Este producto no tiene precio de venta asignado.', 'warning')
      return
    }

    if (!isExtra && item.stock_actual <= 0) {
      showNotice('No hay existencias de este producto.', 'warning')
      return
    }

    const existing = cart.find((c) => c.material_id === item.materials.id)

    if (!isExtra && existing && existing.quantity >= item.stock_actual) {
      showNotice(`Solo hay ${item.stock_actual} unidades disponibles.`, 'warning')
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
    if (!canOperatePOS) return
    if (delta < 0 && !canDecreaseOrRemoveFromOccupiedTable) {
      showNotice('Los meseros no pueden disminuir cantidades en una mesa ya ocupada. Solo un manager puede hacerlo.', 'warning')
      return
    }

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
    if (!canOperatePOS) return
    if (!canDecreaseOrRemoveFromOccupiedTable) {
      showNotice('Los meseros no pueden remover productos de una mesa ya ocupada. Solo un manager puede hacerlo.', 'warning')
      return
    }
    setCart(cart.filter((c) => c.material_id !== id))
  }

  const total = cart.reduce((acc, curr) => acc + curr.unit_price * curr.quantity, 0)
  const totalItems = cart.reduce((acc, curr) => acc + curr.quantity, 0)
  const availableProducts = inventory.filter((item) => item.materials?.categories?.is_for_sale === true)
  const occupiedTables = tables.filter((table) => table.status === 'ocupada').length

  const buildTicketData = (sale, items, table, documentNumber) => {
    const chargedAt = sale?.created_at || new Date().toISOString()

    return {
      saleId: sale?.id,
      documentNumber,
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

  const handleRequestFinalizeSale = () => {
    if (!canOperatePOS) return
    if (!selectedTable || cart.length === 0) return
    setShowFinalizeConfirm(true)
  }

  const handleFinalizeSale = async () => {
    if (!canOperatePOS) return
    if (!selectedTable || cart.length === 0) return

    try {
      setShowFinalizeConfirm(false)
      const centerId = inventory[0]?.centers?.id
      if (!centerId) {
        showNotice('No se encontro un centro de inventario para procesar la venta.', 'warning')
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
          showNotice(`No hay stock suficiente para ${item.name}. Disponible: ${availableStock}, solicitado: ${item.quantity}.`, 'warning')
          await loadInventory()
          return
        }
      }


      const { sale } = await posService.finalizeSale({
        table_id: selectedTable.id,
        items: normalizedCart,
        payment_method: 'Efectivo',
      })
      const documentNumber = sale?.document_number || null
      setTicketData(buildTicketData(sale, normalizedCart, selectedTable, documentNumber))
      showNotice('Venta realizada con exito', 'success')
      setCart([])
      setSelectedTable(null)
      setWaiterEditLocked(false)
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
        {notice && <NoticeBanner notice={notice} onClose={() => setNotice(null)} />}
        <div style={getContainerStyle(isMobile)}>
          <div style={heroCardStyle}>
            <div>
              <h2 style={{ color: '#1f2937', margin: 0, fontSize: isMobile ? '1.5rem' : '1.9rem' }}>Mapa de Mesas</h2>
              <p style={{ ...mutedTextStyle, margin: '8px 0 0 0' }}>
                Toca una mesa para abrir su cuenta y seguir tomando pedidos.
              </p>
              {!canOperatePOS && (
                <div style={readOnlyHintStyle}>
                  Tu usuario puede consultar mesas, pero no modificar pedidos.
                </div>
              )}
              {meseroLockedTable && (
                <div style={warningHintStyle}>
                  Mesa ocupada: como mesero solo puedes agregar productos o aumentar cantidades.
                </div>
              )}
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
      {notice && <NoticeBanner notice={notice} onClose={() => setNotice(null)} />}
      <div style={getWorkspaceStyle(isTablet, isMobile)}>
        <section>
          <div style={topBarStyle(isMobile)}>
            <button onClick={handleSaveAndExit} disabled={!canOperatePOS} style={canOperatePOS ? btnSecondaryStyle : disabledSecondaryBtnStyle}>
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
              {!canOperatePOS && (
                <div style={readOnlyHintStyle}>
                  Modo solo lectura. Puedes revisar el contenido de la mesa, pero no cambiarlo.
                </div>
              )}
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
                    cursor: !canOperatePOS || isOutOfStock ? 'not-allowed' : 'pointer',
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
                      <button onClick={() => changeQuantity(c.material_id, -1)} disabled={!canOperatePOS || !canDecreaseOrRemoveFromOccupiedTable} style={canOperatePOS && canDecreaseOrRemoveFromOccupiedTable ? qtyBtnStyle : disabledQtyBtnStyle} type="button">
                        -
                      </button>
                      <span style={qtyValueStyle}>{c.quantity}</span>
                      <button onClick={() => changeQuantity(c.material_id, 1)} disabled={!canOperatePOS} style={canOperatePOS ? qtyBtnStyle : disabledQtyBtnStyle} type="button">
                        +
                      </button>
                    </div>

                    <button onClick={() => removeFromCart(c.material_id)} disabled={!canOperatePOS || !canDecreaseOrRemoveFromOccupiedTable} style={canOperatePOS && canDecreaseOrRemoveFromOccupiedTable ? deleteBtnStyle : disabledDeleteBtnStyle} type="button">
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
            <button onClick={handleRequestFinalizeSale} disabled={cart.length === 0 || !canOperatePOS} style={cart.length === 0 || !canOperatePOS ? disabledCheckoutBtnStyle : checkoutBtnStyle}>
              Finalizar Venta
            </button>
          </div>
        </section>
      </div>
      {ticketData && <TicketModal ticket={ticketData} onClose={() => setTicketData(null)} />}
      {showFinalizeConfirm && (
        <FinalizeSaleModal
          table={selectedTable}
          total={total}
          totalItems={totalItems}
          onCancel={() => setShowFinalizeConfirm(false)}
          onConfirm={handleFinalizeSale}
        />
      )}
    </>
  )
}

const NoticeBanner = ({ notice, onClose }) => (
  <div style={noticeWrapStyle}>
    <div
      style={{
        ...noticeCardStyle,
        borderLeft: `5px solid ${getNoticeAccent(notice.type)}`,
      }}
    >
      <div>
        <strong style={{ color: '#111827', display: 'block', marginBottom: '4px' }}>
          {getNoticeTitle(notice.type)}
        </strong>
        <span style={{ color: '#475569' }}>{notice.message}</span>
      </div>
      <button type="button" onClick={onClose} style={noticeCloseStyle}>
        Cerrar
      </button>
    </div>
  </div>
)

const FinalizeSaleModal = ({ table, total, totalItems, onCancel, onConfirm }) => (
  <div style={confirmOverlayStyle}>
    <div style={confirmCardStyle}>
      <div style={confirmBadgeStyle}>Confirmar venta</div>
      <h3 style={confirmTitleStyle}>Estas por finalizar la cuenta</h3>
      <p style={confirmTextStyle}>
        Se cerrara la venta de <strong>Mesa {table?.number || 'General'}</strong> y la mesa quedara libre para un nuevo pedido.
      </p>
      <div style={confirmSummaryStyle}>
        <div style={confirmMetricStyle}>
          <span style={confirmMetricLabelStyle}>Articulos</span>
          <strong style={confirmMetricValueStyle}>{totalItems}</strong>
        </div>
        <div style={confirmMetricStyle}>
          <span style={confirmMetricLabelStyle}>Total</span>
          <strong style={confirmMetricValueStyle}>{total.toFixed(2)}</strong>
        </div>
      </div>
      <div style={confirmActionsStyle}>
        <button type="button" onClick={onCancel} style={confirmCancelBtnStyle}>
          Cancelar
        </button>
        <button type="button" onClick={onConfirm} style={confirmApproveBtnStyle}>
          Si, finalizar venta
        </button>
      </div>
    </div>
  </div>
)
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
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const ticketReference = ticket.documentNumber

  const loadLogoDataUrl = async () => {
    const response = await fetch(logoCarreta)
    const blob = await response.blob()

    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  const buildTicketPdf = async () => {
    const { jsPDF } = await loadJsPdf()
    const pageWidth = TICKET_WIDTH_MM
    const margin = 6
    const lineHeight = 4.3
    const itemBlockHeight = 9
    const baseHeight = 52
    const footerHeight = 16
    const pageHeight = Math.max(110, baseHeight + ticket.items.length * itemBlockHeight + footerHeight)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pageWidth, pageHeight],
    })

    const watermarkUrl = await loadLogoDataUrl()
    const centerX = pageWidth / 2
    const contentWidth = pageWidth - margin * 2
    const headerRight = pageWidth - margin
    let y = 8

    pdf.setFillColor(255, 255, 255)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    pdf.setGState(new pdf.GState({ opacity: 0.08 }))
    pdf.addImage(watermarkUrl, 'PNG', 9, pageHeight / 2 - 22, 62, 44, undefined, 'FAST')
    pdf.setGState(new pdf.GState({ opacity: 1 }))

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(13)
    pdf.text('LA CARRETA', centerX, y, { align: 'center' })
    y += 6

    pdf.setFontSize(10)
    pdf.text('Ticket virtual', centerX, y, { align: 'center' })
    y += 7

    pdf.setDrawColor(203, 213, 225)
    pdf.line(margin, y, headerRight, y)
    y += 5

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    if (ticketReference) {
      pdf.text(`Folio de venta: ${ticketReference}`, margin, y)
      y += lineHeight
    }
    pdf.text(`Fecha: ${dateLabel}`, margin, y)
    y += lineHeight
    pdf.text(`Hora: ${timeLabel}`, margin, y)
    y += lineHeight
    pdf.text(`Mesa: ${ticket.tableNumber || 'General'}`, margin, y)
    y += lineHeight

    y += 2
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.text('Producto', margin, y)
    pdf.text('Importe', headerRight, y, { align: 'right' })
    y += 2
    pdf.line(margin, y, headerRight, y)
    y += 5

    ticket.items.forEach((item) => {
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8.4)
      const itemNameLines = pdf.splitTextToSize(item.name, contentWidth - 16)
      pdf.text(itemNameLines, margin, y)

      pdf.text(`$${item.subtotal.toFixed(2)}`, headerRight, y, { align: 'right' })

      y += itemNameLines.length * 3.7
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.8)
      pdf.text(`${item.quantity} x $${item.unitPrice.toFixed(2)}`, margin, y)
      y += 5
    })

    pdf.line(margin, y, headerRight, y)
    y += 6

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10.5)
    pdf.text('Total', margin, y)
    pdf.text(`$${ticket.total.toFixed(2)}`, headerRight, y, { align: 'right' })

    return pdf
  }

  const handleDownloadPdf = async () => {
    try {
      setIsExportingPdf(true)
      const pdf = await buildTicketPdf()
      pdf.save(`ticket-la-carreta-${ticket.documentNumber || Date.now()}.pdf`)
    } catch (error) {
      console.error('Error al generar PDF:', error)
      alert('No se pudo generar el PDF del ticket.')
    } finally {
      setIsExportingPdf(false)
    }
  }

  const handleShareTicket = async () => {
    try {
      setIsExportingPdf(true)
      const pdf = await buildTicketPdf()
      const blob = pdf.output('blob')
      const file = new File([blob], `ticket-la-carreta-${ticket.documentNumber || Date.now()}.pdf`, {
        type: 'application/pdf',
      })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Ticket La Carreta',
          text: `Ticket de consumo${ticket.tableNumber ? ` - Mesa ${ticket.tableNumber}` : ''}`,
          files: [file],
        })
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        link.click()
        URL.revokeObjectURL(url)
        showTicketNotice('Tu navegador no permite compartir archivos directamente. Se descargo el PDF para que lo compartas manualmente.')
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('Error al compartir ticket:', error)
        alert('No se pudo compartir el ticket en este dispositivo.')
      }
    } finally {
      setIsExportingPdf(false)
    }
  }

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
            @page {
              size: ${TICKET_WIDTH_MM}mm auto;
              margin: 0;
            }
            .sheet {
              position: relative;
              width: ${TICKET_WIDTH_MM}mm;
              max-width: ${TICKET_WIDTH_MM}mm;
              margin: 24px auto;
              padding: 8mm 6mm;
              background: #ffffff;
              border-radius: 18px;
              overflow: hidden;
              box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
              box-sizing: border-box;
            }
            .watermark {
              position: absolute;
              inset: 50% auto auto 50%;
              transform: translate(-50%, -50%);
              width: 64mm;
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
                width: ${TICKET_WIDTH_MM}mm;
                max-width: ${TICKET_WIDTH_MM}mm;
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
              ${ticketReference ? `<div><strong>Folio de venta:</strong> ${ticketReference}</div>` : ''}
              <div><strong>Fecha:</strong> ${dateLabel}</div>
              <div><strong>Hora:</strong> ${timeLabel}</div>
              <div><strong>Mesa:</strong> ${ticket.tableNumber || 'General'}</div>
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
            <button type="button" onClick={handleDownloadPdf} style={ticketPdfBtnStyle} disabled={isExportingPdf}>
              {isExportingPdf ? 'Generando...' : 'Descargar PDF'}
            </button>
            <button type="button" onClick={handleShareTicket} style={ticketShareBtnStyle} disabled={isExportingPdf}>
              Compartir
            </button>
            <button type="button" onClick={handlePrintTicket} style={ticketPrintBtnStyle} disabled={isExportingPdf}>
              Imprimir
            </button>
            <button type="button" onClick={onClose} style={ticketCloseBtnStyle}>
              Cerrar
            </button>
          </div>
        </div>

        <div style={ticketMetaStyle}>
          {ticketReference && <div><strong>Folio de venta:</strong> {ticketReference}</div>}
          <div><strong>Fecha:</strong> {dateLabel}</div>
          <div><strong>Hora:</strong> {timeLabel}</div>
          <div><strong>Mesa:</strong> {ticket.tableNumber || 'General'}</div>
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

const showTicketNotice = (message) => {
  window.dispatchEvent(new CustomEvent('pos-ticket-notice', { detail: message }))
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
const disabledQtyBtnStyle = {
  ...qtyBtnStyle,
  color: '#94a3b8',
  cursor: 'not-allowed',
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
const disabledDeleteBtnStyle = {
  ...deleteBtnStyle,
  color: '#94a3b8',
  cursor: 'not-allowed',
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
const disabledSecondaryBtnStyle = {
  ...btnSecondaryStyle,
  backgroundColor: '#94a3b8',
  cursor: 'not-allowed',
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
const disabledCheckoutBtnStyle = {
  ...checkoutBtnStyle,
  backgroundColor: '#94a3b8',
  cursor: 'not-allowed',
}
const readOnlyHintStyle = {
  marginTop: '12px',
  display: 'inline-flex',
  padding: '8px 12px',
  borderRadius: '999px',
  backgroundColor: '#edf2f7',
  color: '#475569',
  fontWeight: '700',
  fontSize: '0.82rem',
}
const warningHintStyle = {
  marginTop: '12px',
  display: 'inline-flex',
  padding: '8px 12px',
  borderRadius: '999px',
  backgroundColor: '#fff7ed',
  color: '#b45309',
  fontWeight: '700',
  fontSize: '0.82rem',
}

const confirmOverlayStyle = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.52)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '18px',
  zIndex: 1050,
}

const confirmCardStyle = {
  width: '100%',
  maxWidth: '460px',
  backgroundColor: '#ffffff',
  borderRadius: '24px',
  boxShadow: '0 28px 70px rgba(15, 23, 42, 0.28)',
  padding: '24px',
  border: '1px solid #fecaca',
}

const confirmBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '8px 12px',
  borderRadius: '999px',
  backgroundColor: '#fff7ed',
  color: '#c2410c',
  fontWeight: '800',
  fontSize: '0.82rem',
  marginBottom: '14px',
}

const confirmTitleStyle = {
  margin: 0,
  color: '#111827',
  fontSize: '1.45rem',
}

const confirmTextStyle = {
  margin: '12px 0 0 0',
  color: '#475569',
  lineHeight: 1.65,
}

const confirmSummaryStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '12px',
  marginTop: '18px',
}

const confirmMetricStyle = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  padding: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const confirmMetricLabelStyle = {
  color: '#64748b',
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const confirmMetricValueStyle = {
  color: '#0f172a',
  fontSize: '1.1rem',
}

const confirmActionsStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
  flexWrap: 'wrap',
  marginTop: '22px',
}

const confirmCancelBtnStyle = {
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  color: '#334155',
  borderRadius: '12px',
  padding: '12px 16px',
  fontWeight: '700',
  cursor: 'pointer',
}

const confirmApproveBtnStyle = {
  border: 'none',
  backgroundColor: '#dc2626',
  color: '#ffffff',
  borderRadius: '12px',
  padding: '12px 16px',
  fontWeight: '800',
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

const ticketPdfBtnStyle = {
  border: 'none',
  borderRadius: '999px',
  backgroundColor: '#1d4ed8',
  color: '#ffffff',
  fontWeight: '700',
  cursor: 'pointer',
  padding: '8px 14px',
}

const ticketShareBtnStyle = {
  border: 'none',
  borderRadius: '999px',
  backgroundColor: '#7c3aed',
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

const noticeWrapStyle = {
  position: 'fixed',
  top: '18px',
  right: '18px',
  zIndex: 1100,
  width: 'min(420px, calc(100vw - 32px))',
}

const noticeCardStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.16)',
  padding: '14px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
}

const noticeCloseStyle = {
  border: 'none',
  background: 'transparent',
  color: '#1d4ed8',
  fontWeight: '700',
  cursor: 'pointer',
  padding: 0,
}

const getNoticeAccent = (type) => {
  if (type === 'success') return '#16a34a'
  if (type === 'warning') return '#d97706'
  return '#2563eb'
}

const getNoticeTitle = (type) => {
  if (type === 'success') return 'Operacion exitosa'
  if (type === 'warning') return 'Aviso'
  return 'Informacion'
}

export default POS





