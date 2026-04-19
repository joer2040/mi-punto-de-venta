import React, { useEffect, useReducer } from 'react';
import { materialService } from '../api/materialService';
import { providerService } from '../api/providerService';
import { useAuth } from '../contexts/AuthContext';
import { ACTION_KEYS, PAGE_PERMISSION_MAP } from '../lib/permissionConfig';
import { useResponsive } from '../lib/useResponsive';

const createPurchaseEntryId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createInitialPurchaseEntryState = () => ({
  materials: [],
  providers: [],
  selectedProvider: '',
  invoiceRef: '',
  loading: true,
  purchase: {
    center_id: '',
    provider_id: '',
    invoice_ref: '',
  },
  itemsList: [],
  currentEntry: {
    material_id: '',
    quantity: '',
    total_cost: '',
  },
});

const purchaseEntryReducer = (state, action) => {
  switch (action.type) {
    case 'load_success':
      return {
        ...state,
        materials: action.materials,
        providers: action.providers,
        loading: false,
        purchase: {
          ...state.purchase,
          center_id: action.centerId,
        },
      };
    case 'load_error':
      return {
        ...state,
        loading: false,
      };
    case 'set_provider':
      return {
        ...state,
        selectedProvider: action.providerId,
        itemsList: action.clearItems ? [] : state.itemsList,
        currentEntry: { material_id: '', quantity: '', total_cost: '' },
      };
    case 'set_invoice_ref':
      return {
        ...state,
        invoiceRef: action.value,
      };
    case 'set_current_entry_field':
      return {
        ...state,
        currentEntry: {
          ...state.currentEntry,
          [action.field]: action.value,
        },
      };
    case 'reset_current_entry':
      return {
        ...state,
        currentEntry: { material_id: '', quantity: '', total_cost: '' },
      };
    case 'add_item':
      return {
        ...state,
        itemsList: [...state.itemsList, action.item],
        currentEntry: { material_id: '', quantity: '', total_cost: '' },
      };
    case 'remove_item':
      return {
        ...state,
        itemsList: state.itemsList.filter((item) => item.entry_id !== action.entryId),
      };
    case 'reset_after_save':
      return {
        ...state,
        selectedProvider: '',
        invoiceRef: '',
        itemsList: [],
        currentEntry: { material_id: '', quantity: '', total_cost: '' },
      };
    default:
      return state;
  }
};

const PurchaseHeader = ({ canProcessPurchases }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
    <h1>Entrada de Almacen (Compras)</h1>
    {!canProcessPurchases && <span style={readOnlyBadgeStyle}>Solo lectura</span>}
  </div>
);

const PurchaseInvoiceSection = ({
  providers,
  selectedProvider,
  invoiceRef,
  onProviderChange,
  onInvoiceRefChange,
  canProcessPurchases,
}) => (
  <section style={sectionStyle}>
    <h3>Datos de la Factura / Remision</h3>
    <div style={{ marginBottom: '15px' }}>
      <label htmlFor="purchase-provider" style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Proveedor:</label>
      <select
        id="purchase-provider"
        style={inputStyle}
        value={selectedProvider}
        onChange={(e) => onProviderChange(e.target.value)}
        disabled={!canProcessPurchases}
        required
      >
        <option value="">Selecciona un proveedor...</option>
        {providers.map((provider) => (
          <option key={provider.id} value={provider.id}>{provider.name} ({provider.rfc})</option>
        ))}
      </select>
    </div>

    <div style={{ marginBottom: '15px' }}>
      <label htmlFor="purchase-invoice-ref" style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Folio de Factura / Remision:</label>
      <input
        id="purchase-invoice-ref"
        type="text"
        style={inputStyle}
        placeholder="Ej: FAC-1234"
        value={invoiceRef}
        onChange={(e) => onInvoiceRefChange(e.target.value)}
        disabled={!canProcessPurchases}
      />
    </div>
  </section>
);

const PurchaseItemSection = ({
  isMobile,
  canProcessPurchases,
  selectedProvider,
  availableMaterials,
  selectedMaterial,
  currentEntry,
  computedUnitCost,
  onEntryFieldChange,
  onAddToList,
}) => (
  <section style={sectionStyle}>
    <h3>Producto a Ingresar</h3>
    <label htmlFor="purchase-material" style={labelStyle}>Material:</label>
    <select
      id="purchase-material"
      style={inputStyle}
      onChange={(e) => onEntryFieldChange('material_id', e.target.value)}
      value={currentEntry.material_id}
      disabled={!canProcessPurchases || !selectedProvider}
    >
      <option value="">{selectedProvider ? 'Selecciona producto...' : 'Primero selecciona un proveedor...'}</option>
      {availableMaterials.map((material) => (
        <option key={material.materials.id} value={material.materials.id}>
          {material.materials.name} ({material.materials.sku})
        </option>
      ))}
    </select>

    <div style={{ fontSize: '0.9em', color: '#4a5568', marginTop: '5px' }}>
      Unidad: <span style={{ fontWeight: 'bold' }}>{selectedMaterial?.materials?.uoms?.abbr || 'pz'}</span>
    </div>

    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', marginTop: '10px' }}>
      <div style={{ flex: 1 }}>
        <label htmlFor="purchase-quantity" style={labelStyle}>Cantidad:</label>
        <input
          id="purchase-quantity"
          type="number"
          style={inputStyle}
          placeholder="0.00"
          value={currentEntry.quantity}
          onChange={(e) => onEntryFieldChange('quantity', e.target.value)}
          disabled={!canProcessPurchases}
        />
      </div>
      <div style={{ flex: 1 }}>
        <label htmlFor="purchase-total-cost" style={labelStyle}>Costo ($):</label>
        <input
          id="purchase-total-cost"
          type="number"
          style={inputStyle}
          placeholder="0.00"
          value={currentEntry.total_cost}
          onChange={(e) => onEntryFieldChange('total_cost', e.target.value)}
          disabled={!canProcessPurchases}
        />
      </div>
      <div style={{ flex: 1 }}>
        <label htmlFor="purchase-unit-cost" style={labelStyle}>Costo Unitario ($):</label>
        <input
          id="purchase-unit-cost"
          type="number"
          style={{ ...inputStyle, ...readOnlyInputStyle }}
          value={Number.isFinite(computedUnitCost) ? computedUnitCost.toFixed(2) : '0.00'}
          readOnly
          disabled
        />
      </div>
    </div>

    <div style={entryRowStyle}>
      <button
        type="button"
        onClick={onAddToList}
        disabled={!canProcessPurchases}
        style={btnAddStyle}
      >
        Agregar a la lista
      </button>
    </div>
  </section>
);

const PurchaseItemsList = ({
  isMobile,
  itemsList,
  canProcessPurchases,
  onRemoveItem,
}) => (
  <div style={tableWrapperStyle}>
    {isMobile ? (
      <div style={mobileCardsListStyle}>
        {itemsList.map((item) => (
          <article key={item.entry_id} style={mobileItemCardStyle}>
            <div style={mobileItemHeaderStyle}>
              <div>
                <div style={mobileItemLabelStyle}>SKU</div>
                <div style={mobileItemSkuStyle}>{item.sku}</div>
              </div>
              <button
                type="button"
                onClick={() => onRemoveItem(item.entry_id)}
                disabled={!canProcessPurchases}
                style={{
                  ...mobileRemoveButtonStyle,
                  ...(canProcessPurchases ? null : mobileRemoveButtonDisabledStyle),
                }}
              >
                Eliminar
              </button>
            </div>

            <div>
              <div style={mobileItemLabelStyle}>Producto</div>
              <div style={mobileItemNameStyle}>{item.name}</div>
            </div>

            <div style={mobileMetricsGridStyle}>
              <div style={mobileMetricCardStyle}>
                <div style={mobileItemLabelStyle}>Cant.</div>
                <div style={mobileMetricValueStyle}>{item.quantity}</div>
              </div>

              <div style={mobileMetricCardStyle}>
                <div style={mobileItemLabelStyle}>Costo U.</div>
                <div style={mobileMetricValueStyle}>${Number(item.unit_cost || 0).toFixed(2)}</div>
              </div>

              <div style={mobileMetricCardStyle}>
                <div style={mobileItemLabelStyle}>Costo</div>
                <div style={mobileSubtotalStyle}>${item.subtotal.toFixed(2)}</div>
              </div>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '680px' }}>
        <thead>
          <tr style={{ backgroundColor: '#2d3748', color: 'white' }}>
            <th style={thStyle}>SKU</th>
            <th style={thStyle}>Producto</th>
            <th style={thStyle}>Cant.</th>
            <th style={thStyle}>Costo</th>
            <th style={thStyle}>Costo U.</th>
            <th style={thStyle}>Accion</th>
          </tr>
        </thead>
        <tbody>
          {itemsList.map((item) => (
            <tr key={item.entry_id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={tdStyle}>{item.sku}</td>
              <td style={tdStyle}>{item.name}</td>
              <td style={tdStyle}>{item.quantity}</td>
              <td style={tdStyle}>${item.subtotal.toFixed(2)}</td>
              <td style={tdStyle}>${Number(item.unit_cost || 0).toFixed(2)}</td>
              <td style={tdStyle}>
                <button
                  type="button"
                  onClick={() => onRemoveItem(item.entry_id)}
                  disabled={!canProcessPurchases}
                  style={{
                    color: canProcessPurchases ? 'red' : '#a0aec0',
                    border: 'none',
                    background: 'none',
                    cursor: canProcessPurchases ? 'pointer' : 'not-allowed',
                  }}
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}

    <div style={{ padding: '20px', textAlign: isMobile ? 'left' : 'right', fontWeight: 'bold', fontSize: '1.1rem' }}>
      Total Factura: ${itemsList.reduce((acc, item) => acc + item.subtotal, 0).toFixed(2)}
    </div>
  </div>
);

const PurchaseEntry = () => {
  const [state, dispatch] = useReducer(purchaseEntryReducer, undefined, createInitialPurchaseEntryState);
  const { isMobile } = useResponsive();
  const { can } = useAuth();
  const canProcessPurchases = can(PAGE_PERMISSION_MAP.purchases, ACTION_KEYS.CREATE);

  const {
    materials,
    providers,
    selectedProvider,
    invoiceRef,
    loading,
    purchase,
    itemsList,
    currentEntry,
  } = state;

  const availableMaterials = selectedProvider
    ? materials.filter((material) => material.materials?.provider_id === selectedProvider)
    : [];

  const selectedMaterial = availableMaterials.find((material) => material.materials?.id === currentEntry.material_id);
  const quantityValue = parseFloat(currentEntry.quantity);
  const totalCostValue = parseFloat(currentEntry.total_cost);
  const computedUnitCost =
    Number.isFinite(quantityValue) && quantityValue > 0 && Number.isFinite(totalCostValue)
      ? totalCostValue / quantityValue
      : 0;

  useEffect(() => {
    const loadData = async () => {
      try {
        const [matData, provData] = await Promise.all([
          materialService.getAllMaterials(),
          providerService.getProviders(),
        ]);

        const filteredMaterials = (matData || []).filter((item) => item.materials?.categories?.is_inventoried === true);

        dispatch({
          type: 'load_success',
          materials: filteredMaterials,
          providers: provData || [],
          centerId: filteredMaterials[0]?.centers?.id || '',
        });
      } catch (error) {
        console.error('Error al cargar datos:', error);
        dispatch({ type: 'load_error' });
      }
    };

    loadData();
  }, []);

  const handleProviderChange = (nextProviderId) => {
    const clearItems = itemsList.length > 0 && nextProviderId !== selectedProvider;

    if (clearItems) {
      const confirmed = window.confirm(
        'Cambiar de proveedor limpiara la lista actual de productos. Â¿Deseas continuar?'
      );

      if (!confirmed) return;
    }

    dispatch({
      type: 'set_provider',
      providerId: nextProviderId,
      clearItems,
    });
  };

  const handleEntryFieldChange = (field, value) => {
    dispatch({
      type: 'set_current_entry_field',
      field,
      value,
    });
  };

  const handleAddToList = () => {
    if (!canProcessPurchases) return;

    if (!selectedProvider) {
      alert('Primero selecciona un proveedor');
      return;
    }

    if (!currentEntry.material_id || !currentEntry.quantity || !currentEntry.total_cost) {
      alert('Por favor completa SKU, cantidad y costo');
      return;
    }

    const materialInfo = availableMaterials.find((material) => material.materials.id === currentEntry.material_id);
    const quantity = parseFloat(currentEntry.quantity);
    const totalCost = parseFloat(currentEntry.total_cost);
    const unitCost = quantity > 0 ? totalCost / quantity : 0;

    dispatch({
      type: 'add_item',
      item: {
        entry_id: createPurchaseEntryId(),
        ...currentEntry,
        quantity,
        total_cost: totalCost,
        unit_cost: unitCost,
        name: materialInfo.materials.name,
        sku: materialInfo.materials.sku,
        subtotal: totalCost,
      },
    });
  };

  const handleRemoveItem = (entryId) => {
    dispatch({
      type: 'remove_item',
      entryId,
    });
  };

  const handleSavePurchase = async (event) => {
    event?.preventDefault?.();
    if (!canProcessPurchases) return;

    if (!selectedProvider || itemsList.length === 0) {
      alert('Por favor completa todos los campos de la compra');
      return;
    }

    try {
      const purchaseData = {
        ...purchase,
        provider_id: selectedProvider,
        invoice_ref: invoiceRef,
      };

      await materialService.recordPurchase(purchaseData, itemsList);
      alert('Compra registrada y stock actualizado');
      dispatch({ type: 'reset_after_save' });
    } catch (error) {
      console.error('Error al registrar compra:', error);
      alert(error?.message || 'Error al guardar la transaccion.');
    }
  };

  if (loading) return <div style={{ padding: '20px' }}>Cargando datos de compra...</div>;

  return (
    <div style={{ padding: isMobile ? '12px' : '20px', maxWidth: '800px', fontFamily: 'sans-serif', margin: '0 auto' }}>
      <PurchaseHeader canProcessPurchases={canProcessPurchases} />

      <form onSubmit={handleSavePurchase} style={formContainerStyle}>
        <PurchaseInvoiceSection
          providers={providers}
          selectedProvider={selectedProvider}
          invoiceRef={invoiceRef}
          onProviderChange={handleProviderChange}
          onInvoiceRefChange={(value) => dispatch({ type: 'set_invoice_ref', value })}
          canProcessPurchases={canProcessPurchases}
        />

        <PurchaseItemSection
          isMobile={isMobile}
          canProcessPurchases={canProcessPurchases}
          selectedProvider={selectedProvider}
          availableMaterials={availableMaterials}
          selectedMaterial={selectedMaterial}
          currentEntry={currentEntry}
          computedUnitCost={computedUnitCost}
          onEntryFieldChange={handleEntryFieldChange}
          onAddToList={handleAddToList}
        />
      </form>

      <PurchaseItemsList
        isMobile={isMobile}
        itemsList={itemsList}
        canProcessPurchases={canProcessPurchases}
        onRemoveItem={handleRemoveItem}
      />

      <div style={{ marginTop: '20px' }}>
        <button type="button" onClick={handleSavePurchase} disabled={!canProcessPurchases} style={canProcessPurchases ? btnStyle : disabledBtnStyle}>
          Procesar Factura Completa
        </button>
      </div>
    </div>
  );
};

const formContainerStyle = { backgroundColor: '#f4f7f6', padding: '20px', borderRadius: '10px' };
const sectionStyle = { marginBottom: '20px', padding: '15px', backgroundColor: '#fff', borderRadius: '8px' };
const labelStyle = { display: 'block', fontSize: '0.9em', color: '#555', marginBottom: '5px' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' };
const readOnlyInputStyle = { backgroundColor: '#f8fafc', color: '#0f172a', WebkitTextFillColor: '#0f172a', fontWeight: '700' };
const btnStyle = { width: '100%', padding: '12px', backgroundColor: '#2980b9', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' };
const entryRowStyle = {
  marginTop: '20px',
  paddingTop: '20px',
  borderTop: '1px solid #e2e8f0',
  display: 'flex',
  justifyContent: 'flex-end',
};
const btnAddStyle = {
  padding: '12px 24px',
  backgroundColor: '#2d3748',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '1rem',
  transition: 'background 0.2s',
};
const tableWrapperStyle = { marginTop: '20px', backgroundColor: '#fff', borderRadius: '10px', overflowX: 'auto', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' };
const thStyle = { padding: '15px', textAlign: 'left' };
const tdStyle = { padding: '12px 15px' };
const readOnlyBadgeStyle = { padding: '8px 12px', borderRadius: '999px', backgroundColor: '#edf2f7', color: '#4a5568', fontWeight: '700' };
const disabledBtnStyle = { ...btnStyle, backgroundColor: '#94a3b8', cursor: 'not-allowed' };
const mobileCardsListStyle = { display: 'grid', gap: '12px', padding: '12px' };
const mobileItemCardStyle = { borderRadius: '16px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' };
const mobileItemHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' };
const mobileItemLabelStyle = { color: '#64748b', fontSize: '0.78rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' };
const mobileItemSkuStyle = { color: '#1e3a5f', fontWeight: '800' };
const mobileItemNameStyle = { color: '#0f172a', fontWeight: '900', fontSize: '1rem' };
const mobileMetricsGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' };
const mobileMetricCardStyle = { borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', padding: '10px' };
const mobileMetricValueStyle = { color: '#0f172a', fontWeight: '800' };
const mobileSubtotalStyle = { color: '#16a34a', fontWeight: '900' };
const mobileRemoveButtonStyle = { border: 'none', borderRadius: '10px', backgroundColor: '#fee2e2', color: '#b91c1c', fontWeight: '800', padding: '10px 12px', cursor: 'pointer' };
const mobileRemoveButtonDisabledStyle = { backgroundColor: '#e2e8f0', color: '#94a3b8', cursor: 'not-allowed' };

export default PurchaseEntry;
