type BrandNameProps = {
  compact?: boolean
}

export function BrandName({ compact = false }: BrandNameProps): React.ReactNode {
  return (
    <span className={compact ? 'brand-name brand-name-compact' : 'brand-name'}>
      <span className="brand-text">SuperWork</span>
    </span>
  )
}
