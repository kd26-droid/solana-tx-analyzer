# Solana Transaction Analyzer

A modern web application for analyzing Solana blockchain transactions. Upload an Excel file with transaction hashes and get detailed analysis including actions, programs, and chain labels.

## Features

- **Excel Upload**: Simple drag-and-drop interface for uploading transaction files
- **Real-time Progress**: Live progress tracking with percentage completion
- **Batch Processing**: Efficiently processes large numbers of transactions with rate limiting
- **Error Handling**: Automatic retries and clear error messages
- **Result Download**: Download analyzed results as Excel file
- **Responsive Design**: Works on desktop and mobile devices

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Solscan API key (optional - a default key is included for testing)

### Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. (Optional) Add your Solscan API key:
   - Copy `.env.example` to `.env.local`
   - Replace `your_api_key_here` with your actual API key

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Prepare Your Excel File**:
   - Create an Excel file (.xlsx or .xls)
   - Add a column named `tx_hash`
   - Fill it with Solana transaction hashes

2. **Upload and Process**:
   - Click or drag your file to upload
   - Click "Process Transactions"
   - Watch the real-time progress

3. **Download Results**:
   - Once complete, click "Download Results"
   - Get an Excel file with analyzed data

## Output Format

The results include the following columns:

- **TX_HASH**: Original transaction hash
- **ACTION**: Transaction types (TRANSFER, SWAP, STAKE, etc.)
- **PROGRAM**: Programs involved in the transaction
- **CHAIN_LABELS**: Source and destination chain information

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/solana-tx-analyzer)

1. Click the "Deploy" button above, or:
2. Push your code to GitHub
3. Import the repository in Vercel
4. Add your `SOLSCAN_API_KEY` environment variable
5. Deploy!

### Environment Variables

Set these in your Vercel project settings:

- `SOLSCAN_API_KEY`: Your Solscan API key

## Technical Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Excel Processing**: SheetJS (xlsx)
- **API**: Server-Sent Events (SSE) for real-time updates

## API Rate Limits

The application respects Solscan's rate limits:
- Processes 14 transactions per batch
- Includes delays between batches
- Automatic retry with exponential backoff

## Troubleshooting

### "Excel file must contain a 'tx_hash' column"
Make sure your Excel file has a column named exactly `tx_hash` (case-sensitive).

### Processing fails or times out
- Check your internet connection
- Verify the transaction hashes are valid
- Try with a smaller batch first

### API rate limit errors
If you're processing many transactions, the app will automatically retry. For very large batches, consider splitting into multiple files.

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
