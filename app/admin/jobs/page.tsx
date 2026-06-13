'use client';

import { useState, useEffect } from 'react';

interface Job {
  id: number;
  domain_id: number;
  job_type: string;
  status: string;
  attempts: number;
  last_error: string;
  scheduled_at: string;
  started_at: string;
  completed_at: string;
  domain?: string;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
    fetch(`/api/admin/jobs${params}`)
      .then((r) => r.json())
      .then((data) => setJobs(data.jobs ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const statusColor = (status: string) => {
    if (status === 'completed') return 'text-green-600 bg-green-50';
    if (status === 'running') return 'text-blue-600 bg-blue-50';
    if (status === 'failed') return 'text-red-600 bg-red-50';
    if (status === 'queued') return 'text-yellow-700 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Enrichment Jobs</h1>
        <div className="flex gap-2">
          {['all', 'queued', 'running', 'failed', 'completed'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          No jobs found.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 font-medium text-gray-500">ID</th>
                <th className="text-left px-6 py-4 font-medium text-gray-500">Type</th>
                <th className="text-left px-6 py-4 font-medium text-gray-500">Domain</th>
                <th className="text-left px-6 py-4 font-medium text-gray-500">Status</th>
                <th className="text-right px-6 py-4 font-medium text-gray-500">Attempts</th>
                <th className="text-left px-6 py-4 font-medium text-gray-500">Scheduled</th>
                <th className="text-left px-6 py-4 font-medium text-gray-500">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-400 font-mono text-xs">{job.id}</td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-900">{job.job_type}</td>
                  <td className="px-6 py-4 text-gray-700">{job.domain ?? job.domain_id}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${statusColor(job.status)}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700">{job.attempts}</td>
                  <td className="px-6 py-4 text-gray-500 text-xs">
                    {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-6 py-4 text-red-500 text-xs max-w-xs truncate">
                    {job.last_error ?? '—'}
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
