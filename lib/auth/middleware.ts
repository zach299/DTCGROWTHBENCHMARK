import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from './apiKey';

export async function requireApiKey(
  req: NextRequest
): Promise<{ error: NextResponse } | { accountId: string }> {
  const key = req.headers.get('x-api-key') ?? '';
  const result = await validateApiKey(key);
  if (!result.valid) {
    return {
      error: NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 }),
    };
  }
  return { accountId: result.accountId! };
}
