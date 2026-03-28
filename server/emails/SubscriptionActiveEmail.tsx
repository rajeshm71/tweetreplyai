import * as React from 'react';
import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

interface Props {
  firstName?: string;
  planName: string;
  nextBillingDate: string;
  appUrl: string;
}

export default function SubscriptionActiveEmail({ firstName, planName, nextBillingDate, appUrl }: Props) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  return (
    <EmailLayout previewText={`Your ${planName} plan is now active`} variant="billing">
      <Heading style={{ color: emailTheme.text, fontSize: '22px', fontWeight: 700, margin: '0 0 16px' }}>
        Your subscription is active 🎉
      </Heading>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
        {greeting}
      </Text>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
        Your <strong>{planName}</strong> plan is now active. You have full access to all features.
      </Text>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 24px' }}>
        Next billing date: <strong>{nextBillingDate}</strong>
      </Text>
      <Button
        href={appUrl}
        style={{
          backgroundColor: emailTheme.primary,
          borderRadius: '8px',
          color: emailTheme.primaryForeground,
          fontSize: '15px',
          fontWeight: 600,
          padding: '12px 28px',
          textDecoration: 'none',
        }}
      >
        Go to Dashboard
      </Button>
    </EmailLayout>
  );
}
