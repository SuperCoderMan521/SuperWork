type BrandNameProps = {
  compact?: boolean
}

export function BrandName({ compact = false }: BrandNameProps): React.ReactNode {
  if (compact) {
    return (
      <span className="brand-name brand-name-compact">
        <span className="brand-super">Super</span>
        <span className="brand-work">Work</span>
      </span>
    )
  }

  return (
    <span className="brand-name">
      <span className="brand-badge" aria-hidden="true">
        <span className="brand-badge-part brand-badge-super">
          <span className="brand-super">Super</span>
        </span>
        <span className="brand-badge-part brand-badge-work">
          <span className="brand-work">Work</span>
        </span>
      </span>
    </span>
  )
}
