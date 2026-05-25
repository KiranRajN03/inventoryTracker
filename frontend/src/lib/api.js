/** Backend base URL without trailing slash (avoids //api/... when concatenating paths). */
export const API_URL = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '');
