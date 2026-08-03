import React, { useEffect, useMemo, useReducer } from 'react';
import { materialService } from '../api/materialService';
import { providerService } from '../api/providerService';
import { useAuth } from '../contexts/AuthContext';
import { ACTION_KEYS, PAGE_PERMISSION_MAP } from '../lib/permissionConfig';
import { useResponsive } from '../lib/useResponsive';
import { colors, space, type, radius, shadow } from '../lib/designTokens';

const GENERAL_PROVIDER_NAME = 'Proveedor General';
const DEFAULT_FREEFORM_UNIT_LABEL = 'pz';

const createPurchaseEntryId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const normalizeProviderName = (value) => String(value || '').trim().toLowerCase();
const isGeneralProviderRecord = (provider) => normalizeProviderName(provider?.name) === normalizeProviderName(GENERAL_PROVIDER_NAME);

const createInitialCurrentEntry = () => ({
  material_id: '',
  item_description: '',
  quantity: '',
  total_cost: '',
});

const createInitialPurchaseEntryState = () => ({
  materials: [],
  providers: [],
  selectedProvider: '',
  invoiceRef: '',
  loading: true,
  isSubmitting: false,
  purchaseChecked: false,
  showPurchaseCheckModal: false,
  showProviderChangeModal: false,
  pendingProviderId: '',
  purchase: {
    center_id: '',
    provider_id: '',
    invoice_ref: '',
  },
  itemsList: [],
  currentEntry: createInitialCurrentEntry(),
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
    case 'set_is_submitting':
      return {
        ...state,
        isSubmitting: action.value,
      };
    case 'set_provider':
      return {
        ...state,
        selectedProvider: action.providerId,
        itemsList: action.clearItems ? [] : state.itemsList,
        currentEntry: createInitialCurrentEntry(),
        purchaseChecked: false,
      };
    case 'request_provider_change_confirmation':
      return {
        ...state,
        showProviderChangeModal: true,
        pendingProviderId: action.providerId,
      };
    case 'cancel_provider_change_confirmation':
      return {
        ...state,
        showProviderChangeModal: false,
        pendingProviderId: '',
      };
    case 'confirm_provider_change':
      return {
        ...state,
        selectedProvider: state.pendingProviderId,
        itemsList: [],
        currentEntry: createInitialCurrentEntry(),
        purchaseChecked: false,
        showProviderChangeModal: false,
        pendingProviderId: '',
      };
    case 'set_invoice_ref':
      return {
        ...state,
        invoiceRef: action.value,
        purchaseChecked: false,
      };
    case 'set_current_entry_field':
      return {
        ...state,
        currentEntry: {
          ...state.currentEntry,
          [action.field]: action.value,
        },
        purchaseChecked: false,
      };
    case 'reset_current_entry':
      return {
        ...state,
        currentEntry: createInitialCurrentEntry(),
        purchaseChecked: false,
      };
    case 'add_item':
      return {
        ...state,
        itemsList: [...state.itemsList, action.item],
        currentEntry: createInitialCurrentEntry(),
        purchaseChecked: false,
      };
    case 'remove_item':
      return {
        ...state,
        itemsList: state.itemsList.filter((item) => item.entry_id !== action.entryId),
        purchaseChecked: false,
      };
    case 'set_purchase_checked':
      return {
        ...state,
        purchaseChecked: action.value,
      };
    case 'set_purchase_check_modal':
      return {
        ...state,
        showPurchaseCheckModal: action.value,
      };
    case 'reset_after_save':
      return {
        ...state,
        selectedProvider: '',
        invoiceRef: '',
        itemsList: [],
        currentEntry: createInitialCurrentEntry(),
        purchaseChecked: false,
        showPurchaseCheckModal: false,
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
          <option key={provider.id} value={provider.id}>
            {provider.name}{provider.rfc ? ` (${provider.rfc})` : ''}
          </option>
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
  isGeneralProvider,
  availableMaterials,
  selectedMaterial,
  currentEntry,
  computedUnitCost,
  onEntryFieldChange,
  onAddToList,
}) => (
  <section style={sectionStyle}>
    <h3>Producto a Ingresar</h3>

    {isGeneralProvider ? (
      <>
        <label htmlFor="purchase-item-description" style={labelStyle}>Concepto / Material:</label>
        <input
          id="purchase-item-description"
          type="text"
          style={inputStyle}
          value={currentEntry.item_description}
          onChange={(e) => onEntryFieldChange('item_description', e.target.value)}
          disabled={!canProcessPurchases || !selectedProvider}
          placeholder={selectedProvider ? 'Describe el concepto a registrar...' : 'Primero selecciona un proveedor...'}
        />
        <div style={{ fontSize: '0.9em', color: '#4a5568', marginTop: '5px' }}>
          Unidad: <span style={{ fontWeight: 'bold' }}>{DEFAULT_FREEFORM_UNIT_LABEL}</span>
        </div>
      </>
    ) : (
      <>
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
          Unidad: <span style={{ fontWeight: 'bold' }}>{selectedMaterial?.materials?.uoms?.abbr || DEFAULT_FREEFORM_UNIT_LABEL}</span>
        </div>
      </>
    )}

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
                <div style={mobileItemLabelStyle}>{item.item_description ? 'Concepto' : 'SKU'}</div>
                <div style={mobileItemSkuStyle}>{item.item_description || item.sku || 'Sin SKU'}</div>
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
              <div style={mobileItemLabelStyle}>{item.item_description ? 'Descripcion' : 'Producto'}</div>
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
            <th style={thStyle}>Clave</th>
            <th style={thStyle}>Descripcion</th>
            <th style={thStyle}>Cant.</th>
            <th style={thStyle}>Costo</th>
            <th style={thStyle}>Costo U.</th>
            <th style={thStyle}>Accion</th>
          </tr>
        </thead>
        <tbody>
          {itemsList.map((item) => (
            <tr key={item.entry_id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={tdStyle}>{item.item_description ? 'Libre' : item.sku}</td>
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

const PurchaseActionBar = ({
  canProcessPurchases,
  purchaseChecked,
  isSubmitting,
  onOpenCheck,
  onProcess,
}) => (
  <div style={purchaseActionsWrapStyle}>
    <button
      type="button"
      onClick={onOpenCheck}
      disabled={!canProcessPurchases || isSubmitting}
      style={canProcessPurchases && !isSubmitting ? btnCheckStyle : disabledCheckBtnStyle}
    >
      Check
    </button>
    <button
      type="button"
      onClick={onProcess}
      disabled={!canProcessPurchases || !purchaseChecked || isSubmitting}
      style={canProcessPurchases && purchaseChecked && !isSubmitting ? btnStyle : disabledBtnStyle}
    >
      {isSubmitting ? 'Procesando...' : 'Procesar Factura Completa'}
    </button>
  </div>
);

const PurchaseCheckModal = ({
  providerName,
  invoiceRef,
  itemsList,
  totalAmount,
  isSubmitting,
  onCancel,
  onConfirm,
}) => (
  <div style={confirmOverlayStyle}>
    <div style={{ ...confirmCardStyle, border: '1px solid #bfdbfe' }}>
      <div style={{ ...confirmBadgeStyle, backgroundColor: '#eff6ff', color: '#1d4ed8' }}>Check de compra</div>
      <h3 style={confirmTitleStyle}>Revisa la factura antes de procesarla</h3>
      <p style={confirmTextStyle}>
        Confirma que el proveedor, el folio y los renglones capturados esten correctos. Despues de validar este paso
        ya podras procesar la compra completa.
      </p>

      <div style={confirmSummaryStyle}>
        <div style={confirmMetricStyle}>
          <span style={confirmMetricLabelStyle}>Proveedor</span>
          <strong style={confirmMetricValueStyle}>{providerName || 'Sin seleccionar'}</strong>
        </div>
        <div style={confirmMetricStyle}>
          <span style={confirmMetricLabelStyle}>Folio</span>
          <strong style={confirmMetricValueStyle}>{invoiceRef || 'Sin folio'}</strong>
        </div>
        <div style={confirmMetricStyle}>
          <span style={confirmMetricLabelStyle}>Renglones</span>
          <strong style={confirmMetricValueStyle}>{itemsList.length}</strong>
        </div>
        <div style={confirmMetricStyle}>
          <span style={confirmMetricLabelStyle}>Total</span>
          <strong style={confirmMetricValueStyle}>${totalAmount.toFixed(2)}</strong>
        </div>
      </div>

      <div style={purchaseCheckItemsWrapStyle}>
        {itemsList.map((item) => (
          <div key={item.entry_id} style={purchaseCheckItemStyle}>
            <div style={{ minWidth: 0 }}>
              <div style={purchaseCheckItemNameStyle}>{item.name}</div>
              <div style={purchaseCheckItemMetaStyle}>
                {item.item_description ? 'Concepto libre' : item.sku || 'Sin SKU'} · {item.quantity} x ${Number(item.unit_cost || 0).toFixed(2)}
              </div>
            </div>
            <strong style={purchaseCheckItemTotalStyle}>${item.subtotal.toFixed(2)}</strong>
          </div>
        ))}
      </div>

      <div style={confirmActionsStyle}>
        <button type="button" onClick={onCancel} style={confirmCancelBtnStyle}>
          Seguir revisando
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting}
          style={{
            ...confirmApproveBtnStyle,
            backgroundColor: isSubmitting ? '#94a3b8' : '#2563eb',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting ? 'Procesando...' : 'Datos correctos'}
        </button>
      </div>
    </div>
  </div>
);

const ProviderChangeModal = ({ onCancel, onConfirm }) => (
  <div style={confirmOverlayStyle}>
    <div style={confirmCardStyle}>
      <div style={confirmBadgeStyle}>Cambiar proveedor</div>
      <h3 style={confirmTitleStyle}>Se limpiara la lista actual</h3>
      <p style={confirmTextStyle}>
        Cambiar de proveedor eliminara los productos ya capturados para esta factura. Si continuamos, empezaremos una
        nueva lista con el proveedor seleccionado.
      </p>

      <div style={confirmActionsStyle}>
        <button type="button" onClick={onCancel} style={confirmCancelBtnStyle}>
          Cancelar
        </button>
        <button type="button" onClick={onConfirm} style={confirmApproveBtnStyle}>
          Continuar
        </button>
      </div>
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
    isSubmitting,
    purchaseChecked,
    showPurchaseCheckModal,
    showProviderChangeModal,
    purchase,
    itemsList,
    currentEntry,
  } = state;

  const selectedProviderRecord = useMemo(
    () => providers.find((provider) => provider.id === selectedProvider) || null,
    [providers, selectedProvider]
  );
  const isGeneralProvider = isGeneralProviderRecord(selectedProviderRecord);

  const availableMaterials = selectedProvider && !isGeneralProvider
    ? materials.filter((material) => material.materials?.provider_id === selectedProvider)
    : [];

  const selectedMaterial = availableMaterials.find((material) => material.materials?.id === currentEntry.material_id);
  const quantityValue = parseFloat(currentEntry.quantity);
  const totalCostValue = parseFloat(currentEntry.total_cost);
  const computedUnitCost =
    Number.isFinite(quantityValue) && quantityValue > 0 && Number.isFinite(totalCostValue)
      ? totalCostValue / quantityValue
      : 0;
  const purchaseTotal = itemsList.reduce((acc, item) => acc + item.subtotal, 0);

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
    if (isSubmitting) return;

    const clearItems = itemsList.length > 0 && nextProviderId !== selectedProvider;

    if (clearItems) {
      dispatch({
        type: 'request_provider_change_confirmation',
        providerId: nextProviderId,
      });
      return;
    }

    dispatch({
      type: 'set_provider',
      providerId: nextProviderId,
      clearItems,
    });
  };

  const validatePurchaseForCheck = () => {
    if (!selectedProvider) {
      alert('Primero selecciona un proveedor');
      return false;
    }

    if (!invoiceRef.trim()) {
      alert('Captura el folio de factura o remision antes de continuar');
      return false;
    }

    if (itemsList.length === 0) {
      alert('Agrega al menos un producto o concepto antes de hacer el Check');
      return false;
    }

    return true;
  };

  const handleOpenPurchaseCheck = () => {
    if (isSubmitting) return;
    if (!validatePurchaseForCheck()) return;
    dispatch({ type: 'set_purchase_check_modal', value: true });
  };

  const handleConfirmPurchaseCheck = () => {
    dispatch({ type: 'set_purchase_checked', value: true });
    dispatch({ type: 'set_purchase_check_modal', value: false });
  };

  const handleEntryFieldChange = (field, value) => {
    dispatch({
      type: 'set_current_entry_field',
      field,
      value,
    });
  };

  const handleAddToList = () => {
    if (!canProcessPurchases || isSubmitting) return;

    if (!selectedProvider) {
      alert('Primero selecciona un proveedor');
      return;
    }

    if (!currentEntry.quantity || !currentEntry.total_cost) {
      alert(isGeneralProvider ? 'Por favor completa descripcion, cantidad y costo' : 'Por favor completa material, cantidad y costo');
      return;
    }

    const quantity = parseFloat(currentEntry.quantity);
    const totalCost = parseFloat(currentEntry.total_cost);

    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(totalCost) || totalCost < 0) {
      alert('Captura una cantidad valida y un costo correcto');
      return;
    }

    if (isGeneralProvider) {
      const description = String(currentEntry.item_description || '').trim();
      if (!description) {
        alert('Debes capturar el concepto o descripcion del registro');
        return;
      }

      const unitCost = quantity > 0 ? totalCost / quantity : 0;

      dispatch({
        type: 'add_item',
        item: {
          entry_id: createPurchaseEntryId(),
          material_id: null,
          item_description: description,
          quantity,
          total_cost: totalCost,
          unit_cost: unitCost,
          name: description,
          sku: '',
          subtotal: totalCost,
        },
      });
      return;
    }

    if (!currentEntry.material_id) {
      alert('Debes seleccionar un material');
      return;
    }

    const materialInfo = availableMaterials.find((material) => material.materials.id === currentEntry.material_id);
    if (!materialInfo?.materials) {
      alert('El material seleccionado ya no esta disponible para este proveedor');
      return;
    }

    const unitCost = quantity > 0 ? totalCost / quantity : 0;

    dispatch({
      type: 'add_item',
      item: {
        entry_id: createPurchaseEntryId(),
        material_id: currentEntry.material_id,
        item_description: '',
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
    if (!canProcessPurchases || isSubmitting) return;

    if (!selectedProvider || itemsList.length === 0) {
      alert('Por favor completa todos los campos de la compra');
      return;
    }

    if (!purchaseChecked) {
      alert('Primero realiza el Check y confirma que la factura esta correcta');
      return;
    }

    try {
      dispatch({ type: 'set_is_submitting', value: true });

      const purchaseData = {
        ...purchase,
        provider_id: selectedProvider,
        invoice_ref: invoiceRef,
      };

      const payloadItems = itemsList.map((item) => (
        item.item_description
          ? {
              item_description: item.item_description,
              quantity: item.quantity,
              unit_cost: item.unit_cost,
            }
          : {
              material_id: item.material_id,
              quantity: item.quantity,
              unit_cost: item.unit_cost,
            }
      ));

      await materialService.recordPurchase(purchaseData, payloadItems);
      alert('Compra registrada correctamente');
      dispatch({ type: 'reset_after_save' });
    } catch (error) {
      console.error('Error al registrar compra:', error);
      alert(error?.message || 'Error al guardar la transaccion.');
    } finally {
      dispatch({ type: 'set_is_submitting', value: false });
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
          isGeneralProvider={isGeneralProvider}
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

      <PurchaseActionBar
        canProcessPurchases={canProcessPurchases}
        purchaseChecked={purchaseChecked}
        isSubmitting={isSubmitting}
        onOpenCheck={handleOpenPurchaseCheck}
        onProcess={handleSavePurchase}
      />

      {showPurchaseCheckModal && (
        <PurchaseCheckModal
          providerName={selectedProviderRecord?.name}
          invoiceRef={invoiceRef}
          itemsList={itemsList}
          totalAmount={purchaseTotal}
          isSubmitting={isSubmitting}
          onCancel={() => dispatch({ type: 'set_purchase_check_modal', value: false })}
          onConfirm={handleConfirmPurchaseCheck}
        />
      )}

      {showProviderChangeModal && (
        <ProviderChangeModal
          onCancel={() => dispatch({ type: 'cancel_provider_change_confirmation' })}
          onConfirm={() => dispatch({ type: 'confirm_provider_change' })}
        />
      )}
    </div>
  );
};

const formContainerStyle = { backgroundColor: colors.gray150, padding: space[8], borderRadius: radius.lg };
const sectionStyle = { marginBottom: space[7], padding: space[7], backgroundColor: colors.white, borderRadius: radius.md };
const labelStyle = { display: 'block', fontSize: type.sm, color: colors.gray700, marginBottom: space[2] };
const inputStyle = { width: '100%', padding: `${space[4]} ${space[5]}`, borderRadius: radius.md, border: `1px solid ${colors.gray300}`, boxSizing: 'border-box' };
const readOnlyInputStyle = { backgroundColor: colors.gray100, color: colors.gray900, WebkitTextFillColor: colors.gray900, fontWeight: type.bold };
const btnStyle = { flex: '1 1 240px', padding: `${space[4]} ${space[8]}`, backgroundColor: colors.blue600, color: colors.white, border: 'none', borderRadius: radius.md, fontWeight: type.bold, cursor: 'pointer' };
const btnCheckStyle = { flex: '0 0 140px', padding: `${space[4]} ${space[9]}`, backgroundColor: colors.gray800, color: colors.white, border: 'none', borderRadius: radius.md, fontWeight: type.black, cursor: 'pointer' };
const entryRowStyle = {
  marginTop: space[7],
  paddingTop: space[7],
  borderTop: `1px solid ${colors.gray200}`,
  display: 'flex',
  justifyContent: 'flex-end',
};
const btnAddStyle = {
  padding: `${space[4]} ${space[12]}`,
  backgroundColor: colors.gray800,
  color: colors.white,
  border: 'none',
  borderRadius: radius.md,
  cursor: 'pointer',
  fontWeight: type.bold,
  fontSize: type.base,
};
const tableWrapperStyle = { marginTop: space[7], backgroundColor: colors.white, borderRadius: radius.lg, overflowX: 'auto', boxShadow: shadow.sm };
const thStyle = { padding: '10px 12px', textAlign: 'left' };
const tdStyle = { padding: '8px 12px' };
const readOnlyBadgeStyle = { padding: `${space[1]} ${space[6]}`, borderRadius: radius.full, backgroundColor: colors.gray150, color: colors.gray600, fontWeight: type.bold };
const disabledBtnStyle = { ...btnStyle, backgroundColor: colors.gray400, cursor: 'not-allowed' };
const disabledCheckBtnStyle = { ...btnCheckStyle, backgroundColor: colors.gray400, cursor: 'not-allowed' };
const mobileCardsListStyle = { display: 'grid', gap: space[6], padding: space[6] };
const mobileItemCardStyle = { borderRadius: radius.xl, border: `1px solid ${colors.gray200}`, backgroundColor: colors.gray100, padding: space[6], display: 'flex', flexDirection: 'column', gap: space[5] };
const mobileItemHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[6] };
const mobileItemLabelStyle = { color: colors.gray500, fontSize: type.xs, fontWeight: type.black, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: space[1] };
const mobileItemSkuStyle = { color: colors.gray800, fontWeight: type.black };
const mobileItemNameStyle = { color: colors.gray900, fontWeight: type.black, fontSize: type.md };
const mobileMetricsGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: space[5] };
const mobileMetricCardStyle = { borderRadius: radius.md, border: `1px solid ${colors.gray200}`, backgroundColor: colors.white, padding: space[5] };
const mobileMetricValueStyle = { color: colors.gray900, fontWeight: type.black };
const mobileSubtotalStyle = { color: colors.green500, fontWeight: type.black };
const mobileRemoveButtonStyle = { border: 'none', borderRadius: radius.md, backgroundColor: colors.red100, color: colors.red700, fontWeight: type.black, padding: `${space[4]} ${space[6]}`, cursor: 'pointer' };
const mobileRemoveButtonDisabledStyle = { backgroundColor: colors.gray200, color: colors.gray400, cursor: 'not-allowed' };
const purchaseActionsWrapStyle = { marginTop: space[7], display: 'flex', gap: space[6], alignItems: 'stretch', flexWrap: 'wrap' };
const confirmOverlayStyle = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.52)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: space[9],
  zIndex: 1050,
};
const confirmCardStyle = {
  width: '100%',
  maxWidth: '520px',
  backgroundColor: colors.white,
  borderRadius: radius.xl,
  boxShadow: '0 28px 70px rgba(15, 23, 42, 0.28)',
  padding: space[10],
  border: `1px solid ${colors.red100}`,
};
const confirmBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: `${space[1]} ${space[5]}`,
  borderRadius: radius.full,
  backgroundColor: colors.amber50,
  color: '#c2410c',
  fontWeight: type.black,
  fontSize: type.xs,
  marginBottom: space[7],
};
const confirmTitleStyle = {
  margin: 0,
  color: colors.gray900,
  fontSize: type['2xl'],
};
const confirmTextStyle = {
  margin: `${space[6]} 0 0 0`,
  color: colors.gray600,
  lineHeight: 1.65,
};
const confirmSummaryStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: space[6],
  marginTop: space[9],
};
const confirmMetricStyle = {
  backgroundColor: colors.gray100,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.lg,
  padding: `${space[5]} ${space[6]}`,
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
};
const confirmMetricLabelStyle = {
  color: colors.gray500,
  fontSize: type.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};
const confirmMetricValueStyle = {
  color: colors.gray900,
  fontSize: type.lg,
};
const confirmActionsStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: space[5],
  flexWrap: 'wrap',
  marginTop: space[9],
};
const confirmCancelBtnStyle = {
  border: `1px solid ${colors.gray300}`,
  backgroundColor: colors.white,
  color: colors.gray700,
  borderRadius: radius.md,
  padding: `${space[4]} ${space[8]}`,
  fontWeight: type.bold,
  cursor: 'pointer',
};
const confirmApproveBtnStyle = {
  border: 'none',
  backgroundColor: colors.red600,
  color: colors.white,
  borderRadius: radius.md,
  padding: `${space[4]} ${space[8]}`,
  fontWeight: type.black,
  cursor: 'pointer',
};
const purchaseCheckItemsWrapStyle = {
  marginTop: space[9],
  display: 'grid',
  gap: space[5],
  maxHeight: '240px',
  overflowY: 'auto',
};
const purchaseCheckItemStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: space[6],
  padding: `${space[5]} ${space[6]}`,
  borderRadius: radius.lg,
  backgroundColor: colors.gray100,
  border: `1px solid ${colors.gray200}`,
};
const purchaseCheckItemNameStyle = {
  color: colors.gray900,
  fontWeight: type.black,
};
const purchaseCheckItemMetaStyle = {
  color: colors.gray500,
  fontSize: type.sm,
  marginTop: space[2],
};
const purchaseCheckItemTotalStyle = {
  color: colors.gray900,
  whiteSpace: 'nowrap',
};

export default PurchaseEntry;
