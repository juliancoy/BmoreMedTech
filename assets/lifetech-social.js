import {readOrganizationLinks} from '../../OrgPortal/shared/organizationLinks.ts'

/** Match the portal dock using the organization's canonical public destinations. */
export function setupLifeTechSocialLinks() {
 const root=document.querySelector('[data-site-brand="lifetech"] .social-links')
 if(!root)return
 fetch('/api/org/api/network/orgs/public/lifetech',{signal:AbortSignal.timeout(5000)})
  .then(async response=>{if(!response.ok)return;const org=await response.json(),links=readOrganizationLinks(org.links)
   const email=root.querySelector('.mail-icon')?.closest('a');if(!email)return
   const nodes=['luma','whatsapp'].flatMap(type=>links.filter(link=>link.type===type).map(link=>{
    const anchor=document.createElement('a');anchor.className='social-link';anchor.href=link.url;anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.setAttribute('aria-label',link.label||(type==='luma'?'LifeTech Luma calendar':'Join LifeTech on WhatsApp'));anchor.title=anchor.getAttribute('aria-label')
    const button=document.createElement('span');button.className='social-button'
    if(type==='whatsapp'){const icon=document.createElement('img');icon.className='social-icon';icon.src='/assets/images/whatsapp-64.webp';icon.alt='';icon.width=25;icon.height=25;button.append(icon)}
    else{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.classList.add('social-icon');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M7 3v4m10-4v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z');svg.append(path);button.append(svg)}
    anchor.append(button);return anchor
   }))
   root.replaceChildren(...nodes,email)
  }).catch(()=>{/* Email signup remains available when public links cannot load. */})
}
