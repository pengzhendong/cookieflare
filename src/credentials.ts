/** Preserve the original username unless the deployment explicitly configures one. */
export const adminUsername = (env: { ADMIN_USERNAME?: string }) => env.ADMIN_USERNAME?.trim() || 'admin';
