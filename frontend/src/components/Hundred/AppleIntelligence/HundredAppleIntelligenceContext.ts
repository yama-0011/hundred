import { createContext, useContext } from 'react'
import type { HundredTargetApp } from '../../../services/AppleIntelligence/appleIntelligenceApi'

export type AppleLauncherContextValue = {
  openAppleIntelligence: (appId?: HundredTargetApp) => void
}

export const HundredAppleIntelligenceContext = createContext<AppleLauncherContextValue | null>(null)

export function useHundredAppleIntelligence() {
  const value = useContext(HundredAppleIntelligenceContext)
  if (!value) throw new Error('HundredAppleIntelligenceProviderが必要です')
  return value
}
