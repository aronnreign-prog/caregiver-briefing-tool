import Image from 'next/image'

interface LogoProps {
  size?: number
  className?: string
  priority?: boolean
}

export function Logo({ size = 20, className = '', priority = false }: LogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="CareNote logo"
      width={size}
      height={size}
      priority={priority}
      className={`shrink-0 object-contain ${className}`}
    />
  )
}

export default Logo
