type ControlRowProps = {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}

export function ControlRow({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
}: ControlRowProps) {
  const inputId = `control-${label.toLowerCase().replaceAll(' ', '-')}`

  return (
    <div className="control-row">
      <div className="control-row-head">
        <label htmlFor={inputId}>{label}</label>
        <output htmlFor={inputId}>{value}</output>
      </div>

      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}
