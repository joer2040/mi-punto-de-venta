import React, { useEffect, useMemo, useState } from 'react'
import { securityService } from '../api/securityService'
import { isValidPassword } from '../api/authService'
import { useAuth } from '../contexts/AuthContext'
import { ACTION_KEYS, PAGE_PERMISSION_MAP } from '../lib/permissionConfig'
import { useResponsive } from '../lib/useResponsive'

const emptyUserForm = {
  id: null,
  username: '',
  full_name: '',
  password: '',
  status: 'active',
  role_ids: [],
}

const normalizeRoleName = (value = '') => value.trim().toLowerCase()
const isManagerRoleName = (value = '') =>
  ['manager', 'administrador operativo'].includes(normalizeRoleName(value))
const isWaiterRoleName = (value = '') => normalizeRoleName(value) === 'mesero'
const getRoleDisplayName = (value = '') => {
  if (isManagerRoleName(value)) return 'manager'
  if (isWaiterRoleName(value)) return 'mesero'
  return normalizeRoleName(value)
}

const SecurityUsers = () => {
  const { can, profile, isManager, isSuperadmin } = useAuth()
  const { isMobile } = useResponsive()
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [userForm, setUserForm] = useState(emptyUserForm)
  const [notice, setNotice] = useState('')

  const canManageUsers = can(PAGE_PERMISSION_MAP.security, ACTION_KEYS.MANAGE)
  const waiterRole = useMemo(
    () => roles.find((role) => isWaiterRoleName(role.name)) || null,
    [roles]
  )
  const managerRole = useMemo(
    () => roles.find((role) => isManagerRoleName(role.name)) || null,
    [roles]
  )

  const roleNameById = useMemo(
    () => new Map(roles.map((role) => [role.id, role.name])),
    [roles]
  )

  const getUserRoleNames = (user) =>
    (user.role_ids || []).map((roleId) => roleNameById.get(roleId)).filter(Boolean)

  const isWaiterOnlyUser = (user) => {
    if (user?.is_superadmin) return false
    const roleNames = getUserRoleNames(user)
    return roleNames.length > 0 && roleNames.every((name) => isWaiterRoleName(name))
  }

  const canManageTargetUser = (user) => {
    if (isSuperadmin) return true
    if (!isManager) return false
    return isWaiterOnlyUser(user)
  }

  const resetUserForm = () => {
    setUserForm({
      ...emptyUserForm,
      role_ids: waiterRole ? [waiterRole.id] : [],
    })
  }

  const loadSecurityData = async () => {
    try {
      const [usersData, rolesData] = await Promise.all([
        securityService.getUsers(),
        securityService.getRoles(),
      ])

      setUsers(usersData)
      setRoles(rolesData)
    } catch (error) {
      console.error('Error al cargar usuarios:', error)
      setNotice(error.message || 'No se pudo cargar la administracion de usuarios.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSecurityData()
  }, [])

  useEffect(() => {
    if (!userForm.id && waiterRole && userForm.role_ids.length === 0) {
      setUserForm((prev) => ({
        ...prev,
        role_ids: [waiterRole.id],
      }))
    }
  }, [userForm.id, userForm.role_ids.length, waiterRole])

  const getRoleOptionsForCurrentUser = () => {
    if (isSuperadmin) {
      return [managerRole, waiterRole].filter(Boolean)
    }

    return waiterRole ? [waiterRole] : []
  }

  const handleSubmitUser = async (event) => {
    event.preventDefault()
    if (!canManageUsers) return

    try {
      const effectiveRoleIds =
        !userForm.id && !isSuperadmin ? (waiterRole ? [waiterRole.id] : []) : userForm.role_ids

      if (!userForm.id && !isValidPassword(userForm.password)) {
        setNotice('La contrasena inicial debe ser alfanumerica y tener al menos 10 caracteres.')
        return
      }

      if (!userForm.id && effectiveRoleIds.length === 0) {
        setNotice('Selecciona un rol para el usuario.')
        return
      }

      if (userForm.id) {
        const targetUser = users.find((user) => user.id === userForm.id)
        if (targetUser && !canManageTargetUser(targetUser)) {
          setNotice('Tu usuario solo puede editar cuentas con rol de mesero.')
          return
        }

        await securityService.updateUser({
          user_id: userForm.id,
          username: userForm.username,
          full_name: userForm.full_name,
          status: userForm.status,
          is_superadmin: false,
          role_ids: effectiveRoleIds,
        })
        setNotice('Usuario actualizado con exito.')
      } else {
        await securityService.createUser({
          username: userForm.username,
          password: userForm.password,
          full_name: userForm.full_name,
          is_superadmin: false,
          role_ids: effectiveRoleIds,
        })
        setNotice('Usuario creado con exito.')
      }

      resetUserForm()
      await loadSecurityData()
    } catch (error) {
      console.error('Error al guardar usuario:', error)
      setNotice(error.message || 'No se pudo guardar el usuario.')
    }
  }

  const handleDeleteUser = async (user) => {
    if (!canManageUsers || user.id === profile?.id) return

    if (!canManageTargetUser(user)) {
      setNotice('Tu usuario solo puede eliminar cuentas con rol de mesero.')
      return
    }

    try {
      await securityService.deleteUser(user.id)
      setNotice('Usuario eliminado con exito.')
      if (userForm.id === user.id) {
        resetUserForm()
      }
      await loadSecurityData()
    } catch (error) {
      console.error('Error al eliminar usuario:', error)
      setNotice(error.message || 'No se pudo eliminar el usuario.')
    }
  }

  const handleEditUser = (user) => {
    if (!canManageTargetUser(user)) {
      setNotice('Tu usuario solo puede editar cuentas con rol de mesero.')
      return
    }

    setUserForm({
      id: user.id,
      username: user.username || '',
      full_name: user.full_name || '',
      password: '',
      status: user.status || 'active',
      role_ids: user.role_ids || [],
    })
  }

  if (loading) return <div style={loadingStyle}>Cargando usuarios...</div>

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a' }}>Usuarios</h2>
          <p style={subtitleStyle}>
            El admin controla todo el sistema. El manager puede operar el negocio y administrar
            solo cuentas de meseros.
          </p>
        </div>
      </div>

      {notice && <div style={noticeStyle}>{notice}</div>}

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <h3 style={sectionTitleStyle}>Cuentas del sistema</h3>
        </div>

        <div style={contentGridStyle(isMobile)}>
          <form onSubmit={handleSubmitUser} style={formCardStyle}>
            <h4 style={formTitleStyle}>{userForm.id ? 'Editar usuario' : 'Crear usuario'}</h4>

            <label style={labelStyle}>Usuario</label>
            <input
              style={inputStyle}
              value={userForm.username}
              onChange={(event) =>
                setUserForm((prev) => ({ ...prev, username: event.target.value.toLowerCase() }))
              }
              disabled={!canManageUsers}
              placeholder="usuario"
              required
            />

            <label style={labelStyle}>Nombre completo</label>
            <input
              style={inputStyle}
              value={userForm.full_name}
              onChange={(event) => setUserForm((prev) => ({ ...prev, full_name: event.target.value }))}
              disabled={!canManageUsers}
              required
            />

            {!userForm.id && (
              <>
                <label style={labelStyle}>Contrasena inicial</label>
                <input
                  type="password"
                  style={inputStyle}
                  value={userForm.password}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
                  disabled={!canManageUsers}
                  required
                />
                <div style={helperTextStyle}>
                  Debe ser alfanumerica y tener al menos 10 caracteres.
                </div>
              </>
            )}

            <label style={labelStyle}>Rol</label>
            <select
              style={inputStyle}
              value={userForm.role_ids[0] || ''}
              onChange={(event) =>
                setUserForm((prev) => ({
                  ...prev,
                  role_ids: event.target.value ? [event.target.value] : [],
                }))
              }
              disabled={!canManageUsers || (!isSuperadmin && Boolean(userForm.id))}
              required
            >
              <option value="">Selecciona un rol</option>
              {getRoleOptionsForCurrentUser().map((role) => (
                <option key={role.id} value={role.id}>
                  {getRoleDisplayName(role.name)}
                </option>
              ))}
            </select>

            <div style={helperTextStyle}>
              {isSuperadmin
                ? 'Como admin puedes crear usuarios con rol de manager o mesero.'
                : 'El manager solo puede crear y editar cuentas con rol de mesero.'}
            </div>

            <label style={labelStyle}>Estatus</label>
            <select
              style={inputStyle}
              value={userForm.status}
              onChange={(event) => setUserForm((prev) => ({ ...prev, status: event.target.value }))}
              disabled={!canManageUsers}
            >
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>

            <div style={formActionsStyle}>
              <button type="submit" style={primaryBtnStyle} disabled={!canManageUsers}>
                {userForm.id ? 'Guardar usuario' : 'Crear usuario'}
              </button>
              <button type="button" style={secondaryBtnStyle} onClick={resetUserForm}>
                Limpiar
              </button>
            </div>
          </form>

          <div style={tableCardStyle}>
            <table style={tableStyle}>
              <thead>
                <tr style={theadStyle}>
                  <th style={thStyle}>Usuario</th>
                  <th style={thStyle}>Estatus</th>
                  <th style={thStyle}>Rol</th>
                  <th style={thStyle}>Accion</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const roleLabel = user.is_superadmin
                    ? 'admin'
                    : getUserRoleNames(user).map((roleName) => getRoleDisplayName(roleName)).join(', ') || 'Sin rol'

                  const canEditTarget = canManageTargetUser(user)

                  return (
                    <tr key={user.id} style={rowStyle}>
                      <td style={tdStyle}>
                        <strong>{user.username}</strong>
                        <div style={metaStyle}>{user.full_name}</div>
                      </td>
                      <td style={tdStyle}>
                        <span style={user.status === 'active' ? activeBadgeStyle : inactiveBadgeStyle}>
                          {user.status === 'active' ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={tdStyle}>{roleLabel}</td>
                      <td style={tdStyle}>
                        <div style={rowActionStyle}>
                          {canEditTarget ? (
                            <button type="button" style={linkBtnStyle} onClick={() => handleEditUser(user)}>
                              Editar
                            </button>
                          ) : (
                            <span style={blockedTextStyle}>Solo lectura</span>
                          )}

                          {canManageUsers && user.id !== profile?.id && canEditTarget && (
                            <button
                              type="button"
                              style={dangerBtnStyle}
                              onClick={() => handleDeleteUser(user)}
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}

const pageStyle = {
  padding: '24px',
  display: 'grid',
  gap: '22px',
}

const headerStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '18px',
  padding: '22px',
  boxShadow: '0 16px 40px rgba(15, 23, 42, 0.08)',
}

const subtitleStyle = {
  margin: '8px 0 0 0',
  color: '#64748b',
  lineHeight: 1.5,
}

const sectionStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '18px',
  padding: '22px',
  boxShadow: '0 16px 40px rgba(15, 23, 42, 0.08)',
}

const sectionHeaderStyle = {
  marginBottom: '18px',
}

const sectionTitleStyle = {
  margin: 0,
  color: '#0f172a',
}

const contentGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'minmax(320px, 380px) minmax(0, 1fr)',
  gap: '18px',
  alignItems: 'start',
})

const formCardStyle = {
  backgroundColor: '#f8fafc',
  borderRadius: '16px',
  padding: '18px',
  display: 'grid',
  gap: '10px',
  border: '1px solid #e2e8f0',
}

const tableCardStyle = {
  overflowX: 'auto',
}

const formTitleStyle = {
  margin: 0,
  color: '#0f172a',
}

const labelStyle = {
  fontWeight: '700',
  color: '#334155',
  fontSize: '0.92rem',
}

const helperTextStyle = {
  color: '#64748b',
  fontSize: '0.82rem',
  lineHeight: 1.5,
}

const inputStyle = {
  width: '100%',
  padding: '11px 12px',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  boxSizing: 'border-box',
}

const formActionsStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap',
  marginTop: '8px',
}

const primaryBtnStyle = {
  padding: '11px 16px',
  borderRadius: '10px',
  border: 'none',
  backgroundColor: '#1d4ed8',
  color: '#ffffff',
  fontWeight: '800',
  cursor: 'pointer',
}

const secondaryBtnStyle = {
  padding: '11px 16px',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  color: '#334155',
  fontWeight: '700',
  cursor: 'pointer',
}

const linkBtnStyle = {
  border: 'none',
  background: 'none',
  color: '#1d4ed8',
  fontWeight: '700',
  cursor: 'pointer',
}

const dangerBtnStyle = {
  border: 'none',
  background: 'none',
  color: '#dc2626',
  fontWeight: '700',
  cursor: 'pointer',
}

const blockedTextStyle = {
  color: '#64748b',
  fontWeight: '700',
  fontSize: '0.85rem',
}

const noticeStyle = {
  backgroundColor: '#eff6ff',
  color: '#1d4ed8',
  borderRadius: '14px',
  padding: '14px 16px',
  fontWeight: '700',
}

const tableStyle = {
  width: '100%',
  minWidth: '720px',
  borderCollapse: 'collapse',
}

const theadStyle = {
  backgroundColor: '#0f172a',
  color: '#ffffff',
}

const thStyle = {
  padding: '12px 14px',
  textAlign: 'left',
  fontSize: '0.82rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const tdStyle = {
  padding: '12px 14px',
  borderBottom: '1px solid #e2e8f0',
  color: '#334155',
  verticalAlign: 'top',
}

const rowStyle = {
  backgroundColor: '#ffffff',
}

const metaStyle = {
  marginTop: '4px',
  color: '#64748b',
  fontSize: '0.84rem',
}

const rowActionStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
}

const activeBadgeStyle = {
  display: 'inline-flex',
  padding: '6px 10px',
  borderRadius: '999px',
  backgroundColor: '#dcfce7',
  color: '#166534',
  fontWeight: '800',
}

const inactiveBadgeStyle = {
  display: 'inline-flex',
  padding: '6px 10px',
  borderRadius: '999px',
  backgroundColor: '#fee2e2',
  color: '#991b1b',
  fontWeight: '800',
}

const loadingStyle = {
  padding: '40px',
  textAlign: 'center',
  color: '#334155',
}

export default SecurityUsers
