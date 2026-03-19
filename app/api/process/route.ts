import { NextRequest, NextResponse } from 'next/server';

const ACTIONS_URL = "https://pro-api.solscan.io/v2.0/transaction/actions";
const DETAIL_URL = "https://pro-api.solscan.io/v2.0/transaction/detail";
const METADATA_URL = "https://pro-api.solscan.io/v2.0/account/metadata";
const API_KEY = process.env.SOLSCAN_API_KEY;

if (!API_KEY) {
  throw new Error('SOLSCAN_API_KEY environment variable is not set');
}

const HEADERS = { "token": API_KEY };

// Rate limit config
// Solscan limit: ~1000 req/min = ~16 req/sec
// Each tx = 2 API calls (actions + detail)
// Batch of 7 txs = up to 14 concurrent calls
// With 3s delay between batches → ~280 req/min (safe margin)
const BATCH_SIZE = 7;
const DELAY_BETWEEN_BATCHES_MS = 3000;
const DELAY_BETWEEN_CALLS_MS = 300;
const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 5;

interface TransactionData {
  data?: any;
}

// Fetch from a single URL with retry + 429 backoff
async function fetchWithRetry(url: string): Promise<any> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(15000),
      });

      if (response.status === 200) {
        return await response.json();
      } else if (response.status === 429) {
        // Exponential backoff on rate limit
        const wait = RETRY_DELAY_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, wait));
        continue;
      } else {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
    } catch (error: any) {
      if (attempt >= MAX_RETRIES - 1) {
        return { error: `Failed after ${MAX_RETRIES} retries: ${error.message}` };
      }
      const wait = RETRY_DELAY_MS * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
  return { error: 'Max retries exceeded' };
}

// Cache signer name lookups to avoid duplicate API calls
const signerNameCache = new Map<string, string | null>();

async function fetchSignerName(address: string): Promise<string | null> {
  if (signerNameCache.has(address)) return signerNameCache.get(address)!;
  const meta = await fetchWithRetry(`${METADATA_URL}?address=${address}`);
  const name = meta?.data?.account_label || meta?.data?.account_domain || null;
  signerNameCache.set(address, name);
  return name;
}

// Fetch actions + detail + signer name for a single tx
async function fetchTransactionJson(txId: string): Promise<any> {
  const actionsResult = await fetchWithRetry(`${ACTIONS_URL}?tx=${txId}`);
  if (actionsResult?.error) return actionsResult;

  await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CALLS_MS));

  const detailResult = await fetchWithRetry(`${DETAIL_URL}?tx=${txId}`);
  if (actionsResult.data && detailResult?.data) {
    const d = detailResult.data;
    actionsResult.data.render_one_line_action = d.render_one_line_action || [];
    actionsResult.data.signer = d.signer || [];
    actionsResult.data.status = d.status;
    actionsResult.data.fee = d.fee;
    actionsResult.data.block_id = d.block_id;

    // Resolve signer name
    const signerAddr = d.signer?.[0];
    if (signerAddr) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CALLS_MS));
      actionsResult.data.signer_name = await fetchSignerName(signerAddr);
    }
  }

  return actionsResult;
}

// Extract action keywords
function extractActionKeywords(types: string[], keywords: string[]): string[] {
  const seen = new Set<string>();
  const primaryKeywords: string[] = [];
  for (const t of types) {
    for (const keyword of keywords) {
      if (t.includes(keyword) && !seen.has(keyword)) {
        primaryKeywords.push(keyword);
        seen.add(keyword);
      }
    }
  }
  return primaryKeywords;
}

// Apply program rule
function applyProgramRule(names: string[], excludeNames: Set<string>, defaultProgram: string = "Token Program"): string[] {
  const filteredNames = names.filter(name => !excludeNames.has(name));
  return filteredNames.length > 0 ? filteredNames : [defaultProgram];
}

// Extract combined chain labels
function extractCombinedChainLabels(jsonData: any): string {
  const activities = jsonData?.activities || [];
  const chainLabels = activities.map((activity: any) => {
    const sourceChain = activity?.data?.source_chain_label || '';
    const dstChain = activity?.data?.dst_chain_label || '';
    return `${sourceChain}, ${dstChain}`.replace(/^, |, $/g, '').trim();
  }).filter(Boolean);
  return chainLabels.join(', ');
}

// Build human-readable summary from render_one_line_action
const SOL_MINT = "So11111111111111111111111111111111111111111";

function buildSummary(jsonData: any): string {
  const renderTokens = jsonData?.render_one_line_action || [];
  if (renderTokens.length === 0) return '';
  const parts: string[] = [];
  for (const item of renderTokens) {
    if (item.text) {
      parts.push(item.text);
    } else if (item.account) {
      parts.push(item.account);
    } else if (item.token_amount) {
      const ta = item.token_amount;
      const amount = (ta.number || 0) / Math.pow(10, ta.decimals || 0);
      const tokenAddr = ta.token_address || '';
      if (tokenAddr === SOL_MINT) {
        parts.push(`${amount} SOL`);
      } else {
        parts.push(`${amount} ${tokenAddr.slice(0, 8)}...`);
      }
    }
  }
  return parts.join(' ');
}

// Extract signer address from JSON data
function extractSigner(jsonData: any): string {
  try {
    const signerChanges = jsonData?.one_line_summary?.data?.signer_balance_changes;
    if (signerChanges && signerChanges.length > 0) {
      return signerChanges[0].address || '';
    }
  } catch {}
  // Fallback: from detail signer array
  const signerArr = jsonData?.signer;
  if (Array.isArray(signerArr) && signerArr.length > 0) {
    return signerArr[0];
  }
  // Fallback: from first transfer's source_owner
  const transfers = jsonData?.transfers || [];
  if (transfers.length > 0) {
    return transfers[0].source_owner || '';
  }
  return '';
}

// Process JSON to extract all columns
function processJson(jsonData: any, txHash: string): any {
  const transfers = jsonData?.transfers || [];
  const activities = jsonData?.activities || [];

  const transferTypes = transfers.map((transfer: any) => transfer?.transfer_type || '');
  const activityTypes = activities.map((activity: any) => activity?.activity_type || '');

  const actionKeywords = [
    "TRANSFER", "APPROVE", "SWAP", "UNSWAP", "STAKE", "UNSTAKE",
    "MINT", "BID", "SALE", "WRAP", "UNWRAP", "DEPOSIT", "WITHDRAW",
    "ADD LIQUIDITY", "REMOVE LIQUIDITY", "ENS", "LENDING",
    "BORROWING", "BRIDGE", "burn", "Distribute"
  ];

  const excludeNames = new Set(["createAccount", "ComputeBudget"]);

  const filteredActionKeywords = extractActionKeywords(
    [...transferTypes, ...activityTypes],
    actionKeywords
  );

  const names = activities.map((activity: any) => activity?.name || '');
  const programResult = applyProgramRule(names, excludeNames);

  if (programResult.some(program => program.includes('Distribution'))) {
    if (!filteredActionKeywords.includes('Distribute')) {
      filteredActionKeywords.push('Distribute');
    }
  }

  const combinedChainLabels = extractCombinedChainLabels(jsonData);
  const signer = extractSigner(jsonData);
  const summary = buildSummary(jsonData);

  // Extract new fields from detail data
  const rola = jsonData?.render_one_line_action || [];
  let activityType: string | null = null;
  let tokenAmount: number | null = null;
  let tokenAddress: string | null = null;
  let recipientCount: number | null = null;

  for (const item of rola) {
    if (item.origin_data) {
      activityType = item.origin_data.activity_type || null;
      recipientCount = item.origin_data.toAddressList?.length ?? null;
    }
    if (item.token_amount && tokenAmount === null) {
      const ta = item.token_amount;
      tokenAmount = (ta.number || 0) / Math.pow(10, ta.decimals || 0);
      tokenAddress = ta.token_address || null;
    }
  }

  return {
    TX_HASH: txHash,
    SIGNER: signer,
    SIGNER_NAME: jsonData?.signer_name || null,
    STATUS: jsonData?.status === 1 ? 'success' : jsonData?.status === 0 ? 'failed' : null,
    FEE_LAMPORTS: jsonData?.fee ?? null,
    BLOCK: jsonData?.block_id ?? null,
    SUMMARY: summary,
    ACTIVITY_TYPE: activityType,
    TOKEN_AMOUNT: tokenAmount,
    TOKEN_ADDRESS: tokenAddress,
    RECIPIENT_COUNT: recipientCount,
    ACTION: filteredActionKeywords.join(', '),
    PROGRAM: programResult.join(', '),
    CHAIN_LABELS: combinedChainLabels,
  };
}

// Helper to send SSE message
function sendSSE(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: any) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { txHashes } = await request.json();

        if (!txHashes || !Array.isArray(txHashes) || txHashes.length === 0) {
          sendSSE(controller, encoder, { type: 'error', message: 'Invalid or empty transaction list' });
          controller.close();
          return;
        }

        const total = txHashes.length;
        const totalBatches = Math.ceil(total / BATCH_SIZE);
        const totalApiCalls = total * 2;
        const estMinutes = (total * (DELAY_BETWEEN_CALLS_MS / 1000 + 0.5) + totalBatches * (DELAY_BETWEEN_BATCHES_MS / 1000)) / 60;
        const results: any[] = [];
        const validJsonData: any[] = [];
        const startTime = Date.now();

        // Initial status with estimate
        sendSSE(controller, encoder, {
          type: 'progress',
          current: 0,
          total,
          message: `Starting: ${total} transactions, ${totalApiCalls} API calls, ~${Math.ceil(estMinutes)} min estimated`
        });

        // Process transactions in batches
        for (let i = 0; i < total; i += BATCH_SIZE) {
          const batch = txHashes.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;

          sendSSE(controller, encoder, {
            type: 'progress',
            current: i,
            total,
            message: `Batch ${batchNum}/${totalBatches} — fetching ${batch.length} transactions...`
          });

          // Fetch all txs in this batch concurrently
          // Each fetchTransactionJson makes 2 sequential calls with internal delay
          const batchPromises = batch.map(async (txHash: string, index: number) => {
            const jsonResponse = await fetchTransactionJson(txHash);

            if (jsonResponse && !jsonResponse.error && jsonResponse.data) {
              validJsonData.push({ txHash, data: jsonResponse });
            }

            return { txHash, jsonResponse };
          });

          await Promise.all(batchPromises);

          // Progress update after batch completes
          const done = Math.min(i + BATCH_SIZE, total);
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = done / elapsed;
          const etaMin = rate > 0 ? ((total - done) / rate / 60) : 0;
          const pct = Math.round((done / total) * 100);

          sendSSE(controller, encoder, {
            type: 'progress',
            current: done,
            total,
            message: `${pct}% done (${done}/${total}) — ${rate.toFixed(1)} tx/sec — ~${Math.ceil(etaMin)} min remaining`
          });

          // Delay between batches to respect rate limits
          if (i + BATCH_SIZE < total) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
          }
        }

        // Process all valid JSON data
        sendSSE(controller, encoder, {
          type: 'progress',
          current: total,
          total,
          message: `Analyzing ${validJsonData.length} transactions...`
        });

        for (const item of validJsonData) {
          try {
            const processed = processJson(item.data.data, item.txHash);
            results.push(processed);
          } catch (error: any) {
            console.error(`Error processing ${item.txHash}:`, error);
            results.push({
              TX_HASH: item.txHash,
              SIGNER: '', SIGNER_NAME: null, STATUS: null,
              FEE_LAMPORTS: null, BLOCK: null, SUMMARY: '',
              ACTIVITY_TYPE: null, TOKEN_AMOUNT: null,
              TOKEN_ADDRESS: null, RECIPIENT_COUNT: null,
              ACTION: 'ERROR', PROGRAM: 'ERROR',
              CHAIN_LABELS: '', ERROR: error.message
            });
          }
        }

        const totalElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

        sendSSE(controller, encoder, {
          type: 'complete',
          total,
          results,
          message: `Done! ${results.length} transactions analyzed in ${totalElapsed} minutes`
        });

        controller.close();
      } catch (error: any) {
        sendSSE(controller, encoder, {
          type: 'error',
          message: error.message || 'An unexpected error occurred'
        });
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
