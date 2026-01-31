'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { 
  Users, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  Car,
  Shield
} from 'lucide-react'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL

export default function Dashboard() {
  const [verificationStats, setVerificationStats] = useState<any>(null)
  const [fraudStats, setFraudStats] = useState<any>(null)
  const [liveTrips, setLiveTrips] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
    // Refresh every 30 seconds
    const interval = setInterval(loadDashboardData, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadDashboardData = async () => {
    try {
      const [verif, fraud, trips] = await Promise.all([
        axios.get(`${API_URL}/admin/verifications/dashboard`),
        axios.get(`${API_URL}/admin/fraud/dashboard`),
        axios.get(`${API_URL}/admin/trips/live`)
      ])
      
      setVerificationStats(verif.data)
      setFraudStats(fraud.data)
      setLiveTrips(trips.data)
      setLoading(false)
    } catch (error) {
      console.error('Error loading dashboard:', error)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">NexRyde Admin</h1>
              <p className="text-sm text-gray-500">Dashboard Overview</p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                Live
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <Link 
              href="/dashboard" 
              className="border-b-2 border-primary-600 py-4 px-1 text-sm font-medium text-primary-600"
            >
              Dashboard
            </Link>
            <Link 
              href="/dashboard/verifications" 
              className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
            >
              Verifications
            </Link>
            <Link 
              href="/dashboard/fraud" 
              className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
            >
              Fraud Monitoring
            </Link>
            <Link 
              href="/dashboard/trips" 
              className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
            >
              Trips
            </Link>
            <Link 
              href="/dashboard/users" 
              className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
            >
              Users
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Verification Stats */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CheckCircle className="h-6 w-6 text-blue-600" />
              </div>
              {verificationStats?.urgent_attention_needed && (
                <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">
                  Urgent
                </span>
              )}
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{verificationStats?.pending_count || 0}</h3>
            <p className="text-sm text-gray-500">Pending Verifications</p>
            <div className="mt-4 text-xs text-gray-500">
              Oldest: {verificationStats?.oldest_pending_hours?.toFixed(1) || 0}h
            </div>
          </div>

          {/* Fraud Alerts */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              {fraudStats?.stats?.critical > 0 && (
                <span className="px-2 py-1 bg-red-600 text-white rounded text-xs font-medium">
                  {fraudStats.stats.critical} Critical
                </span>
              )}
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{fraudStats?.stats?.total_alerts || 0}</h3>
            <p className="text-sm text-gray-500">Fraud Alerts</p>
            <div className="mt-4 text-xs text-gray-500">
              Score: {fraudStats?.fraud_score || 0}/100
            </div>
          </div>

          {/* Live Trips */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <Car className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{liveTrips?.count || 0}</h3>
            <p className="text-sm text-gray-500">Active Trips</p>
            <div className="mt-4 text-xs text-gray-500">
              Long trips: {liveTrips?.long_trips || 0}
            </div>
          </div>

          {/* Approved Today */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{verificationStats?.approved_today || 0}</h3>
            <p className="text-sm text-gray-500">Approved Today</p>
            <div className="mt-4 text-xs text-gray-500">
              Rejected: {verificationStats?.rejected_today || 0}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Fraud Alerts List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Recent Fraud Alerts</h2>
            </div>
            <div className="p-6">
              {fraudStats?.alerts?.slice(0, 5).map((alert: any, index: number) => (
                <div key={index} className="mb-4 last:mb-0 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          alert.severity === 'CRITICAL' ? 'bg-red-600 text-white' :
                          alert.severity === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                          alert.severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {alert.severity}
                        </span>
                        <span className="text-xs text-gray-500">{alert.type}</span>
                      </div>
                      <p className="text-sm text-gray-700">{alert.message}</p>
                    </div>
                  </div>
                </div>
              ))}
              {(!fraudStats?.alerts || fraudStats.alerts.length === 0) && (
                <p className="text-center text-gray-500 py-8">No fraud alerts</p>
              )}
            </div>
          </div>

          {/* Live Trips */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Active Trips</h2>
            </div>
            <div className="p-6">
              {liveTrips?.active_trips?.slice(0, 5).map((trip: any, index: number) => (
                <div key={index} className="mb-4 last:mb-0 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">
                      {trip.driver_info?.name || 'Unknown Driver'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {trip.duration_mins?.toFixed(0) || 0} min
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Rider: {trip.rider_info?.name || 'Unknown'}
                  </p>
                  {trip.is_long && (
                    <span className="mt-2 inline-block px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-medium">
                      ⚠️ Long trip
                    </span>
                  )}
                </div>
              ))}
              {(!liveTrips?.active_trips || liveTrips.active_trips.length === 0) && (
                <p className="text-center text-gray-500 py-8">No active trips</p>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              href="/dashboard/verifications"
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors"
            >
              <Shield className="h-8 w-8 text-primary-600 mb-2" />
              <p className="text-sm font-medium text-gray-900">Verify Drivers</p>
            </Link>
            <Link
              href="/dashboard/users"
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors"
            >
              <Users className="h-8 w-8 text-primary-600 mb-2" />
              <p className="text-sm font-medium text-gray-900">Search Users</p>
            </Link>
            <Link
              href="/dashboard/trips"
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors"
            >
              <BarChart3 className="h-8 w-8 text-primary-600 mb-2" />
              <p className="text-sm font-medium text-gray-900">Trip Analytics</p>
            </Link>
            <Link
              href="/dashboard/fraud"
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors"
            >
              <AlertTriangle className="h-8 w-8 text-primary-600 mb-2" />
              <p className="text-sm font-medium text-gray-900">Fraud Monitor</p>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
