import * as React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import { APP_DISPLAY_NAME } from '../../shared/constants.js';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

interface Props {
  firstName?: string;
  daysRemaining: number;
  used: number;
  limit: number;
  upgradeUrl: string;
  settingsUrl?: string;
  unsubscribeUrl?: string;
}

export default function TrialExpiringEmail({
  firstName,
  daysRemaining,
  used,
  limit,
  upgradeUrl,
  settingsUrl,
  unsubscribeUrl,
}: Props) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const dayWord = daysRemaining === 1 ? 'day' : 'days';
  return (
    <EmailLayout
      previewText={`Your ${APP_DISPLAY_NAME} trial ends in ${daysRemaining} ${dayWord}`}
      variant="engagement"
      settingsUrl={settingsUrl}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading
        style={{ color: emailTheme.text, fontSize: '22px', fontWeight: 700, margin: '0 0 16px' }}
      >
        Your trial ends in {daysRemaining} {dayWord}
      </Heading>
      <Section style={{ textAlign: 'left' as const, margin: '0 0 24px' }}>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
          {greeting}
        </Text>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
          {`You've used ${used} of ${limit} replies on your ${APP_DISPLAY_NAME} trial. Upgrade before your trial ends to keep posting without interruption.`}
        </Text>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: 0 }}>
          Paid plans get higher daily limits, priority generation, and advanced reply modes.
        </Text>
      </Section>
      <Button
        href={upgradeUrl}
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
        Upgrade now
      </Button>
    </EmailLayout>
  );
}
