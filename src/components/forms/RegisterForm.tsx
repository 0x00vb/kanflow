'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth/context'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface RegisterFormProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (user: any, token: string) => void
  onSwitchToLogin: () => void
}

export const RegisterForm: React.FC<RegisterFormProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSwitchToLogin,
}) => {
  const { login } = useAuth()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password'
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsLoading(true)
    setErrors({})

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.details) {
          // Handle validation errors
          const validationErrors: Record<string, string> = {}
          data.details.forEach((detail: any) => {
            const field = detail.path[0]
            validationErrors[field] = detail.message
          })
          setErrors(validationErrors)
        } else {
          setErrors({ general: data.message || 'Registration failed' })
        }
        return
      }

      // Success - use AuthProvider to handle authentication
      login(data.data.user, data.data.token)
      onSuccess?.(data.data.user, data.data.token)
      onClose()

    } catch (error) {
      console.error('Registration error:', error)
      setErrors({ general: 'Network error. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create KanFlow Account">
      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.general && (
          <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg">
            <p className="text-sm text-danger">{errors.general}</p>
          </div>
        )}

        <Input
          label="Full Name"
          type="text"
          name="name"
          value={formData.name}
          onChange={handleInputChange}
          error={errors.name}
          placeholder="Enter your full name"
          autoComplete="name"
          required
        />

        <Input
          label="Email"
          type="email"
          name="email"
          value={formData.email}
          onChange={handleInputChange}
          error={errors.email}
          placeholder="Enter your email"
          autoComplete="email"
          required
        />

        <Input
          label="Password"
          type="password"
          name="password"
          value={formData.password}
          onChange={handleInputChange}
          error={errors.password}
          placeholder="Create a password"
          autoComplete="new-password"
          helperText="Must be at least 8 characters"
          required
        />

        <Input
          label="Confirm Password"
          type="password"
          name="confirmPassword"
          value={formData.confirmPassword}
          onChange={handleInputChange}
          error={errors.confirmPassword}
          placeholder="Confirm your password"
          autoComplete="new-password"
          required
        />

        <div className="space-y-3">
          <Button
            type="submit"
            className="w-full"
            isLoading={isLoading}
            size="lg"
          >
            Create Account
          </Button>

          <div className="text-center">
            <span className="text-sm text-gray-600">Already have an account? </span>
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="text-sm text-primary-blue hover:text-blue-700 font-medium"
            >
              Sign in
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
