import * as React from 'react';
import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

interface Props {
  firstName?: string;
  planName: string;
  accessUntil: string;
  appUrl: string;
}

export default function SubscriptionCanceledEmail({ firstName, planName, accessUntil, appUrl }: Props) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  return (
    <EmailLayout previewText="Your TweetReply subscription has been canceled" variant="billing">
      <Heading style={{ color: emailTheme.text, fontSize: '22px', fontWeight: 700, margin: '0 0 16px' }}>
        Your subscription is canceled
      </Heading>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
        {greeting}
      </Text>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
        Your <strong>{planName}</strong> subscription has been canceled. You'll continue to have access until{' '}
        <strong>{accessUntil}</strong>.
      </Text>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 24px' }}>
        We're sorry to see you go. If you change your mind, you can resubscribe anytime.
      </Text>
      <Button
        href={`${appUrl}/pricing`}
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
        Resubscribe
      </Button>
    </EmailLayout>
  );
}
