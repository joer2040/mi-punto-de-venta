import React, { useEffect, useState } from 'react'
import { materialService } from '../api/materialService'
import { useResponsive } from '../lib/useResponsive'

const MaterialForm = ({ onMaterialAdded }) => {
  const [categories, setCategories] = useState([])
  const [uoms, setUoms] = useState([])
  const { isMobile } = useResponsive()

  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    cat_id: '',
    buy_uom_id: '',
    sell_uom_id: '',
    conversion_factor: 1,
  })

  useEffect(() => {
    const loadData = async () => {
      const cats = await materialService.getCategories()
      const units = await materialService.getUoms()
      setCategories(cats)
      setUoms(units)
    }

    loadData()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()

    const { sku, name, cat_id, buy_uom_id, sell_uom_id } = formData
    if (!sku || !name || !cat_id || !buy_uom_id || !sell_uom_id) {
      alert('Todos los campos son obligatorios')
      return
    }

    try {
      await materialService.createMaterial(formData)
      alert('Material creado con exito')
      setFormData({
        sku: '',
        name: '',
        cat_id: '',
        buy_uom_id: '',
        sell_uom_id: '',
        conversion_factor: 1,
      })
      if (onMaterialAdded) onMaterialAdded()
    } catch (error) {
      console.error(error)
      alert('Error al guardar')
    }
  }

  const selectedCategory = categories.find((c) => c.id === formData.cat_id)
  const isBottleCategory = selectedCategory?.name === 'Botellas/Otros'

  return (
    <form onSubmit={handleSubmit} style={getFormStyle(isMobile)}>
      <h2 style={{ marginBottom: '20px', fontSize: isMobile ? '1.25rem' : '1.5rem' }}>Registro de Nuevo Material</h2>

      <div style={getRowStyle(isMobile)}>
        <div style={groupStyle}>
          <label style={labelStyle}>SKU (Codigo):</label>
          <input
            required
            style={inputStyle}
            value={formData.sku}
            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
            placeholder="Ej: CER-001"
          />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Nombre / Descripcion:</label>
          <input
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
          <label style={labelStyle}>Categoria:</label>
          <select
            required
            style={inputStyle}
            value={formData.cat_id}
            onChange={(e) => setFormData({ ...formData, cat_id: e.target.value })}
          >
            <option value="">Selecciona una...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Factor de conversion:</label>
          <input
            type="number"
            required
            style={inputStyle}
            value={formData.conversion_factor}
            onChange={(e) => setFormData({ ...formData, conversion_factor: e.target.value })}
          />
        </div>
      </div>

      <div style={getRowStyle(isMobile)}>
        <div style={groupStyle}>
          <label style={labelStyle}>Unidad de Compra:</label>
          <select
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
          <label style={labelStyle}>Unidad de Venta:</label>
          <select
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

      <button type="submit" style={btnStyle}>Guardar Material</button>
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

export default MaterialForm
