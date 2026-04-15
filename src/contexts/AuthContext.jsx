/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authService } from '../api/authService'
import { ACTION_KEYS, PAGE_ORDER, PAGE_PERMISSION_MAP } from '../lib/permissionConfig'

const AuthContext = createContext(null)
const normalizeRoleName = (value = '') => value.trim().toLowerCase()
const isManagerRoleName = (value = '') =>
  ['manager', 'administrador operativo'].includes(normalizeRoleName(value))
const isWaiterRoleName = (value = '') => normalizeRoleName(value) === 'mesero'

const getDefaultAccessState = () => ({
  session: null,
  user: null,
  profile: null,
  roleIds: [],
  roleNames: [],
  permissionKeys: [],
  loading: true,
})

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(getDefaultAccessState)

  const loadAccess = useCallback(async (session) => {
    if (!session?.user) {
      setAuthState({
        session: null,
        user: null,
        profile: null,
        roleIds: [],
        roleNames: [],
        permissionKeys: [],
        loading: false,
      })
      return
    }

    try {
      const [profile, access] = await Promise.all([
        authService.getCurrentProfile(session.user.id),
        authService.getCurrentPermissions(session.user.id),
      ])

      setAuthState({
        session,
        user: session.user,
        profile,
        roleIds: access.roleIds,
        roleNames: access.roleNames,
        permissionKeys: access.permissionKeys,
        loading: false,
      })
    } catch (error) {
      console.error('Error al cargar acceso del usuario:', error)
      setAuthState({
        session,
        user: session.user,
        profile: null,
        roleIds: [],
        roleNames: [],
        permissionKeys: [],
        loading: false,
      })
    }
  }, [])

  useEffect(() => {
    let active = true

    authService
      .getSession()
      .then((session) => {
        if (active) {
          loadAccess(session)
        }
      })
      .catch((error) => {
        console.error('Error al leer la sesion actual:', error)
        if (active) {
          setAuthState((prev) => ({ ...prev, loading: false }))
        }
      })

    const { data } = authService.onAuthStateChange((_event, session) => {
      loadAccess(session)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [loadAccess])

  const can = useCallback(
    (screenKey, actionKey = ACTION_KEYS.VIEW) => {
      if (authState.profile?.is_superadmin) return true
      return authState.permissionKeys.includes(`${screenKey}:${actionKey}`)
    },
    [authState.permissionKeys, authState.profile?.is_superadmin]
  )

  const canAccessPage = useCallback(
    (pageKey) => {
      const screenKey = PAGE_PERMISSION_MAP[pageKey]
      if (!screenKey) return false
      return can(screenKey, ACTION_KEYS.VIEW)
    },
    [can]
  )

  const getFirstAllowedPage = useCallback(() => {
    const firstPage = PAGE_ORDER.find((pageKey) => canAccessPage(pageKey))
    return firstPage || 'home'
  }, [canAccessPage])

  const refreshAccess = useCallback(async () => {
    const session = await authService.getSession()
    await loadAccess(session)
  }, [loadAccess])

  const value = useMemo(
    () => ({
      ...authState,
      isAuthenticated: Boolean(authState.session?.user),
      isSuperadmin: Boolean(authState.profile?.is_superadmin),
      isManager: authState.roleNames.some((roleName) => isManagerRoleName(roleName)),
      isWaiter: authState.roleNames.some((roleName) => isWaiterRoleName(roleName)),
      isActive: authState.profile?.status !== 'inactive',
      can,
      canAccessPage,
      getFirstAllowedPage,
      signIn: authService.signIn,
      signOut: authService.signOut,
      refreshAccess,
    }),
    [authState, can, canAccessPage, getFirstAllowedPage, refreshAccess]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}
