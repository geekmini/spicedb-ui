// SpiceDB configuration
const getConfig = () => ({
  url: process.env.SPICEDB_URL || 'http://localhost:8443',
  token: process.env.SPICEDB_TOKEN || 'somerandomkeyhere',
  host: process.env.SPICEDB_HOST || null, // Optional: Host header for ingress routing
});

/**
 * Get headers for SpiceDB API calls
 * Includes Host header if SPICEDB_HOST is configured (for ingress routing)
 */
export function getHeaders() {
  const config = getConfig();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.token}`,
  };

  // Add Host header for ingress routing (e.g., when using IP address)
  if (config.host) {
    headers['Host'] = config.host;
  }

  return headers;
}

/**
 * Fetch wrapper for SpiceDB API calls
 */
export async function spicedbFetch(path, options = {}) {
  const config = getConfig();
  const url = `${config.url}${path}`;

  const fetchOptions = {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers,
    },
  };

  return fetch(url, fetchOptions);
}

/**
 * Get SpiceDB URL for display purposes
 */
export function getSpiceDBUrl() {
  return getConfig().url;
}

export default {
  fetch: spicedbFetch,
  getHeaders,
  getUrl: getSpiceDBUrl,
};
