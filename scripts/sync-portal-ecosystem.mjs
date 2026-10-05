import { readFile, writeFile } from 'node:fs/promises'
import { loadPortalEvidence, graphRelationships } from '../lib/portal-ecosystem.js'
const data=JSON.parse(await readFile(new URL('../assets/data/ecosystem.json',import.meta.url)))
const updated=await loadPortalEvidence(data,fetch,'https://lifetech.fyi/api/org/api/network')
await writeFile(new URL('../assets/data/ecosystem-portal.json',import.meta.url),JSON.stringify(updated,null,2)+'\n')
console.log(JSON.stringify({organizations:updated.organizations.length,relationships:updated.relationships.length,moneyLinks:graphRelationships(updated,{moneyOnly:true}).length,refreshedAt:updated.portalUpdatedAt}))
