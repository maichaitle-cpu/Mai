// Live Claude transport for the eval harness: forwards the app's request bodies to the Messages API,
// returns text + real usage + cost, and caches responses on disk so re-scoring a run costs nothing.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk').default;

const PRICES = { 'claude-sonnet-5': [2, 10], 'claude-sonnet-4-5': [3, 15], 'claude-sonnet-4-6': [3, 15], 'claude-haiku-4-5': [1, 5] };

function makeLive({ cacheDir, noCache }) {
  const client = new Anthropic();
  if (cacheDir) fs.mkdirSync(cacheDir, { recursive: true });
  return async body => {
    const key = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const file = cacheDir && path.join(cacheDir, key + '.json');
    if (file && !noCache && fs.existsSync(file)) return { ...JSON.parse(fs.readFileSync(file, 'utf8')), cached: true, cost: 0 };
    const req = { ...body };
    // Cache the fixed stage prompt: it is identical across every call of that stage.
    if (typeof req.system === 'string' && req.system.length > 3000) req.system = [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }];
    try {
      const msg = await client.messages.create(req);
      if (msg.stop_reason === 'refusal') return { error: 'refusal' };
      const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const u = msg.usage || {};
      const pr = PRICES[msg.model] || PRICES[body.model] || [3, 15];
      const cost = ((u.input_tokens || 0) * pr[0] + (u.cache_creation_input_tokens || 0) * pr[0] * 1.25 + (u.cache_read_input_tokens || 0) * pr[0] * 0.1 + (u.output_tokens || 0) * pr[1]) / 1e6;
      const out = { text, usage: u, model: msg.model, cost, stop: msg.stop_reason };
      if (file) fs.writeFileSync(file, JSON.stringify(out));
      return out;
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return { error: 'rate limit 429 ' + e.message };
      if (e instanceof Anthropic.APIError) return { error: 'API ' + e.status + ' ' + e.message };
      return { error: String((e && e.message) || e) };
    }
  };
}

module.exports = { makeLive };
