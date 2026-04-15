export const SCREEN_KEYS = {
  HOME: 'home',
  MASTER: 'master',
  PROVIDERS: 'providers',
  PURCHASES: 'purchases',
  REPORTS: 'reports',
  REPORT_INVENTORY: 'report_inventory',
  REPORT_PURCHASES: 'report_purchases',
  REPORT_SALES: 'report_sales',
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
  reports: SCREEN_KEYS.REPORTS,
  'report-inventory': SCREEN_KEYS.REPORT_INVENTORY,
  'report-purchases': SCREEN_KEYS.REPORT_PURCHASES,
  'report-sales': SCREEN_KEYS.REPORT_SALES,
  pos: SCREEN_KEYS.POS,
  security: SCREEN_KEYS.SECURITY_USERS,
}

export const PAGE_ORDER = [
  'home',
  'master',
  'providers',
  'purchases',
  'reports',
  'report-inventory',
  'report-purchases',
  'report-sales',
  'pos',
  'security',
]
