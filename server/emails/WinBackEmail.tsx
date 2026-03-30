import * as React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import { APP_DISPLAY_NAME } from '../../shared/constants.js';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

interface Props {
  firstName?: string;
  appUrl: string;
  settingsUrl?: string;
  unsubscribeUrl?: string;
}

export default function WinBackEmail({ firstName, appUrl, settingsUrl, unsubscribeUrl }: Props) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  return (
    <EmailLayout
      previewText="We saved some viral opportunities for you"
      variant="engagement"
      settingsUrl={settingsUrl}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={{ color: emailTheme.text, fontSize: '22px', fontWeight: 700, margin: '0 0 16px' }}>
        We missed you 👋
      </Heading>
      <Section style={{ textAlign: 'left' as const, margin: '0 0 24px' }}>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
          {greeting}
        </Text>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
          {`It's been a while since you generated a reply on ${APP_DISPLAY_NAME}. Your audience is still out there — and so are the trending conversations you could be jumping into.`}
        </Text>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: 0 }}>
          Come back and generate a reply in 30 seconds. We saved some viral opportunities for you.
        </Text>
      </Section>
      <Button
        href={appUrl}
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
        Jump Back In
      </Button>
    </EmailLayout>
  );
}
