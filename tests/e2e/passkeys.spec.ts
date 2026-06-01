import { test, expect } from '@playwright/test'

// Self-healing helper that logs in, running the onboarding setup wizard if a fresh database is detected.
async function ensureLoggedIn(page) {
  // Navigate to login
  await page.goto('/login')

  // Wait for the page to settle (either redirects to setup or stays on login)
  await expect(page.locator('h1:has-text("Welcome to NuxFlow"), h1:has-text("Sign in to NuxFlow")').first()).toBeVisible({ timeout: 20000 })

  const currentUrl = page.url()
  if (currentUrl.endsWith('/setup')) {
    // Step 1: Site Details
    await page.locator('input[placeholder="My Awesome Site"]').fill('E2E Test Site')
    await page.waitForTimeout(500)
    const domainInput = page.locator('input[placeholder="example.com"]')
    const domainVal = await domainInput.inputValue()
    if (domainVal !== 'localhost') {
      await domainInput.fill('localhost')
    }
    await page.locator('button:has-text("Continue")').click()
    
    // Step 2: Admin Account
    await page.locator('input[placeholder="Jane Smith"]').fill('Test Administrator')
    await page.locator('input[placeholder="jane@example.com"]').fill('admin@nuxflow.spec')
    await page.locator('input[placeholder="••••••••"]').first().fill('password123')
    await page.locator('input[placeholder="••••••••"]').last().fill('password123')
    await page.locator('button:has-text("Continue")').click()

    // Step 3: Email Settings
    await page.locator('button:has-text("Continue")').click()

    // Step 4: Template / Finish
    await page.locator('button:has-text("Finish setup")').click()

    // Redirected back to login
    await page.goto('/login')
  }

  // Expect the login heading to be present
  await expect(page.locator('h1:has-text("Sign in to NuxFlow")').first()).toBeVisible({ timeout: 30000 })

  // Fill in correct details and click Sign in
  await page.locator('input[type="email"]').fill('admin@nuxflow.spec')
  await page.locator('input[type="password"]').fill('password123')
  await page.locator('button[type="submit"]:has-text("Sign in")').click()

  // Wait for redirection to dashboard or homepage greeting
  await expect(page.locator('h1.text-2xl')).toHaveText(/Good\s+morning|Good\s+afternoon|Good\s+evening/, { timeout: 20000 })
}

test.describe('NuxFlow Passkey Biometrics Management', () => {
  test('should manage, register, login, and delete a biometric passkey successfully', async ({ page, context }) => {
    // Generate a unique passkey name to prevent matching pre-existing keys in a persistent test DB
    const uniqueKeyName = `E2E Test TouchID Key ${Math.random().toString(36).substring(2, 7)}`

    // 1. Setup Network and Console listeners
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()))
    page.on('pageerror', err => console.log('BROWSER EXCEPTION:', err))
    page.on('request', request => {
      console.log('NETWORK REQUEST:', request.url())
    })
    page.on('response', async response => {
      console.log('NETWORK RESPONSE:', response.status(), response.url())
      if (response.status() >= 400) {
        try {
          const body = await response.text()
          console.log('RESPONSE BODY:', body.substring(0, 500))
        } catch {}
      }
    })

    // Setup WebAuthn Virtual Authenticators via CDP at the start of the session
    const cdpSession = await context.newCDPSession(page)
    await cdpSession.send('WebAuthn.enable')
    
    // Add platform authenticator (internal)
    await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal', // Matches platform/biometrics
        hasUserVerification: true,
        isUserVerified: true, // Simulates successful biometric check
        hasResidentKey: true,
        automaticPresenceSimulation: true, // Auto-approves prompt
      },
    })

    // Add cross-platform authenticator (usb)
    await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'usb', // Matches security key / cross-platform
        hasUserVerification: true,
        isUserVerified: true, // Simulates successful PIN check
        hasResidentKey: true,
        automaticPresenceSimulation: true,
      },
    })

    // 2. Log in
    await ensureLoggedIn(page)

    // 3. Navigate to Settings page
    await page.goto('/admin/settings')
    await expect(page.getByRole('heading', { name: 'Settings' }).first()).toBeVisible()

    // 4. Click the "Security" tab
    const securityTab = page.locator('button:has-text("Security")')
    await expect(securityTab).toBeVisible()
    await securityTab.click()

    // 5. Verify Passkey card is visible
    const passkeyCardHeader = page.locator('p:has-text("Passkeys & Passwordless Login")')
    await expect(passkeyCardHeader).toBeVisible({ timeout: 10000 })

    // 6. Enter a name for the new passkey
    const passkeyNameInput = page.locator('input[placeholder="e.g. Work MacBook TouchID"]')
    await expect(passkeyNameInput).toBeVisible()
    await passkeyNameInput.fill(uniqueKeyName)

    // 7. Click Register Passkey
    const registerBtn = page.locator('button:has-text("Register Passkey")')
    await expect(registerBtn).toBeVisible()
    await registerBtn.click()

    // 8. Confirm the key appears in the list (wait for it to become visible)
    const passkeyRecord = page.locator(`text=${uniqueKeyName}`).first()
    await expect(passkeyRecord).toBeVisible({ timeout: 15000 })
    
    // 9. Log out
    const logoutBtn = page.locator('button[aria-label="Sign out"]').first()
    await expect(logoutBtn).toBeVisible()
    await logoutBtn.click()

    // Wait for redirection to complete
    await page.waitForURL('**/login')

    // 10. Verify redirected to login page
    await expect(page.locator('h1:has-text("Sign in to NuxFlow")').first()).toBeVisible({ timeout: 15000 })

    // 11. Authenticate using the newly registered passkey!
    const passkeySignInBtn = page.locator('button:has-text("Sign in with Passkey")')
    await expect(passkeySignInBtn).toBeVisible()
    await passkeySignInBtn.click()

    // 12. Verify successful authentication and redirection to dashboard
    await expect(page.locator('h1.text-2xl')).toHaveText(/Good\s+morning|Good\s+afternoon|Good\s+evening/, { timeout: 20000 })

    // 13. Navigate back to settings to delete and clean up
    await page.goto('/admin/settings')
    await expect(page.getByRole('heading', { name: 'Settings' }).first()).toBeVisible()

    // 14. Click the "Security" tab again
    await securityTab.click()

    // 15. Verify passkey is still in the list
    await expect(passkeyRecord).toBeVisible()

    // 16. Clean up (Delete the passkey)
    const deleteBtn = page.locator('button[class*="hover:bg-red-50"]').first()
    await expect(deleteBtn).toBeVisible()
    await deleteBtn.click()

    // 17. Confirm our registered passkey is gone from the list (wait for it to become hidden)
    await expect(passkeyRecord).toBeHidden({ timeout: 15000 })
  })
})

