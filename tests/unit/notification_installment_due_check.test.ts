import { DEFAULT_NOTIFICATION_SETTINGS } from '@/hooks/useNotificationSettings';
import { NOTIFICATION_CONFIG } from '@/types/notifications';

describe('installment due check notification wiring', () => {
  it('has enabled default toggle for installment due checks', () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS.evt_installment_due_check).toBe(true);
  });

  it('exposes installment_due_check in notification config', () => {
    expect(NOTIFICATION_CONFIG.installment_due_check).toBeDefined();
    expect(NOTIFICATION_CONFIG.installment_due_check.priority).toBe('urgent');
  });
});
