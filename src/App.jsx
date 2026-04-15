import { useEffect, useMemo, useReducer } from 'react'
import Inventory from './pages/Inventory'
import ProviderMaster from './pages/ProviderMaster'
import PurchaseEntry from './pages/PurchaseEntry'
import ReportsHome from './pages/ReportsHome'
import InventoryReport from './pages/InventoryReport'
import PurchasesReport from './pages/PurchasesReport'
import SalesReport from './pages/SalesReport'
import POS from './pages/POS'
import SecurityUsers from './pages/SecurityUsers'
import Home from './pages/Home'
import Login from './pages/Login'
import AccessDenied from './pages/AccessDenied'
import { AuthProvider, useAuth } from './contexts/AuthContext'

const STORAGE_KEY = 'mi-punto-de-venta.current-page'

const PAGE_LABELS = {
  home: 'Inicio',
  master: 'Materiales',
  providers: 'Proveedores',
  purchases: 'Compras',
  reports: 'Reportes',
  'report-inventory': 'Existencias',
  'report-purchases': 'Reporte compras',
  'report-sales': 'Reporte ventas',
  pos: 'Punto de venta',
  security: 'Usuarios',
}

const PRIMARY_NAV_PAGES = ['home', 'master', 'providers', 'purchases', 'reports', 'pos', 'security']

const getInitialUiState = () => ({
  currentPage: typeof window === 'undefined' ? 'home' : localStorage.getItem(STORAGE_KEY) || 'home',
  isPosEditing: false,
  restoredProfileId: null,
})

const uiReducer = (state, action) => {
  switch (action.type) {
    case 'reset':
      return {
        currentPage: 'home',
        isPosEditing: false,
        restoredProfileId: null,
      }
    case 'restore-page':
      return {
        ...state,
        currentPage: action.page,
        restoredProfileId: action.profileId,
      }
    case 'set-page':
      return {
        ...state,
        currentPage: action.page,
      }
    case 'set-pos-editing':
      return {
        ...state,
        isPosEditing: action.value,
      }
    default:
      return state
  }
}

const AppShell = () => {
  const {
    loading,
    isAuthenticated,
    isActive,
    canAccessPage,
    getFirstAllowedPage,
    profile,
    isWaiter,
  } = useAuth()
  const [uiState, dispatch] = useReducer(uiReducer, undefined, getInitialUiState)
  const { currentPage, isPosEditing, restoredProfileId } = uiState

  useEffect(() => {
    if (!isAuthenticated) {
      localStorage.removeItem(STORAGE_KEY)
      dispatch({ type: 'reset' })
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated || !profile?.id) return
    if (restoredProfileId === profile.id) return

    const storedPage = localStorage.getItem(STORAGE_KEY)
    const nextPage = storedPage && canAccessPage(storedPage)
      ? storedPage
      : getFirstAllowedPage()

    dispatch({ type: 'restore-page', page: nextPage, profileId: profile.id })
  }, [canAccessPage, getFirstAllowedPage, isAuthenticated, profile?.id, restoredProfileId])

  useEffect(() => {
    if (!isAuthenticated) return
    if (!canAccessPage(currentPage)) {
      dispatch({ type: 'set-page', page: getFirstAllowedPage() })
      return
    }

    localStorage.setItem(STORAGE_KEY, currentPage)
  }, [canAccessPage, currentPage, getFirstAllowedPage, isAuthenticated])

  const navItems = useMemo(
    () =>
      PRIMARY_NAV_PAGES.filter((pageKey) => canAccessPage(pageKey)).map((pageKey) => ({
        key: pageKey,
        label: PAGE_LABELS[pageKey] || pageKey,
      })),
    [canAccessPage]
  )

  const handleNavigate = (pageKey) => {
    if (!canAccessPage(pageKey)) return
    dispatch({ type: 'set-page', page: pageKey })
  }

  const handlePosEditingStateChange = (value) => {
    dispatch({ type: 'set-pos-editing', value: Boolean(value) })
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home onNavigate={handleNavigate} />
      case 'master':
        return <Inventory />
      case 'providers':
        return <ProviderMaster />
      case 'purchases':
        return <PurchaseEntry />
      case 'reports':
        return <ReportsHome onNavigate={handleNavigate} />
      case 'report-inventory':
        return <InventoryReport />
      case 'report-purchases':
        return <PurchasesReport />
      case 'report-sales':
        return <SalesReport />
      case 'pos':
        return <POS onEditingStateChange={handlePosEditingStateChange} />
      case 'security':
        return <SecurityUsers />
      default:
        return <AccessDenied />
    }
  }

  if (loading) {
    return <div style={loadingStyle}>Cargando aplicacion...</div>
  }

  if (!isAuthenticated) {
    return <Login />
  }

  if (!isActive) {
    return <AccessDenied />
  }

  const hideNavigation = currentPage === 'home' || (isWaiter && currentPage === 'pos' && isPosEditing)

  return (
    <div style={appStyle}>
      {currentPage !== 'home' && (
        <div style={topMetaStyle}>
          <span style={userPillStyle}>{profile?.full_name || profile?.username || 'Usuario activo'}</span>
        </div>
      )}

      {!hideNavigation && (
        <header style={headerStyle}>
          <div>
            <div style={brandStyle}>La Carreta</div>
            <div style={subtitleStyle}>{profile?.full_name || profile?.username || 'Panel operativo'}</div>
          </div>

          <nav style={navStyle}>
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavigate(item.key)}
                style={{
                  ...navButtonStyle,
                  ...(currentPage === item.key ? activeNavButtonStyle : null),
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </header>
      )}

      <main style={mainStyle}>{renderPage()}</main>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

const appStyle = {
  minHeight: '100vh',
  background: '#f8fafc',
}

const topMetaStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  padding: '18px 24px 0',
}

const userPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '10px 16px',
  borderRadius: '999px',
  background: '#ffffff',
  border: '1px solid #bfdbfe',
  color: '#1e3a5f',
  fontWeight: 800,
  boxShadow: '0 10px 24px rgba(59, 130, 246, 0.08)',
}

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '20px',
  flexWrap: 'wrap',
  padding: '12px 24px 0',
}

const brandStyle = {
  color: '#0f172a',
  fontWeight: 900,
  fontSize: '1.35rem',
}

const subtitleStyle = {
  color: '#64748b',
  fontSize: '0.95rem',
  marginTop: '4px',
}

const navStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap',
}

const navButtonStyle = {
  padding: '10px 16px',
  borderRadius: '999px',
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#334155',
  fontWeight: 700,
  cursor: 'pointer',
}

const activeNavButtonStyle = {
  background: '#0f172a',
  color: '#ffffff',
  borderColor: '#0f172a',
}

const mainStyle = {
  width: '100%',
}

const loadingStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#0f172a',
  fontWeight: 800,
  background: '#f8fafc',
}

export default App
