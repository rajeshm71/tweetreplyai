import * as React from 'react';
import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

interface Props {
  firstName?: string;
  appUrl: string;
  settingsUrl?: string;
}

export default function WinBackEmail({ firstName, appUrl, settingsUrl }: Props) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  return (
    <EmailLayout
      previewText="We saved some viral opportunities for you"
      variant="engagement"
      settingsUrl={settingsUrl}
    >
      <Heading style={{ color: emailTheme.text, fontSize: '22px', fontWeight: 700, margin: '0 0 16px' }}>
        We missed you 👋
      </Heading>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
        {greeting}
      </Text>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
        It's been a while since you generated a reply on TweetReply. Your audience is still out there — and so are the trending conversations you could be jumping into.
      </Text>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 24px' }}>
        Come back and generate a reply in 30 seconds. We saved some viral opportunities for you.
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
        Jump Back In
      </Button>
    </EmailLayout>
  );
}
