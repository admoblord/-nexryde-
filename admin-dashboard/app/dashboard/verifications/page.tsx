'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Shield, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL

export default function Verifications() {
  const [verifications, setVerifications] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadVerifications()
  }, [])

  const loadVerifications = async () => {
    try {
      const [dashboard, list] = await Promise.all([
        axios.get(`${API_URL}/admin/verifications/dashboard`),
        axios.get(`${API_URL}/admin/verifications`)
      ])
      setStats(dashboard.data)
      setVerifications(list.data.verifications || [])
      setLoading(false)
    } catch (error) {
      console.error('Error:', error)
      setLoading(false)
    }
  }

  const approveVerification = async (id: string) => {
    if (!confirm('Approve this verification?')) return
    try {
      await axios.post(`${API_URL}/admin/verifications/${id}/approve`, {
        notes: 'Approved via admin dashboard'
      })
      alert('Verification approved!')
      loadVerifications()
    } catch (error) {
      alert('Failed to approve')
    }
  }

  const rejectVerification = async (id: string) => {
    const reason = prompt('Rejection reason:')
    if (!reason) return
    try {
      await axios.post(`${API_URL}/admin/verifications/${id}/reject`, { reason })
      alert('Verification rejected!')
      loadVerifications()
    } catch (error) {
      alert('Failed to reject')
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Driver Verifications</h1>
              <p className="text-sm text-gray-500">{stats?.message || 'Manage driver verifications'}</p>
            </div>
            <Link href="/dashboard" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending</p>
                <p className="text-2xl font-bold text-orange-600">{stats?.pending_count || 0}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-600" />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Approved Today</p>
                <p className="text-2xl font-bold text-green-600">{stats?.approved_today || 0}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Rejected Today</p>
                <p className="text-2xl font-bold text-red-600">{stats?.rejected_today || 0}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Avg Review Time</p>
                <p className="text-2xl font-bold text-blue-600">{stats?.avg_review_hours?.toFixed(1) || 0}h</p>
              </div>
              <Shield className="h-8 w-8 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Verifications List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold">All Verifications</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitted</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {verifications.map((verif) => (
                  <tr key={verif.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{verif.user_name || verif.personal_info?.fullName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{verif.user_phone || verif.personal_info?.phone}</div>
                      <div className="text-xs text-gray-400">{verif.personal_info?.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {verif.vehicle_info?.vehicleMake} {verif.vehicle_info?.vehicleModel}
                      </div>
                      <div className="text-xs text-gray-500">{verif.vehicle_info?.plateNumber}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        verif.status === 'approved' ? 'bg-green-100 text-green-800' :
                        verif.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        verif.status === 'under_review' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {verif.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(verif.submitted_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      {verif.status === 'pending' && (
                        <>
                          <button
                            onClick={() => approveVerification(verif.id)}
                            className="text-green-600 hover:text-green-900 font-medium"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectVerification(verif.id)}
                            className="text-red-600 hover:text-red-900 font-medium"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {verifications.length === 0 && (
              <div className="text-center py-12">
                <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No verifications found</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
