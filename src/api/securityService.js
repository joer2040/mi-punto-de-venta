import { supabase } from '../lib/supabase'

const groupRoleIdsByUser = (roleLinks) =>
  (roleLinks || []).reduce((acc, link) => {
    const current = acc.get(link.user_id) || []
    current.push(link.role_id)
    acc.set(link.user_id, current)
    return acc
  }, new Map())

const invokeUserAdmin = async (action, payload) => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { data, error } = await supabase.functions.invoke('user-admin', {
    body: {
      action,
      ...payload,
    },
    headers: session?.access_token
      ? {
          Authorization: `Bearer ${session.access_token}`,
        }
      : undefined,
  })

  if (error) {
    const response = error.context

    if (response) {
      try {
        const errorBody = await response.json()
        throw new Error(errorBody?.error || error.message)
      } catch {
        try {
          const errorText = await response.text()
          throw new Error(errorText || error.message)
        } catch {
          throw new Error(error.message)
        }
      }
    }

    throw new Error(error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export const securityService = {
  async getUsers() {
    const [{ data: profiles, error: profilesError }, { data: roleLinks, error: roleLinksError }] =
      await Promise.all([
        supabase
          .from('app_profiles')
          .select('id, username, full_name, email, status, is_superadmin, created_at')
          .order('created_at', { ascending: false }),
        supabase.from('app_user_roles').select('user_id, role_id'),
      ])

    if (profilesError) throw profilesError
    if (roleLinksError) throw roleLinksError

    const roleIdsByUser = groupRoleIdsByUser(roleLinks)

    return (profiles || []).map((profile) => ({
      ...profile,
      role_ids: roleIdsByUser.get(profile.id) || [],
    }))
  },

  async getRoles() {
    const { data, error } = await supabase
      .from('app_roles')
      .select('id, name, description, created_at')
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  async createUser({ username, password, full_name, is_superadmin, role_ids }) {
    return invokeUserAdmin('create_user', {
      username,
      password,
      full_name,
      is_superadmin,
      role_ids: role_ids || [],
    })
  },

  async updateUser({ user_id, username, full_name, status, is_superadmin, role_ids }) {
    return invokeUserAdmin('update_user', {
      user_id,
      username,
      full_name,
      status,
      is_superadmin,
      role_ids: role_ids || [],
    })
  },

  async deleteUser(userId) {
    return invokeUserAdmin('delete_user', {
      user_id: userId,
    })
  },
}
