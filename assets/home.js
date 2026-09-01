const revealItems = [...document.querySelectorAll('[data-reveal]')]
const navToggle = document.querySelector('.nav-toggle')
const primaryNav = document.getElementById('primary-nav')

if (navToggle && primaryNav) {
  document.documentElement.classList.add('nav-enhanced')

  const setNavOpen = (open) => {
    navToggle.setAttribute('aria-expanded', String(open))
    primaryNav.classList.toggle('is-open', open)
  }

  setNavOpen(false)
  requestAnimationFrame(() => primaryNav.classList.add('nav-interactive'))

  navToggle.addEventListener('click', () => {
    setNavOpen(navToggle.getAttribute('aria-expanded') !== 'true')
  })

  primaryNav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setNavOpen(false)
  })

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.site-header-inner')) setNavOpen(false)
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setNavOpen(false)
      navToggle.focus()
    }
  })
}

if (revealItems.length && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('reveal-enabled')

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    },
    {
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.12,
    },
  )

  requestAnimationFrame(() => {
    revealItems.forEach((item) => observer.observe(item))
  })
}
