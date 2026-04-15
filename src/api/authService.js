import { supabase } from '../lib/supabase'

const AUTH_DOMAIN = 'usuarios.mi-punto-de-venta.local'

export const normalizeUsername = (value = '') => value.trim().toLowerCase()

export const usernameToAuthEmail = (username) =>
  `${normalizeUsername(username)}@${AUTH_DOMAIN}`

export const isValidPassword = (value = '') =>
  /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{10,}$/.test(value)

export const authService = {
  async signIn(username, password) {
    const normalizedUsername = normalizeUsername(username)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToAuthEmail(normalizedUsername),
      password,
    })

    if (error) throw error
    return data
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  async updatePassword({ currentPassword, newPassword }) {
    if (!isValidPassword(newPassword)) {
      throw new Error('La contrasena debe ser alfanumerica y tener al menos 10 caracteres.')
    }

    const session = await this.getSession()
    if (!session?.user?.id) {
      throw new Error('No hay una sesion activa para cambiar la contrasena.')
    }

    const profile = await this.getCurrentProfile(session.user.id)
    if (!profile?.username) {
      throw new Error('No se pudo validar el usuario actual.')
    }

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: usernameToAuthEmail(profile.username),
      password: currentPassword,
    })

    if (reauthError) {
      throw new Error('La contrasena actual no es correcta.')
    }

    const { data, error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) throw error
    return data
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return data.session
  },

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  },

  async getCurrentProfile(userId) {
    const { data, error } = await supabase
      .from('app_profiles')
      .select('id, username, full_name, email, status, is_superadmin, created_at')
      .eq('id', userId)
      .maybeSingle()

    if (error) throw error
    return data
  },

  async getCurrentPermissions(userId) {
    const { data: roleLinks, error: roleLinksError } = await supabase
      .from('app_user_roles')
      .select('role_id, app_roles(name)')
      .eq('user_id', userId)

    if (roleLinksError) throw roleLinksError

    const roleIds = (roleLinks || []).map((link) => link.role_id)
    const roleNames = Array.from(
      new Set(
        (roleLinks || [])
          .map((link) => link.app_roles?.name)
          .filter(Boolean)
      )
    )

    if (roleIds.length === 0) {
      return {
        roleIds: [],
        roleNames: [],
        permissionKeys: [],
      }
    }

    const { data: rolePermissions, error: rolePermissionsError } = await supabase
      .from('app_role_permissions')
      .select('role_id, permission_id')
      .in('role_id', roleIds)

    if (rolePermissionsError) throw rolePermissionsError

    const permissionIds = Array.from(new Set((rolePermissions || []).map((item) => item.permission_id)))
    if (permissionIds.length === 0) {
      return {
        roleIds,
        roleNames,
        permissionKeys: [],
      }
    }

    const { data: permissions, error: permissionsError } = await supabase
      .from('app_permissions')
      .select('id, screen_key, action_key')
      .in('id', permissionIds)

    if (permissionsError) throw permissionsError

    return {
      roleIds,
      roleNames,
      permissionKeys: (permissions || []).map(
        (permission) => `${permission.screen_key}:${permission.action_key}`
      ),
    }
  },
}
