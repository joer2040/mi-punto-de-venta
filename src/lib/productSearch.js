const normalizeSearchText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const getEditDistance = (left, right) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]
    previous[0] = leftIndex

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const upper = previous[rightIndex]
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1

      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + substitutionCost
      )
      diagonal = upper
    }
  }

  return previous[right.length]
}

const getTokenScore = (queryToken, candidateToken) => {
  if (queryToken === candidateToken) return 100
  if (candidateToken.startsWith(queryToken)) return 92
  if (queryToken.length >= 2 && candidateToken.includes(queryToken)) return 84
  if (queryToken.length < 3) return 0

  const allowedDistance = queryToken.length <= 4 ? 1 : queryToken.length <= 7 ? 2 : 3
  const candidateVariants = [candidateToken]

  if (candidateToken.length > queryToken.length) {
    for (let index = 0; index <= candidateToken.length - queryToken.length; index += 1) {
      candidateVariants.push(candidateToken.slice(index, index + queryToken.length))
    }
  }

  const distance = Math.min(...candidateVariants.map((variant) => getEditDistance(queryToken, variant)))

  if (distance > allowedDistance) return 0
  return 75 - (distance / Math.max(queryToken.length, candidateToken.length)) * 20
}

export const getApproximateSearchScore = (query, candidate) => {
  const normalizedQuery = normalizeSearchText(query)
  const normalizedCandidate = normalizeSearchText(candidate)

  if (!normalizedQuery) return 1
  if (!normalizedCandidate) return 0
  if (normalizedCandidate === normalizedQuery) return 120
  if (normalizedCandidate.startsWith(normalizedQuery) || normalizedCandidate.includes(` ${normalizedQuery}`)) return 110

  const candidateTokens = normalizedCandidate.split(' ')
  const queryTokens = normalizedQuery.split(' ')
  const tokenScores = queryTokens.map((queryToken) =>
    Math.max(...candidateTokens.map((candidateToken) => getTokenScore(queryToken, candidateToken)))
  )

  if (tokenScores.some((score) => score === 0)) return 0
  return tokenScores.reduce((total, score) => total + score, 0) / tokenScores.length
}

export const rankApproximateMatches = (items, query, getSearchableText) => {
  if (!normalizeSearchText(query)) return items

  return items
    .map((item, index) => ({
      item,
      index,
      score: getApproximateSearchScore(query, getSearchableText(item)),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item)
}
