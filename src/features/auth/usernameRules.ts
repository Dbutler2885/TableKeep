export const USERNAME_LENGTH = 7
export const USERNAME_ALLOWED_CHARACTERS = 'A-Z, a-z, 0-9, _, !@#$%^&*()'
export const USERNAME_PATTERN = /^[A-Za-z0-9_!@#$%^&*()]{7}$/
export const USERNAME_PARTIAL_PATTERN = /^[A-Za-z0-9_!@#$%^&*()]*$/

export function normalizeUsername(username: string) {
  return username.trim()
}

export function isValidUsername(username: string) {
  return USERNAME_PATTERN.test(username)
}

export function getUsernameValidationMessage() {
  return `Use exactly ${USERNAME_LENGTH} characters. Allowed: ${USERNAME_ALLOWED_CHARACTERS}`
}
