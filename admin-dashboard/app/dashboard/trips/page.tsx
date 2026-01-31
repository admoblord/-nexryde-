'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Car, TrendingUp, DollarSign, XCircle } from 'lucide-react'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL

export default function TripsPage() {
  const [analytics, setAnalytics] = useState<any>(null)
  const [liveTrips, setLiveTrips] = useState<any>(null)
  const [period, setPeriod] = useState('today')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [period])

  const loadData = async () => {
    try {
      const [analyticsData, liveData] = await Promise.all([
        axios.get(`${API_URL}/admin/trips/analytics`, { params: { period } }),
        axios.get(`${API_URL}/admin/trips/live`)
      ])
      setAnalytics(analyticsData.data)
      setLiveTrips(liveData.data)
      setLoading(false)
    } catch (error) {
      console.error('Error:', error)
      setLoading(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Trip Analytics</h1>
              <p className="text-sm text-gray-500">Monitor trips and revenue</p>
            </div>
            <Link href="/dashboard" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Period Selector */}
        <div className="mb-6 flex gap-2">
          {['today', 'week', 'month'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg font-medium ${
                period === p
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Trips</p>
                <p className="text-2xl font-bold text-gray-900">{analytics?.total_trips || 0}</p>
              </div>
              <Car className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Completed</p>
                <p className="text-2xl font-bold text-green-600">{analytics?.completed || 0}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Revenue</p>
                <p className="text-2xl font-bold text-purple-600">
                  ₦{(analytics?.revenue?.total || 0).toLocaleString()}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-purple-600" />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Cancelled</p>
                <p className="text-2xl font-bold text-red-600">{analytics?.cancelled || 0}</p>
                <p className="text-xs text-gray-500">{analytics?.cancel_rate}%</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </div>
        </div>

        {/* Insights */}
        {analytics?.insights && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4">Key Insights</h2>
            <ul className="space-y-2">
              {analytics.insights.map((insight: string, i: number) => (
                <li key={i} className="text-gray-700">{insight}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Live Trips */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Active Trips ({liveTrips?.count || 0})</h2>
          <div className="space-y-4">
            {liveTrips?.active_trips?.slice(0, 10).map((trip: any) => (
              <div key={trip.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900">
                      {trip.driver_info?.name} → {trip.rider_info?.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      Status: {trip.status} • Duration: {trip.duration_mins?.toFixed(0)} min
                    </p>
                  </div>
                  {trip.is_long && (
                    <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-medium">
                      Long Trip
                    </span>
                  )}
                </div>
              </div>
            ))}
            {(!liveTrips?.active_trips || liveTrips.active_trips.length === 0) && (
              <p className="text-center text-gray-500 py-8">No active trips</p>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
