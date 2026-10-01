const search = document.querySelector('#eco-search')
const category = document.querySelector('#eco-category')
const type = document.querySelector('#eco-type')
function filter() {
 const q = search.value.trim().toLowerCase(); let count = 0
 document.querySelectorAll('.eco-card').forEach(card => {
  card.hidden = Boolean((q && !card.dataset.search.includes(q)) || (category.value && card.dataset.category !== category.value) || (type.value && card.dataset.type !== type.value))
  if (!card.hidden) count++
 })
 document.querySelectorAll('.eco-category').forEach(section => { section.hidden = !section.querySelector('.eco-card:not([hidden])') })
 document.querySelector('#eco-count').textContent = `${count} organizations`
 document.querySelector('#eco-empty').hidden = count > 0
}
search.addEventListener('input', filter)
category.addEventListener('change', filter)
type.addEventListener('change', filter)
