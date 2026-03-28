import * as React from 'react';
import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

interface Props {
  firstName?: string;
  portalUrl: string;
}

export default function PaymentFailedEmail({ firstName, portalUrl }: Props) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  return (
    <EmailLayout previewText="Action required: your payment failed" variant="billing">
      <Heading style={{ color: '#dc2626', fontSize: '22px', fontWeight: 700, margin: '0 0 16px' }}>
        Payment failed — action required
      </Heading>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
        {greeting}
      </Text>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
        We couldn't process your most recent payment for TweetReply. Your account is currently past due.
      </Text>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 24px' }}>
        Please update your payment method to keep your subscription active.
      </Text>
      <Button
        href={portalUrl}
        style={{
          backgroundColor: '#dc2626',
          borderRadius: '8px',
          color: '#ffffff',
          fontSize: '15px',
          fontWeight: 600,
          padding: '12px 28px',
          textDecoration: 'none',
        }}
      >
        Update Payment Method
      </Button>
    </EmailLayout>
  );
}
