import { Button, Section, Text } from '@react-email/components';
import * as React from 'react';
import { APP_DISPLAY_NAME } from '../../shared/constants.js';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

export interface PasswordResetEmailProps {
  /** Full reset URL including token. */
  resetUrl: string;
}

export default function PasswordResetEmail({ resetUrl }: PasswordResetEmailProps) {
  const previewText = `Reset your ${APP_DISPLAY_NAME} password. Link expires in 1 hour.`;

  return (
    <EmailLayout previewText={previewText} variant="transactional">
      <Text
        style={{
          color: emailTheme.text,
          fontSize: '20px',
          fontWeight: 600,
          lineHeight: '28px',
          margin: '0 0 16px',
        }}
      >
        Reset your password
      </Text>
      <Text
        style={{
          color: emailTheme.text,
          fontSize: '15px',
          lineHeight: '24px',
          margin: '0 0 20px',
        }}
      >
        You requested a password reset. Click the button below to choose a new password.
      </Text>
      <Section style={{ margin: '0 0 24px' }}>
        <Button
          href={resetUrl}
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
          Reset password
        </Button>
      </Section>
      <Section style={{ textAlign: 'left' as const }}>
        <Text
          style={{
            color: emailTheme.muted,
            fontSize: '14px',
            lineHeight: '22px',
            margin: '0 0 12px',
          }}
        >
          This link expires in 1 hour. If you didn&apos;t request this, you can ignore this email.
        </Text>
      </Section>
    </EmailLayout>
  );
}
