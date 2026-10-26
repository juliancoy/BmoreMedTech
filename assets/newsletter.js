const form = document.querySelector('[data-newsletter-form]')
if (form) {
  const status = form.querySelector('[role="status"]')
  const button = form.querySelector('button')
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (!form.reportValidity()) return
    button.disabled = true
    status.textContent = 'Subscribing…'
    try {
      const response = await fetch('/api/org/api/email/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ email: new FormData(form).get('email'), consent: true }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.detail || 'Signup is temporarily unavailable. Please try again.')
      status.textContent = result.message
      form.reset()
    } catch (error) {
      status.textContent = error.message || 'Unable to connect. Please try again.'
    } finally {
      button.disabled = false
    }
  })
}
