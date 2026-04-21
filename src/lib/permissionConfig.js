export const SCREEN_KEYS = {
  HOME: 'home',
  MASTER: 'master',
  PROVIDERS: 'providers',
  PURCHASES: 'purchases',
  MOVEMENTS: 'movements',
  CASH_CONTROL: 'cash_control',
  REPORTS: 'reports',
  REPORT_INVENTORY: 'report_inventory',
  REPORT_PURCHASES: 'report_purchases',
  REPORT_SALES: 'report_sales',
  REPORT_MATERIAL_MOVEMENTS: 'report_material_movements',
  POS: 'pos',
  SECURITY_USERS: 'security_users',
}

export const ACTION_KEYS = {
  VIEW: 'view',
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete',
  MANAGE: 'manage',
}

export const PAGE_PERMISSION_MAP = {
  home: SCREEN_KEYS.HOME,
  master: SCREEN_KEYS.MASTER,
  providers: SCREEN_KEYS.PROVIDERS,
  purchases: SCREEN_KEYS.PURCHASES,
  movements: SCREEN_KEYS.MOVEMENTS,
  'cash-control': SCREEN_KEYS.CASH_CONTROL,
  reports: SCREEN_KEYS.REPORTS,
  'report-inventory': SCREEN_KEYS.REPORT_INVENTORY,
  'report-purchases': SCREEN_KEYS.REPORT_PURCHASES,
  'report-sales': SCREEN_KEYS.REPORT_SALES,
  'report-movements': SCREEN_KEYS.REPORT_MATERIAL_MOVEMENTS,
  pos: SCREEN_KEYS.POS,
  security: SCREEN_KEYS.SECURITY_USERS,
}

export const PAGE_ORDER = [
  'home',
  'master',
  'providers',
  'purchases',
  'movements',
  'cash-control',
  'reports',
  'report-inventory',
  'report-purchases',
  'report-sales',
  'report-movements',
  'pos',
  'security',
]
