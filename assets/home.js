const revealItems = [...document.querySelectorAll('[data-reveal]')]

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
