export const createInitialPosState = () => ({
  inventory: [],
  tables: [],
  selectedTable: null,
  cart: [],
  ticketData: null,
  notice: null,
  loading: true,
  isHydratingTable: false,
  waiterEditLocked: false,
  showFinalizeConfirm: false,
  isFinalizingSale: false,
})

export const posReducer = (state, action) => {
  switch (action.type) {
    case 'bootstrap_data':
      return {
        ...state,
        inventory: action.inventory,
        tables: action.tables,
        loading: false,
      }
    case 'set_loading':
      return {
        ...state,
        loading: action.value,
      }
    case 'set_inventory':
      return {
        ...state,
        inventory: action.inventory,
      }
    case 'set_tables':
      return {
        ...state,
        tables: action.tables,
      }
    case 'set_notice':
      return {
        ...state,
        notice: action.notice,
      }
    case 'set_ticket_data':
      return {
        ...state,
        ticketData: action.ticketData,
      }
    case 'set_show_finalize_confirm':
      return {
        ...state,
        showFinalizeConfirm: action.value,
      }
    case 'set_finalizing_sale':
      return {
        ...state,
        isFinalizingSale: action.value,
      }
    case 'set_selected_table':
      return {
        ...state,
        selectedTable: action.table,
      }
    case 'set_cart':
      return {
        ...state,
        cart: action.cart,
      }
    case 'add_cart_item': {
      const { item } = action
      const existing = state.cart.find((c) => c.material_id === item.material_id && !c.bundle_id)
      if (existing) {
        return {
          ...state,
          cart: state.cart.map((c) =>
            c === existing ? { ...c, quantity: c.quantity + 1 } : c
          ),
        }
      }
      return {
        ...state,
        cart: [...state.cart, { ...item, quantity: 1 }],
      }
    }
    case 'change_cart_quantity':
      return {
        ...state,
        cart: state.cart
          .map((c) => {
            if (c.bundle_id || c.material_id !== action.materialId) return c
            return { ...c, quantity: c.quantity + action.delta }
          })
          .filter((c) => c.quantity > 0),
      }
    case 'set_waiter_edit_locked':
      return {
        ...state,
        waiterEditLocked: action.value,
      }
    case 'hydrate_table_start':
      return {
        ...state,
        isHydratingTable: true,
        selectedTable: action.table,
        waiterEditLocked: false,
      }
    case 'hydrate_table_ready':
      return {
        ...state,
        cart: action.cart,
        waiterEditLocked: action.waiterEditLocked,
        isHydratingTable: false,
      }
    case 'hydrate_table_finish':
      return {
        ...state,
        isHydratingTable: false,
      }
    case 'leave_selected_table':
      return {
        ...state,
        selectedTable: null,
        cart: [],
        waiterEditLocked: false,
      }
    default:
      return state
  }
}
