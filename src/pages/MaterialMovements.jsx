import React, { useEffect, useMemo, useState } from 'react'
import { erpService } from '../api/erpService'
import { materialService } from '../api/materialService'
import { useAuth } from '../contexts/AuthContext'
import { ACTION_KEYS, PAGE_PERMISSION_MAP } from '../lib/permissionConfig'
import { useResponsive } from '../lib/useResponsive'

const MOVEMENT_TYPES = [
  {
    code: '101',
    label: 'Entradas (mov 101)',
    accent: '#0f766e',
    options: [
      { code: 'opening_balance', label: 'Inventario Inicial' },
      { code: 'adjustment_in', label: 'Ajuste de inventario (ingreso)' },
    ],
  },
  {
    code: '261',
    label: 'Salida (mov 261)',
    accent: '#b91c1c',
    options: [
      { code: 'promo_gift', label: 'Promo/Regalo' },
      { code: 'internal_use', label: 'Consumo propio' },
      { code: 'waste', label: 'Desperdicio' },
      { code: 'adjustment_out', label: 'Ajuste de inventario (salida)' },
    ],
  },
]

const normalizeMaterials = (rows = []) =>
  rows
    .filter((row) => row.materials?.categories?.is_inventoried === true)
    .map((row, index) => ({
      rowKey: `${row.materials?.id || 'material'}-${row.centers?.id || index}`,
      materialId: row.materials?.id || '',
      centerId: row.centers?.id || '',
      sku: row.materials?.sku || '',
      name: row.materials?.name || '',
      uomAbbr: row.materials?.uoms?.abbr || 'pz',
      currentStock: Number(row.stock_actual ?? 0),
      categoryName: row.materials?.categories?.name || 'Sin categoria',
      displayLabel: `${row.materials?.name || 'Producto'} (${row.materials?.sku || 'Sin SKU'})`,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }))

const MaterialMovements = () => {
  const { isMobile, isTablet } = useResponsive()
  const { can } = useAuth()
  const canCreateMovements = can(PAGE_PERMISSION_MAP.movements, ACTION_KEYS.CREATE)

  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [movementCode, setMovementCode] = useState('')
  const [movementOption, setMovementOption] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [selectedMaterial, setSelectedMaterial] = useState(null)
  const [quantity, setQuantity] = useState('')
  const [checkResult, setCheckResult] = useState(null)
  const [checkedKey, setCheckedKey] = useState('')
  const [checking, setChecking] = useState(false)
  const [posting, setPosting] = useState(false)

  const loadMaterials = async () => {
    setLoading(true)
    try {
      const rows = await materialService.getAllMaterials()
      setMaterials(normalizeMaterials(rows))
    } catch (error) {
      console.error('Error al cargar materiales para movimientos:', error)
      window.alert(error?.message || 'No se pudieron cargar los materiales.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMaterials()
  }, [])

  const selectedMovementType = useMemo(
    () => MOVEMENT_TYPES.find((movement) => movement.code === movementCode) || null,
    [movementCode]
  )

  const movementOptions = selectedMovementType?.options || []

  const currentFormKey = useMemo(
    () =>
      JSON.stringify({
        movementCode,
        movementOption,
        materialId: selectedMaterial?.materialId || '',
        centerId: selectedMaterial?.centerId || '',
        quantity: String(quantity || ''),
      }),
    [movementCode, movementOption, quantity, selectedMaterial?.centerId, selectedMaterial?.materialId]
  )

  const isCurrentFormChecked = checkedKey === currentFormKey
  const trimmedQuery = productQuery.trim().toLowerCase()

  const suggestions = useMemo(() => {
    if (!movementCode || !movementOption || !trimmedQuery) return []

    return materials
      .filter((material) => {
        const haystack = `${material.name} ${material.sku}`.toLowerCase()
        return haystack.includes(trimmedQuery)
      })
      .slice(0, 8)
  }, [materials, movementCode, movementOption, trimmedQuery])

  const resetValidation = () => {
    setCheckResult(null)
    setCheckedKey('')
  }

  const handleMovementTypeChange = (value) => {
    setMovementCode(value)
    setMovementOption('')
    setProductQuery('')
    setSelectedMaterial(null)
    setQuantity('')
    resetValidation()
  }

  const handleMovementOptionChange = (value) => {
    setMovementOption(value)
    setProductQuery('')
    setSelectedMaterial(null)
    setQuantity('')
    resetValidation()
  }

  const handleProductQueryChange = (value) => {
    setProductQuery(value)

    if (!selectedMaterial || value !== selectedMaterial.displayLabel) {
      setSelectedMaterial(null)
    }

    resetValidation()
  }

  const handleSelectMaterial = (material) => {
    setSelectedMaterial(material)
    setProductQuery(material.displayLabel)
    resetValidation()
  }

  const handleQuantityChange = (value) => {
    setQuantity(value)
    resetValidation()
  }

  const isFormReady =
    Boolean(movementCode) &&
    Boolean(movementOption) &&
    Boolean(selectedMaterial?.materialId) &&
    Number(quantity) > 0

  const buildPayload = () => ({
    center_id: selectedMaterial?.centerId || '',
    material_id: selectedMaterial?.materialId || '',
    movement_code: movementCode,
    movement_option: movementOption,
    quantity: Number(quantity),
  })

  const handleCheck = async () => {
    if (!canCreateMovements || !isFormReady) return

    setChecking(true)
    try {
      const response = await erpService.checkMaterialMovement(buildPayload())
      setCheckResult(response.validation || response)
      setCheckedKey(currentFormKey)
    } catch (error) {
      console.error('Error al verificar movimiento:', error)
      resetValidation()
      window.alert(error?.message || 'No se pudo verificar el movimiento.')
    } finally {
      setChecking(false)
    }
  }

  const clearForm = () => {
    setMovementCode('')
    setMovementOption('')
    setProductQuery('')
    setSelectedMaterial(null)
    setQuantity('')
    resetValidation()
  }

  const handlePost = async () => {
    if (!canCreateMovements || !isFormReady || !checkResult?.valid || !isCurrentFormChecked) return

    setPosting(true)
    try {
      const response = await erpService.postMaterialMovement(buildPayload())
      await loadMaterials()
      clearForm()
      window.alert(`Movimiento posteado correctamente. Documento ${response.document_number}.`)
    } catch (error) {
      console.error('Error al postear movimiento:', error)
      window.alert(error?.message || 'No se pudo postear el movimiento.')
    } finally {
      setPosting(false)
    }
  }

  if (loading) {
    return <div style={{ padding: '24px' }}>Cargando movimiento de materiales...</div>
  }

  const selectedUnit = selectedMaterial?.uomAbbr || '--'
  const showSuggestions = !selectedMaterial && suggestions.length > 0

  return (
    <div style={getPageStyle(isMobile)}>
      <section style={heroCardStyle}>
        <div style={heroHeaderStyle}>
          <div>
            <div style={eyebrowStyle}>ERP / INVENTARIO</div>
            <h1 style={titleStyle}>Movimiento de Materiales</h1>
            <p style={subtitleStyle}>
              Registra entradas y salidas controladas con validacion previa. El sistema revisa stock suficiente antes de postear y asigna un documento interno consecutivo.
            </p>
          </div>

          {!canCreateMovements && <span style={readOnlyBadgeStyle}>Solo lectura</span>}
        </div>
      </section>

      <section style={panelStyle}>
        <div style={getControlsGridStyle(isTablet)}>
          <div style={fieldBlockStyle}>
            <label htmlFor="movement-type" style={labelStyle}>
              Tipos de movimiento
            </label>
            <select
              id="movement-type"
              value={movementCode}
              onChange={(event) => handleMovementTypeChange(event.target.value)}
              style={inputStyle}
              disabled={!canCreateMovements}
            >
              <option value="">Selecciona un tipo...</option>
              {MOVEMENT_TYPES.map((movement) => (
                <option key={movement.code} value={movement.code}>
                  {movement.label}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldBlockStyle}>
            <label htmlFor="movement-option" style={labelStyle}>
              Opcion de movimiento
            </label>
            <select
              id="movement-option"
              value={movementOption}
              onChange={(event) => handleMovementOptionChange(event.target.value)}
              style={{
                ...inputStyle,
                ...(movementCode ? null : disabledInputStyle),
              }}
              disabled={!canCreateMovements || !movementCode}
            >
              <option value="">{movementCode ? 'Selecciona una opcion...' : 'Primero elige el tipo...'}</option>
              {movementOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={dividerStyle} />

        <div style={getFormGridStyle(isTablet)}>
          <div style={{ ...fieldBlockStyle, position: 'relative' }}>
            <label htmlFor="movement-product" style={labelStyle}>
              Producto
            </label>
            <input
              id="movement-product"
              type="text"
              value={productQuery}
              onChange={(event) => handleProductQueryChange(event.target.value)}
              placeholder={movementCode && movementOption ? 'Escribe nombre o SKU...' : 'Primero elige tipo y opcion...'}
              style={{
                ...inputStyle,
                ...autocompleteInputStyle,
                ...(movementCode && movementOption ? null : disabledInputStyle),
              }}
              disabled={!canCreateMovements || !movementCode || !movementOption}
              autoComplete="off"
            />

            {showSuggestions && (
              <div style={suggestionsPanelStyle}>
                {suggestions.map((material) => (
                  <button
                    key={material.rowKey}
                    type="button"
                    onClick={() => handleSelectMaterial(material)}
                    style={suggestionButtonStyle}
                  >
                    <span style={suggestionTitleStyle}>{material.name}</span>
                    <span style={suggestionMetaStyle}>
                      {material.sku} · Stock {material.currentStock} {material.uomAbbr}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={quantityWrapStyle}>
            <div style={{ ...fieldBlockStyle, flex: 1 }}>
              <label htmlFor="movement-quantity" style={labelStyle}>
                Cantidad
              </label>
              <input
                id="movement-quantity"
                type="number"
                min="0"
                step="0.001"
                value={quantity}
                onChange={(event) => handleQuantityChange(event.target.value)}
                placeholder="0.000"
                style={{
                  ...inputStyle,
                  ...(movementCode && movementOption ? null : disabledInputStyle),
                }}
                disabled={!canCreateMovements || !movementCode || !movementOption}
              />
            </div>

            <div style={{ ...fieldBlockStyle, width: isMobile ? '100%' : '160px' }}>
              <label htmlFor="movement-unit" style={labelStyle}>
                Unidad
              </label>
              <input id="movement-unit" value={selectedUnit} readOnly style={{ ...inputStyle, ...readOnlyInputStyle }} />
            </div>
          </div>
        </div>

        <div style={buttonRowStyle}>
          <button
            type="button"
            onClick={handleCheck}
            disabled={!canCreateMovements || !isFormReady || checking}
            style={{
              ...checkButtonStyle,
              ...((!canCreateMovements || !isFormReady || checking) ? disabledButtonStyle : null),
            }}
          >
            {checking ? 'Verificando...' : 'Check'}
          </button>

          <button
            type="button"
            onClick={handlePost}
            disabled={!canCreateMovements || !checkResult?.valid || !isCurrentFormChecked || posting}
            style={{
              ...postButtonStyle,
              ...((!canCreateMovements || !checkResult?.valid || !isCurrentFormChecked || posting) ? disabledButtonStyle : null),
            }}
          >
            {posting ? 'Posteando...' : 'Postear'}
          </button>
        </div>

        {checkResult && (
          <section
            style={{
              ...validationCardStyle,
              borderColor: checkResult.valid ? '#86efac' : '#fca5a5',
              background: checkResult.valid ? '#f0fdf4' : '#fef2f2',
            }}
          >
            <div style={validationHeaderStyle}>
              <div>
                <div style={validationTitleStyle}>{checkResult.valid ? 'Validacion correcta' : 'Validacion rechazada'}</div>
                <div style={validationMessageStyle}>{checkResult.message}</div>
              </div>
              <span
                style={{
                  ...statusPillStyle,
                  background: checkResult.valid ? '#dcfce7' : '#fee2e2',
                  color: checkResult.valid ? '#166534' : '#b91c1c',
                }}
              >
                {checkResult.valid ? 'OK' : 'Error'}
              </span>
            </div>

            <div style={validationGridStyle}>
              <div style={validationMetricStyle}>
                <span style={validationMetricLabelStyle}>Producto</span>
                <strong>{checkResult.product_name || selectedMaterial?.name || '--'}</strong>
              </div>
              <div style={validationMetricStyle}>
                <span style={validationMetricLabelStyle}>Movimiento</span>
                <strong>{checkResult.movement_label || '--'}</strong>
              </div>
              <div style={validationMetricStyle}>
                <span style={validationMetricLabelStyle}>Stock actual</span>
                <strong>
                  {Number(checkResult.current_stock ?? 0)} {checkResult.unit_abbr || selectedUnit}
                </strong>
              </div>
              <div style={validationMetricStyle}>
                <span style={validationMetricLabelStyle}>Stock proyectado</span>
                <strong>
                  {Number(checkResult.projected_stock ?? 0)} {checkResult.unit_abbr || selectedUnit}
                </strong>
              </div>
            </div>
          </section>
        )}
      </section>
    </div>
  )
}

const getPageStyle = (isMobile) => ({
  padding: isMobile ? '16px' : '20px 8px 34px',
  display: 'flex',
  flexDirection: 'column',
  gap: '18px',
})

const heroCardStyle = {
  background: 'linear-gradient(135deg, #ffffff 0%, #ecfeff 100%)',
  border: '1px solid #bae6fd',
  borderRadius: '24px',
  boxShadow: '0 18px 44px rgba(15, 23, 42, 0.08)',
  padding: '24px',
}

const heroHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '16px',
  flexWrap: 'wrap',
}

const eyebrowStyle = {
  color: '#0f766e',
  fontWeight: 900,
  fontSize: '0.8rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
}

const titleStyle = {
  margin: '10px 0 8px',
  color: '#0f172a',
  fontWeight: 900,
  fontSize: '1.9rem',
}

const subtitleStyle = {
  margin: 0,
  color: '#334155',
  lineHeight: 1.7,
  maxWidth: '850px',
}

const readOnlyBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '10px 14px',
  borderRadius: '999px',
  background: '#e2e8f0',
  color: '#334155',
  fontWeight: 800,
}

const panelStyle = {
  background: '#ffffff',
  borderRadius: '24px',
  padding: '22px',
  border: '1px solid rgba(203, 213, 225, 0.9)',
  boxShadow: '0 18px 42px rgba(15, 23, 42, 0.08)',
  display: 'flex',
  flexDirection: 'column',
  gap: '18px',
}

const getControlsGridStyle = (isTablet) => ({
  display: 'grid',
  gridTemplateColumns: isTablet ? '1fr' : 'repeat(2, minmax(0, 1fr))',
  gap: '16px',
})

const getFormGridStyle = (isTablet) => ({
  display: 'grid',
  gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 1.3fr) minmax(0, 1fr)',
  gap: '16px',
  alignItems: 'start',
})

const fieldBlockStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const labelStyle = {
  color: '#334155',
  fontWeight: 800,
  fontSize: '0.95rem',
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: '48px',
  borderRadius: '14px',
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#0f172a',
  padding: '12px 14px',
  fontSize: '1rem',
  outline: 'none',
}

const disabledInputStyle = {
  background: '#e2e8f0',
  color: '#64748b',
}

const readOnlyInputStyle = {
  background: '#f8fafc',
  fontWeight: 800,
}

const autocompleteInputStyle = {
  position: 'relative',
}

const suggestionsPanelStyle = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  marginTop: '6px',
  borderRadius: '16px',
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  boxShadow: '0 18px 34px rgba(15, 23, 42, 0.14)',
  overflow: 'hidden',
  zIndex: 10,
}

const suggestionButtonStyle = {
  width: '100%',
  border: 'none',
  borderBottom: '1px solid #e2e8f0',
  background: '#ffffff',
  color: '#0f172a',
  textAlign: 'left',
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  cursor: 'pointer',
}

const suggestionTitleStyle = {
  fontWeight: 800,
}

const suggestionMetaStyle = {
  color: '#64748b',
  fontSize: '0.9rem',
}

const quantityWrapStyle = {
  display: 'flex',
  gap: '16px',
  alignItems: 'flex-end',
  flexWrap: 'wrap',
}

const dividerStyle = {
  height: '1px',
  background: '#e2e8f0',
}

const buttonRowStyle = {
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap',
}

const checkButtonStyle = {
  minWidth: '140px',
  border: 'none',
  borderRadius: '14px',
  padding: '13px 18px',
  background: '#0f172a',
  color: '#ffffff',
  fontWeight: 900,
  cursor: 'pointer',
}

const postButtonStyle = {
  minWidth: '140px',
  border: 'none',
  borderRadius: '14px',
  padding: '13px 18px',
  background: '#0f766e',
  color: '#ffffff',
  fontWeight: 900,
  cursor: 'pointer',
}

const disabledButtonStyle = {
  background: '#94a3b8',
  cursor: 'not-allowed',
}

const validationCardStyle = {
  borderRadius: '18px',
  border: '1px solid',
  padding: '18px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
}

const validationHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
}

const validationTitleStyle = {
  color: '#0f172a',
  fontWeight: 900,
  fontSize: '1rem',
}

const validationMessageStyle = {
  color: '#334155',
  marginTop: '4px',
  lineHeight: 1.6,
}

const statusPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '8px 12px',
  borderRadius: '999px',
  fontWeight: 900,
}

const validationGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '12px',
}

const validationMetricStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  background: 'rgba(255, 255, 255, 0.65)',
  borderRadius: '14px',
  padding: '12px',
}

const validationMetricLabelStyle = {
  color: '#64748b',
  fontSize: '0.82rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

export default MaterialMovements
