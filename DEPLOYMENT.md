# Deployment Guide

## Quick Start (Local)

```bash
cd solana-tx-analyzer
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel

### Option 1: Using Vercel CLI

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
cd solana-tx-analyzer
vercel
```

3. Follow the prompts
4. Add environment variable in Vercel dashboard:
   - `SOLSCAN_API_KEY` = your API key

### Option 2: Using Vercel Dashboard

1. Push code to GitHub/GitLab/Bitbucket

2. Go to https://vercel.com

3. Click "New Project"

4. Import your repository

5. Add Environment Variable:
   - Name: `SOLSCAN_API_KEY`
   - Value: Your Solscan API key

6. Click "Deploy"

## Environment Variables

### Required for Production

- `SOLSCAN_API_KEY`: Your Solscan Pro API key
  - Get from: https://pro-api.solscan.io/

### Optional

The app includes a default API key for testing, but you should use your own for production.

## Configuration

### Vercel Specific

The `vercel.json` file configures:
- Function timeout: 300 seconds (5 minutes) for processing large batches

### Rate Limiting

Configured in `app/api/process/route.ts`:
- `BATCH_SIZE`: 14 transactions per batch
- `RETRY_DELAY`: 5000ms between retries
- `MAX_RETRIES`: 3 attempts per transaction

Adjust these if you have different API rate limits.

## Testing

### Test with Sample Data

1. Create an Excel file with these columns:
   ```
   tx_hash
   your_transaction_hash_1
   your_transaction_hash_2
   ```

2. Upload through the web interface

3. Watch the progress

4. Download results

### Common Test Scenarios

- Small batch (1-10 transactions)
- Medium batch (50-100 transactions)
- Invalid transaction hash
- Empty Excel file
- Missing tx_hash column

## Monitoring

### Vercel Dashboard

- View function logs in Vercel dashboard
- Monitor function execution time
- Check error rates

### Performance Tips

1. **For large batches** (500+ transactions):
   - Consider increasing `BATCH_SIZE` if your API allows
   - Monitor Vercel function timeout (max 300s on Pro plan)

2. **API Rate Limits**:
   - Current settings respect 1000 requests/min limit
   - Adjust if you have higher limits

3. **Vercel Limits**:
   - Free: 10s function timeout
   - Pro: 300s function timeout
   - Enterprise: Custom

## Troubleshooting

### Deployment fails
- Check Node.js version (18+)
- Verify all dependencies in package.json
- Check build logs in Vercel dashboard

### Functions timeout
- Reduce batch size in the Excel file
- Consider upgrading Vercel plan
- Optimize API calls

### API errors
- Verify API key is set correctly
- Check API rate limits
- Review error logs

## Security

### API Key Protection

- Never commit `.env.local` to git
- Use Vercel environment variables for production
- Rotate API keys periodically

### File Upload

- Max file size controlled by Next.js config
- Only .xlsx and .xls files accepted
- Client-side validation

## Support

For issues:
1. Check Vercel deployment logs
2. Review browser console for client errors
3. Test API endpoint directly at `/api/process`
