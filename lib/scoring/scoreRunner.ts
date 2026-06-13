import Anthropic from '@anthropic-ai/sdk';
import { buildScorePrompt, ScoreInput, ScoreOutput, SYSTEM_PROMPT } from './growthScorePrompt';
import { logger } from '@/lib/utils/logger';
import { createServiceClient } from '@/lib/supabase/server';

const MODEL = 'claude-sonnet-4-6';

export async function runScoring(domainId: number, input: ScoreInput): Promise<ScoreOutput> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = buildScorePrompt(input);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].type === 'text' ? message.content[0].text : '';
  let parsed: ScoreOutput;

  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    logger.error('Failed to parse Claude score output', { raw, err: String(err) });
    throw new Error('Claude returned invalid JSON');
  }

  // Persist to growth_scores
  const supabase = createServiceClient();
  await supabase.from('growth_scores').upsert(
    {
      domain_id: domainId,
      score: parsed.score,
      paid_media_signal: parsed.paid_media_signal,
      social_signal: parsed.social_signal,
      hiring_signal: parsed.hiring_signal,
      site_signal: parsed.site_signal,
      summary: parsed.summary,
      recommended_buyer: parsed.recommended_buyer,
      recommended_angle: parsed.recommended_angle,
      outbound_hook: parsed.outbound_hook,
      reasons: parsed.reasons,
      model: MODEL,
      raw_model_output: { raw, usage: message.usage },
      calculated_at: new Date().toISOString(),
    },
    { onConflict: 'domain_id' }
  );

  return parsed;
}
