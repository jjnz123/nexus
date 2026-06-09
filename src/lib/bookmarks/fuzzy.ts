export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t.includes(q)) return 100 + (100 - t.indexOf(q));

  let score = 0;
  let tIndex = 0;
  for (const char of q) {
    const found = t.indexOf(char, tIndex);
    if (found === -1) return 0;
    score += 10 - Math.min(found - tIndex, 9);
    tIndex = found + 1;
  }
  return score;
}

export function fuzzyMatchCard(
  query: string,
  card: { title: string; description?: string | null; url: string }
): boolean {
  if (!query.trim()) return true;
  const scores = [
    fuzzyScore(query, card.title),
    fuzzyScore(query, card.description ?? ""),
    fuzzyScore(query, card.url),
  ];
  return Math.max(...scores) > 0;
}
