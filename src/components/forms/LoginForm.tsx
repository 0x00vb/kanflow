'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth/context'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface LoginFormProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (user: any, token: string) => void
  onSwitchToRegister: () => void
}

export const LoginForm: React.FC<LoginFormProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSwitchToRegister,
}) => {
  const { login } = useAuth()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
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

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
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
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
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
          setErrors({ general: data.message || 'Login failed' })
        }
        return
      }

      // Success - use AuthProvider to handle authentication
      login(data.data.user, data.data.token)
      onSuccess?.(data.data.user, data.data.token)
      onClose()

    } catch (error) {
      console.error('Login error:', error)
      setErrors({ general: 'Network error. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sign In to KanFlow">
      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.general && (
          <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg">
            <p className="text-sm text-danger">{errors.general}</p>
          </div>
        )}

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
          placeholder="Enter your password"
          autoComplete="current-password"
          required
        />

        <div className="flex items-center justify-between">
          <label className="flex items-center">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-primary-blue focus:ring-primary-blue"
            />
            <span className="ml-2 text-sm text-gray-600">Remember me</span>
          </label>

          <button
            type="button"
            className="text-sm text-primary-blue hover:text-blue-700 font-medium"
          >
            Forgot password?
          </button>
        </div>

        <div className="space-y-3">
          <Button
            type="submit"
            className="w-full"
            isLoading={isLoading}
            size="lg"
          >
            Sign In
          </Button>

          <div className="text-center">
            <span className="text-sm text-gray-600">Don't have an account? </span>
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="text-sm text-primary-blue hover:text-blue-700 font-medium"
            >
              Sign up
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
