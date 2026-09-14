// supabase-js re-emits SIGNED_IN / TOKEN_REFRESHED whenever the tab regains
// focus. Reloading profile and permissions on every one of those is wasted
// network; only reload when the identity actually changes or the user record
// was updated.
export const shouldReloadAccess = ({ event, previousUserId, nextUserId }) => {
  if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') return true
  if (!previousUserId) return true
  return previousUserId !== nextUserId
}
