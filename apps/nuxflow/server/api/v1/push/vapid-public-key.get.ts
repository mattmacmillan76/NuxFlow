import { resolveSetting } from '../../../utils/settings'

export default defineEventHandler(async (event) => {
  const publicKey = await resolveSetting(event, 'push.vapid_public_key') as string | null
  return { publicKey: publicKey || null }
})
