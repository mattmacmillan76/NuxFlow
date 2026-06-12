import { requireRole } from '../../../utils/permissions'
import { saveSetting } from '../../../utils/settings'
import { generateVapidKeys } from '../../../utils/webpush'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const { publicKey, privateKey } = await generateVapidKeys()
  await Promise.all([
    saveSetting(event, 'push.vapid_public_key', publicKey),
    saveSetting(event, 'push.vapid_private_key', privateKey),
  ])
  return { publicKey }
})
