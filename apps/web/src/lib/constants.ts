/** File limits the API actually accepts (see apps/api multipart limit and
 * parser MIME allow-list). Keep in sync: '.doc' is not accepted, so it is
 * not listed here. There is no support contact, so no support email. */
export const APP_NAME = 'AuditMind';
export const APP_VERSION = '1.0.6';
export const FILE_SIZE_LIMIT_MB = 15;
export const FILE_SIZE_LIMIT_BYTES = FILE_SIZE_LIMIT_MB * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt'];
