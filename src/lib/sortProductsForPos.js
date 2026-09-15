const SORT_LAST = '￿'

const getCategoryName = (item) => item.materials?.categories?.name ?? null

export function sortProductsForPos(products) {
  return [...products].sort((a, b) => {
    const catA = getCategoryName(a)
    const catB = getCategoryName(b)

    if (catA === null && catB !== null) return 1
    if (catA !== null && catB === null) return -1
    if (catA !== null && catB !== null) {
      const catCmp = catA.localeCompare(catB, 'es', { sensitivity: 'base' })
      if (catCmp !== 0) return catCmp
    }

    const nameA = a.materials?.name ?? ''
    const nameB = b.materials?.name ?? ''
    const nameCmp = nameA.localeCompare(nameB, 'es', { sensitivity: 'base' })
    if (nameCmp !== 0) return nameCmp

    const idA = String(a.materials?.id ?? SORT_LAST)
    const idB = String(b.materials?.id ?? SORT_LAST)
    return idA < idB ? -1 : idA > idB ? 1 : 0
  })
}
