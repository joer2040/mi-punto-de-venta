import React, { useEffect, useMemo, useReducer } from 'react'
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
  {
    code: 'invoice_adjustment',
    label: 'Ajuste Factura',
    accent: '#7c3aed',
    options: [{ code: 'invoice_adjustment', label: 'Ajuste Factura' }],
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

const resetValidationFields = {
  checkResult: null,
  checkedKey: '',
}

const resetProductFields = {
  productQuery: '',
  selectedMaterial: null,
  quantity: '',
  ...resetValidationFields,
}

const createInitialMovementState = () => ({
  materials: [],
  loading: true,
  movementCode: '',
  movementOption: '',
  invoiceRef: '',
  invoiceDetails: null,
  invoiceLoading: false,
  productQuery: '',
  selectedMaterial: null,
  quantity: '',
  checkResult: null,
  checkedKey: '',
  checking: false,
  posting: false,
})

const movementReducer = (state, action) => {
  switch (action.type) {
    case 'set-loading':
      return { ...state, loading: action.value }
    case 'set-materials':
      return { ...state, materials: action.value }
    case 'set-movement-type':
      return {
        ...state,
        movementCode: action.value,
        movementOption: action.value === 'invoice_adjustment' ? 'invoice_adjustment' : '',
        invoiceRef: '',
        invoiceDetails: null,
        ...resetProductFields,
      }
    case 'set-movement-option':
      return {
        ...state,
        movementOption: action.value,
        ...resetProductFields,
      }
    case 'set-invoice-ref':
      return {
        ...state,
        invoiceRef: action.value,
        invoiceDetails: null,
        ...resetProductFields,
      }
    case 'set-invoice-loading':
      return { ...state, invoiceLoading: action.value }
    case 'set-invoice-details':
      return {
        ...state,
        invoiceDetails: action.value,
        ...resetProductFields,
      }
    case 'set-product-query': {
      const shouldClearSelection =
        !state.selectedMaterial || action.value !== state.selectedMaterial.displayLabel

      return {
        ...state,
        productQuery: action.value,
        selectedMaterial: shouldClearSelection ? null : state.selectedMaterial,
        ...resetValidationFields,
      }
    }
    case 'select-material':
      return {
        ...state,
        selectedMaterial: action.value,
        productQuery: action.value.displayLabel,
        quantity: action.quantity,
        ...resetValidationFields,
      }
    case 'set-quantity':
      return {
        ...state,
        quantity: action.value,
        ...resetValidationFields,
      }
    case 'reset-validation':
      return { ...state, ...resetValidationFields }
    case 'set-checking':
      return { ...state, checking: action.value }
    case 'set-check-success':
      return {
        ...state,
        checkResult: action.value,
        checkedKey: action.key,
      }
    case 'set-posting':
      return { ...state, posting: action.value }
    case 'clear-form':
      return {
        ...state,
        movementCode: '',
        movementOption: '',
        invoiceRef: '',
        invoiceDetails: null,
        invoiceLoading: false,
        checking: false,
        posting: false,
        ...resetProductFields,
      }
    default:
      return state
  }
}

const MovementHero = ({ canCreateMovements }) => (
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
)

const MovementSelectors = ({
  isTablet,
  canCreateMovements,
  movementCode,
  movementOption,
  isInvoiceAdjustment,
  movementOptions,
  onMovementTypeChange,
  onMovementOptionChange,
}) => (
  <div style={getControlsGridStyle(isTablet)}>
    <div style={fieldBlockStyle}>
      <label htmlFor="movement-type" style={labelStyle}>
        Tipos de movimiento
      </label>
      <select
        id="movement-type"
        value={movementCode}
        onChange={(event) => onMovementTypeChange(event.target.value)}
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
        onChange={(event) => onMovementOptionChange(event.target.value)}
        style={{
          ...inputStyle,
          ...((movementCode && !isInvoiceAdjustment) ? null : disabledInputStyle),
        }}
        disabled={!canCreateMovements || !movementCode || isInvoiceAdjustment}
      >
        <option value="">{movementCode && !isInvoiceAdjustment ? 'Selecciona una opcion...' : 'No aplica para este tipo...'}</option>
        {movementOptions.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  </div>
)

const InvoiceLookup = ({
  isInvoiceAdjustment,
  isTablet,
  canCreateMovements,
  invoiceRef,
  invoiceLoading,
  invoiceDetails,
  onInvoiceRefChange,
  onLoadInvoice,
}) => {
  if (!isInvoiceAdjustment) return null

  return (
    <>
      <div style={invoiceLookupRowStyle(isTablet)}>
        <div style={{ ...fieldBlockStyle, flex: 1 }}>
          <label htmlFor="movement-invoice" style={labelStyle}>
            Factura existente
          </label>
          <input
            id="movement-invoice"
            type="text"
            value={invoiceRef}
            onChange={(event) => onInvoiceRefChange(event.target.value)}
            placeholder="Escribe el folio exacto de la factura..."
            style={inputStyle}
            disabled={!canCreateMovements}
          />
        </div>

        <button
          type="button"
          onClick={onLoadInvoice}
          disabled={!canCreateMovements || !invoiceRef.trim() || invoiceLoading}
          style={{
            ...checkButtonStyle,
            alignSelf: isTablet ? 'stretch' : 'flex-end',
            ...((!canCreateMovements || !invoiceRef.trim() || invoiceLoading) ? disabledButtonStyle : null),
          }}
        >
          {invoiceLoading ? 'Buscando...' : 'Buscar Factura'}
        </button>
      </div>

      {invoiceDetails && (
        <section style={invoiceCardStyle}>
          <div style={invoiceHeaderStyle}>
            <div style={invoiceTitleStyle}>Factura encontrada</div>
            <span style={invoiceRefPillStyle}>{invoiceDetails.invoice_ref}</span>
          </div>

          <div style={invoiceInfoGridStyle}>
            <div style={invoiceInfoItemStyle}>
              <span style={invoiceInfoLabelStyle}>Proveedor</span>
              <strong>{invoiceDetails.provider_name}</strong>
            </div>
            <div style={invoiceInfoItemStyle}>
              <span style={invoiceInfoLabelStyle}>Fecha</span>
              <strong>{new Date(invoiceDetails.created_at).toLocaleString('es-MX')}</strong>
            </div>
          </div>
        </section>
      )}
    </>
  )
}

const ProductSelection = ({
  isTablet,
  isMobile,
  canCreateMovements,
  movementCode,
  movementOption,
  isInvoiceAdjustment,
  invoiceDetails,
  productQuery,
  suggestions,
  selectedMaterial,
  quantity,
  selectedUnit,
  showSuggestions,
  invoiceLineAmount,
  onProductQueryChange,
  onSelectMaterial,
  onQuantityChange,
}) => (
  <>
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
          onChange={(event) => onProductQueryChange(event.target.value)}
          placeholder={
            isInvoiceAdjustment
              ? (invoiceDetails ? 'Busca un producto de la factura...' : 'Primero carga una factura...')
              : (movementCode && movementOption ? 'Escribe nombre o SKU...' : 'Primero elige tipo y opcion...')
          }
          style={{
            ...inputStyle,
            ...autocompleteInputStyle,
            ...((movementCode && movementOption && (!isInvoiceAdjustment || invoiceDetails)) ? null : disabledInputStyle),
          }}
          disabled={!canCreateMovements || !movementCode || !movementOption || (isInvoiceAdjustment && !invoiceDetails)}
          autoComplete="off"
        />

        {showSuggestions && (
          <div style={suggestionsPanelStyle}>
            {suggestions.map((material) => (
              <button
                key={material.rowKey || material.purchase_item_id}
                type="button"
                onClick={() => onSelectMaterial(material)}
                style={suggestionButtonStyle}
              >
                <span style={suggestionTitleStyle}>{isInvoiceAdjustment ? material.material_name : material.name}</span>
                <span style={suggestionMetaStyle}>
                  {isInvoiceAdjustment
                    ? `${material.material_sku} · Factura ${material.quantity} ${material.unit_abbr} · $${material.total_cost.toFixed(2)}`
                    : `${material.sku} · Stock ${material.currentStock} ${material.uomAbbr}`}
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
            onChange={(event) => onQuantityChange(event.target.value)}
            placeholder="0.000"
            style={{
              ...inputStyle,
              ...((movementCode && movementOption && (!isInvoiceAdjustment || selectedMaterial)) ? null : disabledInputStyle),
            }}
            disabled={!canCreateMovements || !movementCode || !movementOption || (isInvoiceAdjustment && !selectedMaterial)}
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

    {isInvoiceAdjustment && selectedMaterial && (
      <section style={invoiceLineCardStyle}>
        <div style={invoiceLineGridStyle}>
          <div style={invoiceInfoItemStyle}>
            <span style={invoiceInfoLabelStyle}>Producto</span>
            <strong>{selectedMaterial.name}</strong>
          </div>
          <div style={invoiceInfoItemStyle}>
            <span style={invoiceInfoLabelStyle}>Cantidad original</span>
            <strong>{Number(selectedMaterial.originalQuantity || 0)} {selectedMaterial.uomAbbr}</strong>
          </div>
          <div style={invoiceInfoItemStyle}>
            <span style={invoiceInfoLabelStyle}>Monto original</span>
            <strong>${Number(selectedMaterial.totalCost || 0).toFixed(2)}</strong>
          </div>
          <div style={invoiceInfoItemStyle}>
            <span style={invoiceInfoLabelStyle}>Monto ajustado</span>
            <strong>${Number(invoiceLineAmount || 0).toFixed(2)}</strong>
          </div>
        </div>
      </section>
    )}
  </>
)

const MovementActions = ({
  canCreateMovements,
  isFormReady,
  checking,
  posting,
  checkResult,
  isCurrentFormChecked,
  onCheck,
  onPost,
}) => (
  <div style={buttonRowStyle}>
    <button
      type="button"
      onClick={onCheck}
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
      onClick={onPost}
      disabled={!canCreateMovements || !checkResult?.valid || !isCurrentFormChecked || posting}
      style={{
        ...postButtonStyle,
        ...((!canCreateMovements || !checkResult?.valid || !isCurrentFormChecked || posting) ? disabledButtonStyle : null),
      }}
    >
      {posting ? 'Posteando...' : 'Postear'}
    </button>
  </div>
)

const ValidationSummary = ({
  checkResult,
  isInvoiceAdjustment,
  selectedMaterial,
  selectedUnit,
  invoiceDetails,
  quantity,
}) => {
  if (!checkResult) return null

  return (
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
        {isInvoiceAdjustment && (
          <div style={validationMetricStyle}>
            <span style={validationMetricLabelStyle}>Factura</span>
            <strong>{checkResult.invoice_ref || invoiceDetails?.invoice_ref || '--'}</strong>
          </div>
        )}
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
        {isInvoiceAdjustment && (
          <>
            <div style={validationMetricStyle}>
              <span style={validationMetricLabelStyle}>Cantidad factura</span>
              <strong>{Number(checkResult.original_quantity ?? selectedMaterial?.originalQuantity ?? 0)} {checkResult.unit_abbr || selectedUnit}</strong>
            </div>
            <div style={validationMetricStyle}>
              <span style={validationMetricLabelStyle}>Cantidad nueva</span>
              <strong>{Number((checkResult.requested_quantity ?? quantity) || 0)} {checkResult.unit_abbr || selectedUnit}</strong>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

const MaterialMovements = () => {
  const { isMobile, isTablet } = useResponsive()
  const { can } = useAuth()
  const canCreateMovements = can(PAGE_PERMISSION_MAP.movements, ACTION_KEYS.CREATE)
  const [state, dispatch] = useReducer(movementReducer, undefined, createInitialMovementState)
  const {
    materials,
    loading,
    movementCode,
    movementOption,
    invoiceRef,
    invoiceDetails,
    invoiceLoading,
    productQuery,
    selectedMaterial,
    quantity,
    checkResult,
    checkedKey,
    checking,
    posting,
  } = state

  const isInvoiceAdjustment = movementCode === 'invoice_adjustment'

  const loadMaterials = async () => {
    dispatch({ type: 'set-loading', value: true })
    try {
      const rows = await materialService.getAllMaterials()
      dispatch({ type: 'set-materials', value: normalizeMaterials(rows) })
    } catch (error) {
      console.error('Error al cargar materiales para movimientos:', error)
      window.alert(error?.message || 'No se pudieron cargar los materiales.')
    } finally {
      dispatch({ type: 'set-loading', value: false })
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
        invoiceRef,
        purchaseItemId: selectedMaterial?.purchaseItemId || '',
        materialId: selectedMaterial?.materialId || '',
        centerId: selectedMaterial?.centerId || '',
        quantity: String(quantity || ''),
      }),
    [
      invoiceRef,
      movementCode,
      movementOption,
      quantity,
      selectedMaterial?.centerId,
      selectedMaterial?.materialId,
      selectedMaterial?.purchaseItemId,
    ]
  )

  const isCurrentFormChecked = checkedKey === currentFormKey
  const trimmedQuery = productQuery.trim().toLowerCase()

  const suggestions = useMemo(() => {
    if (!movementCode || !movementOption || !trimmedQuery) return []

    const sourceMaterials = isInvoiceAdjustment ? invoiceDetails?.items || [] : materials

    return sourceMaterials
      .filter((material) => {
        const haystack = isInvoiceAdjustment
          ? `${material.material_name} ${material.material_sku}`.toLowerCase()
          : `${material.name} ${material.sku}`.toLowerCase()

        return haystack.includes(trimmedQuery)
      })
      .slice(0, 8)
  }, [invoiceDetails?.items, isInvoiceAdjustment, materials, movementCode, movementOption, trimmedQuery])

  const resetValidation = () => {
    dispatch({ type: 'reset-validation' })
  }

  const handleMovementTypeChange = (value) => {
    dispatch({ type: 'set-movement-type', value })
  }

  const handleMovementOptionChange = (value) => {
    if (isInvoiceAdjustment) return
    dispatch({ type: 'set-movement-option', value })
  }

  const handleInvoiceRefChange = (value) => {
    dispatch({ type: 'set-invoice-ref', value })
  }

  const handleLoadInvoice = async () => {
    if (!isInvoiceAdjustment || !invoiceRef.trim()) return

    dispatch({ type: 'set-invoice-loading', value: true })
    try {
      const details = await materialService.getPurchaseInvoiceDetails(invoiceRef)
      if (!details) {
        dispatch({ type: 'set-invoice-details', value: null })
        window.alert('No se encontro una factura con ese folio.')
        return
      }

      dispatch({ type: 'set-invoice-details', value: details })
    } catch (error) {
      console.error('Error al cargar factura para ajuste:', error)
      window.alert(error?.message || 'No se pudo cargar la factura seleccionada.')
    } finally {
      dispatch({ type: 'set-invoice-loading', value: false })
    }
  }

  const handleProductQueryChange = (value) => {
    dispatch({ type: 'set-product-query', value })
  }

  const handleSelectMaterial = (material) => {
    const normalizedMaterial = isInvoiceAdjustment
      ? {
          rowKey: material.rowKey,
          purchaseItemId: material.purchase_item_id,
          materialId: material.material_id,
          centerId: invoiceDetails?.center_id || '',
          sku: material.material_sku,
          name: material.material_name,
          uomAbbr: material.unit_abbr,
          displayLabel: material.displayLabel,
          originalQuantity: Number(material.quantity || 0),
          unitCost: Number(material.unit_cost || 0),
          totalCost: Number(material.total_cost || 0),
        }
      : material

    dispatch({
      type: 'select-material',
      value: normalizedMaterial,
      quantity: isInvoiceAdjustment ? String(normalizedMaterial.originalQuantity || '') : quantity,
    })
  }

  const handleQuantityChange = (value) => {
    dispatch({ type: 'set-quantity', value })
  }

  const isFormReady =
    Boolean(movementCode) &&
    Boolean(movementOption) &&
    (!isInvoiceAdjustment || Boolean(invoiceDetails?.id)) &&
    Boolean(selectedMaterial?.materialId) &&
    Number(quantity) > 0

  const buildPayload = () => ({
    center_id: selectedMaterial?.centerId || '',
    material_id: selectedMaterial?.materialId || '',
    movement_code: movementCode,
    movement_option: movementOption,
    quantity: Number(quantity),
    invoice_ref: isInvoiceAdjustment ? invoiceDetails?.invoice_ref || invoiceRef.trim() : undefined,
    purchase_item_id: isInvoiceAdjustment ? selectedMaterial?.purchaseItemId || '' : undefined,
  })

  const handleCheck = async () => {
    if (!canCreateMovements || !isFormReady) return

    dispatch({ type: 'set-checking', value: true })
    try {
      const response = await erpService.checkMaterialMovement(buildPayload())
      dispatch({
        type: 'set-check-success',
        value: response.validation || response,
        key: currentFormKey,
      })
    } catch (error) {
      console.error('Error al verificar movimiento:', error)
      resetValidation()
      window.alert(error?.message || 'No se pudo verificar el movimiento.')
    } finally {
      dispatch({ type: 'set-checking', value: false })
    }
  }

  const clearForm = () => {
    dispatch({ type: 'clear-form' })
  }

  const handlePost = async () => {
    if (!canCreateMovements || !isFormReady || !checkResult?.valid || !isCurrentFormChecked) return

    dispatch({ type: 'set-posting', value: true })
    try {
      const response = await erpService.postMaterialMovement(buildPayload())
      await loadMaterials()
      clearForm()
      window.alert(`Movimiento posteado correctamente. Documento ${response.document_number}.`)
    } catch (error) {
      console.error('Error al postear movimiento:', error)
      window.alert(error?.message || 'No se pudo postear el movimiento.')
    } finally {
      dispatch({ type: 'set-posting', value: false })
    }
  }

  if (loading) {
    return <div style={{ padding: '24px' }}>Cargando movimiento de materiales...</div>
  }

  const selectedUnit = selectedMaterial?.uomAbbr || '--'
  const showSuggestions = !selectedMaterial && suggestions.length > 0
  const invoiceLineAmount = isInvoiceAdjustment && selectedMaterial
    ? Number(quantity || 0) * Number(selectedMaterial.unitCost || 0)
    : 0

  return (
    <div style={getPageStyle(isMobile)}>
      <MovementHero canCreateMovements={canCreateMovements} />

      <section style={panelStyle}>
        <MovementSelectors
          isTablet={isTablet}
          canCreateMovements={canCreateMovements}
          movementCode={movementCode}
          movementOption={movementOption}
          isInvoiceAdjustment={isInvoiceAdjustment}
          movementOptions={movementOptions}
          onMovementTypeChange={handleMovementTypeChange}
          onMovementOptionChange={handleMovementOptionChange}
        />

        <InvoiceLookup
          isInvoiceAdjustment={isInvoiceAdjustment}
          isTablet={isTablet}
          canCreateMovements={canCreateMovements}
          invoiceRef={invoiceRef}
          invoiceLoading={invoiceLoading}
          invoiceDetails={invoiceDetails}
          onInvoiceRefChange={handleInvoiceRefChange}
          onLoadInvoice={handleLoadInvoice}
        />

        <ProductSelection
          isTablet={isTablet}
          isMobile={isMobile}
          canCreateMovements={canCreateMovements}
          movementCode={movementCode}
          movementOption={movementOption}
          isInvoiceAdjustment={isInvoiceAdjustment}
          invoiceDetails={invoiceDetails}
          productQuery={productQuery}
          suggestions={suggestions}
          selectedMaterial={selectedMaterial}
          quantity={quantity}
          selectedUnit={selectedUnit}
          showSuggestions={showSuggestions}
          invoiceLineAmount={invoiceLineAmount}
          onProductQueryChange={handleProductQueryChange}
          onSelectMaterial={handleSelectMaterial}
          onQuantityChange={handleQuantityChange}
        />

        <MovementActions
          canCreateMovements={canCreateMovements}
          isFormReady={isFormReady}
          checking={checking}
          posting={posting}
          checkResult={checkResult}
          isCurrentFormChecked={isCurrentFormChecked}
          onCheck={handleCheck}
          onPost={handlePost}
        />

        <ValidationSummary
          checkResult={checkResult}
          isInvoiceAdjustment={isInvoiceAdjustment}
          selectedMaterial={selectedMaterial}
          selectedUnit={selectedUnit}
          invoiceDetails={invoiceDetails}
          quantity={quantity}
        />
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

const invoiceLookupRowStyle = (isTablet) => ({
  display: 'flex',
  gap: '14px',
  flexDirection: isTablet ? 'column' : 'row',
  alignItems: isTablet ? 'stretch' : 'flex-end',
})

const invoiceCardStyle = {
  borderRadius: '18px',
  border: '1px solid #ddd6fe',
  background: '#faf5ff',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
}

const invoiceHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
}

const invoiceTitleStyle = {
  color: '#4c1d95',
  fontWeight: 900,
}

const invoiceRefPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '8px 12px',
  borderRadius: '999px',
  background: '#ede9fe',
  color: '#5b21b6',
  fontWeight: 800,
}

const invoiceInfoGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '12px',
}

const invoiceInfoItemStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const invoiceInfoLabelStyle = {
  color: '#7c3aed',
  fontSize: '0.8rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const invoiceLineCardStyle = {
  borderRadius: '18px',
  border: '1px solid #ddd6fe',
  background: '#ffffff',
  padding: '16px',
}

const invoiceLineGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '12px',
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
