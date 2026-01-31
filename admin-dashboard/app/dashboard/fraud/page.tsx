'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { AlertTriangle, Search, Shield, Ban, Clock } from 'lucide-react'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL

export default function FraudMonitoring() {
  const [fraudData, setFraudData] = useState<any>(null)
  const [selectedAlert, setSelectedAlert] = useState<any>(null)
  const [investigation, setInvestigation] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFraudData()
  }, [])

  const loadFraudData = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/fraud/dashboard`)
      setFraudData(response.data)
      setLoading(false)
    } catch (error) {
      console.error('Error loading fraud data:', error)
      setLoading(false)
    }
  }

  const investigateUser = async (userId: string) => {
    try {
      const response = await axios.post(`${API_URL}/admin/fraud/investigate/${userId}`)
      setInvestigation(response.data)
    } catch (error) {
      console.error('Error investigating user:', error)
    }
  }

  const takeAction = async (userId: string, action: string, reason: string) => {
    if (!confirm(`Are you sure you want to ${action} this user?`)) return

    try {
      await axios.post(`${API_URL}/admin/fraud/action/${userId}`, { action, reason })
      alert(`Action "${action}" taken successfully!`)
      loadFraudData()
      setInvestigation(null)
    } catch (error) {
      console.error('Error taking action:', error)
      alert('Failed to take action')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - same as dashboard */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Fraud Monitoring</h1>
              <p className="text-sm text-gray-500">Real-time fraud detection</p>
            </div>
            <Link href="/dashboard" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">Total Alerts</p>
            <p className="text-2xl font-bold text-gray-900">{fraudData?.stats?.total_alerts || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">Critical</p>
            <p className="text-2xl font-bold text-red-600">{fraudData?.stats?.critical || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">High</p>
            <p className="text-2xl font-bold text-orange-600">{fraudData?.stats?.high || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">Medium</p>
            <p className="text-2xl font-bold text-yellow-600">{fraudData?.stats?.medium || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500">Fraud Score</p>
            <p className="text-2xl font-bold text-gray-900">{fraudData?.fraud_score || 0}/100</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Alerts List */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Fraud Alerts</h2>
            </div>
            <div className="p-6 space-y-4">
              {fraudData?.alerts?.map((alert: any, index: number) => (
                <div 
                  key={index}
                  className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 cursor-pointer"
                  onClick={() => {
                    setSelectedAlert(alert)
                    if (alert.driver_id || alert.user_id) {
                      investigateUser(alert.driver_id || alert.user_id)
                    }
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        alert.severity === 'CRITICAL' ? 'bg-red-600 text-white' :
                        alert.severity === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                        alert.severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {alert.severity}
                      </span>
                      <span className="text-xs font-medium text-gray-500">{alert.type}</span>
                    </div>
                    <AlertTriangle className={`h-5 w-5 ${
                      alert.severity === 'CRITICAL' ? 'text-red-600' :
                      alert.severity === 'HIGH' ? 'text-orange-600' :
                      'text-yellow-600'
                    }`} />
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{alert.message}</p>
                  {alert.driver_id && (
                    <p className="text-xs text-gray-500">Driver ID: {alert.driver_id}</p>
                  )}
                  {alert.user_ids && (
                    <p className="text-xs text-gray-500">Affected users: {alert.user_ids.length}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Investigation Panel */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Investigation</h2>
            </div>
            <div className="p-6">
              {investigation ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">User Info</h3>
                    <div className="space-y-1 text-sm">
                      <p><span className="text-gray-500">Name:</span> {investigation.user_info.name}</p>
                      <p><span className="text-gray-500">Phone:</span> {investigation.user_info.phone}</p>
                      <p><span className="text-gray-500">Role:</span> {investigation.user_info.role}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Risk Assessment</h3>
                    <div className={`p-3 rounded-lg mb-2 ${
                      investigation.risk_assessment.level === 'CRITICAL' ? 'bg-red-100' :
                      investigation.risk_assessment.level === 'HIGH' ? 'bg-orange-100' :
                      investigation.risk_assessment.level === 'MEDIUM' ? 'bg-yellow-100' :
                      'bg-green-100'
                    }`}>
                      <p className="font-medium">{investigation.risk_assessment.level}</p>
                      <p className="text-sm">Score: {investigation.risk_assessment.score}/100</p>
                    </div>
                    <p className="text-sm text-gray-700">{investigation.risk_assessment.recommendation}</p>
                  </div>

                  {investigation.red_flags && investigation.red_flags.length > 0 && (
                    <div>
                      <h3 className="font-medium text-gray-900 mb-2">Red Flags</h3>
                      <ul className="space-y-1">
                        {investigation.red_flags.map((flag: string, i: number) => (
                          <li key={i} className="text-sm text-red-600">{flag}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Statistics</h3>
                    <div className="space-y-1 text-sm">
                      <p><span className="text-gray-500">Total Trips:</span> {investigation.stats.total_trips}</p>
                      <p><span className="text-gray-500">Cancelled:</span> {investigation.stats.cancelled_trips}</p>
                      <p><span className="text-gray-500">Cancel Rate:</span> {investigation.stats.cancel_rate}%</p>
                      <p><span className="text-gray-500">SOS Count:</span> {investigation.stats.sos_count}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-200">
                    <h3 className="font-medium text-gray-900 mb-3">Take Action</h3>
                    <div className="space-y-2">
                      <button
                        onClick={() => takeAction(investigation.user_id, 'warn', 'Suspicious activity detected')}
                        className="w-full px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 text-sm font-medium"
                      >
                        ⚠️ Warn User
                      </button>
                      <button
                        onClick={() => takeAction(investigation.user_id, 'suspend_7days', 'Fraud investigation')}
                        className="w-full px-4 py-2 bg-orange-100 text-orange-800 rounded-lg hover:bg-orange-200 text-sm font-medium"
                      >
                        🔒 Suspend 7 Days
                      </button>
                      <button
                        onClick={() => takeAction(investigation.user_id, 'suspend_30days', 'Serious fraud violation')}
                        className="w-full px-4 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200 text-sm font-medium"
                      >
                        🔒 Suspend 30 Days
                      </button>
                      <button
                        onClick={() => takeAction(investigation.user_id, 'ban_permanent', 'Confirmed fraud')}
                        className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                      >
                        ❌ Ban Permanently
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">
                  Click on an alert to investigate
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
