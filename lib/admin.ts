const DEFAULT_ADMIN_USERS = ["user_3GF3SCTcxn9xxl8tIOPugSjGU5O"];

function getAdminUsers() {
  const configured = process.env.ADMIN_USER_IDS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return configured && configured.length > 0 ? configured : DEFAULT_ADMIN_USERS;
}

export function isAdminUser(userId?: string | null) {
  return Boolean(userId && getAdminUsers().includes(userId));
}
