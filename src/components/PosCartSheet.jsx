import { useEffect, useState } from 'react'
import { colors, radius, shadow, space, type } from '../lib/designTokens'

const qtyBtnBase = {
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  border: 'none',
  backgroundColor: colors.gray200,
  color: colors.gray900,
  fontWeight: type.black,
  fontSize: '1rem',
  cursor: 'pointer',
}

const deleteBtnBase = {
  padding: `${space[3]} ${space[6]}`,
  backgroundColor: colors.red100,
  color: colors.red700,
  border: `1px solid ${colors.red100}`,
  borderRadius: radius.md,
  fontWeight: type.bold,
  fontSize: type.xs,
  cursor: 'pointer',
}

const PosCartSheet = ({
  displayCart,
  canOperatePOS,
  canDecreaseOrRemoveFromOccupiedTable,
  onChangeQuantity,
  onRemoveFromCart,
  onClose,
}) => {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <>
      <div
        role="presentation"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.45)',
          zIndex: 400,
        }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: colors.white,
          borderRadius: `${radius.xl} ${radius.xl} 0 0`,
          boxShadow: shadow.lg,
          zIndex: 401,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.25s ease',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: `${space[5]} ${space[8]}`,
          borderBottom: `1px solid ${colors.gray200}`,
          flexShrink: 0,
        }}>
          <h3 style={{ margin: 0, color: colors.gray900, fontSize: type.lg }}>Cuenta actual</h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: `${space[3]} ${space[7]}`,
              backgroundColor: colors.gray800,
              color: colors.white,
              border: 'none',
              borderRadius: radius.md,
              fontWeight: type.bold,
              fontSize: type.base,
              cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>

        <div style={{
          overflowY: 'auto',
          flex: 1,
          padding: `${space[5]} ${space[6]}`,
          display: 'flex',
          flexDirection: 'column',
          gap: space[5],
        }}>
          {displayCart.length === 0 ? (
            <div style={{
              backgroundColor: colors.gray100,
              border: `1px dashed ${colors.gray300}`,
              borderRadius: radius.lg,
              padding: space[8],
              textAlign: 'center',
              color: colors.gray500,
            }}>
              Sin artículos en la cuenta
            </div>
          ) : (
            displayCart.map((item) => (
              <div key={item.id} style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr)',
                gap: space[5],
                padding: space[5],
                borderRadius: radius.lg,
                backgroundColor: colors.gray100,
                border: `1px solid ${colors.gray200}`,
              }}>
                <div>
                  <div style={{ fontSize: type.md, color: colors.gray900, fontWeight: type.bold }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: type.xs, color: colors.gray500, marginTop: space[1] }}>
                    {item.kind === 'bundle' ? `$${item.subtotal.toFixed(2)} bundle` : `$${item.unit_price} c/u`}
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: space[5],
                  flexWrap: 'wrap',
                }}>
                  {item.kind === 'bundle' ? (
                    <button
                      type="button"
                      onClick={() => onRemoveFromCart(item.id)}
                      disabled={!canOperatePOS || !canDecreaseOrRemoveFromOccupiedTable}
                      style={canOperatePOS && canDecreaseOrRemoveFromOccupiedTable
                        ? deleteBtnBase
                        : { ...deleteBtnBase, cursor: 'not-allowed', opacity: 0.5 }}
                    >
                      Quitar bundle
                    </button>
                  ) : (
                    <>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: space[4],
                        backgroundColor: colors.white,
                        borderRadius: radius.full,
                        padding: space[2],
                        border: `1px solid ${colors.gray300}`,
                      }}>
                        <button
                          type="button"
                          onClick={() => onChangeQuantity(item.id, -1)}
                          disabled={!canOperatePOS || !canDecreaseOrRemoveFromOccupiedTable}
                          style={canOperatePOS && canDecreaseOrRemoveFromOccupiedTable
                            ? qtyBtnBase
                            : { ...qtyBtnBase, backgroundColor: colors.gray100, color: colors.gray400, cursor: 'not-allowed' }}
                        >
                          −
                        </button>
                        <span style={{
                          minWidth: '28px',
                          textAlign: 'center',
                          fontWeight: type.black,
                          fontSize: type.md,
                          color: colors.gray900,
                        }}>
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onChangeQuantity(item.id, 1)}
                          disabled={!canOperatePOS}
                          style={canOperatePOS
                            ? qtyBtnBase
                            : { ...qtyBtnBase, backgroundColor: colors.gray100, color: colors.gray400, cursor: 'not-allowed' }}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveFromCart(item.id)}
                        disabled={!canOperatePOS || !canDecreaseOrRemoveFromOccupiedTable}
                        style={canOperatePOS && canDecreaseOrRemoveFromOccupiedTable
                          ? deleteBtnBase
                          : { ...deleteBtnBase, cursor: 'not-allowed', opacity: 0.5 }}
                      >
                        Quitar
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}

export default PosCartSheet
