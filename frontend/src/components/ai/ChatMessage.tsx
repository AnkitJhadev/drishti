import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from 'recharts'
import type { ChatMessage as ChatMessageType } from '../../types/ai'

const BAR_COLORS = ['#f59e0b', '#ef4444', '#f97316', '#3b82f6', '#8b5cf6', '#10b981']

interface Props {
  message: ChatMessageType
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user'

  const chartData = message.chart_data
    ? Object.entries(message.chart_data).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
    : []

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className="max-w-[80%] px-3 py-2 rounded-lg text-sm"
        style={{
          background: isUser ? '#f59e0b' : '#1a2235',
          color: isUser ? '#0a0f1e' : '#f9fafb',
          border: isUser ? 'none' : '1px solid #1f2937',
        }}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>

        {/* Map highlights */}
        {!isUser && message.map_highlights && message.map_highlights.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {message.map_highlights.map((id) => (
              <span
                key={id}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: '#0a0f1e', color: '#f59e0b', border: '1px solid #374151' }}
              >
                📍 {id}
              </span>
            ))}
          </div>
        )}

        {/* Inline chart */}
        {!isUser && chartData.length > 0 && (
          <div style={{ height: 100, marginTop: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} stroke="#374151" />
                <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
