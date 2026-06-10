import React, { useEffect, useState } from 'react';
import api from '../../services/api';

interface SubscriptionInfo {
  status: string;
  trial_ends_at: string | null;
  plan: { name: string } | null;
}

const TrialBanner: React.FC = () => {
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.get<SubscriptionInfo>('/tenant/subscription')
      .then(r => setInfo(r.data))
      .catch(() => {/* silent */});
  }, []);

  if (!info || dismissed) return null;

  const daysLeft = (): number | null => {
    if (!info.trial_ends_at) return null;
    const diff = new Date(info.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86_400_000));
  };

  const days = daysLeft();

  // Show banner only when trialing and ≤ 14 days left
  if (info.status !== 'trialing' || days === null || days > 14) return null;

  const urgent = days <= 3;
  const expired = days === 0;

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 text-sm font-medium
        ${urgent ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}
      role="alert"
    >
      <div className="flex items-center gap-2">
        <span className="material-icons text-base">
          {expired ? 'error' : 'schedule'}
        </span>
        {expired
          ? 'Your free trial has ended. Please contact support to activate your subscription.'
          : `Free trial: ${days} day${days !== 1 ? 's' : ''} remaining${info.plan ? ` on the ${info.plan.name} plan` : ''}.`
        }
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <a
          href="/subscription"
          className="underline underline-offset-2 hover:no-underline whitespace-nowrap"
        >
          View subscription
        </a>
        {!expired && (
          <button
            onClick={() => setDismissed(true)}
            className="opacity-80 hover:opacity-100"
            aria-label="Dismiss trial banner"
          >
            <span className="material-icons text-base">close</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default TrialBanner;
