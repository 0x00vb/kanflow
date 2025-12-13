import React from 'react'
import { cn } from '@/utils/cn'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  padding?: 'none' | 'sm' | 'md' | 'lg'
  shadow?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  border?: boolean
  hover?: boolean
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  padding = 'md',
  shadow = 'sm',
  border = true,
  hover = false,
  ...props
}) => {
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  }

  const shadowClasses = {
    none: '',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
  }

  return (
    <div
      className={cn(
        'bg-white rounded-lg transition-all duration-200',
        border && 'border border-gray-200',
        paddingClasses[padding],
        shadowClasses[shadow],
        hover && 'hover:shadow-md hover:-translate-y-0.5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={cn('flex items-center justify-between', className)}
    {...props}
  >
    {children}
  </div>
)

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode
}

export const CardTitle: React.FC<CardTitleProps> = ({
  children,
  className,
  ...props
}) => (
  <h3
    className={cn('text-lg font-semibold text-gray-900', className)}
    {...props}
  >
    {children}
  </h3>
)

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export const CardContent: React.FC<CardContentProps> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={cn('', className)}
    {...props}
  >
    {children}
  </div>
)
