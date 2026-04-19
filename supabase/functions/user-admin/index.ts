// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const AUTH_DOMAIN = 'usuarios.mi-punto-de-venta.local'

const normalizeUsername = (value: string) => value.trim().toLowerCase()
const usernameToAuthEmail = (username: string) => `${normalizeUsername(username)}@${AUTH_DOMAIN}`
const isValidPassword = (value: string) => /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{10,}$/.test(value)
const normalizeRoleName = (value: string | null | undefined) => (value || '').trim().toLowerCase()
const isManagerRoleName = (value: string | null | undefined) =>
  ['manager', 'administrador operativo'].includes(normalizeRoleName(value))
const isWaiterRoleName = (value: string | null | undefined) => normalizeRoleName(value) === 'mesero'

type RoleLinkRow = {
  role_id: string
  app_roles: { name: string | null } | { name: string | null }[] | null
}

const readRoleName = (roleLink: RoleLinkRow) => {
  if (Array.isArray(roleLink.app_roles)) {
    return roleLink.app_roles[0]?.name ?? null
  }

  return roleLink.app_roles?.name ?? null
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })

const resolveAuthenticatedUser = async (supabaseUrl: string, authApiKey: string, authorization: string) => {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: authApiKey,
      Authorization: authorization,
    },
  })

  if (!response.ok) {
    return { user: null, error: new Error('Sesion invalida o expirada.') }
  }

  return {
    user: await response.json(),
    error: null,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey =
      Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authApiKey = Deno.env.get('PROJECT_LEGACY_SERVICE_ROLE_KEY') || serviceRoleKey
    const authorization = req.headers.get('Authorization')

    if (!authorization) {
      return json({ error: 'No se recibio token de autenticacion.' }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const accessToken = authorization.replace(/^Bearer\s+/i, '').trim()

    const { user, error: userError } = await resolveAuthenticatedUser(
      supabaseUrl,
      authApiKey,
      `Bearer ${accessToken}`
    )

    if (userError || !user) {
      return json({ error: 'Sesion invalida o expirada.' }, 401)
    }

    const { data: profile, error: profileError } = await adminClient
      .from('app_profiles')
      .select('id, is_superadmin, status')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || profile?.status !== 'active') {
      return json({ error: 'No tienes permisos para administrar usuarios.' }, 403)
    }

    const { data: callerRoleLinks, error: callerRoleError } = await adminClient
      .from('app_user_roles')
      .select('role_id, app_roles(name)')
      .eq('user_id', user.id)

    if (callerRoleError) {
      return json({ error: callerRoleError.message }, 400)
    }

    const callerRoleNames = Array.from(
      new Set(((callerRoleLinks as RoleLinkRow[] | null) || []).map(readRoleName).filter(Boolean))
    )

    const isSuperadmin = Boolean(profile?.is_superadmin)
    const isManager = callerRoleNames.some((roleName) => isManagerRoleName(roleName))

    if (!isSuperadmin && !isManager) {
      return json({ error: 'No tienes permisos para administrar usuarios.' }, 403)
    }

    const { data: allRoles, error: allRolesError } = await adminClient
      .from('app_roles')
      .select('id, name')

    if (allRolesError) {
      return json({ error: allRolesError.message }, 400)
    }

    const roleNameById = new Map((allRoles || []).map((role) => [role.id, role.name]))
    const waiterRoleId = (allRoles || []).find((role) => isWaiterRoleName(role.name))?.id || null

    const areWaiterOnlyRoleIds = (roleIds: string[]) =>
      roleIds.length > 0 && roleIds.every((roleId) => isWaiterRoleName(roleNameById.get(roleId)))

    const getTargetRoleNames = async (targetUserId: string) => {
      const { data, error } = await adminClient
        .from('app_user_roles')
        .select('role_id, app_roles(name)')
        .eq('user_id', targetUserId)

      if (error) {
        throw new Error(error.message)
      }

      return Array.from(
        new Set(((data as RoleLinkRow[] | null) || []).map(readRoleName).filter(Boolean))
      )
    }

    const body = (await req.json()) as Record<string, unknown>
    const action = body?.action

    if (action === 'create_user') {
      const username = normalizeUsername(body.username ?? '')
      const password = String(body.password ?? '')
      const fullName = body.full_name ? String(body.full_name) : null
      const roleIds = Array.isArray(body.role_ids) ? body.role_ids : []

      if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
        return json({ error: 'El usuario debe tener entre 3 y 30 caracteres y solo usar letras, numeros, punto, guion o guion bajo.' }, 400)
      }

      if (!isValidPassword(password)) {
        return json({ error: 'La contrasena debe ser alfanumerica y tener al menos 10 caracteres.' }, 400)
      }

      if (!isSuperadmin) {
        if (!waiterRoleId || !areWaiterOnlyRoleIds(roleIds)) {
          return json({ error: 'El manager solo puede crear usuarios con rol de mesero.' }, 403)
        }
      }

      const internalEmail = usernameToAuthEmail(username)

      const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
        email: internalEmail,
        password,
        email_confirm: true,
        user_metadata: {
          username,
        },
      })

      if (createError || !createdUser.user) {
        return json({ error: createError?.message || 'No se pudo crear el usuario auth.' }, 400)
      }

      const newUserId = createdUser.user.id

      const { error: profileInsertError } = await adminClient.from('app_profiles').insert({
        id: newUserId,
        username,
        full_name: fullName,
        email: internalEmail,
        status: 'active',
        is_superadmin: false,
      })

      if (profileInsertError) {
        await adminClient.auth.admin.deleteUser(newUserId)
        return json({ error: profileInsertError.message }, 400)
      }

      if (roleIds.length > 0) {
        const { error: roleInsertError } = await adminClient.from('app_user_roles').insert(
          roleIds.map((roleId: string) => ({
            user_id: newUserId,
            role_id: roleId,
          }))
        )

        if (roleInsertError) {
          await adminClient.from('app_profiles').delete().eq('id', newUserId)
          await adminClient.auth.admin.deleteUser(newUserId)
          return json({ error: roleInsertError.message }, 400)
        }
      }

      await adminClient.from('audit_log').insert([
        {
          entity_type: 'app_profile',
          entity_id: newUserId,
          event_type: 'user_created',
          new_values: {
            username,
            full_name: fullName,
            is_superadmin: false,
            role_ids: roleIds,
          },
          notes: 'Alta de usuario desde Edge Function',
          performed_by: user.id,
        },
        ...(roleIds.length > 0
          ? [
              {
                entity_type: 'app_profile',
                entity_id: newUserId,
                event_type: 'role_assigned',
                new_values: { role_ids: roleIds },
                notes: 'Asignacion inicial de roles',
                performed_by: user.id,
              },
            ]
          : []),
      ])

      return json({ id: newUserId })
    }

    if (action === 'update_user') {
      const userId = String(body.user_id ?? '')
      const username = normalizeUsername(body.username ?? '')
      const fullName = body.full_name ? String(body.full_name) : null
      const status = body.status === 'inactive' ? 'inactive' : 'active'
      const roleIds = Array.isArray(body.role_ids) ? body.role_ids : []

      if (!userId) return json({ error: 'Falta user_id.' }, 400)
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
        return json({ error: 'El usuario debe tener entre 3 y 30 caracteres y solo usar letras, numeros, punto, guion o guion bajo.' }, 400)
      }

      const { data: previousProfile, error: previousProfileError } = await adminClient
        .from('app_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (previousProfileError || !previousProfile) {
        return json({ error: 'Usuario no encontrado.' }, 404)
      }

      const previousRoleNames = await getTargetRoleNames(userId)

      if (!isSuperadmin) {
        if (previousProfile.is_superadmin || previousRoleNames.some((name) => !isWaiterRoleName(name))) {
          return json({ error: 'El manager solo puede editar usuarios con rol de mesero.' }, 403)
        }

        if (!waiterRoleId || !areWaiterOnlyRoleIds(roleIds)) {
          return json({ error: 'El manager solo puede dejar usuarios con rol de mesero.' }, 403)
        }
      }

      const internalEmail = usernameToAuthEmail(username)

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
        email: internalEmail,
        user_metadata: {
          ...(previousProfile ?? {}),
          username,
        },
      })

      if (authUpdateError) {
        return json({ error: authUpdateError.message }, 400)
      }

      const { error: profileUpdateError } = await adminClient
        .from('app_profiles')
        .update({
          username,
          full_name: fullName,
          email: internalEmail,
          status,
          is_superadmin: false,
        })
        .eq('id', userId)

      if (profileUpdateError) {
        return json({ error: profileUpdateError.message }, 400)
      }

      await adminClient.from('app_user_roles').delete().eq('user_id', userId)
      if (roleIds.length > 0) {
        const { error: roleInsertError } = await adminClient.from('app_user_roles').insert(
          roleIds.map((roleId: string) => ({
            user_id: userId,
            role_id: roleId,
          }))
        )

        if (roleInsertError) {
          return json({ error: roleInsertError.message }, 400)
        }
      }

      await adminClient.from('audit_log').insert([
        {
          entity_type: 'app_profile',
          entity_id: userId,
          event_type:
            previousProfile.status !== 'inactive' && status === 'inactive'
              ? 'user_deactivated'
              : 'user_updated',
          old_values: {
            username: previousProfile.username,
            full_name: previousProfile.full_name,
            status: previousProfile.status,
            is_superadmin: previousProfile.is_superadmin,
          },
          new_values: {
            username,
            full_name: fullName,
            status,
            is_superadmin: false,
            role_ids: roleIds,
          },
          notes: 'Actualizacion de usuario desde Edge Function',
          performed_by: user.id,
        },
        {
          entity_type: 'app_profile',
          entity_id: userId,
          event_type: 'role_assigned',
          new_values: { role_ids: roleIds },
          notes: 'Actualizacion de roles del usuario',
          performed_by: user.id,
        },
      ])

      return json({ id: userId })
    }

    if (action === 'delete_user') {
      const userId = String(body.user_id ?? '')
      if (!userId) return json({ error: 'Falta user_id.' }, 400)
      if (userId === user.id) return json({ error: 'No puedes eliminar tu propio usuario.' }, 400)

      const { data: previousProfile, error: previousProfileError } = await adminClient
        .from('app_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (previousProfileError || !previousProfile) {
        return json({ error: 'Usuario no encontrado.' }, 404)
      }

      const previousRoleNames = await getTargetRoleNames(userId)

      if (!isSuperadmin) {
        if (previousProfile.is_superadmin || previousRoleNames.some((name) => !isWaiterRoleName(name))) {
          return json({ error: 'El manager solo puede eliminar usuarios con rol de mesero.' }, 403)
        }
      }

      await adminClient.from('audit_log').insert({
        entity_type: 'app_profile',
        entity_id: userId,
        event_type: 'user_deleted',
        old_values: {
          username: previousProfile.username,
          full_name: previousProfile.full_name,
          status: previousProfile.status,
          is_superadmin: previousProfile.is_superadmin,
        },
        notes: 'Eliminacion de usuario desde Edge Function',
        performed_by: user.id,
      })

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
      if (deleteError) {
        return json({ error: deleteError.message }, 400)
      }

      return json({ id: userId })
    }

    return json({ error: 'Accion no soportada.' }, 400)
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, 500)
  }
})
