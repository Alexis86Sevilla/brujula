export const meta = {
  name: 'audit-cards',
  description: 'Run the card validator on the cards in docs/cards (first args.limit, default 3) and rank the results',
}

const limit = (args && args.limit) || 3

const fileSchema = {
  type: 'object',
  required: ['files'],
  properties: { files: { type: 'array', items: { type: 'string' } } },
}

const resultSchema = {
  type: 'object',
  required: ['file', 'ok', 'errors'],
  properties: {
    file: { type: 'string' },
    ok: { type: 'boolean' },
    errors: { type: 'array', items: { type: 'string' } },
  },
}

const found = await agent('List every docs/cards/*.md file. Do not read them.', { schema: fileSchema })
const files = found.files.slice(0, limit)

const results = await pipeline(files, file =>
  agent(
    `Run: node plugin/skills/tarjeta/scripts/check-card.mjs '${file.replace(/'/g, '')}'\n` +
      'Report its JSON verdict for this file. Do not edit any file.',
    { label: file, schema: resultSchema },
  ),
)

return results
  .filter(Boolean)
  .sort((a, b) => b.errors.length - a.errors.length)
