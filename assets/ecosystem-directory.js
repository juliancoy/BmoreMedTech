const search = document.querySelector('#eco-search')
const category = document.querySelector('#eco-category')
const type = document.querySelector('#eco-type')
function filter() {
 const q = search.value.trim().toLowerCase(); let count = 0
 document.querySelectorAll('.eco-card').forEach(card => {
  card.hidden = Boolean((q && !card.dataset.search.includes(q)) || (category.value && card.dataset.category !== category.value) || (type.value && card.dataset.type !== type.value))
  if (!card.hidden) count++
 })
 document.querySelectorAll('.eco-bars li').forEach(row => { row.hidden = document.getElementById(row.dataset.org).hidden })
 document.querySelectorAll('.eco-category').forEach(section => { const visible=section.querySelectorAll('.eco-card:not([hidden])').length; section.hidden = !visible; section.querySelector('header>span:last-child').textContent=`${visible} ${visible===1?'organization':'organizations'}` })
 document.querySelector('#eco-count').textContent = `${count} ${count===1?'organization':'organizations'}`
 document.querySelector('#eco-empty').hidden = count > 0
}
search.addEventListener('input', filter)
category.addEventListener('change', filter)
type.addEventListener('change', filter)

document.querySelectorAll('.eco-bar-row').forEach(link => {
 link.addEventListener('click', () => {
  const card = document.getElementById(link.parentElement.dataset.org)
  card.querySelector('details').open = true
  card.setAttribute('tabindex', '-1')
  card.focus({ preventScroll: true })
 })
})
