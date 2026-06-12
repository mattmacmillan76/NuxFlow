import { requireRole } from '../../../utils/permissions'
import { sendPushToUser } from '../../../utils/webpush'

export default defineEventHandler(async (event) => {
  const { userId } = await requireRole(event, 'admin')

  await sendPushToUser(event, userId, {
    title: 'Test notification',
    body: 'Push notifications are working correctly.',
    url: '/admin',
  })

  return { sent: true }
})
