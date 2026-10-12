import { ServerConfig } from '../types';

/**
 * Computes the Subversion WebDAV checkout URL for a repository.
 * If the user is accessing the Web Console directly on the API port (e.g. 8080),
 * this directs them to the Subversion WebDAV port (default: 8081).
 * If running behind a reverse proxy on standard HTTP/HTTPS (port 80/443),
 * it preserves the standard proxy origin.
 */
export const buildCheckoutUrl = (repoName: string, serverConfig?: ServerConfig | null): string => {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const currentPort = window.location.port;

  const svnPort = serverConfig?.svn_port || 8081;
  const rawPrefix = serverConfig?.svn_url_prefix || '/svn';
  const prefix = rawPrefix.endsWith('/')
    ? rawPrefix.slice(0, -1)
    : rawPrefix.startsWith('/')
    ? rawPrefix
    : `/${rawPrefix}`;

  // If accessed behind a reverse proxy (standard port 80/443 without explicit port number):
  if (!currentPort || currentPort === '80' || currentPort === '443') {
    return `${protocol}//${hostname}${prefix}/${repoName}`;
  }

  // Direct access: point to Subversion WebDAV port
  const portPart = svnPort === 80 || svnPort === 443 ? '' : `:${svnPort}`;
  return `${protocol}//${hostname}${portPart}${prefix}/${repoName}`;
};

