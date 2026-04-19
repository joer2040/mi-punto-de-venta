import React, { useEffect, useState } from 'react'
import { materialService } from '../api/materialService'
import { providerService } from '../api/providerService'
import { useResponsive } from '../lib/useResponsive'

const normalizeCategoryName = (value) => (value || '').trim().toLowerCase()

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
    const isExtraCategory = normalizeCategoryName(selectedCategory?.name) === 'extras'

    if (!sku || !name || !cat_id || !buy_uom_id || !sell_uom_id) {
      alert('Todos los campos son obligatorios')
      return
    }

    if (!isExtraCategory && !provider_id) {
      alert('Debes seleccionar un proveedor para este material')
      return
    }

    try {
      await materialService.createMaterial({
        ...formData,
        provider_id: isExtraCategory ? '' : formData.provider_id,
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
  const isExtraCategory = normalizeCategoryName(selectedCategory?.name) === 'extras'
  const isBottleCategory = selectedCategory?.name === 'Botellas/Otros'

  return (
    <form onSubmit={handleSubmit} style={getFormStyle(isMobile)}>
      <h2 style={{ marginBottom: '20px', fontSize: isMobile ? '1.25rem' : '1.5rem' }}>Registro de Nuevo Material</h2>

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
            disabled={isExtraCategory}
          >
            <option value="">{isExtraCategory ? 'Produccion interna (sin proveedor)...' : 'Selecciona un proveedor...'}</option>
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
              const nextIsExtraCategory = normalizeCategoryName(nextCategory?.name) === 'extras'

              setFormData({
                ...formData,
                cat_id: nextCategoryId,
                provider_id: nextIsExtraCategory ? '' : formData.provider_id,
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

      {isExtraCategory && (
        <div style={helperInfoStyle}>
          Los materiales de la categoria Extras se consideran de produccion interna y no llevan proveedor.
        </div>
      )}

      {providers.length === 0 && (
        <div style={helperWarningStyle}>
          {isExtraCategory
            ? 'Puedes registrar materiales Extras sin proveedor.'
            : 'Primero debes crear al menos un proveedor para poder registrar materiales.'}
        </div>
      )}

      <button type="submit" style={btnStyle} disabled={providers.length === 0 && !isExtraCategory}>Guardar Material</button>
    </form>
  )
}

const getFormStyle = (isMobile) => ({
  backgroundColor: '#ffffff',
  padding: isMobile ? '18px' : '30px',
  borderRadius: '15px',
  boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
  border: '1px solid #dee2e6',
})

const getRowStyle = (isMobile) => ({
  display: 'flex',
  flexDirection: isMobile ? 'column' : 'row',
  gap: '20px',
  marginBottom: '15px',
})

const groupStyle = { flex: 1, display: 'flex', flexDirection: 'column' }

const labelStyle = {
  fontSize: '0.9em',
  fontWeight: '700',
  marginBottom: '8px',
  color: '#2c3e50',
  display: 'block',
}

const inputStyle = {
  padding: '12px',
  borderRadius: '8px',
  border: '2px solid #ced4da',
  backgroundColor: '#f8f9fa',
  fontSize: '1em',
  color: '#495057',
  outline: 'none',
  transition: 'border-color 0.2s',
  width: '100%',
  boxSizing: 'border-box',
}

const btnStyle = {
  width: '100%',
  padding: '15px',
  backgroundColor: '#1a73e8',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 'bold',
  fontSize: '1em',
  cursor: 'pointer',
  marginTop: '20px',
  boxShadow: '0 4px 12px rgba(26, 115, 232, 0.3)',
}

const helperWarningStyle = {
  marginTop: '16px',
  padding: '12px 14px',
  borderRadius: '10px',
  backgroundColor: '#fff7ed',
  border: '1px solid #fdba74',
  color: '#9a3412',
  fontWeight: '700',
}

const helperInfoStyle = {
  marginTop: '16px',
  padding: '12px 14px',
  borderRadius: '10px',
  backgroundColor: '#eff6ff',
  border: '1px solid #93c5fd',
  color: '#1d4ed8',
  fontWeight: '700',
}

export default MaterialForm
