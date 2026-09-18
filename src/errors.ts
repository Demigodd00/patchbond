// Provider and JSON-RPC rejections are not necessarily Error instances.
// Inspect known error fields only; never stringify an entire wallet request.
export function errorInfo(error: unknown) {
 const seen = new Set<object>(), messages: string[] = [], codes: number[] = [];
 function visit(value: unknown, depth = 0) {
  if (depth > 6) return;
  if (typeof value === 'string') {
   const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
   if (text && !/^\[object Object\]$/i.test(text) && !messages.includes(text)) messages.push(text.slice(0, 360));
   return;
  }
  if (!value || typeof value !== 'object' || seen.has(value) || seen.size >= 32) return;
  seen.add(value);
  const record = value as Record<string, unknown>;
  const code = typeof record.code === 'number' ? record.code : typeof record.code === 'string' && /^-?\d+$/.test(record.code) ? Number(record.code) : undefined;
  if (code !== undefined && Number.isFinite(code)) codes.push(code);
  for (const key of ['shortMessage', 'message', 'details', 'reason']) visit(record[key], depth + 1);
  for (const key of ['cause', 'error', 'data', 'originalError']) visit(record[key], depth + 1);
 }
 visit(error);
 return {messages, codes};
}

export function isUserRejection(error: unknown) { return errorInfo(error).codes.includes(4001); }

export class ActionError extends Error {}

export function formatError(error: unknown): string {
 if (error instanceof ActionError) return error.message;
 const {messages, codes} = errorInfo(error);
 const all = messages.join(' ');
 const detail = messages.find(m => !/^(?:internal (?:json-rpc )?error\.?|unknown error\.?|an unknown (?:rpc )?error occurred\.?|execution reverted\.?)$/i.test(m)) || messages[0];
 const suffix = codes.length ? ` (code ${codes.at(-1)})` : '';
 if (codes.includes(4001)) return 'Wallet request rejected. No automatic retry will be made.';
 if (codes.includes(-32002)) return 'A request is already pending in your wallet. Open the wallet and resolve that request; do not submit another.';
 if (codes.includes(4100)) return 'Wallet access is not authorized. Unlock your wallet and connect the intended account.';
 if (codes.includes(4902)) return 'StudioNet is not configured in this wallet. Add or select StudioNet (chain 61999), then reconnect.';
 if (codes.includes(4900) || codes.includes(4901)) return 'The wallet is disconnected from the requested network. Reconnect to StudioNet (chain 61999).';
 if (codes.includes(4200)) return 'The wallet does not support this request. Use a compatible Ethereum wallet on StudioNet.';
 if (/insufficient (?:funds|balance)|exceeds (?:the )?balance/i.test(all)) return 'Insufficient simulated GEN. Use the account faucet at studio.genlayer.com for this test wallet. Never send real-value funds.';
 const prefix = /failed to fetch|network|timeout|timed out|connection|offline|http request failed/i.test(all) ? 'Network/RPC error: ' : '';
 return detail ? `${prefix}${detail}${suffix}` : `The wallet or network returned an error without readable details${suffix}. No automatic retry will be made.`;
}
