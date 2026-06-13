'use client';

import { useState, useEffect } from 'react';

interface CsvImport {
  id: string;
  filename: string;
  status: string;
  total_rows: number;
  processed_rows: number;
  failed_rows: number;
  started_at: string;
  completed_at: string;
  created_at: string;
  last_error: string;
}

export default function ImportsPage() {
  const [imports, setImports] = useState<CsvImport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/imports')
      .then((r) => r.json())
      .then((data) => setImports(data.imports ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const statusColor = (status: string) => {
    if (status === 'completed') return 'text-green-600 bg-green-50';
    if (status === 'running') return 'text-blue-600 bg-blue-50';
    if (status === 'failed') return 'text-red-600 bg-red-50';
    return 'text-gray-600 bg-gray-50';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">CSV Imports</h1>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : imports.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          No imports yet. Run the import script to get started.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 font-medium text-gray-500">File</th>
                <th className="text-left px-6 py-4 font-medium text-gray-500">Status</th>
                <th className="text-right px-6 py-4 font-medium text-gray-500">Processed</th>
                <th className="text-right px-6 py-4 font-medium text-gray-500">Failed</th>
                <th className="text-left px-6 py-4 font-medium text-gray-500">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {imports.map((imp) => (
                <tr key={imp.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-mono text-xs text-gray-900">{imp.filename}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${statusColor(imp.status)}`}>
                      {imp.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700">
                    {imp.processed_rows?.toLocaleString() ?? '—'}
                    {imp.total_rows ? ` / ${imp.total_rows.toLocaleString()}` : ''}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700">{imp.failed_rows ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-500 text-xs">
                    {imp.started_at ? new Date(imp.started_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
