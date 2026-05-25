export const ADMIN_USERS = ["user_392Q7p9ahx7GuGwIit2aWNeWaak"];

export function isAdminUser(userId?: string | null) {
  return Boolean(userId && ADMIN_USERS.includes(userId));
}
