import * as React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import { APP_DISPLAY_NAME } from '../../shared/constants.js';
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
    <EmailLayout previewText={`Your ${APP_DISPLAY_NAME} subscription has been canceled`} variant="billing">
      <Heading style={{ color: emailTheme.text, fontSize: '22px', fontWeight: 700, margin: '0 0 16px' }}>
        Your subscription is canceled
      </Heading>
      <Section style={{ textAlign: 'left' as const, margin: '0 0 24px' }}>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
          {greeting}
        </Text>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
          Your <strong>{planName}</strong> subscription has been canceled. You'll continue to have access until{' '}
          <strong>{accessUntil}</strong>.
        </Text>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: 0 }}>
          We're sorry to see you go. If you change your mind, you can resubscribe anytime.
        </Text>
      </Section>
      <Button
        href={`${appUrl}/pricing`}
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
        Resubscribe
      </Button>
    </EmailLayout>
  );
}
