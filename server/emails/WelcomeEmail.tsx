import { Button, Section, Text } from '@react-email/components';
import * as React from 'react';
import { APP_DISPLAY_NAME } from '../../shared/constants.js';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

export interface WelcomeEmailProps {
  /** Display name; falls back to "there". */
  firstName?: string;
  /** Absolute app base URL (no trailing slash). */
  appUrl: string;
}

export default function WelcomeEmail({ firstName, appUrl }: WelcomeEmailProps) {
  const name = firstName?.trim() || 'there';
  const previewText = `Welcome to ${APP_DISPLAY_NAME} — open your dashboard and start replying smarter.`;

  return (
    <EmailLayout previewText={previewText} variant="welcome">
      <Text
        style={{
          color: emailTheme.text,
          fontSize: '20px',
          fontWeight: 600,
          lineHeight: '28px',
          margin: '0 0 16px',
        }}
      >
        Welcome to {APP_DISPLAY_NAME}, {name}!
      </Text>
      <Text
        style={{
          color: emailTheme.text,
          fontSize: '15px',
          lineHeight: '24px',
          margin: '0 0 20px',
        }}
      >
        Thanks for signing up. Here are a few things you can do right away:
      </Text>
      <Section style={{ margin: '0 0 24px', textAlign: 'left' as const }}>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 8px' }}>
          • Generate high-quality tweet replies in one click
        </Text>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 8px' }}>
          • Use different tones and styles for your replies
        </Text>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: 0 }}>
          • Track your usage from your dashboard
        </Text>
      </Section>
      <Section>
        <Button
          href={appUrl}
          style={{
            backgroundColor: emailTheme.primary,
            borderRadius: '8px',
            color: emailTheme.primaryForeground,
            display: 'inline-block',
            fontSize: '15px',
            fontWeight: 600,
            lineHeight: '1',
            padding: '14px 28px',
            textDecoration: 'none',
          }}
        >
          Open your dashboard
        </Button>
      </Section>
    </EmailLayout>
  );
}
