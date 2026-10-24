import { fileURLToPath } from 'node:url'
import { existsSync, statSync } from 'node:fs'

export function electronEnvironment() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  env.LIFETECH_LOCAL_ORIGIN ||= 'https://localhost:8770'
  env.LIFETECH_IDENTITY_ORIGIN ||= env.ORGPORTAL_LOCAL_IDENTITY_BASE_URL || 'https://id.localhost:8443'
  env.LIFETECH_IDENTITY_CERT ||= fileURLToPath(new URL('../../../OrgPortal/.local/certs/localhost.crt', import.meta.url))
  env.LIFETECH_DEV_CERT ||= fileURLToPath(new URL('../../.local/certs/localhost.crt', import.meta.url))
  // Ubuntu may restrict user namespaces for unpackaged development binaries.
  if (process.platform === 'linux' && !env.CHROME_DEVEL_SANDBOX) {
    for (const helper of ['/opt/lifetech/chrome-sandbox', '/opt/google/chrome/chrome-sandbox']) {
      if (!existsSync(helper)) continue
      const stat = statSync(helper)
      if (stat.uid === 0 && (stat.mode & 0o4000)) { env.CHROME_DEVEL_SANDBOX = helper; break }
    }
  }
  return env
}
