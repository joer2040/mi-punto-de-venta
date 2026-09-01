import { useEffect, useState } from 'react'
import { materialService } from '../api/materialService'
import { providerService } from '../api/providerService'
import { useResponsive } from '../lib/useResponsive'
import { colors, space, type, radius, shadow } from '../lib/designTokens'

const normalizeCategoryName = (value) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

const createInitialCatalogState = () => ({
  categories: [],
  uoms: [],
  providers: [],
})

const MaterialForm = ({ onMaterialAdded }) => {
  const [catalogs, setCatalogs] = useState(createInitialCatalogState)
  const { isMobile } = useResponsive()
  const { categories, uoms, providers } = catalogs

  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    provider_id: '',
    cat_id: '',
    buy_uom_id: '',
    sell_uom_id: '',
  })

  useEffect(() => {
    const loadData = async () => {
      const [cats, units, providersData] = await Promise.all([
        materialService.getCategories(),
        materialService.getUoms(),
        providerService.getProviders(),
      ])
      setCatalogs({
        categories: cats,
        uoms: units,
        providers: providersData || [],
      })
    }

    loadData()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()

    const { sku, name, provider_id, cat_id, buy_uom_id, sell_uom_id } = formData
    const selectedCategory = categories.find((c) => c.id === cat_id)
    const isInternalProduction = selectedCategory?.is_internal_production === true

    if (!sku || !name || !cat_id || !buy_uom_id || !sell_uom_id) {
      alert('Todos los campos son obligatorios')
      return
    }

    if (!isInternalProduction && !provider_id) {
      alert('Debes seleccionar un proveedor para este material')
      return
    }

    try {
      await materialService.createMaterial({
        ...formData,
        provider_id: isInternalProduction ? '' : formData.provider_id,
      })
      alert('Material creado con exito')
      setFormData({
        sku: '',
        name: '',
        provider_id: '',
        cat_id: '',
        buy_uom_id: '',
        sell_uom_id: '',
      })
      if (onMaterialAdded) onMaterialAdded()
    } catch (error) {
      console.error(error)
      alert(error?.message || 'Error al guardar')
    }
  }

  const selectedCategory = categories.find((c) => c.id === formData.cat_id)
  const isInternalProduction = selectedCategory?.is_internal_production === true
  const isBottleCategory = normalizeCategoryName(selectedCategory?.name) === 'botella'

  return (
    <form onSubmit={handleSubmit} style={getFormStyle(isMobile)}>
      <h2 style={{ marginBottom: space[7], fontSize: isMobile ? type.xl : type['2xl'] }}>Registro de Nuevo Material</h2>

      <div style={getRowStyle(isMobile)}>
        <div style={groupStyle}>
          <label htmlFor="material-sku" style={labelStyle}>SKU (Codigo):</label>
          <input
            id="material-sku"
            required
            style={inputStyle}
            value={formData.sku}
            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
            placeholder="Ej: CER-001"
          />
        </div>
        <div style={groupStyle}>
          <label htmlFor="material-name" style={labelStyle}>Nombre / Descripcion:</label>
          <input
            id="material-name"
            required
            style={inputStyle}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ej: Cerveza Clara 355ml"
          />
        </div>
      </div>

      <div style={getRowStyle(isMobile)}>
        <div style={groupStyle}>
          <label htmlFor="material-provider" style={labelStyle}>Proveedor:</label>
          <select
            id="material-provider"
            style={inputStyle}
            value={formData.provider_id}
            onChange={(e) => setFormData({ ...formData, provider_id: e.target.value })}
            disabled={isInternalProduction}
            required={!isInternalProduction}
          >
            <option value="">{isInternalProduction ? 'Producción Interna' : 'Selecciona un proveedor...'}</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} ({provider.rfc})
              </option>
            ))}
          </select>
        </div>
        <div style={groupStyle}>
          <label htmlFor="material-category" style={labelStyle}>Categoria:</label>
          <select
            id="material-category"
            required
            style={inputStyle}
            value={formData.cat_id}
            onChange={(e) => {
              const nextCategoryId = e.target.value
              const nextCategory = categories.find((category) => category.id === nextCategoryId)
              const nextIsInternalProduction = nextCategory?.is_internal_production === true

              setFormData({
                ...formData,
                cat_id: nextCategoryId,
                provider_id: nextIsInternalProduction ? '' : formData.provider_id,
              })
            }}
          >
            <option value="">Selecciona una...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={getRowStyle(isMobile)}>
        <div style={groupStyle}>
          <label htmlFor="material-buy-uom" style={labelStyle}>Unidad de Compra:</label>
          <select
            id="material-buy-uom"
            required
            style={inputStyle}
            value={formData.buy_uom_id}
            onChange={(e) => setFormData({ ...formData, buy_uom_id: e.target.value })}
          >
            <option value="">Selecciona...</option>
            {uoms
              .filter((u) => {
                if (u.abbr === 'lts') return isBottleCategory
                return true
              })
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.abbr})
                </option>
              ))}
          </select>
        </div>
        <div style={groupStyle}>
          <label htmlFor="material-sell-uom" style={labelStyle}>Unidad de Venta:</label>
          <select
            id="material-sell-uom"
            required
            style={inputStyle}
            value={formData.sell_uom_id}
            onChange={(e) => setFormData({ ...formData, sell_uom_id: e.target.value })}
          >
            <option value="">Selecciona...</option>
            {uoms
              .filter((u) => {
                if (u.abbr === 'lts') return isBottleCategory
                return true
              })
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.abbr})
                </option>
              ))}
          </select>
        </div>
      </div>

      {isInternalProduction && (
        <div style={helperInfoStyle}>
          Los materiales de produccion interna no llevan proveedor.
        </div>
      )}

      {providers.length === 0 && (
        <div style={helperWarningStyle}>
          {isInternalProduction
            ? 'Puedes registrar materiales de produccion interna sin proveedor.'
            : 'Primero debes crear al menos un proveedor para poder registrar materiales.'}
        </div>
      )}

      <button type="submit" style={btnStyle} disabled={providers.length === 0 && !isInternalProduction}>Guardar Material</button>
    </form>
  )
}

const getFormStyle = (isMobile) => ({
  backgroundColor: colors.white,
  padding: isMobile ? space[7] : space[9],
  borderRadius: radius.lg,
  boxShadow: shadow.md,
  border: `1px solid ${colors.gray200}`,
})

const getRowStyle = (isMobile) => ({
  display: 'flex',
  flexDirection: isMobile ? 'column' : 'row',
  gap: space[7],
  marginBottom: space[5],
})

const groupStyle = { flex: 1, display: 'flex', flexDirection: 'column' }

const labelStyle = {
  fontSize: type.sm,
  fontWeight: type.bold,
  marginBottom: space[2],
  color: colors.gray700,
  display: 'block',
}

const inputStyle = {
  padding: `${space[4]} ${space[5]}`,
  borderRadius: radius.md,
  border: `1px solid ${colors.gray300}`,
  backgroundColor: colors.white,
  fontSize: type.base,
  color: colors.gray700,
  outline: 'none',
  transition: 'border-color 0.2s',
  width: '100%',
  boxSizing: 'border-box',
}

const btnStyle = {
  width: '100%',
  padding: `${space[4]} ${space[8]}`,
  backgroundColor: colors.blue700,
  color: colors.white,
  border: 'none',
  borderRadius: radius.md,
  fontWeight: type.bold,
  fontSize: type.base,
  cursor: 'pointer',
  marginTop: space[6],
}

const helperWarningStyle = {
  marginTop: space[4],
  padding: `${space[6]} ${space[7]}`,
  borderRadius: radius.md,
  backgroundColor: colors.amber50,
  border: '1px solid #fdba74',
  color: '#9a3412',
  fontWeight: type.bold,
}

const helperInfoStyle = {
  marginTop: space[4],
  padding: `${space[6]} ${space[7]}`,
  borderRadius: radius.md,
  backgroundColor: colors.blue50,
  border: `1px solid ${colors.blue100}`,
  color: colors.blue700,
  fontWeight: type.bold,
}

export default MaterialForm
