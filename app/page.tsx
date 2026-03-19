'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

type ProcessingStatus = 'idle' | 'uploading' | 'processing' | 'completed' | 'error';

interface ProgressData {
  current: number;
  total: number;
  status: string;
  percentage: number;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState<ProgressData>({ current: 0, total: 0, status: '', percentage: 0 });
  const [error, setError] = useState<string>('');
  const [resultData, setResultData] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.name.match(/\.(xlsx|xls)$/)) {
        setError('Please upload a valid Excel file (.xlsx or .xls)');
        return;
      }
      setFile(selectedFile);
      setError('');
      setStatus('idle');
      setResultData(null);
    }
  };

  const processTransactions = async () => {
    if (!file) return;

    setStatus('uploading');
    setError('');
    setProgress({ current: 0, total: 0, status: 'Reading file...', percentage: 0 });

    try {
      // Read Excel file
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Auto-detect transaction hash column
      if (jsonData.length === 0) {
        throw new Error('Excel file is empty');
      }

      // Try to find a column that looks like it has transaction hashes
      const firstRow = jsonData[0] as Record<string, any>;
      const columns = Object.keys(firstRow);

      // Try common column names first
      const commonNames = ['tx_hash', 'txhash', 'transaction', 'tx', 'hash', 'signature', 'txid', 'transaction_id', 'tx_id'];
      let txColumn = columns.find(col =>
        commonNames.some(name => col.toLowerCase().includes(name))
      );

      // If not found, use the first column
      if (!txColumn) {
        txColumn = columns[0];
      }

      const txHashes = jsonData.map((row: any) => row[txColumn]).filter(Boolean);

      if (txHashes.length === 0) {
        throw new Error('No transaction hashes found in the file');
      }

      setProgress({
        current: 0,
        total: txHashes.length,
        status: `Found ${txHashes.length} transactions in column "${txColumn}"...`,
        percentage: 0
      });
      setStatus('processing');

      // Call API to process transactions
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ txHashes }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Processing failed');
      }

      // Stream progress updates
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');

          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.substring(6).trim();
                if (!jsonStr) continue;

                const data = JSON.parse(jsonStr);

                if (data.type === 'progress') {
                  setProgress({
                    current: data.current,
                    total: data.total,
                    status: data.message,
                    percentage: Math.round((data.current / data.total) * 100)
                  });
                } else if (data.type === 'complete') {
                  setResultData(data.results);
                  setStatus('completed');
                  setProgress({
                    current: data.total,
                    total: data.total,
                    status: data.message || 'Processing completed!',
                    percentage: 100
                  });
                } else if (data.type === 'error') {
                  throw new Error(data.message);
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE message:', line, parseError);
              }
            }
          }
        }
      }

    } catch (err: any) {
      setStatus('error');
      setError(err.message || 'An error occurred during processing');
      console.error('Processing error:', err);
    }
  };

  const downloadResults = () => {
    if (!resultData) return;

    const worksheet = XLSX.utils.json_to_sheet(resultData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
    XLSX.writeFile(workbook, 'solana_transaction_analysis.xlsx');
  };

  const reset = () => {
    setFile(null);
    setStatus('idle');
    setProgress({ current: 0, total: 0, status: '', percentage: 0 });
    setError('');
    setResultData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Solana Transaction Analyzer
            </h1>
            <p className="text-gray-600">
              Upload your Excel file with transaction hashes to analyze
            </p>
          </div>

          {/* File Upload Section */}
          {status === 'idle' && (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <svg
                    className="w-12 h-12 text-gray-400 mb-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <span className="text-sm text-gray-600">
                    Click to upload or drag and drop
                  </span>
                  <span className="text-xs text-gray-500 mt-1">
                    Excel files only (.xlsx, .xls)
                  </span>
                </label>
              </div>

              {file && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <svg
                        className="w-8 h-8 text-blue-500 mr-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <div>
                        <p className="font-medium text-gray-900">{file.name}</p>
                        <p className="text-sm text-gray-500">
                          {(file.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={reset}
                      className="text-red-500 hover:text-red-700"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <svg
                      className="w-5 h-5 text-red-500 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="text-red-700">{error}</span>
                  </div>
                </div>
              )}

              <button
                onClick={processTransactions}
                disabled={!file}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                  file
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Process Transactions
              </button>
            </div>
          )}

          {/* Processing Status */}
          {(status === 'uploading' || status === 'processing') && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-lg font-medium text-gray-900 mb-2">
                  {progress.status}
                </p>
                {progress.total > 0 && (
                  <p className="text-sm text-gray-600">
                    Processing transaction {progress.current} of {progress.total}
                  </p>
                )}
              </div>

              {progress.total > 0 && (
                <div className="space-y-2">
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${progress.percentage}%` }}
                    ></div>
                  </div>
                  <p className="text-center text-sm font-medium text-gray-700">
                    {progress.percentage}%
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Completion Status */}
          {status === 'completed' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                  <svg
                    className="w-8 h-8 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Processing Complete!
                </h2>
                <p className="text-gray-600">
                  Successfully analyzed {progress.total} transactions
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={downloadResults}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center"
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download Results
                </button>
                <button
                  onClick={reset}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 px-4 rounded-lg font-medium transition-colors"
                >
                  Process Another File
                </button>
              </div>
            </div>
          )}

          {/* Error Status */}
          {status === 'error' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                  <svg
                    className="w-8 h-8 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Processing Failed
                </h2>
                <p className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
                  {error}
                </p>
              </div>

              <button
                onClick={reset}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 px-4 rounded-lg font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 mb-2">How it works:</h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Upload any Excel file with Solana transaction hashes</li>
            <li>Column name doesn't matter - we auto-detect it!</li>
            <li>The app fetches and analyzes all transactions automatically</li>
            <li>Download results with ACTION, PROGRAM, and CHAIN_LABELS data</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
