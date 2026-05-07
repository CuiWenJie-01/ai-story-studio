import type { ApiProvider } from '../../types'

interface ApiIconProps {
  provider: ApiProvider
  size?: number
  className?: string
}

export const KlingIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect width="24" height="24" rx="6" fill="url(#kling-gradient)" />
    <path
      d="M7 8h2v8H7V8zm4 0h2l4 5-4 5h-2l4-5-4-5z"
      fill="white"
    />
    <defs>
      <linearGradient id="kling-gradient" x1="0" y1="0" x2="24" y2="24">
        <stop stopColor="#FF6B6B" />
        <stop offset="1" stopColor="#FF8E53" />
      </linearGradient>
    </defs>
  </svg>
)

export const RunningHubIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect width="24" height="24" rx="6" fill="url(#runninghub-gradient)" />
    <circle cx="12" cy="12" r="3" fill="white" />
    <circle cx="12" cy="6" r="2" fill="white" opacity="0.8" />
    <circle cx="17" cy="9" r="2" fill="white" opacity="0.8" />
    <circle cx="17" cy="15" r="2" fill="white" opacity="0.8" />
    <circle cx="12" cy="18" r="2" fill="white" opacity="0.8" />
    <circle cx="7" cy="15" r="2" fill="white" opacity="0.8" />
    <circle cx="7" cy="9" r="2" fill="white" opacity="0.8" />
    <defs>
      <linearGradient id="runninghub-gradient" x1="0" y1="0" x2="24" y2="24">
        <stop stopColor="#667EEA" />
        <stop offset="1" stopColor="#764BA2" />
      </linearGradient>
    </defs>
  </svg>
)

export const JimengIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect width="24" height="24" rx="6" fill="url(#jimeng-gradient)" />
    <path
      d="M12 6c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm0 10c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4z"
      fill="white"
    />
    <circle cx="12" cy="12" r="2" fill="white" />
    <path d="M12 4v2M12 18v2M4 12h2M18 12h2" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    <defs>
      <linearGradient id="jimeng-gradient" x1="0" y1="0" x2="24" y2="24">
        <stop stopColor="#00D9FF" />
        <stop offset="1" stopColor="#0066FF" />
      </linearGradient>
    </defs>
  </svg>
)

export const MiniMaxIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect width="24" height="24" rx="6" fill="url(#minimax-gradient)" />
    <path
      d="M7 8h2v8H7V8zm4 0h2v3h-2V8zm4 0h2v8h-2V8zm-4 5h2v3h-2v-3z"
      fill="white"
    />
    <defs>
      <linearGradient id="minimax-gradient" x1="0" y1="0" x2="24" y2="24">
        <stop stopColor="#6366F1" />
        <stop offset="1" stopColor="#8B5CF6" />
      </linearGradient>
    </defs>
  </svg>
)

export const Gemini12AIIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect width="24" height="24" rx="6" fill="url(#gemini12ai-gradient)" />
    <path
      d="M12 2L14.5 9H9.5L12 2Z"
      fill="white"
    />
    <path
      d="M12 22L9.5 15H14.5L12 22Z"
      fill="white"
      opacity="0.8"
    />
    <path
      d="M2 12L9.5 9.5V14.5L2 12Z"
      fill="white"
      opacity="0.9"
    />
    <path
      d="M22 12L14.5 14.5V9.5L22 12Z"
      fill="white"
      opacity="0.9"
    />
    <circle cx="12" cy="12" r="3" fill="white" />
    <defs>
      <linearGradient id="gemini12ai-gradient" x1="0" y1="0" x2="24" y2="24">
        <stop stopColor="#4285F4" />
        <stop offset="0.5" stopColor="#9B72CB" />
        <stop offset="1" stopColor="#D96570" />
      </linearGradient>
    </defs>
  </svg>
)

export const YunwuIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect width="24" height="24" rx="6" fill="url(#yunwu-gradient)" />
    <path
      d="M6 14C6 11.79 7.79 10 10 10C10.5 8.3 12.1 7 14 7C16.76 7 19 9.24 19 12C19 12.36 18.96 12.71 18.89 13.05C20.12 13.32 21 14.42 21 15.73C21 17.54 19.54 19 17.73 19H6.27C4.46 19 3 17.54 3 15.73C3 14.42 3.88 13.32 5.11 13.05C5.04 12.71 5 12.36 5 12C5 11.34 5.13 10.71 5.36 10.14"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      fill="none"
    />
    <circle cx="9" cy="14" r="1.5" fill="white" />
    <circle cx="15" cy="14" r="1.5" fill="white" />
    <circle cx="12" cy="16" r="1" fill="white" />
    <defs>
      <linearGradient id="yunwu-gradient" x1="0" y1="0" x2="24" y2="24">
        <stop stopColor="#60A5FA" />
        <stop offset="1" stopColor="#3B82F6" />
      </linearGradient>
    </defs>
  </svg>
)

export const VolcArkIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect width="24" height="24" rx="6" fill="url(#volcark-gradient)" />
    <path
      d="M12 5L6 19h3l1.5-4h3L15 19h3L12 5zm0 5l1.5 4h-3L12 10z"
      fill="white"
    />
    <defs>
      <linearGradient id="volcark-gradient" x1="0" y1="0" x2="24" y2="24">
        <stop stopColor="#FF6A00" />
        <stop offset="1" stopColor="#FF3D00" />
      </linearGradient>
    </defs>
  </svg>
)

const ApiIcon: React.FC<ApiIconProps> = ({ provider, size = 24, className }) => {
  switch (provider) {
    case 'kling':
      return <KlingIcon size={size} className={className} />
    case 'runninghub':
      return <RunningHubIcon size={size} className={className} />
    case 'jimeng':
      return <JimengIcon size={size} className={className} />
    case 'minimax':
      return <MiniMaxIcon size={size} className={className} />
    case 'gemini12ai':
      return <Gemini12AIIcon size={size} className={className} />
    case 'yunwu':
      return <YunwuIcon size={size} className={className} />
    case 'volcark':
      return <VolcArkIcon size={size} className={className} />
    default:
      return null
  }
}

export default ApiIcon
