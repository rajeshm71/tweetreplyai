import * as React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

interface Props {
  firstName?: string;
  pct: 80 | 100;
  used: number;
  limit: number;
  resetAt: string;
  upgradeUrl: string;
  appUrl: string;
  settingsUrl?: string;
  unsubscribeUrl?: string;
}

export default function UsageThresholdEmail({
  firstName,
  pct,
  used,
  limit,
  resetAt,
  upgradeUrl,
  appUrl,
  settingsUrl,
  unsubscribeUrl,
}: Props) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const isLimit = pct >= 100;
  const headline = isLimit
    ? "You've hit your limit — here's what to do"
    : "You've used 80% of your credits — heads up";

  return (
    <EmailLayout
      previewText={headline}
      variant="alert"
      settingsUrl={settingsUrl}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading
        style={{
          color: isLimit ? '#dc2626' : '#d97706',
          fontSize: '22px',
          fontWeight: 700,
          margin: '0 0 16px',
        }}
      >
        {isLimit ? '🚫 Credit limit reached' : '⚠️ 80% of credits used'}
      </Heading>
      <Section style={{ textAlign: 'left' as const, margin: '0 0 24px' }}>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
          {greeting}
        </Text>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
          You've used <strong>{used}</strong> of your <strong>{limit}</strong> credits this period.
          {isLimit
            ? " You've reached your limit and can't generate new suggestions until your credits reset."
            : ' You have a few credits left — plan accordingly.'}
        </Text>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: 0 }}>
          Credits reset on <strong>{resetAt}</strong>.
        </Text>
      </Section>
      <Button
        href={isLimit ? upgradeUrl : appUrl}
        style={{
          backgroundColor: emailTheme.primary,
          borderRadius: '8px',
          color: emailTheme.primaryForeground,
          display: 'inline-block',
          fontSize: '15px',
          fontWeight: 600,
          padding: '12px 28px',
          textDecoration: 'none',
        }}
      >
        {isLimit ? 'Upgrade to Keep Going' : 'Go to Dashboard'}
      </Button>
    </EmailLayout>
  );
}
