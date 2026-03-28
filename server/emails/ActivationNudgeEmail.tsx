import * as React from 'react';
import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

interface Props {
  firstName?: string;
  appUrl: string;
  settingsUrl?: string;
}

export default function ActivationNudgeEmail({ firstName, appUrl, settingsUrl }: Props) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  return (
    <EmailLayout
      previewText="You haven't generated your first reply yet..."
      variant="engagement"
      settingsUrl={settingsUrl}
    >
      <Heading style={{ color: emailTheme.text, fontSize: '22px', fontWeight: 700, margin: '0 0 16px' }}>
        Your first viral reply is waiting 🚀
      </Heading>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
        {greeting}
      </Text>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
        You signed up for TweetReply but haven't generated your first reply yet. It only takes 30 seconds!
      </Text>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 24px' }}>
        Paste any tweet, pick a tone, and get an AI-crafted reply that gets noticed.
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
        Generate My First Reply
      </Button>
    </EmailLayout>
  );
}
