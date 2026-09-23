function AppleIntelligenceMark({ compact = false }: { compact?: boolean }) {
  return <span className={`hundred-apple-icon ${compact ? 'compact' : ''}`} aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false"><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4.4"><ellipse cx="32" cy="32" rx="22" ry="10" /><ellipse cx="32" cy="32" rx="22" ry="10" transform="rotate(60 32 32)" /><ellipse cx="32" cy="32" rx="22" ry="10" transform="rotate(120 32 32)" /></g></svg></span>
}

export default AppleIntelligenceMark
