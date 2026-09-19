// Pure functions for the delete_material EF action.
// Business logic lives in the delete_material_safely RPC.
// This module handles input validation and result → HTTP response mapping.

export const validateDeleteInput = (body) => {
  const materialId = String(body?.material_id ?? '').trim()
  if (!materialId) return { valid: false, error: 'material_id es requerido.' }
  return { valid: true, materialId }
}

export const mapDeleteResult = (rpcResult) => {
  if (!rpcResult) {
    return { status: 500, body: { error: 'Respuesta inesperada del sistema.' } }
  }

  switch (rpcResult.result) {
    case 'blocked':
      return {
        status: 409,
        body: {
          result: 'blocked',
          reason: 'stock_available',
          error: 'No se puede eliminar este material porque aún tiene inventario disponible.',
        },
      }
    case 'deactivated':
      return { status: 200, body: { result: 'deactivated' } }
    case 'deleted':
      return { status: 200, body: { result: 'deleted' } }
    case 'not_found':
      return { status: 404, body: { error: 'Material no encontrado.' } }
    default:
      return { status: 500, body: { error: 'Resultado de operacion desconocido.' } }
  }
}
